import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaginaInicial from './(sistema)/inicio/page';
import PaginaDeLogin from './entrar/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'u1',
      nome: 'Sérgio Supervisor',
      email: 'sergio@demo.test',
      perfil: 'SUPERVISOR',
      area: 'FINANCEIRO',
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'transportadora-demo' },
    },
    sair: vi.fn(),
  }),
}));

describe('página de login', () => {
  it('tem o título e o formulário', () => {
    render(<PaginaDeLogin />);

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Empresa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });
});

describe('página inicial', () => {
  it('cumprimenta pelo primeiro nome e mostra perfil, área e empresa', () => {
    render(<PaginaInicial />);

    expect(screen.getByRole('heading', { name: 'Olá, Sérgio' })).toBeInTheDocument();
    expect(screen.getByText('Supervisor')).toBeInTheDocument();
    expect(screen.getByText('Área: Financeiro')).toBeInTheDocument();
    expect(screen.getByText('transportadora-demo')).toBeInTheDocument();
  });

  it('não repete o ponto final da razão social', () => {
    render(<PaginaInicial />);

    expect(screen.getByText('Você está no SIGOF da Transportadora Demo Ltda.')).toBeInTheDocument();
  });
});
