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
    /** Data do commit da imagem (ISO 8601), gravada no build do Docker. */
    CONSTRUIDO_EM: z.string().optional(),

    DATABASE_URL: z.string().url(),

    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
    /** Vida do token de acesso. Curta: se vazar, serve por pouco tempo. */
    ACESSO_MINUTOS: z.coerce.number().int().positive().default(15),
    /**
     * Duração máxima de um login, em horas, mesmo com a tela aberta: cobre
     * um expediente, e no dia seguinte a pessoa entra de novo.
     */
    SESSAO_HORAS: z.coerce.number().int().positive().default(12),
    /**
     * Sem nenhum uso por este tempo (navegador fechado, computador
     * desligado), a sessão acaba. A tela aberta se renova sozinha.
     */
    SESSAO_INATIVIDADE_MINUTOS: z.coerce.number().int().positive().default(120),

    /**
     * Origem do frontend, a única autorizada a chamar a API com cookies.
     * Obrigatória em staging e produção: um padrão errado ali bloquearia o
     * site inteiro sem nenhum aviso.
     */
    FRONTEND_URL: z.string().url().optional(),

    /**
     * Chave que cifra os segredos guardados no banco (ex.: senha do e-mail
     * de envio). Obrigatória em staging e produção; trocar a chave obriga a
     * cadastrar de novo esses segredos.
     */
    CHAVE_CIFRA: z
      .string()
      .min(32, 'CHAVE_CIFRA deve ter no mínimo 32 caracteres')
      .optional(),

    /**
     * Armazenamento S3 dos anexos (SeaweedFS no servidor e no
     * docker-compose). Sem endpoint, os anexos ficam indisponíveis.
     */
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_BUCKET: z.string().min(3).default('sigof-anexos'),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_REGIAO: z.string().default('us-east-1'),

    /**
     * Para onde vai o que as pessoas escrevem na caixa de sugestões do
     * ambiente de testes. Sem ela, a caixa não aparece nas telas.
     */
    SUGESTOES_EMAIL: z.string().email().optional(),

    /** Intervalo entre as rodadas de envio da fila de e-mails. */
    EMAIL_INTERVALO_SEGUNDOS: z.coerce.number().int().positive().default(15),
  })
  .superRefine((env, ctx) => {
    const publicado =
      env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
    for (const campo of ['FRONTEND_URL', 'CHAVE_CIFRA'] as const) {
      if (publicado && env[campo] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [campo],
          message: `obrigatória em ${env.NODE_ENV}`,
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    FRONTEND_URL: env.FRONTEND_URL ?? 'http://localhost:3000',
    // Só desenvolvimento e testes chegam aqui sem a variável
    CHAVE_CIFRA:
      env.CHAVE_CIFRA ?? 'somente-desenvolvimento-nao-use-em-producao',
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
