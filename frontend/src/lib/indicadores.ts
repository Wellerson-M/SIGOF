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

export const indicadores = {
  calcular: (dias: Periodo) => pedir<Indicadores>(`/indicadores?dias=${dias}`),
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
