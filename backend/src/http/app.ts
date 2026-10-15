import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { Env } from '../config/env.js';
import { rotasDeAutenticacao } from '../modulos/auth/rotas.js';
import { ServicoDeAutenticacao } from '../modulos/auth/servico.js';
import { protecaoCsrf } from './csrf.js';
import { tratadorDeErros } from './tratador-de-erros.js';

export interface ModulosDaApp {
  prisma: PrismaClient;
  env: Env;
  /** Sobrescreve o limite de tentativas de login (testes). */
  limiteDeLoginPorMinuto?: number;
}

/**
 * Monta a aplicação Express sem iniciar o servidor.
 *
 * Separar a montagem (`criarApp`) da execução (`server.ts`) permite que os
 * testes de integração subam a aplicação em memória com Supertest, sem
 * ocupar porta (RFC seção 5.6).
 *
 * Sem `modulos`, sobe só a infraestrutura (cabeçalhos, log, health check e
 * tratamento de erros), o que basta para os testes unitários dela.
 */
export function criarApp(modulos?: ModulosDaApp): Express {
  const app = express();

  // Cabeçalhos de segurança (RFC seção 6.1 — "Configuração Incorreta")
  app.use(helmet());
  // Só o frontend pode chamar a API levando cookies; qualquer outra origem
  // é recusada pelo navegador
  app.use(
    cors({
      origin: modulos ? modulos.env.FRONTEND_URL : false,
      credentials: true,
    }),
  );
  app.use(cookieParser());

  // Logs estruturados em JSON com correlation id por requisição
  // (RFC seção 5.7 — pilar de Logs)
  app.use(
    pinoHttp({
      genReqId: (req) =>
        req.headers['x-request-id']?.toString() ?? randomUUID(),
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      // Os testes não devem poluir a saída com log de requisição
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    }),
  );

  // Depois do log: JSON malformado ou grande demais também fica registrado
  // com o correlation id
  app.use(express.json({ limit: '1mb' }));

  // Requisições que alteram dados só são aceitas vindas do frontend
  app.use(protecaoCsrf(modulos ? [modulos.env.FRONTEND_URL] : []));

  // Health check consumido pelo monitoramento e pelo deploy
  // (RFC seções 5.7 e 5.8; RNF04)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  if (modulos) {
    const { prisma, env } = modulos;
    const servico = new ServicoDeAutenticacao(prisma, {
      jwtSecret: env.JWT_SECRET,
      acessoMinutos: env.ACESSO_MINUTOS,
      sessaoDias: env.SESSAO_DIAS,
    });

    app.use(
      '/auth',
      rotasDeAutenticacao({
        servico,
        prisma,
        jwtSecret: env.JWT_SECRET,
        acessoMinutos: env.ACESSO_MINUTOS,
        cookieSeguro:
          env.NODE_ENV === 'production' || env.NODE_ENV === 'staging',
        ...(modulos.limiteDeLoginPorMinuto === undefined
          ? {}
          : { limiteDeLoginPorMinuto: modulos.limiteDeLoginPorMinuto }),
      }),
    );
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ erro: 'Rota não encontrada' });
  });

  app.use(tratadorDeErros);

  return app;
}
