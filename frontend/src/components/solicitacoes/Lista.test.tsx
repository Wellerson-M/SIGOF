import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi, type Perfil } from '@/lib/api';
import {
  api,
  consultaDaLista,
  type PaginaDaLista,
  type Resumo,
} from '@/lib/solicitacoes';
import { Lista } from './Lista';

let perfil: Perfil = 'ANALISTA';
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'eu',
      nome: 'André',
      email: 'a@demo.test',
      perfil,
      area: null,
      trocarSenha: false,
      empresa: { razaoSocial: 'Demo', slug: 'demo' },
    },
    sair: vi.fn(),
    atualizar: vi.fn(),
  }),
}));

function item(n: number): Resumo {
  return {
    id: `s${n}`,
    protocolo: `SOL-2026-08-${String(n).padStart(4, '0')}`,
    tipo: 'REVERSAO',
    cte: String(1000 + n),
    nf: null,
    descricao: `Ocorrência ${n}`,
    status: 'RESOLVIDO',
    prioridade: 'MEDIA',
    solicitante: { id: 'x', nome: 'Sofia' },
    responsavel: n % 2 ? { id: 'eu', nome: 'André' } : null,
    criadoEm: '2026-08-10T12:00:00Z',
    atualizadoEm: '2026-08-10T12:00:00Z',
    slaVenceEm: null,
    sla: { situacao: 'ENCERRADO', minutosRestantes: null },
    acoes: [],
    totais: { anexos: 0, mensagens: 0 },
  };
}

const pagina = (total: number, itens: Resumo[], numero = 1): PaginaDaLista => ({
  itens,
  total,
  pagina: numero,
  porPagina: 25,
});

beforeEach(() => {
  vi.restoreAllMocks();
  perfil = 'ANALISTA';
});
afterEach(() => vi.useRealTimers());

describe('consultaDaLista', () => {
  it('monta só os filtros preenchidos', () => {
    expect(consultaDaLista({ pagina: 1 })).toBe('pagina=1');
    expect(
      consultaDaLista({
        pagina: 2,
        status: ['NOVO', 'ESCALADO'],
        tipo: [],
        minhas: true,
        busca: 'CTe 12',
        de: '2026-10-01',
        ate: '2026-10-16',
      }),
    ).toBe(
      'pagina=2&status=NOVO%2CESCALADO&minhas=true&busca=CTe+12&de=2026-10-01&ate=2026-10-16',
    );
  });
});

describe('Lista', () => {
  it('mostra a página, filtra e pagina', async () => {
    const pesquisar = vi
      .spyOn(api, 'pesquisar')
      .mockImplementation(async (f) =>
        pagina(30, [item(f.pagina === 2 ? 26 : 1)], f.pagina),
      );
    render(<Lista />);

    expect(await screen.findByText('SOL-2026-08-0001')).toHaveAttribute(
      'href',
      '/solicitacoes/s1',
    );
    expect(screen.getByText('30 solicitações')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Próxima'));
    expect(await screen.findByText('SOL-2026-08-0026')).toBeInTheDocument();
    expect(pesquisar).toHaveBeenLastCalledWith({ pagina: 2 });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'RESOLVIDO');
    expect(pesquisar).toHaveBeenLastCalledWith({
      pagina: 1,
      status: ['RESOLVIDO'],
    });

    await userEvent.click(screen.getByLabelText('Só as minhas'));
    expect(pesquisar).toHaveBeenLastCalledWith(
      expect.objectContaining({ minhas: true, pagina: 1 }),
    );

    await userEvent.click(screen.getByText('Limpar filtros'));
    expect(pesquisar).toHaveBeenLastCalledWith({ pagina: 1 });
  });

  it('a busca espera a pessoa parar de digitar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pesquisar = vi
      .spyOn(api, 'pesquisar')
      .mockResolvedValue(pagina(0, []));
    render(<Lista />);
    await screen.findByText('Nenhuma solicitação encontrada.');

    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await usuario.type(screen.getByLabelText('Buscar'), '12345');
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(pesquisar).toHaveBeenLastCalledWith({ pagina: 1, busca: '12345' });
    expect(pesquisar).toHaveBeenCalledTimes(2);
  });

  it('datas, prioridade e tipo', async () => {
    const pesquisar = vi
      .spyOn(api, 'pesquisar')
      .mockResolvedValue(pagina(1, [item(2)]));
    render(<Lista />);
    await screen.findByText('1 solicitação');
    await userEvent.type(screen.getByLabelText('De'), '2026-10-01');
    await userEvent.selectOptions(
      screen.getByLabelText('Prioridade'),
      'URGENTE',
    );
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'OUTRO');
    expect(pesquisar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        de: '2026-10-01',
        prioridade: ['URGENTE'],
        tipo: ['OUTRO'],
      }),
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('solicitante não tem "só as minhas"; erro aparece', async () => {
    perfil = 'SOLICITANTE';
    vi.spyOn(api, 'pesquisar').mockRejectedValue(
      new ErroDaApi(400, 'VALIDACAO', 'Use a data no formato AAAA-MM-DD'),
    );
    render(<Lista />);
    expect(
      await screen.findByText('Use a data no formato AAAA-MM-DD'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Só as minhas')).toBeNull();
    expect(screen.getByRole('link', { name: 'Quadro' })).toHaveAttribute(
      'href',
      '/solicitacoes',
    );
  });
});
