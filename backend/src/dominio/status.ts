/**
 * Máquina de estados da solicitação (RFC seções 2.5, 3.1 e 3.3).
 *
 * A RFC lista os seis status e descreve os fluxos em prosa, mas não define
 * formalmente quais transições são válidas nem quem pode fazer cada uma.
 * Este módulo é essa definição, e é a fonte única consultada pelo serviço
 * antes de gravar qualquer mudança de status.
 *
 * Duas regras estruturais da RFC estão codificadas aqui:
 *  - solicitação nunca é excluída: RESOLVIDO e CANCELADO são terminais;
 *  - apenas usuários internos assumem solicitações, e o solicitante não
 *    consegue conduzir o atendimento.
 */

export type Status =
  | 'NOVO'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_DOC'
  | 'ESCALADO'
  | 'RESOLVIDO'
  | 'CANCELADO';

export type Perfil = 'SOLICITANTE' | 'ANALISTA' | 'SUPERVISOR' | 'ADMIN';

export interface Transicao {
  de: Status;
  para: Status;
  perfis: readonly Perfil[];
  descricao: string;
}

export const TRANSICOES: readonly Transicao[] = [
  {
    de: 'NOVO',
    para: 'EM_ANDAMENTO',
    perfis: ['ANALISTA', 'SUPERVISOR'],
    descricao: 'Analista assume a solicitação da fila',
  },
  {
    de: 'NOVO',
    para: 'CANCELADO',
    perfis: ['SOLICITANTE', 'SUPERVISOR', 'ADMIN'],
    descricao: 'Solicitação cancelada antes de ser assumida',
  },
  {
    de: 'EM_ANDAMENTO',
    para: 'AGUARDANDO_DOC',
    perfis: ['ANALISTA', 'SUPERVISOR'],
    descricao: 'Falta documentação; o SLA é pausado',
  },
  {
    de: 'EM_ANDAMENTO',
    para: 'ESCALADO',
    perfis: ['ANALISTA', 'SUPERVISOR'],
    descricao: 'Analista não consegue resolver; supervisor é notificado',
  },
  {
    de: 'EM_ANDAMENTO',
    para: 'RESOLVIDO',
    perfis: ['ANALISTA', 'SUPERVISOR'],
    descricao: 'Atendimento concluído com descrição da ação tomada',
  },
  {
    de: 'EM_ANDAMENTO',
    para: 'CANCELADO',
    perfis: ['SUPERVISOR', 'ADMIN'],
    descricao: 'Cancelamento durante o atendimento',
  },
  {
    de: 'AGUARDANDO_DOC',
    para: 'EM_ANDAMENTO',
    perfis: ['ANALISTA', 'SUPERVISOR'],
    descricao: 'Documento recebido; o SLA é retomado',
  },
  {
    de: 'AGUARDANDO_DOC',
    para: 'CANCELADO',
    perfis: ['SUPERVISOR', 'ADMIN'],
    descricao: 'Cancelamento por falta de documentação',
  },
  {
    de: 'ESCALADO',
    para: 'EM_ANDAMENTO',
    perfis: ['SUPERVISOR'],
    descricao: 'Supervisor reatribui a um analista sênior',
  },
  {
    de: 'ESCALADO',
    para: 'RESOLVIDO',
    perfis: ['ANALISTA', 'SUPERVISOR'],
    descricao: 'Resolvido após o escalonamento',
  },
  {
    de: 'ESCALADO',
    para: 'CANCELADO',
    perfis: ['SUPERVISOR', 'ADMIN'],
    descricao: 'Cancelamento após escalonamento',
  },
] as const;

/** Estados finais: a partir deles não há transição possível. */
export const STATUS_TERMINAIS: readonly Status[] = ['RESOLVIDO', 'CANCELADO'];

export class TransicaoInvalidaError extends Error {
  constructor(
    readonly de: Status,
    readonly para: Status,
    readonly perfil: Perfil,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'TransicaoInvalidaError';
  }
}

export function ehTerminal(status: Status): boolean {
  return STATUS_TERMINAIS.includes(status);
}

/** Transições possíveis a partir de um status, independente de perfil. */
export function transicoesDe(status: Status): readonly Transicao[] {
  return TRANSICOES.filter((transicao) => transicao.de === status);
}

/** Transições que um perfil específico pode executar a partir de um status. */
export function transicoesPermitidas(
  status: Status,
  perfil: Perfil,
): readonly Transicao[] {
  return transicoesDe(status).filter((transicao) =>
    transicao.perfis.includes(perfil),
  );
}

export function podeTransicionar(
  de: Status,
  para: Status,
  perfil: Perfil,
): boolean {
  return TRANSICOES.some(
    (transicao) =>
      transicao.de === de &&
      transicao.para === para &&
      transicao.perfis.includes(perfil),
  );
}

/**
 * Valida a transição, lançando erro com a causa exata.
 *
 * As mensagens distinguem "transição inexistente" de "perfil sem
 * permissão" — o serviço traduz a primeira em 422 e a segunda em 403.
 */
export function validarTransicao(
  de: Status,
  para: Status,
  perfil: Perfil,
): void {
  if (de === para) {
    throw new TransicaoInvalidaError(
      de,
      para,
      perfil,
      `A solicitação já está em ${de}`,
    );
  }

  if (ehTerminal(de)) {
    throw new TransicaoInvalidaError(
      de,
      para,
      perfil,
      `${de} é um status final e não admite alteração`,
    );
  }

  const transicao = TRANSICOES.find(
    (candidata) => candidata.de === de && candidata.para === para,
  );

  if (!transicao) {
    throw new TransicaoInvalidaError(
      de,
      para,
      perfil,
      `Não há transição de ${de} para ${para}`,
    );
  }

  if (!transicao.perfis.includes(perfil)) {
    throw new TransicaoInvalidaError(
      de,
      para,
      perfil,
      `O perfil ${perfil} não pode mover a solicitação de ${de} para ${para}`,
    );
  }
}
