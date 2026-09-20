import 'dotenv/config';
import { z } from 'zod';

/**
 * Validação das variáveis de ambiente na inicialização.
 *
 * A aplicação falha imediatamente (fail fast) se alguma variável obrigatória
 * estiver ausente ou malformada, em vez de quebrar em tempo de execução com
 * um erro obscuro. Segredos vêm sempre do ambiente, nunca do código
 * (RFC seções 5.8 e 6.1 — "Configuração Incorreta").
 */
const esquemaEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3333),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  SLA_ATENDIMENTO_INICIAL_MINUTOS: z.coerce
    .number()
    .int()
    .positive()
    .default(240),
  JANELA_DUPLICIDADE_DIAS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof esquemaEnv>;

export function carregarEnv(fonte: NodeJS.ProcessEnv = process.env): Env {
  const resultado = esquemaEnv.safeParse(fonte);

  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Variáveis de ambiente inválidas:\n${problemas}\n\n` +
        'Confira o arquivo .env.example.',
    );
  }

  return resultado.data;
}
