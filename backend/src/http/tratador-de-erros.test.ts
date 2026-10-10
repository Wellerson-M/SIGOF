import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { criarApp } from './app.js';
import {
  ErroAcessoNegado,
  ErroDeConflito,
  ErroDeRegraDeNegocio,
  ErroDeValidacao,
  ErroNaoAutenticado,
  ErroNaoEncontrado,
} from './erros.js';
import { tratadorDeErros } from './tratador-de-erros.js';

/** App mínima com uma rota que lança o erro informado. */
function appQueLanca(erro: unknown): Express {
  const app = express();
  app.get('/falha', () => {
    throw erro;
  });
  app.use(tratadorDeErros);
  return app;
}

describe('tratadorDeErros', () => {
  it.each([
    [new ErroDeValidacao(), 400, 'VALIDACAO'],
    [new ErroNaoAutenticado(), 401, 'NAO_AUTENTICADO'],
    [new ErroAcessoNegado(), 403, 'ACESSO_NEGADO'],
    [new ErroNaoEncontrado(), 404, 'NAO_ENCONTRADO'],
    [new ErroDeConflito('Já existe'), 409, 'CONFLITO'],
    [new ErroDeRegraDeNegocio('Transição inválida'), 422, 'REGRA_DE_NEGOCIO'],
  ])(
    'responde %s com o status do erro de aplicação',
    async (erro, status, codigo) => {
      const resposta = await request(appQueLanca(erro)).get('/falha');

      expect(resposta.status).toBe(status);
      expect(resposta.body.codigo).toBe(codigo);
      expect(resposta.body.erro).toBe(erro.message);
    },
  );

  it('inclui os detalhes quando o erro traz detalhes', async () => {
    const detalhes = { protocolos: ['SOL-2026-10-0001'] };
    const resposta = await request(
      appQueLanca(new ErroDeConflito('Possível duplicidade', detalhes)),
    ).get('/falha');

    expect(resposta.body.detalhes).toEqual(detalhes);
  });

  it('omite o campo detalhes quando o erro não traz detalhes', async () => {
    const resposta = await request(appQueLanca(new ErroNaoEncontrado())).get(
      '/falha',
    );

    expect(resposta.body).not.toHaveProperty('detalhes');
  });

  it('responde 500 genérico para erro inesperado, sem vazar a mensagem', async () => {
    const resposta = await request(
      appQueLanca(new Error('senha do banco: hunter2')),
    ).get('/falha');

    expect(resposta.status).toBe(500);
    expect(resposta.body.erro).toBe('Erro interno do servidor');
    expect(resposta.body.codigo).toBe('ERRO_INTERNO');
    expect(JSON.stringify(resposta.body)).not.toContain('hunter2');
  });

  it('responde 500 quando o valor lançado nem é um Error', async () => {
    const resposta = await request(appQueLanca('falhou')).get('/falha');

    expect(resposta.status).toBe(500);
  });

  it('não confia em status 5xx vindo de um erro qualquer', async () => {
    const resposta = await request(
      appQueLanca(Object.assign(new Error('x'), { status: 503 })),
    ).get('/falha');

    expect(resposta.status).toBe(500);
    expect(resposta.body.codigo).toBe('ERRO_INTERNO');
  });

  it('respeita erro 4xx genérico com mensagem fixa', async () => {
    const resposta = await request(
      appQueLanca(Object.assign(new Error('interno'), { status: 418 })),
    ).get('/falha');

    expect(resposta.status).toBe(418);
    expect(resposta.body.erro).toBe('Requisição inválida');
  });
});

describe('erros do Express na aplicação real', () => {
  it('responde 400 para JSON malformado', async () => {
    const resposta = await request(criarApp())
      .post('/health')
      .set('content-type', 'application/json')
      .send('{"quebrado":');

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toBe('JSON malformado');
  });

  it('responde 413 para corpo grande demais', async () => {
    const resposta = await request(criarApp())
      .post('/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ texto: 'x'.repeat(2 * 1024 * 1024) }));

    expect(resposta.status).toBe(413);
    expect(resposta.body.erro).toBe('Corpo da requisição grande demais');
  });
});

describe('correlation id no erro 500', () => {
  it('devolve o id da requisição para o suporte localizar o log', async () => {
    const app = express();
    app.use(pinoHttp({ genReqId: () => 'rastreio-500', level: 'silent' }));
    app.get('/falha', () => {
      throw new Error('x');
    });
    app.use(tratadorDeErros);

    const resposta = await request(app).get('/falha');

    expect(resposta.status).toBe(500);
    expect(resposta.body.id).toBe('rastreio-500');
  });
});
