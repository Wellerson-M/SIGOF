import pino from 'pino';
import { carregarEnv } from '../config/env.js';
import { criarPrismaClient } from '../banco/cliente.js';
import { criarApp } from './app.js';

const logger = pino();
const env = carregarEnv();
const prisma = criarPrismaClient(env.DATABASE_URL);
const app = criarApp({ prisma, env });

const servidor = app.listen(env.PORT, () => {
  logger.info(
    { porta: env.PORT, ambiente: env.NODE_ENV },
    'SIGOF API iniciada',
  );
});

// Encerramento gracioso: para de aceitar novas conexões e finaliza as em curso
// antes de sair, evitando requisições cortadas durante um deploy
// (RFC seção 5.8 — rollback/entrega contínua).
// Uma requisição travada não pode segurar o processo para sempre: depois do
// prazo, sai com erro. Um segundo sinal durante a espera é ignorado.
const PRAZO_DE_ENCERRAMENTO_MS = 10_000;
let encerrando = false;

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    if (encerrando) return;
    encerrando = true;

    logger.info({ sinal }, 'Encerrando SIGOF API');
    servidor.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    servidor.closeIdleConnections();

    setTimeout(() => {
      logger.error('Encerramento excedeu o prazo; saindo à força');
      process.exit(1);
    }, PRAZO_DE_ENCERRAMENTO_MS).unref();
  });
}
