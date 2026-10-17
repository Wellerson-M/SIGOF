/** Painel gerencial: os números e o CSV vêm prontos da API. */
import { pedir, pedirArquivo } from './api';
import type { Status, Tipo } from './solicitacoes';

export type Periodo = 7 | 30 | 90;

export interface Indicadores {
  periodo: { dias: number; de: string; ate: string };
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
    percentualNoPrazo: number | null;
    minutosMedioAteAssumir: number | null;
    minutosMedioAteResolver: number | null;
    abertasComAlertaDeDuplicidade: number;
    /** Registradas já resolvidas: fora do tempo médio de resolução. */
    registrosRapidos?: number;
  };
  porTipo: { tipo: Tipo; total: number }[];
  porResponsavel: {
    id: string;
    nome: string;
    emAberto: number;
    resolvidasNoPeriodo: number;
  }[];
  porDia: { dia: string; abertas: number; resolvidas: number }[];
  /** De quem foi o erro, entre as resolvidas no período. */
  porCausa?: {
    causa: string;
    total: number;
    detalhes: { detalhe: string; total: number }[];
  }[];
  resolvidasSemCausa?: number;
  porFilial?: { filial: string; total: number }[];
  porSolicitante?: { nome: string; total: number }[];
  tempoAteResolverPorTipo?: {
    tipo: Tipo;
    minutos: number;
    resolvidas: number;
  }[];
}

export interface Balanco {
  mes: string;
  linhas: {
    digitador: string;
    ctesEmitidos: number | null;
    erros: number;
    /** Erros a cada 100 CTe; null sem produção importada. */
    taxaDeErro: number | null;
  }[];
  importadoEm: string | null;
}

/**
 * Lê a planilha de produção: uma linha por digitador, com o nome e a
 * quantidade separados por ponto e vírgula, vírgula ou tabulação (o Excel
 * em português salva com ";"). Cabeçalho e linhas sem número são ignorados.
 */
export function lerPlanilhaDeProducao(
  texto: string,
): { digitador: string; ctesEmitidos: number }[] {
  return texto
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .flatMap((linha) => {
      const [nome, quantidade] = linha
        .split(/[;\t,]/)
        .map((c) => c.trim().replace(/^"|"$/g, ''));
      const numero = Number((quantidade ?? '').replace(/\./g, ''));
      return nome && Number.isInteger(numero) && numero >= 0 && quantidade
        ? [{ digitador: nome, ctesEmitidos: numero }]
        : [];
    });
}

export const indicadores = {
  calcular: (dias: Periodo) => pedir<Indicadores>(`/indicadores?dias=${dias}`),
  balanco: (mes: string) =>
    pedir<Balanco>(`/indicadores/digitadores?mes=${encodeURIComponent(mes)}`),
  importarProducao: (
    mes: string,
    linhas: { digitador: string; ctesEmitidos: number }[],
  ) =>
    pedir<{ mes: string; digitadores: number }>('/indicadores/producao', {
      method: 'PUT',
      body: JSON.stringify({ mes, linhas }),
    }),
  csv: (dias: Periodo) =>
    pedirArquivo(`/indicadores/solicitacoes.csv?dias=${dias}`),
};

/** 45 → "45 min"; 135 → "2h 15min"; 3000 → "2d 2h". null → "—". */
export function duracao(minutos: number | null): string {
  if (minutos === null) return '—';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto ? `${horas}h ${resto}min` : `${horas}h`;
  }
  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  return restoHoras ? `${dias}d ${restoHoras}h` : `${dias}d`;
}

/** "2026-10-16" → "16/10" (sem passar por Date: não muda de dia pelo fuso). */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split('-');
  return `${d}/${mes}`;
}

/** Topo do eixo: um número redondo acima do maior valor (1, 2, 5, 10, 20...). */
export function topoDoEixo(maior: number): number {
  if (maior <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(maior));
  for (const passo of [1, 2, 5, 10]) {
    if (passo * base >= maior) return passo * base;
  }
  return 10 * base;
}
