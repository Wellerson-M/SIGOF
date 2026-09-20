import pino from 'pino';
import { carregarEnv } from '../config/env.js';
import { criarApp } from './app.js';

const logger = pino();
const env = carregarEnv();
const app = criarApp();

const servidor = app.listen(env.PORT, () => {
  logger.info(
    { porta: env.PORT, ambiente: env.NODE_ENV },
    'SIGOF API iniciada',
  );
});

// Encerramento gracioso: para de aceitar novas conexões e finaliza as em curso
// antes de sair, evitando requisições cortadas durante um deploy
// (RFC seção 5.8 — rollback/entrega contínua).
for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    logger.info({ sinal }, 'Encerrando SIGOF API');
    servidor.close(() => process.exit(0));
  });
}
