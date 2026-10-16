import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaDeIndicadores from '@/app/(sistema)/indicadores/page';
import { ErroDaApi, type Perfil } from '@/lib/api';
import {
  diaCurto,
  duracao,
  indicadores,
  topoDoEixo,
  type Indicadores,
} from '@/lib/indicadores';
import { resumoDoDia } from '@/lib/inicio';
import type { Resumo } from '@/lib/solicitacoes';
import { Barras, GraficoPorDia } from './Graficos';

let perfil: Perfil = 'SUPERVISOR';
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'eu',
      nome: 'Sérgio',
      email: 's@demo.test',
      perfil,
      area: null,
      trocarSenha: false,
      empresa: { razaoSocial: 'Demo', slug: 'demo' },
    },
    sair: vi.fn(),
    atualizar: vi.fn(),
  }),
}));

const DADOS: Indicadores = {
  periodo: { dias: 7, de: '2026-10-09T00:00:00Z', ate: '2026-10-16T00:00:00Z' },
  agora: {
    abertas: 5,
    porStatus: {
      NOVO: 2,
      EM_ANDAMENTO: 2,
      AGUARDANDO_DOC: 1,
      ESCALADO: 0,
      RESOLVIDO: 3,
      CANCELADO: 0,
    },
    slaVencido: 1,
    semResponsavel: 2,
  },
  noPeriodo: {
    abertas: 8,
    resolvidas: 3,
    canceladas: 0,
    atendidasNoPrazo: 3,
    atendidas: 4,
    percentualNoPrazo: 75,
    minutosMedioAteAssumir: 95,
    minutosMedioAteResolver: 3000,
    abertasComAlertaDeDuplicidade: 1,
  },
  porTipo: [
    { tipo: 'REVERSAO', total: 5 },
    { tipo: 'AJUSTE_FISCAL', total: 3 },
  ],
  porResponsavel: [
    { id: 'a', nome: 'André', emAberto: 2, resolvidasNoPeriodo: 3 },
  ],
  porDia: Array.from({ length: 7 }, (_, i) => ({
    dia: `2026-10-${String(10 + i).padStart(2, '0')}`,
    abertas: i,
    resolvidas: i % 2,
  })),
  porCausa: [
    {
      causa: 'Erro de digitação',
      total: 3,
      detalhes: [
        { detalhe: 'Bruno', total: 2 },
        { detalhe: 'Ana', total: 1 },
      ],
    },
  ],
  resolvidasSemCausa: 1,
};

beforeEach(() => {
  vi.restoreAllMocks();
  perfil = 'SUPERVISOR';
});

describe('formatos', () => {
  it('duracao', () => {
    expect(duracao(null)).toBe('—');
    expect(duracao(45)).toBe('45 min');
    expect(duracao(120)).toBe('2h');
    expect(duracao(135)).toBe('2h 15min');
    expect(duracao(3000)).toBe('2d 2h');
    expect(duracao(2880)).toBe('2d');
  });

  it('diaCurto e topoDoEixo', () => {
    expect(diaCurto('2026-10-05')).toBe('05/10');
    expect(topoDoEixo(0)).toBe(1);
    expect(topoDoEixo(7)).toBe(10);
    expect(topoDoEixo(13)).toBe(20);
    expect(topoDoEixo(45)).toBe(50);
    expect(topoDoEixo(100)).toBe(100);
  });
});

describe('página de indicadores', () => {
  it('mostra os números, os gráficos e troca o período', async () => {
    const calcular = vi.spyOn(indicadores, 'calcular').mockResolvedValue(DADOS);
    render(<PaginaDeIndicadores />);

    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('3 de 4 assumidas no período')).toBeInTheDocument();
    expect(screen.getByText('1h 35min')).toBeInTheDocument();
    expect(screen.getByText('2d 2h')).toBeInTheDocument();
    expect(screen.getByLabelText('Atenção')).toBeInTheDocument();
    expect(screen.getByText('Reversão')).toBeInTheDocument();
    expect(screen.getByText('André')).toBeInTheDocument();
    expect(
      screen.getByText(/abertas mesmo com o alerta de duplicidade/),
    ).toBeInTheDocument();
    expect(screen.getByText('Erro de digitação')).toBeInTheDocument();
    expect(screen.getByText('Bruno')).toBeInTheDocument();
    expect(
      screen.getByText('1 resolvida(s) sem a causa informada.'),
    ).toBeInTheDocument();
    expect(calcular).toHaveBeenCalledWith(30);

    await userEvent.click(screen.getByRole('button', { name: '7 dias' }));
    expect(calcular).toHaveBeenLastCalledWith(7);
  });

  it('baixa o CSV do período', async () => {
    vi.spyOn(indicadores, 'calcular').mockResolvedValue(DADOS);
    const csv = vi
      .spyOn(indicadores, 'csv')
      .mockResolvedValue(new Blob(['a;b']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicar = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<PaginaDeIndicadores />);
    await userEvent.click(await screen.findByText('Baixar planilha (CSV)'));
    expect(csv).toHaveBeenCalledWith(30);
    expect(clicar).toHaveBeenCalled();
  });

  it('erro da API aparece na tela', async () => {
    vi.spyOn(indicadores, 'calcular').mockRejectedValue(
      new ErroDaApi(500, 'ERRO', 'Falhou'),
    );
    render(<PaginaDeIndicadores />);
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });

  it('analista não vê', () => {
    perfil = 'ANALISTA';
    render(<PaginaDeIndicadores />);
    expect(
      screen.getByText('Os indicadores são do supervisor e do administrador.'),
    ).toBeInTheDocument();
  });
});

describe('gráficos', () => {
  it('a coluna de cada dia mostra os valores ao passar o mouse e tem tabela', async () => {
    render(<GraficoPorDia porDia={DADOS.porDia} />);
    const dia = screen.getByLabelText('16/10: 6 abertas, 0 resolvidas');
    fireEvent.mouseEnter(dia);
    expect(screen.getByRole('tooltip')).toHaveTextContent('16/10');
    expect(screen.getByRole('tooltip')).toHaveTextContent('6 abertas');
    fireEvent.blur(dia);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(screen.getByLabelText('10/10: 0 abertas, 0 resolvidas'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('10/10');

    await userEvent.click(screen.getByText('Ver como tabela'));
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });

  it('barras sem dados', () => {
    render(<Barras titulo="Por tipo" itens={[]} />);
    expect(screen.getByText('Nada no período.')).toBeInTheDocument();
  });
});

describe('resumo da página inicial', () => {
  const item = (parte: Partial<Resumo>) =>
    ({
      status: 'NOVO',
      responsavel: null,
      filial: null,
      sla: { situacao: 'NO_PRAZO', minutosRestantes: 60 },
      ...parte,
    }) as Resumo;
  const itens = [
    item({}),
    item({ status: 'EM_ANDAMENTO', responsavel: { id: 'eu', nome: 'Eu' } }),
    item({ sla: { situacao: 'VENCIDO', minutosRestantes: 0 } }),
    item({ status: 'AGUARDANDO_DOC' }),
    item({ status: 'RESOLVIDO' }),
  ];

  it('para a equipe: fila, comigo e vencidas', () => {
    expect(resumoDoDia({ id: 'eu', perfil: 'ANALISTA' }, itens)).toEqual([
      { rotulo: 'Na fila, sem ninguém', valor: 2 },
      { rotulo: 'Comigo', valor: 1 },
      { rotulo: 'Com SLA vencido', valor: 1, critico: true },
    ]);
  });

  it('para o solicitante: em aberto, esperando documento e resolvidas', () => {
    expect(resumoDoDia({ id: 'eu', perfil: 'SOLICITANTE' }, itens)).toEqual([
      { rotulo: 'Minhas em aberto', valor: 4 },
      { rotulo: 'Esperando documento', valor: 1 },
      { rotulo: 'Resolvidas (30 dias)', valor: 1 },
    ]);
  });
});
