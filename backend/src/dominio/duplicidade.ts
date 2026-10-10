/**
 * Detecção de solicitações duplicadas (RF09 / RFC seções 2.5 e 3.2).
 *
 * Regra da RFC: alertar quando o mesmo CTe ou NF já foi objeto de outra
 * solicitação nos últimos 7 dias. A RFC não dizia a partir de quando
 * contar a janela nem o que fazer com solicitações canceladas; as duas
 * decisões estão explicitadas aqui:
 *
 *  - a janela é contada para trás a partir da abertura da nova solicitação,
 *    usando a data de abertura das existentes;
 *  - solicitações canceladas não geram alerta, porque não representam
 *    atendimento em curso nem concluído.
 *
 * O alerta não bloqueia: quem abre decide vincular ou prosseguir
 * (RFC seção 3.2).
 */

import type { Status } from './status.js';

export const JANELA_DUPLICIDADE_DIAS_PADRAO = 7;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export interface SolicitacaoComparavel {
  id: string;
  empresaId: string;
  protocolo: string;
  cte: string | null;
  nf: string | null;
  status: Status;
  criadoEm: Date;
}

export interface CandidataDuplicidade {
  empresaId: string;
  cte: string | null;
  nf: string | null;
  criadoEm: Date;
}

export interface MotivoDuplicidade {
  solicitacao: SolicitacaoComparavel;
  documento: 'CTE' | 'NF';
  valor: string;
}

/** Tamanho da chave de acesso de CTe e NF-e (44 dígitos). */
const TAMANHO_CHAVE_DE_ACESSO = 44;

/**
 * Posição do número do documento dentro da chave de acesso: depois de
 * UF (2), ano/mês (4), CNPJ do emitente (14), modelo (2) e série (3) vêm
 * os 9 dígitos do número.
 */
const INICIO_NUMERO_NA_CHAVE = 25;
const FIM_NUMERO_NA_CHAVE = 34;

/**
 * Normaliza o documento antes de comparar.
 *
 * Número de CTe e de NF é sempre numérico, então só os dígitos importam.
 * Assim "12345", "012345", "CTE 12.345" e "CT-e nº 12345" viram todos
 * "12345" — são exatamente as variações que aparecem quando cada pessoa
 * digita o número à mão.
 *
 * Se a pessoa colar a chave de acesso inteira (44 dígitos), extrai dela o
 * número do documento, para que a chave e o número digitado batam.
 */
export function normalizarDocumento(valor: string | null): string | null {
  if (valor === null) {
    return null;
  }

  let digitos = valor.replace(/\D/g, '');

  if (digitos.length === TAMANHO_CHAVE_DE_ACESSO) {
    digitos = digitos.slice(INICIO_NUMERO_NA_CHAVE, FIM_NUMERO_NA_CHAVE);
  }

  const semZerosIniciais = digitos.replace(/^0+/, '');

  return semZerosIniciais === '' ? null : semZerosIniciais;
}

export function encontrarDuplicidades(
  candidata: CandidataDuplicidade,
  existentes: readonly SolicitacaoComparavel[],
  janelaDias: number = JANELA_DUPLICIDADE_DIAS_PADRAO,
): MotivoDuplicidade[] {
  const cteCandidata = normalizarDocumento(candidata.cte);
  const nfCandidata = normalizarDocumento(candidata.nf);

  if (cteCandidata === null && nfCandidata === null) {
    return [];
  }

  const limiteInferior = new Date(
    candidata.criadoEm.getTime() - janelaDias * MILISSEGUNDOS_POR_DIA,
  );

  const motivos: MotivoDuplicidade[] = [];

  for (const existente of existentes) {
    // Isolamento multi-tenant: uma empresa nunca enxerga documento de outra
    // (RFC seção 5.5). A checagem é redundante com o filtro do repositório,
    // e é justamente por isso que ela fica aqui — é a última barreira.
    if (existente.empresaId !== candidata.empresaId) {
      continue;
    }

    if (existente.status === 'CANCELADO') {
      continue;
    }

    if (
      existente.criadoEm < limiteInferior ||
      existente.criadoEm > candidata.criadoEm
    ) {
      continue;
    }

    const cteExistente = normalizarDocumento(existente.cte);
    const nfExistente = normalizarDocumento(existente.nf);

    if (cteCandidata !== null && cteExistente === cteCandidata) {
      motivos.push({
        solicitacao: existente,
        documento: 'CTE',
        valor: cteCandidata,
      });
      continue;
    }

    if (nfCandidata !== null && nfExistente === nfCandidata) {
      motivos.push({
        solicitacao: existente,
        documento: 'NF',
        valor: nfCandidata,
      });
    }
  }

  return motivos;
}

export function haDuplicidade(
  candidata: CandidataDuplicidade,
  existentes: readonly SolicitacaoComparavel[],
  janelaDias: number = JANELA_DUPLICIDADE_DIAS_PADRAO,
): boolean {
  return encontrarDuplicidades(candidata, existentes, janelaDias).length > 0;
}
