import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { Env } from '../config/env.js';
import { rotasDeAdministracao } from '../modulos/administracao/rotas.js';
import { ServicoDeAdministracao } from '../modulos/administracao/servico.js';
import { ServicoDeAvisos } from '../modulos/avisos/avisos.js';
import type { Remetente } from '../modulos/avisos/carteiro.js';
import { ServicoDeConfiguracaoDeEmail } from '../modulos/avisos/configuracao.js';
import { ServicoDeNotificacoes } from '../modulos/avisos/notificacoes.js';
import {
  rotasDeConfiguracaoDeEmail,
  rotasDeNotificacoes,
} from '../modulos/avisos/rotas.js';
import {
  ArmazenamentoIndisponivel,
  ArmazenamentoS3,
  type Armazenamento,
} from '../modulos/anexos/armazenamento.js';
import { rotasDeAnexos } from '../modulos/anexos/rotas.js';
import { ServicoDeAnexos } from '../modulos/anexos/servico.js';
import { rotasDeAutenticacao } from '../modulos/auth/rotas.js';
import {
  ServicoDeIndicadores,
  rotasDeIndicadores,
} from '../modulos/indicadores/indicadores.js';
import { ServicoDeAutenticacao } from '../modulos/auth/servico.js';
import { rotasDeSolicitacoes } from '../modulos/solicitacoes/rotas.js';
import { ServicoDeSolicitacoes } from '../modulos/solicitacoes/servico.js';
import { Cifra } from '../seguranca/cifra.js';
import { protecaoCsrf } from './csrf.js';
import { tratadorDeErros } from './tratador-de-erros.js';

export interface ModulosDaApp {
  prisma: PrismaClient;
  env: Env;
  /** Sobrescreve o limite de tentativas de login (testes). */
  limiteDeLoginPorMinuto?: number;
  /** Troca o envio SMTP real por um dublê (testes). */
  remetenteDeEmail?: Remetente;
  /** Troca o armazenamento S3 por outro (testes). */
  armazenamento?: Armazenamento;
}

function armazenamentoDo(env: Env): Armazenamento {
  if (!env.STORAGE_ENDPOINT) {
    return new ArmazenamentoIndisponivel();
  }
  return new ArmazenamentoS3({
    endpoint: env.STORAGE_ENDPOINT,
    bucket: env.STORAGE_BUCKET,
    chaveDeAcesso: env.STORAGE_ACCESS_KEY ?? '',
    segredo: env.STORAGE_SECRET_KEY ?? '',
    regiao: env.STORAGE_REGIAO,
  });
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

  // Em staging e produção a API fica atrás do Caddy. Sem isto, o IP de toda
  // requisição seria o do Caddy, e o limite de tentativas de login valeria
  // para todos os usuários juntos.
  const publicado =
    modulos?.env.NODE_ENV === 'staging' ||
    modulos?.env.NODE_ENV === 'production';
  if (publicado) {
    app.set('trust proxy', 1);
  }

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
      // Commit em execução: o pipeline de entrega usa para confirmar que a
      // versão nova está no ar
      versao: modulos?.env.VERSAO ?? 'local',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Qual versão está no ar: aparece no rodapé do menu e na Administração.
  // Sem login, como o /health: a tela de entrada também mostra.
  app.get('/api/sistema', (_req: Request, res: Response) => {
    res.json({
      versao: modulos?.env.VERSAO ?? 'local',
      ambiente: modulos?.env.NODE_ENV ?? 'development',
      construidoEm: modulos?.env.CONSTRUIDO_EM || null,
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
      '/api/auth',
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

    const avisos = new ServicoDeAvisos({ urlDoSistema: env.FRONTEND_URL });
    app.use(
      '/api/solicitacoes/:id/anexos',
      rotasDeAnexos({
        servico: new ServicoDeAnexos(
          prisma,
          modulos.armazenamento ?? armazenamentoDo(env),
          avisos,
        ),
        jwtSecret: env.JWT_SECRET,
      }),
    );
    app.use(
      '/api/solicitacoes',
      rotasDeSolicitacoes({
        servico: new ServicoDeSolicitacoes(prisma, avisos),
        jwtSecret: env.JWT_SECRET,
      }),
    );

    app.use(
      '/api/indicadores',
      rotasDeIndicadores({
        servico: new ServicoDeIndicadores(prisma),
        jwtSecret: env.JWT_SECRET,
      }),
    );

    app.use(
      '/api/notificacoes',
      rotasDeNotificacoes({
        servico: new ServicoDeNotificacoes(prisma),
        jwtSecret: env.JWT_SECRET,
      }),
    );

    app.use(
      '/api/admin/email',
      rotasDeConfiguracaoDeEmail({
        servico: new ServicoDeConfiguracaoDeEmail(
          prisma,
          new Cifra(env.CHAVE_CIFRA),
          env.FRONTEND_URL,
          modulos.remetenteDeEmail,
        ),
        jwtSecret: env.JWT_SECRET,
      }),
    );

    app.use(
      '/api/admin',
      rotasDeAdministracao({
        servico: new ServicoDeAdministracao(prisma),
        jwtSecret: env.JWT_SECRET,
      }),
    );
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ erro: 'Rota não encontrada' });
  });

  app.use(tratadorDeErros);

  return app;
}
