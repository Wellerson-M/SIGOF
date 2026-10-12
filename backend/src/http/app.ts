import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { tratadorDeErros } from './tratador-de-erros.js';

/**
 * Monta a aplicação Express sem iniciar o servidor.
 *
 * Separar a montagem (`criarApp`) da execução (`server.ts`) permite que os
 * testes de integração subam a aplicação em memória com Supertest, sem
 * ocupar porta (RFC seção 5.6).
 */
export function criarApp(): Express {
  const app = express();

  // Cabeçalhos de segurança (RFC seção 6.1 — "Configuração Incorreta")
  app.use(helmet());
  app.use(cors());

  // Logs estruturados em JSON com correlation id por requisição
  // (RFC seção 5.7 — pilar de Logs)
  app.use(
    pinoHttp({
      genReqId: (req) =>
        req.headers['x-request-id']?.toString() ?? randomUUID(),
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      // Os testes não devem poluir a saída com log de requisição
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    }),
  );

  // Depois do log: JSON malformado ou grande demais também fica registrado
  // com o correlation id
  app.use(express.json({ limit: '1mb' }));

  // Health check consumido pelo monitoramento e pelo deploy
  // (RFC seções 5.7 e 5.8; RNF04)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ erro: 'Rota não encontrada' });
  });

  app.use(tratadorDeErros);

  return app;
}
