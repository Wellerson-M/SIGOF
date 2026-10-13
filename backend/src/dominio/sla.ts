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
 * O expediente vem dos parâmetros de cada empresa (início, fim, dias úteis
 * e fuso IANA), porque cada transportadora tem o seu horário.
 *
 * O deslocamento do fuso é resolvido uma vez, no instante de referência de
 * cada cálculo. Os fusos brasileiros não têm horário de verão desde 2019,
 * então o deslocamento é constante; um fuso com horário de verão teria
 * erro de até 1 hora num prazo que atravesse a troca.
 */

export interface Expediente {
  /** Início do expediente em minutos desde a meia-noite local (480 = 08:00). */
  inicioMinuto: number;
  /** Fim do expediente em minutos desde a meia-noite local (1080 = 18:00). */
  fimMinuto: number;
  /** Dias úteis, no padrão de `Date.getDay()` — 0 é domingo. */
  diasUteis: readonly number[];
  /** Fuso IANA, ex.: "America/Sao_Paulo". */
  fusoHorario: string;
}

/** Os parâmetros de expediente como estão gravados na `Empresa`. */
export interface ParametrosDeExpediente {
  fusoHorario: string;
  expedienteInicioMinuto: number;
  expedienteFimMinuto: number;
  diasUteis: readonly number[];
}

export const EXPEDIENTE_PADRAO: Expediente = {
  inicioMinuto: 8 * 60,
  fimMinuto: 18 * 60,
  diasUteis: [1, 2, 3, 4, 5],
  fusoHorario: 'America/Sao_Paulo',
};

/** Prazo de atendimento inicial padrão: 4 horas úteis (RFC seção 2.5). */
export const SLA_ATENDIMENTO_INICIAL_MINUTOS = 240;

const MINUTO_EM_MS = 60 * 1000;
const MINUTOS_POR_DIA = 24 * 60;

export class SlaInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SlaInvalidoError';
  }
}

/** Converte os parâmetros gravados na empresa para o formato do cálculo. */
export function expedienteDaEmpresa(
  parametros: ParametrosDeExpediente,
): Expediente {
  return {
    inicioMinuto: parametros.expedienteInicioMinuto,
    fimMinuto: parametros.expedienteFimMinuto,
    diasUteis: parametros.diasUteis,
    fusoHorario: parametros.fusoHorario,
  };
}

// ------------------------------------------------------------- Internos
//
// As funções abaixo trabalham com uma data "local": o instante deslocado
// pelo offset, de forma que os getters UTC devolvam a hora de parede.

function validarExpediente(expediente: Expediente): void {
  const { inicioMinuto, fimMinuto, diasUteis } = expediente;

  if (
    !Number.isInteger(inicioMinuto) ||
    !Number.isInteger(fimMinuto) ||
    inicioMinuto < 0 ||
    fimMinuto > MINUTOS_POR_DIA
  ) {
    throw new SlaInvalidoError(
      'O expediente deve estar entre 00:00 e 24:00, em minutos inteiros',
    );
  }

  if (inicioMinuto >= fimMinuto) {
    throw new SlaInvalidoError(
      'O início do expediente deve ser anterior ao término',
    );
  }

  if (diasUteis.length === 0) {
    throw new SlaInvalidoError('O expediente precisa ter ao menos um dia útil');
  }

  if (diasUteis.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6)) {
    throw new SlaInvalidoError('Dias úteis vão de 0 (domingo) a 6 (sábado)');
  }
}

/**
 * Deslocamento do fuso em relação ao UTC, em minutos, no instante dado.
 * Ex.: America/Sao_Paulo → -180.
 */
export function offsetDoFuso(fusoHorario: string, instante: Date): number {
  let formato: Intl.DateTimeFormat;

  try {
    formato = new Intl.DateTimeFormat('en-US', {
      timeZone: fusoHorario,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  } catch {
    throw new SlaInvalidoError(`Fuso horário desconhecido: ${fusoHorario}`);
  }

  const partes = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );

  const horaDeParedeComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
  );

  const instanteSemSegundos =
    Math.floor(instante.getTime() / MINUTO_EM_MS) * MINUTO_EM_MS;

  return Math.round((horaDeParedeComoUtc - instanteSemSegundos) / MINUTO_EM_MS);
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

function emMinuto(local: Date, minutoDoDia: number): Date {
  const resultado = new Date(local.getTime());
  resultado.setUTCHours(0, minutoDoDia, 0, 0);
  return resultado;
}

function proximoDiaUtil(local: Date, expediente: Expediente): Date {
  const resultado = new Date(local.getTime());

  do {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
  } while (!ehDiaUtil(resultado, expediente));

  return emMinuto(resultado, expediente.inicioMinuto);
}

/** Move um instante para dentro do expediente, avançando se necessário. */
function normalizar(local: Date, expediente: Expediente): Date {
  if (!ehDiaUtil(local, expediente)) {
    return proximoDiaUtil(local, expediente);
  }

  const inicio = emMinuto(local, expediente.inicioMinuto);
  const fim = emMinuto(local, expediente.fimMinuto);

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

  const offset = offsetDoFuso(expediente.fusoHorario, inicio);
  let atual = normalizar(paraLocal(inicio, offset), expediente);
  let restante = minutos;

  while (restante > 0) {
    const fimDoDia = emMinuto(atual, expediente.fimMinuto);
    const disponivel = (fimDoDia.getTime() - atual.getTime()) / MINUTO_EM_MS;

    if (restante <= disponivel) {
      atual = new Date(atual.getTime() + restante * MINUTO_EM_MS);
      restante = 0;
    } else {
      restante -= disponivel;
      atual = proximoDiaUtil(atual, expediente);
    }
  }

  return deLocal(atual, offset);
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

  const offset = offsetDoFuso(expediente.fusoHorario, inicio);
  const alvo = paraLocal(fim, offset);
  let atual = normalizar(paraLocal(inicio, offset), expediente);
  let total = 0;

  while (atual < alvo) {
    const fimDoDia = emMinuto(atual, expediente.fimMinuto);
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

  const minutosDaPausa = minutosUteisEntre(estado.pausadoEm, agora, expediente);

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
