import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { emitirTokenDeAcesso } from '../modulos/auth/tokens.js';
import { autenticar, exigirPerfil, usuarioDa } from './autenticacao.js';
import { protecaoCsrf } from './csrf.js';
import { tratadorDeErros } from './tratador-de-erros.js';

const SEGREDO = 'z'.repeat(32);

function appDeTeste() {
  const app = express();
  app.use(cookieParser());
  app.use(protecaoCsrf(['http://localhost:3000']));
  app.get('/qualquer', autenticar(SEGREDO), (req, res) => {
    res.json(usuarioDa(req));
  });
  app.get(
    '/gestao',
    autenticar(SEGREDO),
    exigirPerfil('SUPERVISOR', 'ADMIN'),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.get('/sem-autenticar', exigirPerfil('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/usuario-sem-autenticar', (req, res) => {
    res.json(usuarioDa(req));
  });
  app.use(tratadorDeErros);
  return app;
}

async function cookieDe(perfil: 'SOLICITANTE' | 'SUPERVISOR') {
  const token = await emitirTokenDeAcesso(
    { id: 'u1', empresaId: 'e1', perfil },
    SEGREDO,
    5,
  );
  return `sigof_acesso=${token}`;
}

describe('autenticar', () => {
  it('coloca o usuário do token na requisição', async () => {
    const resposta = await request(appDeTeste())
      .get('/qualquer')
      .set('Cookie', await cookieDe('SOLICITANTE'));

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      id: 'u1',
      empresaId: 'e1',
      perfil: 'SOLICITANTE',
    });
  });

  it('sem cookie, responde 401', async () => {
    expect((await request(appDeTeste()).get('/qualquer')).status).toBe(401);
  });
});

describe('exigirPerfil', () => {
  it('deixa passar o perfil autorizado', async () => {
    const resposta = await request(appDeTeste())
      .get('/gestao')
      .set('Cookie', await cookieDe('SUPERVISOR'));

    expect(resposta.status).toBe(200);
  });

  it('recusa com 403 outro perfil', async () => {
    const resposta = await request(appDeTeste())
      .get('/gestao')
      .set('Cookie', await cookieDe('SOLICITANTE'));

    expect(resposta.status).toBe(403);
    expect(resposta.body.codigo).toBe('ACESSO_NEGADO');
  });

  it('usado sem autenticar antes, responde 401 em vez de deixar passar', async () => {
    expect((await request(appDeTeste()).get('/sem-autenticar')).status).toBe(
      401,
    );
    expect(
      (await request(appDeTeste()).get('/usuario-sem-autenticar')).status,
    ).toBe(401);
  });
});
