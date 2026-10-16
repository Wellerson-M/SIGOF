import type { AcaoDeAuditoria, Prisma, PrismaClient } from '@prisma/client';

/** Quem pode gravar: o client normal ou uma transação em andamento. */
type Gravador =
  Pick<PrismaClient, 'eventoAuditoria'> | Prisma.TransactionClient;

export interface Evento {
  empresaId: string;
  acao: AcaoDeAuditoria;
  autorId?: string | null;
  alvoId?: string | null;
  detalhes?: Prisma.InputJsonValue;
  ip?: string | null | undefined;
}

/**
 * Grava um evento na trilha de auditoria (RNF09).
 *
 * Dentro de uma transação, o evento só existe se a alteração também for
 * gravada: não fica registro de mudança que não aconteceu.
 */
export async function registrar(gravador: Gravador, evento: Evento) {
  await gravador.eventoAuditoria.create({
    data: {
      empresaId: evento.empresaId,
      acao: evento.acao,
      autorId: evento.autorId ?? null,
      alvoId: evento.alvoId ?? null,
      ...(evento.detalhes === undefined ? {} : { detalhes: evento.detalhes }),
      ip: evento.ip ?? null,
    },
  });
}

/**
 * Só os campos que mudaram, com o valor de antes e o de depois:
 * `{ perfil: { de: 'ANALISTA', para: 'SUPERVISOR' } }`.
 */
export function diferencas(
  antes: object,
  depois: object,
): Record<string, { de: unknown; para: unknown }> {
  const mudou: Record<string, { de: unknown; para: unknown }> = {};
  const valores = antes as Record<string, unknown>;
  for (const [campo, valor] of Object.entries(depois)) {
    if (valor === undefined) continue;
    const anterior = valores[campo];
    if (JSON.stringify(anterior) !== JSON.stringify(valor)) {
      mudou[campo] = { de: anterior ?? null, para: valor };
    }
  }
  return mudou;
}
