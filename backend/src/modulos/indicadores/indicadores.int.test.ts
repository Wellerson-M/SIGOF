import type { Perfil, PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../http/app.js';
import {
  SENHA,
  apagarEmpresaDeTeste,
  conectar,
  cookiesDa,
  criarEmpresaDeTeste,
  envDeTeste,
  temBanco,
  type EmpresaDeTeste,
} from '../../testes/banco-de-teste.js';

const ENV = envDeTeste();
const FRONTEND = ENV.FRONTEND_URL;

describe.skipIf(!temBanco)('indicadores (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;
  const cookies = new Map<string, string>();

  async function cookieDe(perfil: Perfil, de: EmpresaDeTeste = empresa) {
    const chave = `${de.slug}:${perfil}`;
    if (!cookies.has(chave)) {
      const resposta = await request(app)
        .post('/api/auth/login')
        .set('Origin', FRONTEND)
        .send({
          empresa: de.slug,
          email: de.usuarios[perfil].email,
          senha: SENHA,
        });
      cookies.set(chave, `sigof_acesso=${cookiesDa(resposta).sigof_acesso}`);
    }
    return cookies.get(chave) ?? '';
  }

  const post = async (
    perfil: Perfil,
    url: string,
    corpo: object,
    de = empresa,
  ) =>
    request(app)
      .post(url)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe(perfil, de))
      .send(corpo);

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({ prisma, env: ENV, limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
    outra = await criarEmpresaDeTeste(prisma);

    // Três solicitações: uma resolvida, uma em andamento, uma na fila
    const ids: string[] = [];
    for (const [i, descricao] of [
      'Primeira; com "aspas"',
      'Segunda',
      '=SOMA(1)',
    ].entries()) {
      const r = await post('SOLICITANTE', '/api/solicitacoes', {
        tipo: i === 0 ? 'AJUSTE_FISCAL' : 'REVERSAO',
        cte: String(30_000 + i),
        descricao: `${descricao} — descrição longa o bastante`,
      });
      ids.push(r.body.id as string);
    }
    await post('ANALISTA', `/api/solicitacoes/${ids[0]}/status`, {
      status: 'EM_ANDAMENTO',
    });
    await post('ANALISTA', `/api/solicitacoes/${ids[0]}/status`, {
      status: 'RESOLVIDO',
      observacao: 'Feito',
    });
    await post('ANALISTA', `/api/solicitacoes/${ids[1]}/status`, {
      status: 'EM_ANDAMENTO',
    });
    // Na outra empresa, uma que não pode aparecer aqui
    await post(
      'SOLICITANTE',
      '/api/solicitacoes',
      { tipo: 'OUTRO', descricao: 'De outra empresa' },
      outra,
    );
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, outra.id);
    await prisma.$disconnect();
  });

  it('só supervisor e administrador veem', async () => {
    for (const perfil of ['SOLICITANTE', 'ANALISTA'] as const) {
      const r = await request(app)
        .get('/api/indicadores')
        .set('Cookie', await cookieDe(perfil));
      expect(r.status).toBe(403);
    }
  });

  it('calcula a partir das solicitações da própria empresa', async () => {
    const r = await request(app)
      .get('/api/indicadores?dias=7')
      .set('Cookie', await cookieDe('SUPERVISOR'));
    expect(r.status).toBe(200);
    expect(r.body.periodo.dias).toBe(7);
    expect(r.body.agora).toMatchObject({
      abertas: 2,
      slaVencido: 0,
      semResponsavel: 1,
    });
    expect(r.body.noPeriodo).toMatchObject({
      abertas: 3,
      resolvidas: 1,
      atendidas: 2,
      atendidasNoPrazo: 2,
      percentualNoPrazo: 100,
    });
    expect(r.body.porTipo).toEqual([
      { tipo: 'REVERSAO', total: 2 },
      { tipo: 'AJUSTE_FISCAL', total: 1 },
    ]);
    expect(r.body.porResponsavel).toEqual([
      expect.objectContaining({
        nome: 'ANALISTA',
        emAberto: 1,
        resolvidasNoPeriodo: 1,
      }),
    ]);
    expect(r.body.porDia).toHaveLength(7);
  });

  it('recusa período fora da lista', async () => {
    const r = await request(app)
      .get('/api/indicadores?dias=365')
      .set('Cookie', await cookieDe('ADMIN'));
    expect(r.status).toBe(400);
  });

  it('exporta CSV para o Excel, com fórmulas neutralizadas', async () => {
    const r = await request(app)
      .get('/api/indicadores/solicitacoes.csv?dias=30')
      .set('Cookie', await cookieDe('ADMIN'));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(
      /attachment; filename="sigof-solicitacoes-\d{4}-\d{2}-\d{2}-30dias\.csv"/,
    );
    const texto = r.text;
    expect(texto.startsWith('﻿Protocolo;Aberta em;Tipo')).toBe(true);
    const linhas = texto.trim().split('\r\n');
    expect(linhas).toHaveLength(4);
    expect(texto).toContain(
      // Filial vazia entre o tipo e o CTe; NF e fatura vazias depois dele
      ';Ajuste fiscal;;30000;;;Resolvido;Média;SOLICITANTE;ANALISTA;',
    );
    // Sem causa registrada, as três últimas colunas ficam vazias
    expect(texto).toMatch(/;sim;;;\r\n/);
    expect(texto).not.toContain('De outra empresa');
  });
});
