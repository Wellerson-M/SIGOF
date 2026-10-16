import pino from 'pino';
import { carregarEnv } from '../config/env.js';
import { criarPrismaClient } from '../banco/cliente.js';
import { Carteiro } from '../modulos/avisos/carteiro.js';
import { Cifra } from '../seguranca/cifra.js';
import { criarApp } from './app.js';

const logger = pino();
const env = carregarEnv();
const prisma = criarPrismaClient(env.DATABASE_URL);
const app = criarApp({ prisma, env });

// Fila de e-mails: enviada em segundo plano, no mesmo processo da API
const carteiro = new Carteiro(
  prisma,
  new Cifra(env.CHAVE_CIFRA),
  undefined,
  undefined,
  (mensagem, erro) => logger.error({ err: erro }, mensagem),
);
carteiro.iniciar(env.EMAIL_INTERVALO_SEGUNDOS * 1000);

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
    carteiro.parar();
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
