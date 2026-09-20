/**
 * Cálculo do SLA de atendimento (RFC seções 2.5, 3.2 e 4.2).
 *
 * A RFC define "prazo máximo para atendimento inicial: 4 horas (horário
 * comercial)" e diz que o SLA é pausado enquanto a solicitação aguarda
 * documentação. Duas consequências que a prosa não detalhava:
 *
 *  - "4 horas de horário comercial" não é o mesmo que somar 4 horas ao
 *    relógio: uma solicitação aberta às 17h de sexta vence às 11h de
 *    segunda, não às 21h de sexta;
 *  - a pausa precisa devolver ao prazo exatamente o tempo útil consumido
 *    durante a espera, e não o tempo corrido.
 *
 * O expediente é fixo em UTC-3 (America/Sao_Paulo). O Brasil não adota
 * horário de verão desde 2019, então um offset fixo é suficiente e evita
 * depender de base de fusos.
 */

export interface Expediente {
  /** Hora de início do expediente, no fuso local (0-23). */
  horaInicio: number;
  /** Hora de término do expediente, no fuso local (1-24). */
  horaFim: number;
  /** Dias úteis, no padrão de `Date.getDay()` — 0 é domingo. */
  diasUteis: readonly number[];
  /** Deslocamento do fuso local em relação ao UTC, em minutos. */
  offsetMinutos: number;
}

export const EXPEDIENTE_PADRAO: Expediente = {
  horaInicio: 8,
  horaFim: 18,
  diasUteis: [1, 2, 3, 4, 5],
  offsetMinutos: -180,
};

/** Prazo de atendimento inicial: 4 horas úteis (RFC seção 2.5). */
export const SLA_ATENDIMENTO_INICIAL_MINUTOS = 240;

const MINUTO_EM_MS = 60 * 1000;

export class SlaInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SlaInvalidoError';
  }
}

// ------------------------------------------------------------- Internos
//
// As funções abaixo trabalham com uma data "local": o instante deslocado
// pelo offset, de forma que os getters UTC devolvam a hora de parede.

function validarExpediente(expediente: Expediente): void {
  if (expediente.horaInicio >= expediente.horaFim) {
    throw new SlaInvalidoError(
      'A hora de início do expediente deve ser anterior à de término',
    );
  }

  if (expediente.diasUteis.length === 0) {
    throw new SlaInvalidoError('O expediente precisa ter ao menos um dia útil');
  }
}

function paraLocal(data: Date, offsetMinutos: number): Date {
  return new Date(data.getTime() + offsetMinutos * MINUTO_EM_MS);
}

function deLocal(local: Date, offsetMinutos: number): Date {
  return new Date(local.getTime() - offsetMinutos * MINUTO_EM_MS);
}

function ehDiaUtil(local: Date, expediente: Expediente): boolean {
  return expediente.diasUteis.includes(local.getUTCDay());
}

function emHora(local: Date, hora: number): Date {
  const resultado = new Date(local.getTime());
  resultado.setUTCHours(hora, 0, 0, 0);
  return resultado;
}

function proximoDiaUtil(local: Date, expediente: Expediente): Date {
  const resultado = new Date(local.getTime());

  do {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
  } while (!ehDiaUtil(resultado, expediente));

  return emHora(resultado, expediente.horaInicio);
}

/** Move um instante para dentro do expediente, avançando se necessário. */
function normalizar(local: Date, expediente: Expediente): Date {
  if (!ehDiaUtil(local, expediente)) {
    return proximoDiaUtil(local, expediente);
  }

  const inicio = emHora(local, expediente.horaInicio);
  const fim = emHora(local, expediente.horaFim);

  if (local < inicio) {
    return inicio;
  }

  if (local >= fim) {
    return proximoDiaUtil(local, expediente);
  }

  return local;
}

// -------------------------------------------------------------- Públicos

/**
 * Soma minutos úteis a um instante, pulando noites, fins de semana e
 * qualquer intervalo fora do expediente.
 */
export function adicionarMinutosUteis(
  inicio: Date,
  minutos: number,
  expediente: Expediente = EXPEDIENTE_PADRAO,
): Date {
  validarExpediente(expediente);

  if (!Number.isFinite(minutos) || minutos < 0) {
    throw new SlaInvalidoError(
      `Minutos devem ser um número não negativo: ${minutos}`,
    );
  }

  let atual = normalizar(paraLocal(inicio, expediente.offsetMinutos), expediente);
  let restante = minutos;

  while (restante > 0) {
    const fimDoDia = emHora(atual, expediente.horaFim);
    const disponivel = (fimDoDia.getTime() - atual.getTime()) / MINUTO_EM_MS;

    if (restante <= disponivel) {
      atual = new Date(atual.getTime() + restante * MINUTO_EM_MS);
      restante = 0;
    } else {
      restante -= disponivel;
      atual = proximoDiaUtil(atual, expediente);
    }
  }

  return deLocal(atual, expediente.offsetMinutos);
}

/** Minutos úteis decorridos entre dois instantes. */
export function minutosUteisEntre(
  inicio: Date,
  fim: Date,
  expediente: Expediente = EXPEDIENTE_PADRAO,
): number {
  validarExpediente(expediente);

  if (fim <= inicio) {
    return 0;
  }

  const alvo = paraLocal(fim, expediente.offsetMinutos);
  let atual = normalizar(paraLocal(inicio, expediente.offsetMinutos), expediente);
  let total = 0;

  while (atual < alvo) {
    const fimDoDia = emHora(atual, expediente.horaFim);
    const limite = fimDoDia < alvo ? fimDoDia : alvo;

    total += (limite.getTime() - atual.getTime()) / MINUTO_EM_MS;

    if (fimDoDia >= alvo) {
      break;
    }

    atual = proximoDiaUtil(atual, expediente);
  }

  return Math.round(total);
}

export interface EstadoSla {
  venceEm: Date;
  pausadoEm: Date | null;
  minutosPausados: number;
}

export function iniciarSla(
  criadoEm: Date,
  minutos: number = SLA_ATENDIMENTO_INICIAL_MINUTOS,
  expediente: Expediente = EXPEDIENTE_PADRAO,
): EstadoSla {
  return {
    venceEm: adicionarMinutosUteis(criadoEm, minutos, expediente),
    pausadoEm: null,
    minutosPausados: 0,
  };
}

/** Marca o início da pausa (entrada em AGUARDANDO_DOC). */
export function pausarSla(estado: EstadoSla, agora: Date): EstadoSla {
  if (estado.pausadoEm !== null) {
    throw new SlaInvalidoError('O SLA já está pausado');
  }

  return { ...estado, pausadoEm: agora };
}

/**
 * Retoma o SLA, empurrando o vencimento adiante pelo tempo útil que a
 * solicitação passou parada.
 */
export function retomarSla(
  estado: EstadoSla,
  agora: Date,
  expediente: Expediente = EXPEDIENTE_PADRAO,
): EstadoSla {
  if (estado.pausadoEm === null) {
    throw new SlaInvalidoError('O SLA não está pausado');
  }

  const minutosDaPausa = minutosUteisEntre(
    estado.pausadoEm,
    agora,
    expediente,
  );

  return {
    venceEm: adicionarMinutosUteis(estado.venceEm, minutosDaPausa, expediente),
    pausadoEm: null,
    minutosPausados: estado.minutosPausados + minutosDaPausa,
  };
}

/** Enquanto pausado o relógio não corre, então o SLA não vence. */
export function estaVencido(estado: EstadoSla, agora: Date): boolean {
  if (estado.pausadoEm !== null) {
    return false;
  }

  return agora > estado.venceEm;
}

/**
 * Minutos úteis restantes até o vencimento. Zero quando já venceu.
 * Alimenta o indicador de SLA na fila do analista (RFC seção 4.2, Tela 4).
 */
export function minutosUteisRestantes(
  estado: EstadoSla,
  agora: Date,
  expediente: Expediente = EXPEDIENTE_PADRAO,
): number {
  const referencia = estado.pausadoEm ?? agora;

  return minutosUteisEntre(referencia, estado.venceEm, expediente);
}
