/**
 * Indicadores do painel gerencial (RF10 e RNF de gestão; RFC seção 4.2,
 * Tela 6). Função pura: recebe as solicitações já lidas do banco e o
 * instante de referência, e devolve os números. Assim cada fórmula é
 * testada sem banco.
 *
 * Definições (as mesmas que aparecem na tela):
 *  - **Atendida no prazo:** foi assumida (primeira passagem para "Em
 *    andamento") antes de o SLA vencer. É o que o SLA da RFC mede: o prazo
 *    de *atendimento inicial*, não o de resolução.
 *  - **Tempo até assumir / até resolver:** tempo corrido, em minutos, da
 *    abertura até o evento. Corrido, e não útil, porque é o tempo que o
 *    cliente de fato esperou.
 */
import { indicadorDeSla, type Prioridade } from './fila.js';
import type { Expediente } from './sla.js';
import type { Status } from './status.js';

export type Tipo = 'REVERSAO' | 'TROCA_PAGADOR' | 'AJUSTE_FISCAL' | 'OUTRO';

export interface SolicitacaoParaIndicadores {
  status: Status;
  tipo: Tipo;
  prioridade: Prioridade;
  criadoEm: Date;
  resolvidoEm: Date | null;
  assumidaEm: Date | null;
  slaVenceEm: Date | null;
  slaPausadoEm: Date | null;
  slaMinutosPausados: number;
  responsavel: { id: string; nome: string } | null;
  abertaComAlertaDeDuplicidade: boolean;
}

export interface Indicadores {
  periodo: { dias: number; de: Date; ate: Date };
  agora: {
    abertas: number;
    porStatus: Record<Status, number>;
    slaVencido: number;
    semResponsavel: number;
  };
  noPeriodo: {
    abertas: number;
    resolvidas: number;
    canceladas: number;
    atendidasNoPrazo: number;
    atendidas: number;
    /** Percentual 0–100, ou null se nenhuma foi assumida ainda. */
    percentualNoPrazo: number | null;
    minutosMedioAteAssumir: number | null;
    minutosMedioAteResolver: number | null;
    abertasComAlertaDeDuplicidade: number;
  };
  porTipo: { tipo: Tipo; total: number }[];
  porResponsavel: {
    id: string;
    nome: string;
    emAberto: number;
    resolvidasNoPeriodo: number;
  }[];
  porDia: { dia: string; abertas: number; resolvidas: number }[];
}

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const TIPOS: Tipo[] = ['REVERSAO', 'TROCA_PAGADOR', 'AJUSTE_FISCAL', 'OUTRO'];
const STATUS: Status[] = [
  'NOVO',
  'EM_ANDAMENTO',
  'AGUARDANDO_DOC',
  'ESCALADO',
  'RESOLVIDO',
  'CANCELADO',
];

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** "2026-10-16" no fuso da empresa (o dia de quem trabalha, não o UTC). */
export function diaLocal(data: Date, fusoHorario: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}

export function ehEmAberto(status: Status): boolean {
  return status !== 'RESOLVIDO' && status !== 'CANCELADO';
}

export function calcularIndicadores(
  solicitacoes: readonly SolicitacaoParaIndicadores[],
  agora: Date,
  dias: number,
  expediente: Expediente,
): Indicadores {
  const de = new Date(agora.getTime() - dias * DIA);
  const noPeriodo = (data: Date | null) =>
    data !== null && data >= de && data <= agora;

  const porStatus = Object.fromEntries(STATUS.map((s) => [s, 0])) as Record<
    Status,
    number
  >;
  let abertas = 0;
  let slaVencido = 0;
  let semResponsavel = 0;

  const abertasNoPeriodo = solicitacoes.filter((s) => noPeriodo(s.criadoEm));
  const resolvidasNoPeriodo = solicitacoes.filter(
    (s) => s.status === 'RESOLVIDO' && noPeriodo(s.resolvidoEm),
  );

  for (const s of solicitacoes) {
    if (!ehEmAberto(s.status)) continue;
    abertas += 1;
    porStatus[s.status] += 1;
    if (!s.responsavel) semResponsavel += 1;
    const sla = indicadorDeSla(
      s.status,
      s.slaVenceEm
        ? {
            venceEm: s.slaVenceEm,
            pausadoEm: s.slaPausadoEm,
            minutosPausados: s.slaMinutosPausados,
          }
        : null,
      agora,
      expediente,
    );
    if (sla.situacao === 'VENCIDO') slaVencido += 1;
  }
  // Encerradas só contam as do período (as antigas não dizem nada de agora)
  porStatus.RESOLVIDO = resolvidasNoPeriodo.length;
  porStatus.CANCELADO = abertasNoPeriodo.filter(
    (s) => s.status === 'CANCELADO',
  ).length;

  const assumidas = abertasNoPeriodo.filter((s) => s.assumidaEm !== null);
  const noPrazo = assumidas.filter(
    (s) => s.slaVenceEm === null || (s.assumidaEm as Date) <= s.slaVenceEm,
  );

  const porTipo = TIPOS.map((tipo) => ({
    tipo,
    total: abertasNoPeriodo.filter((s) => s.tipo === tipo).length,
  }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);

  const responsaveis = new Map<string, Indicadores['porResponsavel'][number]>();
  for (const s of solicitacoes) {
    if (!s.responsavel) continue;
    const linha = responsaveis.get(s.responsavel.id) ?? {
      id: s.responsavel.id,
      nome: s.responsavel.nome,
      emAberto: 0,
      resolvidasNoPeriodo: 0,
    };
    if (ehEmAberto(s.status)) linha.emAberto += 1;
    if (s.status === 'RESOLVIDO' && noPeriodo(s.resolvidoEm))
      linha.resolvidasNoPeriodo += 1;
    responsaveis.set(s.responsavel.id, linha);
  }

  // Um ponto por dia do período, inclusive os dias sem nada (zero também é dado)
  const fuso = expediente.fusoHorario;
  const porDia = new Map<string, { abertas: number; resolvidas: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    porDia.set(diaLocal(new Date(agora.getTime() - i * DIA), fuso), {
      abertas: 0,
      resolvidas: 0,
    });
  }
  for (const s of abertasNoPeriodo) {
    const dia = porDia.get(diaLocal(s.criadoEm, fuso));
    if (dia) dia.abertas += 1;
  }
  for (const s of resolvidasNoPeriodo) {
    const dia = porDia.get(diaLocal(s.resolvidoEm as Date, fuso));
    if (dia) dia.resolvidas += 1;
  }

  return {
    periodo: { dias, de, ate: agora },
    agora: { abertas, porStatus, slaVencido, semResponsavel },
    noPeriodo: {
      abertas: abertasNoPeriodo.length,
      resolvidas: resolvidasNoPeriodo.length,
      canceladas: porStatus.CANCELADO,
      atendidas: assumidas.length,
      atendidasNoPrazo: noPrazo.length,
      percentualNoPrazo:
        assumidas.length === 0
          ? null
          : Math.round((noPrazo.length / assumidas.length) * 100),
      minutosMedioAteAssumir: media(
        assumidas.map(
          (s) =>
            ((s.assumidaEm as Date).getTime() - s.criadoEm.getTime()) / MINUTO,
        ),
      ),
      minutosMedioAteResolver: media(
        resolvidasNoPeriodo.map(
          (s) =>
            ((s.resolvidoEm as Date).getTime() - s.criadoEm.getTime()) / MINUTO,
        ),
      ),
      abertasComAlertaDeDuplicidade: abertasNoPeriodo.filter(
        (s) => s.abertaComAlertaDeDuplicidade,
      ).length,
    },
    porTipo,
    porResponsavel: [...responsaveis.values()].sort(
      (a, b) =>
        b.emAberto +
          b.resolvidasNoPeriodo -
          (a.emAberto + a.resolvidasNoPeriodo) || a.nome.localeCompare(b.nome),
    ),
    porDia: [...porDia.entries()].map(([dia, n]) => ({ dia, ...n })),
  };
}

/** Uma célula de CSV: aspas escapadas e fórmula neutralizada. */
export function celulaCsv(valor: string | number | null): string {
  if (valor === null) return '';
  let texto = String(valor);
  // Excel executa célula que começa com = + - @ como fórmula (CSV injection)
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/**
 * CSV no formato que o Excel em português abre direto: separador ";" e
 * BOM no início (sem ele, os acentos viram lixo).
 */
export function montarCsv(
  cabecalho: string[],
  linhas: (string | number | null)[][],
): string {
  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map(celulaCsv).join(';'))
    .join('\r\n');
  return `\uFEFF${corpo}\r\n`;
}
