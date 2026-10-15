import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { protecaoCsrf } from './csrf.js';
import { tratadorDeErros } from './tratador-de-erros.js';

const FRONTEND = 'https://app.sigof.test';

function appDeTeste() {
  const app = express();
  app.use(protecaoCsrf([FRONTEND]));
  app.get('/ler', (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/alterar', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(tratadorDeErros);
  return app;
}

describe('protecaoCsrf', () => {
  it('deixa passar leitura de qualquer origem', async () => {
    const resposta = await request(appDeTeste())
      .get('/ler')
      .set('Origin', 'https://site-malicioso.test');

    expect(resposta.status).toBe(200);
  });

  it('deixa passar alteração vinda do frontend', async () => {
    const resposta = await request(appDeTeste())
      .post('/alterar')
      .set('Origin', FRONTEND);

    expect(resposta.status).toBe(200);
  });

  it('recusa alteração vinda de outro site', async () => {
    const resposta = await request(appDeTeste())
      .post('/alterar')
      .set('Origin', 'https://site-malicioso.test');

    expect(resposta.status).toBe(403);
  });

  it('sem Origin, usa o Referer', async () => {
    const doFrontend = await request(appDeTeste())
      .post('/alterar')
      .set('Referer', `${FRONTEND}/solicitacoes/nova`);
    const deFora = await request(appDeTeste())
      .post('/alterar')
      .set('Referer', 'https://site-malicioso.test/pagina');

    expect(doFrontend.status).toBe(200);
    expect(deFora.status).toBe(403);
  });

  it('sem Origin nem Referer (ou com Referer inválido), recusa', async () => {
    const semNada = await request(appDeTeste()).post('/alterar');
    const invalido = await request(appDeTeste())
      .post('/alterar')
      .set('Referer', 'isto não é uma url');

    expect(semNada.status).toBe(403);
    expect(invalido.status).toBe(403);
  });

  it('não confunde origem parecida (prefixo) com a autorizada', async () => {
    const resposta = await request(appDeTeste())
      .post('/alterar')
      .set('Origin', `${FRONTEND}.site-malicioso.test`);

    expect(resposta.status).toBe(403);
  });
});
