import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Perfil } from '@/lib/api';
import { Moldura } from './Moldura';

vi.mock('next/navigation', () => ({ usePathname: () => '/inicio' }));

const sair = vi.fn().mockResolvedValue(undefined);
let perfil: Perfil = 'SOLICITANTE';
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'u1',
      nome: 'Sofia Solicitante',
      email: 'sofia@demo.test',
      perfil,
      area: 'COMERCIAL',
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'transportadora-demo' },
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

  it('o botão Sair encerra a sessão', async () => {
    render(<Moldura>x</Moldura>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));
    expect(sair).toHaveBeenCalled();
  });
});
