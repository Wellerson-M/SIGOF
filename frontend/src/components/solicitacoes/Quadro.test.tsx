import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { api, type Resumo } from '@/lib/solicitacoes';
import { Quadro, itensDaColuna } from './Quadro';

vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'analista-1',
      nome: 'André Analista',
      email: 'andre@demo.test',
      perfil: 'ANALISTA',
      area: null,
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'demo' },
    },
    sair: vi.fn(),
  }),
}));

function solicitacao(extra: Partial<Resumo> = {}): Resumo {
  return {
    id: 's1',
    protocolo: 'SOL-2026-10-0001',
    tipo: 'REVERSAO',
    cte: '12345',
    nf: null,
    descricao: 'Mercadoria recusada pelo cliente.',
    status: 'NOVO',
    prioridade: 'ALTA',
    solicitante: { id: 'sol-1', nome: 'Sofia' },
    responsavel: null,
    filial: null,
    registroRapido: false,
    criadoEm: '2026-10-15T12:00:00Z',
    atualizadoEm: '2026-10-15T12:00:00Z',
    slaVenceEm: '2026-10-15T16:00:00Z',
    sla: { situacao: 'NO_PRAZO', minutosRestantes: 135 },
    acoes: ['EM_ANDAMENTO'],
    totais: { anexos: 0, mensagens: 0 },
    ...extra,
  };
}

const coluna = (nome: string) => screen.getByRole('region', { name: nome });

/** Simula o arraste de um cartão até uma coluna (o jsdom não tem DataTransfer). */
function arrastar(cartao: HTMLElement, destino: HTMLElement) {
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
  fireEvent.dragStart(cartao, { dataTransfer });
  fireEvent.dragOver(destino, { dataTransfer });
  fireEvent.drop(destino, { dataTransfer });
  fireEvent.dragEnd(cartao, { dataTransfer });
}

describe('Quadro', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listar').mockResolvedValue([
      solicitacao(),
      solicitacao({
        id: 's2',
        protocolo: 'SOL-2026-10-0002',
        status: 'EM_ANDAMENTO',
        prioridade: 'URGENTE',
        responsavel: { id: 'analista-1', nome: 'André Analista' },
        acoes: ['AGUARDANDO_DOC', 'ESCALADO', 'RESOLVIDO'],
      }),
    ]);
  });

  it('põe cada cartão na coluna do seu status, com prioridade e SLA', async () => {
    render(<Quadro />);

    await screen.findByText('SOL-2026-10-0001');
    const novo = coluna('Novo');
    expect(within(novo).getByText('SOL-2026-10-0001')).toBeInTheDocument();
    expect(within(novo).getByText('Alta')).toBeInTheDocument();
    expect(
      within(novo).getByText('Vence em 2h 15min úteis'),
    ).toBeInTheDocument();
    expect(
      within(coluna('Em andamento')).getByText('SOL-2026-10-0002'),
    ).toBeInTheDocument();
    // Cancelado só aparece se pedir
    expect(screen.queryByRole('region', { name: 'Cancelado' })).toBeNull();
  });

  it('arrastar para uma coluna permitida move o cartão', async () => {
    const movida = solicitacao({
      status: 'EM_ANDAMENTO',
      responsavel: { id: 'analista-1', nome: 'André Analista' },
      acoes: ['RESOLVIDO'],
    });
    const mover = vi.spyOn(api, 'mover').mockResolvedValue(movida);
    render(<Quadro />);

    const cartao = await screen.findByRole('link', {
      name: /SOL-2026-10-0001/,
    });
    arrastar(cartao, coluna('Em andamento'));

    expect(mover).toHaveBeenCalledWith(
      's1',
      'EM_ANDAMENTO',
      undefined,
      undefined,
    );
    expect(
      await within(coluna('Em andamento')).findByText('SOL-2026-10-0001'),
    ).toBeInTheDocument();
  });

  it('coluna que não é permitida para o cartão não aceita', async () => {
    const mover = vi.spyOn(api, 'mover');
    render(<Quadro />);

    const cartao = await screen.findByRole('link', {
      name: /SOL-2026-10-0001/,
    });
    arrastar(cartao, coluna('Resolvido'));

    expect(mover).not.toHaveBeenCalled();
    expect(
      within(coluna('Novo')).getByText('SOL-2026-10-0001'),
    ).toBeInTheDocument();
  });

  it('resolver pede a descrição do que foi feito antes de mover', async () => {
    const mover = vi.spyOn(api, 'mover').mockResolvedValue(
      solicitacao({
        id: 's2',
        protocolo: 'SOL-2026-10-0002',
        status: 'RESOLVIDO',
        acoes: [],
      }),
    );
    render(<Quadro />);

    const cartao = await screen.findByRole('link', {
      name: /SOL-2026-10-0002/,
    });
    arrastar(cartao, coluna('Resolvido'));

    const dialogo = await screen.findByRole('dialog');
    expect(mover).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .type(within(dialogo).getByRole('textbox'), 'CTe substituto emitido');
    await userEvent
      .setup()
      .click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

    expect(mover).toHaveBeenCalledWith(
      's2',
      'RESOLVIDO',
      'CTe substituto emitido',
      undefined,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('se a API recusar, o cartão volta e o motivo aparece', async () => {
    vi.spyOn(api, 'mover').mockRejectedValue(
      new ErroDaApi(
        403,
        'ACESSO_NEGADO',
        'Você não tem permissão para esta ação',
      ),
    );
    render(<Quadro />);

    const cartao = await screen.findByRole('link', {
      name: /SOL-2026-10-0001/,
    });
    arrastar(cartao, coluna('Em andamento'));

    expect(await screen.findByText(/não tem permissão/)).toBeInTheDocument();
    expect(
      within(coluna('Novo')).getByText('SOL-2026-10-0001'),
    ).toBeInTheDocument();
  });

  it('"Só as que estão comigo" filtra pelo responsável', async () => {
    render(<Quadro />);
    await screen.findByText('SOL-2026-10-0001');

    await userEvent
      .setup()
      .click(screen.getByLabelText('Só as que estão comigo'));

    expect(screen.queryByText('SOL-2026-10-0001')).toBeNull();
    expect(screen.getByText('SOL-2026-10-0002')).toBeInTheDocument();
  });

  it('sem conexão, avisa e deixa tentar de novo', async () => {
    vi.spyOn(api, 'listar').mockRejectedValue(
      new ErroDaApi(0, 'SEM_CONEXAO', 'Não foi possível falar com o servidor.'),
    );
    render(<Quadro />);

    expect(
      await screen.findByText(/Não foi possível falar com o servidor/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    ).toBeInTheDocument();
  });
});

describe('ordem das colunas', () => {
  it('encerradas: a mais recente em cima; em aberto: a ordem da fila', () => {
    const velha = solicitacao({
      id: 'v',
      status: 'RESOLVIDO',
      atualizadoEm: '2026-10-10T12:00:00Z',
    });
    const nova = solicitacao({
      id: 'n',
      status: 'RESOLVIDO',
      atualizadoEm: '2026-10-16T12:00:00Z',
    });
    const fila = [
      solicitacao({
        id: 'a',
        status: 'NOVO',
        atualizadoEm: '2026-10-01T00:00:00Z',
      }),
      solicitacao({
        id: 'b',
        status: 'NOVO',
        atualizadoEm: '2026-10-16T00:00:00Z',
      }),
    ];

    expect(itensDaColuna([velha, nova], 'RESOLVIDO').map((i) => i.id)).toEqual([
      'n',
      'v',
    ]);
    expect(itensDaColuna(fila, 'NOVO').map((i) => i.id)).toEqual(['a', 'b']);
  });
});
