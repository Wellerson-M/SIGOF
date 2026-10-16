/**
 * Ordem da fila e indicador de SLA (RFC seção 4.2, Tela 4).
 *
 * A fila do analista mostra primeiro o que é mais grave: prioridade maior
 * vem antes e, na mesma prioridade, quem vence primeiro. O indicador
 * traduz o estado do SLA nas quatro cores da tela (no prazo, atenção,
 * vencido e pausado).
 */

import {
  estaVencido,
  minutosUteisRestantes,
  type EstadoSla,
  type Expediente,
} from './sla.js';
import { ehTerminal, type Status } from './status.js';

export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export type SituacaoDoSla =
  'NO_PRAZO' | 'ATENCAO' | 'VENCIDO' | 'PAUSADO' | 'ENCERRADO';

/** Com até 1 hora útil restante, o cartão fica amarelo. */
export const MINUTOS_DE_ATENCAO = 60;

const PESO_DA_PRIORIDADE: Record<Prioridade, number> = {
  URGENTE: 4,
  ALTA: 3,
  MEDIA: 2,
  BAIXA: 1,
};

export interface IndicadorDeSla {
  situacao: SituacaoDoSla;
  /** Minutos úteis até vencer; null quando encerrada ou sem prazo. */
  minutosRestantes: number | null;
}

export function indicadorDeSla(
  status: Status,
  estado: EstadoSla | null,
  agora: Date,
  expediente: Expediente,
): IndicadorDeSla {
  if (ehTerminal(status) || estado === null) {
    return { situacao: 'ENCERRADO', minutosRestantes: null };
  }

  const minutosRestantes = minutosUteisRestantes(estado, agora, expediente);

  if (estado.pausadoEm !== null) {
    return { situacao: 'PAUSADO', minutosRestantes };
  }
  if (estaVencido(estado, agora)) {
    return { situacao: 'VENCIDO', minutosRestantes: 0 };
  }
  if (minutosRestantes <= MINUTOS_DE_ATENCAO) {
    return { situacao: 'ATENCAO', minutosRestantes };
  }
  return { situacao: 'NO_PRAZO', minutosRestantes };
}

export interface ItemDaFila {
  prioridade: Prioridade;
  slaVenceEm: Date | null;
  criadoEm: Date;
}

/** Prioridade maior primeiro; empate: vence antes; sem prazo vai ao fim. */
export function compararNaFila(a: ItemDaFila, b: ItemDaFila): number {
  const porPrioridade =
    PESO_DA_PRIORIDADE[b.prioridade] - PESO_DA_PRIORIDADE[a.prioridade];
  if (porPrioridade !== 0) {
    return porPrioridade;
  }

  const venceA = a.slaVenceEm?.getTime() ?? Number.POSITIVE_INFINITY;
  const venceB = b.slaVenceEm?.getTime() ?? Number.POSITIVE_INFINITY;
  if (venceA !== venceB) {
    return venceA < venceB ? -1 : 1;
  }

  return a.criadoEm.getTime() - b.criadoEm.getTime();
}
