import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { criarApp } from './app.js';

describe('GET /health', () => {
  it('responde 200 com status ok', async () => {
    const resposta = await request(criarApp()).get('/health');

    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('ok');
    expect(typeof resposta.body.uptime).toBe('number');
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
