import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import * as administracao from '@/lib/administracao';
import PaginaDaConta from './(sistema)/conta/page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const atualizar = vi.fn();
let trocarSenha = false;
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'u1',
      nome: 'Bia',
      email: 'bia@demo.test',
      perfil: 'ANALISTA',
      area: null,
      trocarSenha,
      empresa: { razaoSocial: 'Demo', slug: 'demo' },
    },
    sair: vi.fn(),
    atualizar,
  }),
}));

async function preencher(atual: string, nova: string, repetida = nova) {
  await userEvent.type(
    screen.getByLabelText(/Senha (atual|provisória)/),
    atual,
  );
  await userEvent.type(screen.getByLabelText(/^Nova senha/), nova);
  await userEvent.type(screen.getByLabelText('Repita a nova senha'), repetida);
  await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
}

describe('Minha conta', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    atualizar.mockReset();
    trocarSenha = false;
  });

  it('no primeiro acesso, troca a provisória e vai para o início', async () => {
    trocarSenha = true;
    const trocar = vi
      .spyOn(administracao, 'trocarMinhaSenha')
      .mockResolvedValue(undefined);
    render(<PaginaDaConta />);

    expect(screen.getByText(/Bem-vindo ao SIGOF/)).toBeInTheDocument();
    await preencher('Provisoria1', 'MinhaSenha2026');

    expect(trocar).toHaveBeenCalledWith('Provisoria1', 'MinhaSenha2026');
    expect(atualizar).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/inicio');
  });

  it('confirmação diferente não chega à API', async () => {
    const trocar = vi.spyOn(administracao, 'trocarMinhaSenha');
    render(<PaginaDaConta />);
    await preencher('Atual1234', 'MinhaSenha2026', 'OutraCoisa2026');
    expect(
      screen.getByText('A confirmação não é igual à nova senha'),
    ).toBeInTheDocument();
    expect(trocar).not.toHaveBeenCalled();
  });

  it('mostra o erro da API e não sai da página', async () => {
    vi.spyOn(administracao, 'trocarMinhaSenha').mockRejectedValue(
      new ErroDaApi(422, 'REGRA_DE_NEGOCIO', 'A senha atual não confere'),
    );
    render(<PaginaDaConta />);
    await preencher('Errada123', 'MinhaSenha2026');
    expect(
      await screen.findByText('A senha atual não confere'),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('troca normal avisa e continua na página', async () => {
    vi.spyOn(administracao, 'trocarMinhaSenha').mockResolvedValue(undefined);
    render(<PaginaDaConta />);
    await preencher('Atual1234', 'MinhaSenha2026');
    expect(await screen.findByText(/Senha trocada/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
