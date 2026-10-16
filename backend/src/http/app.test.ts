import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { carregarEnv } from '../config/env.js';
import { criarApp } from './app.js';

describe('GET /health', () => {
  it('responde 200 com status ok', async () => {
    const resposta = await request(criarApp()).get('/health');

    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('ok');
    expect(typeof resposta.body.uptime).toBe('number');
    expect(resposta.body.versao).toBe('local');
  });
});

describe('GET /api/sistema', () => {
  it('diz a versão e o ambiente no ar, sem precisar de login', async () => {
    const resposta = await request(criarApp()).get('/api/sistema');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      versao: 'local',
      ambiente: 'development',
      construidoEm: null,
    });
  });
});

describe('correlation id', () => {
  it('reaproveita o x-request-id enviado pelo cliente', async () => {
    const resposta = await request(criarApp())
      .get('/health')
      .set('x-request-id', 'id-de-rastreio-123');

    expect(resposta.status).toBe(200);
  });
});

describe('rota inexistente', () => {
  it('responde 404 com mensagem de erro', async () => {
    const resposta = await request(criarApp()).get('/rota-que-nao-existe');

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro).toBe('Rota não encontrada');
  });
});

describe('IP do cliente atrás do proxy (Caddy)', () => {
  // Banco simulado: nenhum usuário existe, então todo login responde 401
  const prismaSemUsuarios = {
    usuario: { findFirst: () => Promise.resolve(null) },
  } as unknown as PrismaClient;

  function appEm(NODE_ENV: 'development' | 'staging') {
    return criarApp({
      prisma: prismaSemUsuarios,
      env: carregarEnv({
        NODE_ENV,
        DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
        JWT_SECRET: 'x'.repeat(32),
        FRONTEND_URL: 'https://app.sigof.test',
        CHAVE_CIFRA: 'c'.repeat(32),
      }),
      limiteDeLoginPorMinuto: 1,
    });
  }

  function login(app: ReturnType<typeof appEm>, ipReal: string) {
    return request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://app.sigof.test')
      .set('X-Forwarded-For', ipReal)
      .send({ empresa: 'demo', email: 'a@b.test', senha: 'x' });
  }

  it('em staging, cada IP real tem o próprio limite de tentativas', async () => {
    const app = appEm('staging');

    expect((await login(app, '203.0.113.1')).status).toBe(401);
    expect((await login(app, '203.0.113.1')).status).toBe(429);
    expect((await login(app, '203.0.113.2')).status).toBe(401);
  });

  it('em desenvolvimento, ignora o X-Forwarded-For (que o cliente pode forjar)', async () => {
    const app = appEm('development');

    expect((await login(app, '203.0.113.1')).status).toBe(401);
    expect((await login(app, '203.0.113.2')).status).toBe(429);
  });
});
