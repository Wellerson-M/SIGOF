import type { PrismaClient } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ErroNaoAutenticado } from '../../http/erros.js';
import { tratadorDeErros } from '../../http/tratador-de-erros.js';
import { rotasDeAutenticacao } from './rotas.js';
import type { ServicoDeAutenticacao } from './servico.js';

/**
 * Teste isolado das rotas, com o serviço simulado. O cookie de sessão é
 * colocado direto na requisição: aqui interessa só o que a rota faz quando
 * a renovação falha (o fluxo completo, com cookies reais, está nos testes
 * de integração).
 */
function appCom(renovar: () => Promise<never>) {
  const app = express();
  app.use((req, _res, next) => {
    req.cookies = { sigof_sessao: 'qualquer' };
    next();
  });
  app.use(
    '/api/auth',
    rotasDeAutenticacao({
      servico: { renovar } as unknown as ServicoDeAutenticacao,
      prisma: {} as PrismaClient,
      jwtSecret: 'x'.repeat(32),
      acessoMinutos: 15,
      cookieSeguro: false,
    }),
  );
  app.use(tratadorDeErros);
  return app;
}

describe('POST /api/auth/renovar quando a renovação falha', () => {
  it('sessão inválida: apaga os cookies', async () => {
    const app = appCom(() =>
      Promise.reject(new ErroNaoAutenticado('Sessão expirada')),
    );

    const resposta = await request(app).post('/api/auth/renovar');

    expect(resposta.status).toBe(401);
    expect(String(resposta.headers['set-cookie'])).toContain('sigof_sessao=;');
  });

  it('falha passageira (ex.: banco fora do ar): mantém os cookies', async () => {
    const app = appCom(() => Promise.reject(new Error('conexão recusada')));

    const resposta = await request(app).post('/api/auth/renovar');

    expect(resposta.status).toBe(500);
    expect(resposta.headers['set-cookie']).toBeUndefined();
  });
});
