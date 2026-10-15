import { config } from 'dotenv';
import { z } from 'zod';

/**
 * Validação das variáveis de ambiente na inicialização.
 *
 * A aplicação falha imediatamente (fail fast) se alguma variável obrigatória
 * estiver ausente ou malformada, em vez de quebrar em tempo de execução com
 * um erro obscuro. Segredos vêm sempre do ambiente, nunca do código
 * (RFC seções 5.8 e 6.1 — "Configuração Incorreta").
 */
// O .env fica na raiz do repositório, mas `npm run dev` roda dentro de
// backend/. Procura nos dois lugares; o primeiro encontrado vence.
config({ path: ['.env', '../.env'] });

const esquemaEnv = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),

    PORT: z.coerce.number().int().positive().default(3333),

    /** Commit da imagem em execução, gravado no build do Docker. */
    VERSAO: z.string().default('local'),

    DATABASE_URL: z.string().url(),

    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
    /** Vida do token de acesso. Curta: se vazar, serve por pouco tempo. */
    ACESSO_MINUTOS: z.coerce.number().int().positive().default(15),
    /** Vida da sessão (refresh token) sem uso. */
    SESSAO_DIAS: z.coerce.number().int().positive().default(7),

    /**
     * Origem do frontend, a única autorizada a chamar a API com cookies.
     * Obrigatória em staging e produção: um padrão errado ali bloquearia o
     * site inteiro sem nenhum aviso.
     */
    FRONTEND_URL: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    const publicado =
      env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
    if (publicado && env.FRONTEND_URL === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FRONTEND_URL'],
        message: `obrigatória em ${env.NODE_ENV}`,
      });
    }
  })
  .transform((env) => ({
    ...env,
    FRONTEND_URL: env.FRONTEND_URL ?? 'http://localhost:3000',
  }));

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
