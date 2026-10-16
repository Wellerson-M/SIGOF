import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Perfil } from '@/lib/api';
import { api, type Detalhe } from '@/lib/solicitacoes';
import PaginaDaSolicitacao from './(sistema)/solicitacoes/[id]/page';
import PaginaDeNovaSolicitacao from './(sistema)/solicitacoes/nova/page';
import PaginaDoQuadro from './(sistema)/solicitacoes/page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'abc' }) }));

let perfil: Perfil = 'SOLICITANTE';
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'u1',
      nome: 'Sofia',
      email: 'sofia@demo.test',
      perfil,
      area: null,
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'demo' },
    },
    sair: vi.fn(),
  }),
}));

describe('páginas de solicitações', () => {
  it('o quadro do solicitante explica que mostra as dele', async () => {
    perfil = 'SOLICITANTE';
    vi.spyOn(api, 'listar').mockResolvedValue([]);
    render(<PaginaDoQuadro />);

    expect(
      screen.getByText('Acompanhe aqui as solicitações que você abriu.'),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('Nada por aqui')).toHaveLength(5);
    expect(screen.queryByLabelText('Só as que estão comigo')).toBeNull();
  });

  it('nova solicitação mostra o formulário', () => {
    perfil = 'ANALISTA';
    render(<PaginaDeNovaSolicitacao />);
    expect(screen.getByLabelText('Tipo de ocorrência')).toBeInTheDocument();
  });

  it('administrador não abre solicitação', () => {
    perfil = 'ADMIN';
    render(<PaginaDeNovaSolicitacao />);
    expect(
      screen.getByText('O perfil de administrador não abre solicitações.'),
    ).toBeInTheDocument();
  });

  it('o detalhe usa o id do endereço', async () => {
    perfil = 'SOLICITANTE';
    const detalhar = vi
      .spyOn(api, 'detalhar')
      .mockReturnValue(new Promise<Detalhe>(() => {}));
    render(<PaginaDaSolicitacao />);

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(detalhar).toHaveBeenCalledWith('abc');
  });
});
