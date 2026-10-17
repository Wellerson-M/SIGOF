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

const FRONTEND = envDeTeste().FRONTEND_URL;

describe.skipIf(!temBanco)('verificações (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({ prisma, env: envDeTeste(), limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
    outra = await criarEmpresaDeTeste(prisma);
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, outra.id);
    await prisma.$disconnect();
  });

  async function como(perfil: Perfil, de: EmpresaDeTeste = empresa) {
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
    const cookie = cookies.get(chave) ?? '';
    const enviar =
      (metodo: 'post' | 'patch' | 'put') => (url: string, corpo: object) => {
        const agente = request(app);
        return agente[metodo](url)
          .set('Origin', FRONTEND)
          .set('Cookie', cookie)
          .send(corpo);
      };
    return {
      get: (url: string) => request(app).get(url).set('Cookie', cookie),
      post: enviar('post'),
      patch: enviar('patch'),
      put: enviar('put'),
    };
  }

  let documento = 40_000;
  function abrir(perfil: Perfil, extra: object = {}) {
    documento += 1;
    return como(perfil).then((quem) =>
      quem.post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        cte: String(documento),
        descricao: 'Mercadoria recusada, emitir reversão.',
        ...extra,
      }),
    );
  }

  let desacordo: string;
  let conferencia: string;
  let soAjuste: string;

  it('o administrador cria os itens; os outros perfis só leem', async () => {
    const admin = await como('ADMIN');
    const criado = await admin.post('/api/cadastros/verificacoes', {
      texto: 'Desacordo fiscal do CTe realizado',
      quemMarca: 'SOLICITANTE',
      tipos: ['REVERSAO'],
    });
    expect(criado.status).toBe(201);
    desacordo = criado.body.id;

    conferencia = (
      await admin.post('/api/cadastros/verificacoes', {
        texto: 'Conferido com o financeiro',
        quemMarca: 'EQUIPE',
        obrigatorioParaResolver: true,
      })
    ).body.id;
    soAjuste = (
      await admin.post('/api/cadastros/verificacoes', {
        texto: 'Só em ajuste fiscal',
        tipos: ['AJUSTE_FISCAL'],
      })
    ).body.id;

    expect(
      (
        await (
          await como('SUPERVISOR')
        ).post('/api/cadastros/verificacoes', { texto: 'Não pode' })
      ).status,
    ).toBe(403);
    const lidos = await (
      await como('SOLICITANTE')
    ).get('/api/cadastros/verificacoes');
    expect(lidos.body).toHaveLength(3);
  });

  it('o solicitante marca ao abrir; o detalhe mostra só os itens do tipo', async () => {
    const aberta = await abrir('SOLICITANTE', { verificacoes: [desacordo] });
    expect(aberta.status).toBe(201);

    const detalhe = await (
      await como('SOLICITANTE')
    ).get(`/api/solicitacoes/${aberta.body.id}`);
    const itens = detalhe.body.verificacoes as {
      itemId: string;
      marcada: boolean;
      podeMarcar: boolean;
      marcadaPor: { nome: string } | null;
    }[];
    expect(itens.map((i) => i.itemId)).toEqual([desacordo, conferencia]);
    expect(itens[0]).toMatchObject({ marcada: true, podeMarcar: true });
    expect(itens[0]!.marcadaPor).not.toBeNull();
    // Item da equipe: o solicitante vê, mas não marca
    expect(itens[1]).toMatchObject({ marcada: false, podeMarcar: false });
  });

  it('cada perfil marca só o que é dele; marcar e desmarcar vão para o histórico', async () => {
    const aberta = await abrir('SOLICITANTE');
    const id = aberta.body.id;

    const doSolicitante = await (
      await como('SOLICITANTE')
    ).put(`/api/solicitacoes/${id}/verificacoes/${conferencia}`, {
      marcada: true,
    });
    expect(doSolicitante.status).toBe(403);

    const analista = await como('ANALISTA');
    const marcada = await analista.put(
      `/api/solicitacoes/${id}/verificacoes/${conferencia}`,
      { marcada: true },
    );
    expect(marcada.status).toBe(200);
    expect(
      marcada.body.find((v: { itemId: string }) => v.itemId === conferencia),
    ).toMatchObject({ marcada: true });

    await analista.put(`/api/solicitacoes/${id}/verificacoes/${conferencia}`, {
      marcada: false,
    });
    const detalhe = await analista.get(`/api/solicitacoes/${id}`);
    const textos = (detalhe.body.historico as { observacao: string | null }[])
      .map((h) => h.observacao)
      .filter(Boolean);
    expect(textos).toEqual([
      'Marcou: Conferido com o financeiro',
      'Desmarcou: Conferido com o financeiro',
    ]);
  });

  it('item de outro tipo ou de outra empresa é recusado', async () => {
    const aberta = await abrir('SOLICITANTE');
    const solicitante = await como('SOLICITANTE');
    expect(
      (
        await solicitante.put(
          `/api/solicitacoes/${aberta.body.id}/verificacoes/${soAjuste}`,
          { marcada: true },
        )
      ).status,
    ).toBe(422);

    const alheio = await (
      await como('ADMIN', outra)
    ).post('/api/cadastros/verificacoes', { texto: 'Da outra empresa' });
    expect(
      (
        await solicitante.put(
          `/api/solicitacoes/${aberta.body.id}/verificacoes/${alheio.body.id}`,
          { marcada: true },
        )
      ).status,
    ).toBe(422);
  });

  it('item obrigatório sem marcar impede resolver', async () => {
    const aberta = await abrir('SOLICITANTE');
    const id = aberta.body.id;
    const analista = await como('ANALISTA');
    await analista.post(`/api/solicitacoes/${id}/status`, {
      status: 'EM_ANDAMENTO',
    });

    const recusada = await analista.post(`/api/solicitacoes/${id}/status`, {
      status: 'RESOLVIDO',
    });
    expect(recusada.status).toBe(422);
    expect(recusada.body.erro).toBe(
      'Antes de resolver, marque: Conferido com o financeiro',
    );

    await analista.put(`/api/solicitacoes/${id}/verificacoes/${conferencia}`, {
      marcada: true,
    });
    expect(
      (
        await analista.post(`/api/solicitacoes/${id}/status`, {
          status: 'RESOLVIDO',
        })
      ).status,
    ).toBe(200);
  });

  it('desativado some das novas, mas continua nas que já marcaram', async () => {
    const aberta = await abrir('SOLICITANTE', { verificacoes: [desacordo] });
    await (
      await como('ADMIN')
    ).patch(`/api/cadastros/verificacoes/${desacordo}`, { ativo: false });

    const antiga = await (
      await como('SOLICITANTE')
    ).get(`/api/solicitacoes/${aberta.body.id}`);
    expect(
      antiga.body.verificacoes.find(
        (v: { itemId: string }) => v.itemId === desacordo,
      ),
    ).toMatchObject({ marcada: true, podeMarcar: false });

    const nova = await abrir('SOLICITANTE');
    const detalheNova = await (
      await como('SOLICITANTE')
    ).get(`/api/solicitacoes/${nova.body.id}`);
    expect(
      detalheNova.body.verificacoes.map((v: { itemId: string }) => v.itemId),
    ).not.toContain(desacordo);
  });
});
