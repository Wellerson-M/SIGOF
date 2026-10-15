import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ErroNaoAutenticado } from '../../http/erros.js';
import { tratadorDeErros } from '../../http/tratador-de-erros.js';
import { rotasDeAutenticacao } from './rotas.js';
import type { ServicoDeAutenticacao } from './servico.js';

function appCom(renovar: () => Promise<never>) {
  const app = express();
  app.use(cookieParser());
  app.use(
    '/auth',
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

describe('POST /auth/renovar quando a renovação falha', () => {
  it('sessão inválida: apaga os cookies', async () => {
    const app = appCom(() =>
      Promise.reject(new ErroNaoAutenticado('Sessão expirada')),
    );

    const resposta = await request(app)
      .post('/auth/renovar')
      .set('Cookie', 'sigof_sessao=qualquer');

    expect(resposta.status).toBe(401);
    expect(String(resposta.headers['set-cookie'])).toContain('sigof_sessao=;');
  });

  it('falha passageira (ex.: banco fora do ar): mantém os cookies', async () => {
    const app = appCom(() => Promise.reject(new Error('conexão recusada')));

    const resposta = await request(app)
      .post('/auth/renovar')
      .set('Cookie', 'sigof_sessao=qualquer');

    expect(resposta.status).toBe(500);
    expect(resposta.headers['set-cookie']).toBeUndefined();
  });
});
