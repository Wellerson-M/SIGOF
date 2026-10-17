import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { plataforma } from '@/lib/plataforma';
import EntradaDaPlataforma from './entrar/page';
import PaginaDaPlataforma from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const EMPRESA = {
  id: 'e1',
  razaoSocial: 'Transportadora Demo Ltda.',
  cnpj: '11222333000181',
  slug: 'transportadora-demo',
  ativa: true,
  criadoEm: '2026-10-01T10:00:00Z',
  usuariosAtivos: 4,
  solicitacoesEmAberto: 3,
  solicitacoesNoMes: 12,
  ultimoAcessoEm: null,
};
const ADMIN = { id: 'a', nome: 'Dono', email: 'd@x.test', trocarSenha: false };

beforeEach(() => replace.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('entrada da plataforma', () => {
  it('entra e vai para o painel; senha errada mostra o erro e limpa a senha', async () => {
    const entrar = vi
      .spyOn(plataforma, 'entrar')
      .mockRejectedValueOnce(
        new ErroDaApi(401, 'NAO_AUTENTICADO', 'E-mail ou senha inválidos'),
      )
      .mockResolvedValueOnce(undefined);
    render(<EntradaDaPlataforma />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('E-mail'), 'd@x.test');
    await usuario.type(screen.getByLabelText('Senha'), 'errada');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(
      await screen.findByText('E-mail ou senha inválidos'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveValue('');

    await usuario.type(screen.getByLabelText('Senha'), 'Certa2026');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(entrar).toHaveBeenLastCalledWith('d@x.test', 'Certa2026');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/plataforma'));
  });
});

describe('painel da plataforma', () => {
  function preparar(eu = ADMIN) {
    vi.spyOn(plataforma, 'eu').mockResolvedValue(eu);
    vi.spyOn(plataforma, 'empresas').mockResolvedValue([EMPRESA]);
    vi.spyOn(plataforma, 'eventos').mockResolvedValue({
      eventos: [
        {
          id: 'v1',
          acao: 'EMPRESA_CRIADA',
          empresaId: 'e1',
          detalhes: null,
          ip: '10.0.0.1',
          criadoEm: '2026-10-17T10:00:00Z',
          administrador: { id: 'a', nome: 'Dono' },
        },
      ],
      total: 1,
      pagina: 1,
    });
  }

  it('desativa com confirmação e mostra a trilha', async () => {
    preparar();
    const alterar = vi
      .spyOn(plataforma, 'alterarEmpresa')
      .mockResolvedValue({ ...EMPRESA, ativa: false });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    render(<PaginaDaPlataforma />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Desativar' }),
    );
    expect(alterar).toHaveBeenCalledWith('e1', { ativa: false });
    expect(screen.getByText('Transportadora criada')).toBeInTheDocument();
  });

  it('desistir da confirmação não desativa', async () => {
    preparar();
    const alterar = vi.spyOn(plataforma, 'alterarEmpresa');
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    render(<PaginaDaPlataforma />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Desativar' }),
    );
    expect(alterar).not.toHaveBeenCalled();
  });

  it('cria mais um administrador na empresa e mostra a senha provisória', async () => {
    preparar();
    const respostas = ['TI Novo', 'ti@demo.test'];
    vi.stubGlobal(
      'prompt',
      vi.fn(() => respostas.shift() ?? null),
    );
    const criar = vi
      .spyOn(plataforma, 'criarAdministrador')
      .mockResolvedValue({
        email: 'ti@demo.test',
        senhaProvisoria: 'Zz9Yy8Xx7Ww6',
      });
    render(<PaginaDaPlataforma />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Novo administrador' }),
    );
    expect(criar).toHaveBeenCalledWith('e1', 'TI Novo', 'ti@demo.test');
    expect(await screen.findByText(/Zz9Yy8Xx7Ww6/)).toBeInTheDocument();
  });

  it('troca a senha provisória e sai', async () => {
    preparar({ ...ADMIN, trocarSenha: true });
    const trocar = vi.spyOn(plataforma, 'trocarSenha').mockResolvedValue();
    const sair = vi.spyOn(plataforma, 'sair').mockResolvedValue();
    render(<PaginaDaPlataforma />);
    const usuario = userEvent.setup();

    await usuario.type(
      await screen.findByLabelText('Senha provisória'),
      'Prov1234',
    );
    await usuario.type(screen.getByLabelText(/^Nova senha/), 'Minha2026');
    await usuario.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(trocar).toHaveBeenCalledWith('Prov1234', 'Minha2026');

    await usuario.click(screen.getByRole('button', { name: 'Sair' }));
    expect(sair).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/plataforma/entrar'),
    );
  });

  it('erro que não é de sessão aparece na tela', async () => {
    vi.spyOn(plataforma, 'eu').mockRejectedValue(
      new ErroDaApi(500, 'ERRO', 'Servidor fora do ar'),
    );
    vi.spyOn(plataforma, 'empresas').mockResolvedValue([]);
    vi.spyOn(plataforma, 'eventos').mockResolvedValue({
      eventos: [],
      total: 0,
      pagina: 1,
    });
    render(<PaginaDaPlataforma />);
    expect(await screen.findByText('Servidor fora do ar')).toBeInTheDocument();
  });
});

describe('conversa com a API da plataforma', () => {
  it('manda JSON, devolve o corpo e transforma erro em ErroDaApi', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([EMPRESA]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ erro: 'CNPJ inválido', codigo: 'REGRA' }),
          {
            status: 422,
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);

    expect(await plataforma.empresas()).toEqual([EMPRESA]);
    await expect(
      plataforma.criarEmpresa({
        razaoSocial: 'X',
        cnpj: '1',
        slug: 'x',
        administrador: { nome: 'Y', email: 'y@y.test' },
      }),
    ).rejects.toMatchObject({ status: 422, message: 'CNPJ inválido' });
    expect(fetch.mock.calls[1]![1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(plataforma.sair()).resolves.toBeUndefined();
    await expect(plataforma.eu()).rejects.toMatchObject({ status: 0 });
  });
});
