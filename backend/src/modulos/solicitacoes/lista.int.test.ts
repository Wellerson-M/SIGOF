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
import { ITENS_POR_PAGINA, inicioDoDia } from './servico.js';

const ENV = envDeTeste();
const FRONTEND = ENV.FRONTEND_URL;

describe('inicioDoDia', () => {
  it('meia-noite local, em UTC', () => {
    expect(inicioDoDia('2026-10-16', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-16T03:00:00.000Z',
    );
    expect(inicioDoDia('2026-10-16', 'America/Manaus').toISOString()).toBe(
      '2026-10-16T04:00:00.000Z',
    );
    expect(inicioDoDia('2026-10-16', 'UTC').toISOString()).toBe(
      '2026-10-16T00:00:00.000Z',
    );
  });
});

describe.skipIf(!temBanco)('lista com filtros (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;
  const cookies = new Map<string, string>();
  const ids: string[] = [];

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

  const lista = async (perfil: Perfil, filtros = '', de = empresa) =>
    request(app)
      .get(`/api/solicitacoes/lista${filtros}`)
      .set('Cookie', await cookieDe(perfil, de));

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({ prisma, env: ENV, limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
    outra = await criarEmpresaDeTeste(prisma);

    // 30 solicitações: as do analista e as do solicitante, de tipos variados
    for (let i = 0; i < 30; i++) {
      const perfil: Perfil = i % 3 === 0 ? 'ANALISTA' : 'SOLICITANTE';
      const r = await request(app)
        .post('/api/solicitacoes')
        .set('Origin', FRONTEND)
        .set('Cookie', await cookieDe(perfil))
        .send({
          tipo: i % 2 === 0 ? 'REVERSAO' : 'AJUSTE_FISCAL',
          cte: String(80_000 + i),
          descricao: `Ocorrência número ${i} para a lista`,
          prioridade: i === 5 ? 'URGENTE' : 'MEDIA',
        });
      ids.push(r.body.id as string);
    }
    // Uma resolvida há 60 dias: fora do quadro, mas na lista
    await prisma.solicitacao.update({
      where: { id: ids[1] ?? '' },
      data: {
        status: 'RESOLVIDO',
        criadoEm: new Date(Date.now() - 61 * 86_400_000),
        atualizadoEm: new Date(Date.now() - 60 * 86_400_000),
        resolvidoEm: new Date(Date.now() - 60 * 86_400_000),
      },
    });
    await request(app)
      .post(`/api/solicitacoes/${ids[2]}/status`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe('ANALISTA'))
      .send({ status: 'EM_ANDAMENTO' });
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, outra.id);
    await prisma.$disconnect();
  });

  it('pagina de forma estável, mais nova primeiro', async () => {
    const p1 = (await lista('SUPERVISOR')).body;
    const p2 = (await lista('SUPERVISOR', '?pagina=2')).body;
    expect(p1).toMatchObject({
      total: 30,
      pagina: 1,
      porPagina: ITENS_POR_PAGINA,
    });
    expect(p1.itens).toHaveLength(ITENS_POR_PAGINA);
    expect(p2.itens).toHaveLength(30 - ITENS_POR_PAGINA);
    const todos = [...p1.itens, ...p2.itens].map((s: { id: string }) => s.id);
    expect(new Set(todos).size).toBe(30);
    expect(p1.itens[0].id).toBe(ids[29]);
  });

  it('inclui o que já saiu do quadro', async () => {
    const r = (await lista('SUPERVISOR', '?status=RESOLVIDO')).body;
    expect(r.itens.map((s: { id: string }) => s.id)).toEqual([ids[1]]);
    const quadro = (
      await request(app)
        .get('/api/solicitacoes')
        .set('Cookie', await cookieDe('SUPERVISOR'))
    ).body as { id: string }[];
    expect(quadro.some((s) => s.id === ids[1])).toBe(false);
  });

  it('combina filtros de status, prioridade, tipo e busca', async () => {
    expect((await lista('SUPERVISOR', '?prioridade=URGENTE')).body.total).toBe(
      1,
    );
    expect((await lista('SUPERVISOR', '?tipo=REVERSAO')).body.total).toBe(15);
    expect(
      (await lista('SUPERVISOR', '?status=NOVO,EM_ANDAMENTO&tipo=REVERSAO'))
        .body.total,
    ).toBe(15);
    expect((await lista('SUPERVISOR', '?busca=CT-e 80.007')).body.total).toBe(
      1,
    );
    expect((await lista('SUPERVISOR', '?busca=ocorrência')).body.total).toBe(
      30,
    );
  });

  it('"minhas" e responsável', async () => {
    const minhas = (await lista('ANALISTA', '?minhas=true')).body;
    // As 10 que o analista abriu, mais a que ele assumiu
    expect(minhas.total).toBe(11);
    const comAnalista = (
      await lista(
        'SUPERVISOR',
        `?responsavelId=${empresa.usuarios.ANALISTA.id}`,
      )
    ).body;
    expect(comAnalista.itens.map((s: { id: string }) => s.id)).toEqual([
      ids[2],
    ]);
  });

  it('filtra por período, no fuso da empresa', async () => {
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    expect(
      (await lista('SUPERVISOR', `?de=${hoje}&ate=${hoje}`)).body.total,
    ).toBe(29);
    expect((await lista('SUPERVISOR', '?ate=2020-01-01')).body.total).toBe(0);
  });

  it('o solicitante vê só as dele; outra empresa não vê nada', async () => {
    expect((await lista('SOLICITANTE')).body.total).toBe(20);
    expect((await lista('SUPERVISOR', '', outra)).body.total).toBe(0);
  });

  it('valida os filtros', async () => {
    expect((await lista('SUPERVISOR', '?status=QUALQUER')).status).toBe(400);
    expect((await lista('SUPERVISOR', '?de=16/10/2026')).status).toBe(400);
    expect((await lista('SUPERVISOR', '?pagina=0')).status).toBe(400);
  });
});
