import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvedorDeSessao, useSessao } from './sessao';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const usuarioLogado = vi.fn();
const sair = vi.fn();
vi.mock('./api', () => ({
  usuarioLogado: () => usuarioLogado(),
  sair: () => sair(),
}));

const USUARIO = {
  id: 'u1',
  nome: 'André Analista',
  email: 'andre@demo.test',
  perfil: 'ANALISTA',
  area: null,
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
    usuarioLogado.mockRejectedValue(new Error('401'));
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/entrar'));
  });

  it('sair encerra a sessão na API e volta para o login', async () => {
    usuarioLogado.mockResolvedValue(USUARIO);
    sair.mockResolvedValue(undefined);
    render(
      <ProvedorDeSessao>
        <MostraUsuario />
      </ProvedorDeSessao>,
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sair' }));

    expect(sair).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/entrar');
  });

  it('useSessao fora do provedor é erro de programação', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<MostraUsuario />)).toThrow(/ProvedorDeSessao/);
  });
});
