import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from './api';
import { ProvedorDeSessao, useSessao } from './sessao';

const replace = vi.fn();
// Objeto estável, como o roteador de verdade do Next
const roteador = { replace };
let caminho = '/inicio';
vi.mock('next/navigation', () => ({
  useRouter: () => roteador,
  usePathname: () => caminho,
}));

const usuarioLogado = vi.fn();
const sair = vi.fn();
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  usuarioLogado: () => usuarioLogado(),
  sair: () => sair(),
}));

const USUARIO = {
  id: 'u1',
  nome: 'André Analista',
  email: 'andre@demo.test',
  perfil: 'ANALISTA',
  area: null,
  trocarSenha: false,
  empresa: { razaoSocial: 'Demo', slug: 'demo' },
};

function MostraUsuario() {
  const { usuario, sair: sairDaSessao } = useSessao();
  return (
    <>
      <p>{usuario.nome}</p>
      <button type="button" onClick={() => void sairDaSessao()}>
        Sair
      </button>
    </>
  );
}

describe('ProvedorDeSessao', () => {
  beforeEach(() => {
    caminho = '/inicio';
    replace.mockReset();
    usuarioLogado.mockReset();
    sair.mockReset();
  });

  it('mostra "Carregando…" enquanto confirma a sessão', () => {
    usuarioLogado.mockReturnValue(new Promise(() => {}));
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('com sessão válida, entrega o usuário para as páginas', async () => {
    usuarioLogado.mockResolvedValue(USUARIO);
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );
    expect(await screen.findByText('André Analista')).toBeInTheDocument();
  });

  it('sem sessão, manda para o login', async () => {
    usuarioLogado.mockRejectedValue(
      new ErroDaApi(401, 'NAO_AUTENTICADO', 'Autenticação necessária'),
    );
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/entrar'));
  });

  it('servidor fora do ar não desloga: mostra o erro e deixa tentar de novo', async () => {
    usuarioLogado
      .mockRejectedValueOnce(
        new ErroDaApi(
          0,
          'SEM_CONEXAO',
          'Não foi possível falar com o servidor.',
        ),
      )
      .mockResolvedValueOnce(USUARIO);
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    );
    expect(replace).not.toHaveBeenCalled();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('André Analista')).toBeInTheDocument();
  });

  it('se sair falhar na API, continua logado (não vai para o login)', async () => {
    usuarioLogado.mockResolvedValue(USUARIO);
    sair.mockRejectedValue(new ErroDaApi(0, 'SEM_CONEXAO', 'sem conexão'));
    let falhou = false;
    function SairComErro() {
      const sessao = useSessao();
      return (
        <button
          type="button"
          onClick={() => sessao.sair().catch(() => (falhou = true))}
        >
          Sair
        </button>
      );
    }
    render(
      <ProvedorDeSessao>
        <SairComErro />
      </ProvedorDeSessao>,
    );

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Sair' }));

    await vi.waitFor(() => expect(falhou).toBe(true));
    expect(replace).not.toHaveBeenCalled();
  });

  it('sair encerra a sessão na API e volta para o login', async () => {
    usuarioLogado.mockResolvedValue(USUARIO);
    sair.mockResolvedValue(undefined);
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Sair' }));

    expect(sair).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/entrar');
  });

  it('useSessao fora do provedor é erro de programação', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<MostraUsuario />)).toThrow(/ProvedorDeSessao/);
  });

  it('com senha provisória, leva para Minha conta antes de tudo', async () => {
    usuarioLogado.mockResolvedValue({ ...USUARIO, trocarSenha: true });
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );
    await screen.findByText('André Analista');
    // O redirecionamento vem num efeito, logo depois de o nome aparecer
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/conta'));
  });

  it('na própria Minha conta não redireciona, e atualizar busca de novo', async () => {
    caminho = '/conta';
    usuarioLogado.mockResolvedValueOnce({ ...USUARIO, trocarSenha: true });
    usuarioLogado.mockResolvedValueOnce({ ...USUARIO, nome: 'André Novo' });
    function Atualiza() {
      const { usuario, atualizar } = useSessao();
      return (
        <button type="button" onClick={() => void atualizar()}>
          {usuario.nome}
        </button>
      );
    }
    render(
      <ProvedorDeSessao>
        <Atualiza />
      </ProvedorDeSessao>,
    );
    await userEvent.click(await screen.findByText('André Analista'));
    expect(await screen.findByText('André Novo')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
