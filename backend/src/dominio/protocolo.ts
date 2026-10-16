/**
 * Geração e leitura do número de protocolo (RFC seções 2.5 e 4.3).
 *
 * Formato: `SOL-AAAA-MM-NNNN`, onde NNNN é um sequencial que reinicia a
 * cada mês e é contado por empresa. O valor é imutável depois de gerado.
 *
 * Este módulo cuida apenas do formato. A obtenção do próximo sequencial é
 * responsabilidade do repositório, que incrementa a tabela
 * `SequenciaProtocolo` dentro da transação que cria a solicitação — é isso
 * que garante que duas aberturas simultâneas não recebam o mesmo número.
 */

export interface ComponentesProtocolo {
  ano: number;
  mes: number;
  sequencial: number;
}

/** Com 4 dígitos, o teto é 9999 solicitações por empresa/mês. */
export const SEQUENCIAL_MAXIMO = 9999;

const FORMATO_PROTOCOLO = /^SOL-(\d{4})-(\d{2})-(\d{4})$/;

export class ProtocoloInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ProtocoloInvalidoError';
  }
}

export function formatarProtocolo({
  ano,
  mes,
  sequencial,
}: ComponentesProtocolo): string {
  if (!Number.isInteger(ano) || ano < 1000 || ano > 9999) {
    throw new ProtocoloInvalidoError(`Ano fora do intervalo: ${ano}`);
  }

  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new ProtocoloInvalidoError(`Mês fora do intervalo: ${mes}`);
  }

  if (!Number.isInteger(sequencial) || sequencial < 1) {
    throw new ProtocoloInvalidoError(
      `Sequencial deve ser inteiro positivo: ${sequencial}`,
    );
  }

  if (sequencial > SEQUENCIAL_MAXIMO) {
    throw new ProtocoloInvalidoError(
      `Sequencial estourou o limite de ${SEQUENCIAL_MAXIMO} para a competência ${mes}/${ano}`,
    );
  }

  const mesFormatado = String(mes).padStart(2, '0');
  const sequencialFormatado = String(sequencial).padStart(4, '0');

  return `SOL-${ano}-${mesFormatado}-${sequencialFormatado}`;
}

export function analisarProtocolo(protocolo: string): ComponentesProtocolo {
  const partes = FORMATO_PROTOCOLO.exec(protocolo.trim());

  if (!partes) {
    throw new ProtocoloInvalidoError(
      `Protocolo fora do formato SOL-AAAA-MM-NNNN: ${protocolo}`,
    );
  }

  const componentes: ComponentesProtocolo = {
    ano: Number(partes[1]),
    mes: Number(partes[2]),
    sequencial: Number(partes[3]),
  };

  // Reaproveita as validações de intervalo (mês 13, sequencial 0, etc.)
  formatarProtocolo(componentes);

  return componentes;
}

/**
 * Competência (ano/mês) de uma data, que identifica a linha de
 * `SequenciaProtocolo` a ser incrementada.
 *
 * É calculada no fuso da empresa. O servidor roda em UTC: sem isto, uma
 * solicitação aberta às 22h do dia 31 em São Paulo (01h do dia 1º em UTC)
 * ganharia o protocolo do mês seguinte.
 */
export function competenciaDe(
  data: Date,
  fusoHorario: string,
): { ano: number; mes: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fusoHorario,
      year: 'numeric',
      month: 'numeric',
    })
      .formatToParts(data)
      .map((parte) => [parte.type, parte.value]),
  );

  return { ano: Number(partes.year), mes: Number(partes.month) };
}
