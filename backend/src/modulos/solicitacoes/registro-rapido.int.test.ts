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
import { ArmazenamentoEmMemoria } from '../anexos/armazenamento.js';

const FRONTEND = envDeTeste().FRONTEND_URL;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF registro');

describe.skipIf(!temBanco)('registro rápido (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({
      prisma,
      env: envDeTeste(),
      limiteDeLoginPorMinuto: 1000,
      armazenamento: new ArmazenamentoEmMemoria(),
    });
    empresa = await criarEmpresaDeTeste(prisma);
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await prisma.$disconnect();
  });

  async function cookieDe(perfil: Perfil) {
    if (!cookies.has(perfil)) {
      const resposta = await request(app)
        .post('/api/auth/login')
        .set('Origin', FRONTEND)
        .send({
          empresa: empresa.slug,
          email: empresa.usuarios[perfil].email,
          senha: SENHA,
        });
      cookies.set(perfil, `sigof_acesso=${cookiesDa(resposta).sigof_acesso}`);
    }
    return cookies.get(perfil) ?? '';
  }

  async function registrar(perfil: Perfil, corpo: object) {
    return request(app)
      .post('/api/solicitacoes')
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe(perfil))
      .send(corpo);
  }

  let documento = 50_000;
  function base(extra: object = {}) {
    documento += 1;
    return {
      tipo: 'REVERSAO',
      cte: String(documento),
      descricao: 'Reversão pedida pelo WhatsApp',
      registro: { acaoTomada: 'CTe de reversão emitido e enviado.' },
      ...extra,
    };
  }

  it('nasce resolvida, com o analista como responsável e sem prazo', async () => {
    const resposta = await registrar('ANALISTA', base());

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      status: 'RESOLVIDO',
      registroRapido: true,
      responsavel: { id: empresa.usuarios.ANALISTA.id },
      slaVenceEm: null,
    });

    const detalhe = await request(app)
      .get(`/api/solicitacoes/${resposta.body.id}`)
      .set('Cookie', await cookieDe('ANALISTA'));
    expect(
      detalhe.body.historico.map(
        (h: { statusNovo: string; observacao: string }) => [
          h.statusNovo,
          h.observacao,
        ],
      ),
    ).toEqual([
      ['NOVO', 'Registro rápido'],
      ['RESOLVIDO', 'CTe de reversão emitido e enviado.'],
    ]);
  });

  it('não avisa ninguém, nem por e-mail', async () => {
    const resposta = await registrar('SUPERVISOR', base());
    const [notificacoes, emails] = await Promise.all([
      prisma.notificacao.count({ where: { solicitacaoId: resposta.body.id } }),
      prisma.emailSaida.count({ where: { solicitacaoId: resposta.body.id } }),
    ]);

    expect(notificacoes).toBe(0);
    expect(emails).toBe(0);
  });

  it('grava a causa do erro junto', async () => {
    const causa = await prisma.causaDeErro.create({
      data: {
        empresaId: empresa.id,
        nome: 'Erro de digitação',
        opcoes: ['Ana'],
      },
    });
    const resposta = await registrar(
      'ANALISTA',
      base({
        registro: {
          acaoTomada: 'Corrigido.',
          classificacao: { causaId: causa.id, detalhe: 'Ana' },
        },
      }),
    );

    const gravada = await prisma.solicitacao.findUniqueOrThrow({
      where: { id: resposta.body.id },
    });
    expect(gravada).toMatchObject({ causaId: causa.id, causaDetalhe: 'Ana' });
  });

  it('a equipe anexa o documento depois de registrar', async () => {
    const resposta = await registrar('ANALISTA', base());
    const anexo = await request(app)
      .post(`/api/solicitacoes/${resposta.body.id}/anexos`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe('ANALISTA'))
      .attach('arquivo', PDF, 'cte.pdf');

    expect(anexo.status).toBe(201);
    expect(
      await prisma.notificacao.count({
        where: { solicitacaoId: resposta.body.id },
      }),
    ).toBe(0);
  });

  it('também passa pelo alerta de duplicidade', async () => {
    const primeira = base();
    await registrar('ANALISTA', primeira);
    const repetida = await registrar('ANALISTA', {
      ...primeira,
      registro: { acaoTomada: 'De novo.' },
    });

    expect(repetida.status).toBe(409);
  });

  it('solicitante não faz registro rápido; ação tomada vazia é recusada', async () => {
    expect((await registrar('SOLICITANTE', base())).status).toBe(403);
    expect(
      (await registrar('ANALISTA', base({ registro: { acaoTomada: ' ' } })))
        .status,
    ).toBe(400);
  });

  it('fica fora do tempo médio de resolução e é contado à parte', async () => {
    const indicadores = await request(app)
      .get('/api/indicadores?dias=7')
      .set('Cookie', await cookieDe('SUPERVISOR'));

    expect(indicadores.body.noPeriodo.registrosRapidos).toBe(5);
    expect(indicadores.body.noPeriodo.minutosMedioAteResolver).toBeNull();
  });
});
