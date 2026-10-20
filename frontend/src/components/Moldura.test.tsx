import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Perfil } from '@/lib/api';
import { Moldura } from './Moldura';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inicio',
  useRouter: () => ({ push: vi.fn() }),
}));
// O sino busca as notificações na API; aqui ele só precisa aparecer
vi.mock('@/lib/avisos', async (original) => ({
  ...(await original<typeof import('@/lib/avisos')>()),
  notificacoes: {
    listar: () => Promise.resolve({ naoLidas: 0, itens: [] }),
    marcarLidas: () => Promise.resolve({ naoLidas: 0 }),
  },
}));

const sair = vi.fn().mockResolvedValue(undefined);
let perfil: Perfil = 'SOLICITANTE';
let modulos: string[] | undefined;
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'u1',
      nome: 'Sofia Solicitante',
      email: 'sofia@demo.test',
      perfil,
      area: 'COMERCIAL',
      empresa: {
        razaoSocial: 'Transportadora Demo Ltda.',
        slug: 'transportadora-demo',
        modulos,
      },
    },
    sair,
  }),
}));

describe('Moldura', () => {
  it('mostra quem está logado e a empresa', () => {
    perfil = 'SOLICITANTE';
    render(<Moldura>conteúdo</Moldura>);

    expect(screen.getByText('Sofia Solicitante')).toBeInTheDocument();
    expect(screen.getByText('Solicitante')).toBeInTheDocument();
    expect(screen.getByText('Transportadora Demo Ltda.')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('esconde do menu o que o perfil não pode acessar', () => {
    perfil = 'SOLICITANTE';
    render(<Moldura>x</Moldura>);
    expect(screen.queryAllByText('Administração')).toHaveLength(0);
  });

  it('administrador vê a Administração', () => {
    perfil = 'ADMIN';
    render(<Moldura>x</Moldura>);
    expect(screen.getAllByText('Administração').length).toBeGreaterThan(0);
  });

  it('se sair falhar, avisa na tela', async () => {
    sair.mockRejectedValueOnce(new Error('sem conexão'));
    render(<Moldura>x</Moldura>);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível sair',
    );
  });

  it('o botão Sair encerra a sessão', async () => {
    render(<Moldura>x</Moldura>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));
    expect(sair).toHaveBeenCalled();
  });

  it('o registro rápido some com o módulo desligado', () => {
    perfil = 'ANALISTA';
    modulos = ['FILIAIS'];
    render(<Moldura>x</Moldura>);
    expect(screen.queryAllByText('Registro rápido')).toHaveLength(0);
    modulos = undefined;
  });
});
