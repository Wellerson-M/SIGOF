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

describe.skipIf(!temBanco)('solicitações (integração, banco real)', () => {
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

  /** Faz login uma vez por usuário e reaproveita o cookie de acesso. */
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
      expect(resposta.status).toBe(204);
      cookies.set(chave, `sigof_acesso=${cookiesDa(resposta).sigof_acesso}`);
    }
    const cookie = cookies.get(chave) ?? '';
    return {
      get: (url: string) => request(app).get(url).set('Cookie', cookie),
      post: (url: string, corpo: object = {}) =>
        request(app)
          .post(url)
          .set('Origin', FRONTEND)
          .set('Cookie', cookie)
          .send(corpo),
      patch: (url: string, corpo: object) =>
        request(app)
          .patch(url)
          .set('Origin', FRONTEND)
          .set('Cookie', cookie)
          .send(corpo),
    };
  }

  let documento = 70_000;
  /** Cada teste usa um CTe próprio, para não esbarrar na duplicidade. */
  function novoCte(): string {
    documento += 1;
    return String(documento);
  }

  async function abrir(perfil: Perfil = 'SOLICITANTE', extra: object = {}) {
    const resposta = await (
      await como(perfil)
    ).post('/api/solicitacoes', {
      tipo: 'REVERSAO',
      cte: novoCte(),
      descricao: 'Mercadoria recusada, emitir CTe de reversão.',
      ...extra,
    });
    expect(resposta.status).toBe(201);
    return resposta.body as { id: string; protocolo: string; status: string };
  }

  describe('abrir', () => {
    it('gera protocolo, prazo de SLA e o primeiro evento do histórico', async () => {
      const solicitante = await como('SOLICITANTE');
      const resposta = await solicitante.post('/api/solicitacoes', {
        tipo: 'TROCA_PAGADOR',
        cte: 'CT-e nº 012.345',
        nf: '',
        pagadorCorreto: 'Destinatário (FOB)',
        descricao: 'Pagador errado no CTe; o correto é o destinatário.',
        prioridade: 'ALTA',
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        protocolo: expect.stringMatching(/^SOL-\d{4}-\d{2}-\d{4}$/),
        status: 'NOVO',
        prioridade: 'ALTA',
        cte: '12345',
        nf: null,
        responsavel: null,
        acoes: ['CANCELADO'],
      });
      expect(resposta.body.sla.situacao).not.toBe('ENCERRADO');

      const detalhe = await solicitante.get(
        `/api/solicitacoes/${resposta.body.id}`,
      );
      expect(detalhe.body.historico).toHaveLength(1);
      expect(detalhe.body.historico[0]).toMatchObject({
        statusAnterior: null,
        statusNovo: 'NOVO',
      });
    });

    it('numera em sequência, sem repetir, mesmo com aberturas simultâneas', async () => {
      const criadas = await Promise.all(
        Array.from({ length: 5 }, () => abrir()),
      );
      const numeros = criadas.map((c) => Number(c.protocolo.slice(-4)));

      expect(new Set(numeros).size).toBe(5);
    });

    it('com o mesmo CTe aberto há pouco, avisa a duplicidade (409) e deixa confirmar', async () => {
      const solicitante = await como('SOLICITANTE');
      const cte = novoCte();
      const primeira = await solicitante.post('/api/solicitacoes', {
        tipo: 'OUTRO',
        cte,
        descricao: 'Peso divergente no CTe emitido.',
      });

      const repetida = await solicitante.post('/api/solicitacoes', {
        tipo: 'OUTRO',
        cte: `0${cte}`,
        descricao: 'Peso divergente de novo, outro pedido.',
      });
      expect(repetida.status).toBe(409);
      expect(repetida.body.detalhes.duplicidades[0]).toMatchObject({
        protocolo: primeira.body.protocolo,
        documento: 'CTE',
      });

      const confirmada = await solicitante.post('/api/solicitacoes', {
        tipo: 'OUTRO',
        cte,
        descricao: 'Peso divergente de novo, outro pedido.',
        confirmarDuplicidade: true,
      });
      expect(confirmada.status).toBe(201);
    });

    it('cancelada não conta como duplicidade', async () => {
      const cte = novoCte();
      const primeira = await abrir('SOLICITANTE', { cte });
      await (
        await como('SOLICITANTE')
      ).post(`/api/solicitacoes/${primeira.id}/status`, {
        status: 'CANCELADO',
        observacao: 'Aberta por engano',
      });

      const segunda = await (
        await como('SOLICITANTE')
      ).post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        cte,
        descricao: 'Agora sim, reversão necessária.',
      });
      expect(segunda.status).toBe(201);
    });

    it('recusa sem documento, troca de pagador sem pagador e descrição curta', async () => {
      const solicitante = await como('SOLICITANTE');

      const semDocumento = await solicitante.post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        descricao: 'Falta o número do documento aqui.',
      });
      expect(semDocumento.status).toBe(422);

      const semPagador = await solicitante.post('/api/solicitacoes', {
        tipo: 'TROCA_PAGADOR',
        cte: novoCte(),
        descricao: 'Pagador errado, mas não disse qual.',
      });
      expect(semPagador.status).toBe(422);

      const curta = await solicitante.post('/api/solicitacoes', {
        tipo: 'OUTRO',
        descricao: 'curta',
      });
      expect(curta.status).toBe(422);
      expect(curta.body.erro).toMatch(/10 caracteres/);
    });

    it('administrador não abre solicitação', async () => {
      const resposta = await (
        await como('ADMIN')
      ).post('/api/solicitacoes', {
        tipo: 'OUTRO',
        descricao: 'Admin tentando abrir uma solicitação.',
      });
      expect(resposta.status).toBe(403);
    });

    it('sem login, nada feito (401)', async () => {
      const resposta = await request(app).get('/api/solicitacoes');
      expect(resposta.status).toBe(401);
    });
  });

  describe('listar e ver', () => {
    it('o quadro vem ordenado por prioridade e o solicitante só vê as dele', async () => {
      const urgente = await abrir('ANALISTA', { prioridade: 'URGENTE' });
      const baixa = await abrir('SOLICITANTE', { prioridade: 'BAIXA' });

      const doAnalista = await (
        await como('ANALISTA')
      ).get('/api/solicitacoes');
      const ids = (doAnalista.body as { id: string }[]).map((s) => s.id);
      expect(ids.indexOf(urgente.id)).toBeLessThan(ids.indexOf(baixa.id));

      const doSolicitante = await (
        await como('SOLICITANTE')
      ).get('/api/solicitacoes');
      const visiveis = (doSolicitante.body as { id: string }[]).map(
        (s) => s.id,
      );
      expect(visiveis).toContain(baixa.id);
      expect(visiveis).not.toContain(urgente.id);

      const alheia = await (
        await como('SOLICITANTE')
      ).get(`/api/solicitacoes/${urgente.id}`);
      expect(alheia.status).toBe(404);
    });

    it('busca por protocolo e por CTe', async () => {
      const cte = novoCte();
      const criada = await abrir('SOLICITANTE', { cte });
      const analista = await como('ANALISTA');

      const porCte = await analista.get(`/api/solicitacoes?busca=${cte}`);
      expect(porCte.body.map((s: { id: string }) => s.id)).toEqual([criada.id]);

      const porProtocolo = await analista.get(
        `/api/solicitacoes?busca=${criada.protocolo.toLowerCase()}`,
      );
      expect(porProtocolo.body.map((s: { id: string }) => s.id)).toEqual([
        criada.id,
      ]);
    });

    it('outra empresa não enxerga nada (isolamento multi-tenant)', async () => {
      const criada = await abrir();
      const deFora = await como('SUPERVISOR', outra);

      const lista = await deFora.get('/api/solicitacoes');
      expect(lista.body.map((s: { id: string }) => s.id)).not.toContain(
        criada.id,
      );
      expect((await deFora.get(`/api/solicitacoes/${criada.id}`)).status).toBe(
        404,
      );
      expect(
        (
          await deFora.post(`/api/solicitacoes/${criada.id}/status`, {
            status: 'EM_ANDAMENTO',
          })
        ).status,
      ).toBe(404);
    });

    it('id inválido responde 404', async () => {
      const resposta = await (
        await como('ANALISTA')
      ).get('/api/solicitacoes/nao-e-um-id');
      expect(resposta.status).toBe(404);
    });
  });

  describe('mover no quadro (status)', () => {
    it('analista assume: vira responsável e o histórico registra', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');

      const assumida = await analista.post(
        `/api/solicitacoes/${criada.id}/status`,
        { status: 'EM_ANDAMENTO' },
      );

      expect(assumida.status).toBe(200);
      expect(assumida.body).toMatchObject({
        status: 'EM_ANDAMENTO',
        responsavel: { id: empresa.usuarios.ANALISTA.id },
      });
      expect(assumida.body.acoes).toEqual(
        expect.arrayContaining(['AGUARDANDO_DOC', 'ESCALADO', 'RESOLVIDO']),
      );
    });

    it('aguardando documento pausa o SLA; ao voltar, o prazo é retomado', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'EM_ANDAMENTO',
      });

      const pausada = await analista.post(
        `/api/solicitacoes/${criada.id}/status`,
        { status: 'AGUARDANDO_DOC', observacao: 'Falta o canhoto assinado' },
      );
      expect(pausada.body.sla.situacao).toBe('PAUSADO');
      const noBanco = await prisma.solicitacao.findUniqueOrThrow({
        where: { id: criada.id },
      });
      expect(noBanco.slaPausadoEm).not.toBeNull();

      const retomada = await analista.post(
        `/api/solicitacoes/${criada.id}/status`,
        { status: 'EM_ANDAMENTO' },
      );
      expect(retomada.body.sla.situacao).not.toBe('PAUSADO');
      const depois = await prisma.solicitacao.findUniqueOrThrow({
        where: { id: criada.id },
      });
      expect(depois.slaPausadoEm).toBeNull();
      expect(depois.slaVenceEm!.getTime()).toBeGreaterThanOrEqual(
        noBanco.slaVenceEm!.getTime(),
      );
    });

    it('resolver não exige a descrição da ação; depois disso, está encerrada', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'EM_ANDAMENTO',
      });

      const resolvida = await analista.post(
        `/api/solicitacoes/${criada.id}/status`,
        { status: 'RESOLVIDO' },
      );
      expect(resolvida.body).toMatchObject({
        status: 'RESOLVIDO',
        acoes: [],
        sla: { situacao: 'ENCERRADO' },
      });

      const reaberta = await analista.post(
        `/api/solicitacoes/${criada.id}/status`,
        { status: 'EM_ANDAMENTO' },
      );
      expect(reaberta.status).toBe(422);
    });

    it('movimento que não existe dá 422; perfil sem permissão dá 403', async () => {
      const criada = await abrir();

      const pulo = await (
        await como('ANALISTA')
      ).post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'Pulando etapas',
      });
      expect(pulo.status).toBe(422);

      const solicitanteAssumindo = await (
        await como('SOLICITANTE')
      ).post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      expect(solicitanteAssumindo.status).toBe(403);
    });

    it('dois arrastando o mesmo cartão: só um movimento vale', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');
      const supervisor = await como('SUPERVISOR');

      const respostas = await Promise.all([
        analista.post(`/api/solicitacoes/${criada.id}/status`, {
          status: 'EM_ANDAMENTO',
        }),
        supervisor.post(`/api/solicitacoes/${criada.id}/status`, {
          status: 'EM_ANDAMENTO',
        }),
      ]);

      const codigos = respostas.map((r) => r.status).sort();
      expect(codigos[0]).toBe(200);
      expect([409, 422]).toContain(codigos[1]);
      const historico = await prisma.statusHistorico.count({
        where: { solicitacaoId: criada.id },
      });
      expect(historico).toBe(2);
    });
  });

  describe('prioridade, responsável e conversa', () => {
    it('analista muda a prioridade e fica no histórico; solicitante não pode', async () => {
      const criada = await abrir();

      const negada = await (
        await como('SOLICITANTE')
      ).patch(`/api/solicitacoes/${criada.id}/prioridade`, {
        prioridade: 'URGENTE',
      });
      expect(negada.status).toBe(403);

      const analista = await como('ANALISTA');
      const mudada = await analista.patch(
        `/api/solicitacoes/${criada.id}/prioridade`,
        { prioridade: 'URGENTE' },
      );
      expect(mudada.body.prioridade).toBe('URGENTE');

      const detalhe = await analista.get(`/api/solicitacoes/${criada.id}`);
      expect(detalhe.body.historico.at(-1).observacao).toBe(
        'Prioridade: Média → Urgente',
      );
    });

    it('supervisor e analista alocam só para analista ou supervisor da própria empresa', async () => {
      const criada = await abrir();
      const supervisor = await como('SUPERVISOR');

      const responsaveis = await supervisor.get(
        '/api/solicitacoes/responsaveis',
      );
      expect(responsaveis.body.map((p: { id: string }) => p.id)).toEqual(
        expect.arrayContaining([
          empresa.usuarios.ANALISTA.id,
          empresa.usuarios.SUPERVISOR.id,
        ]),
      );

      const atribuida = await supervisor.post(
        `/api/solicitacoes/${criada.id}/atribuir`,
        { responsavelId: empresa.usuarios.ANALISTA.id },
      );
      expect(atribuida.body.responsavel.id).toBe(empresa.usuarios.ANALISTA.id);

      const deOutraEmpresa = await supervisor.post(
        `/api/solicitacoes/${criada.id}/atribuir`,
        { responsavelId: outra.usuarios.ANALISTA.id },
      );
      expect(deOutraEmpresa.status).toBe(422);

      // O analista também aloca (a empresa pode desligar)
      const analista = await como('ANALISTA');
      const porAnalista = await analista.post(
        `/api/solicitacoes/${criada.id}/atribuir`,
        { responsavelId: empresa.usuarios.SUPERVISOR.id },
      );
      expect(porAnalista.status).toBe(200);
      expect(porAnalista.body.responsavel.id).toBe(
        empresa.usuarios.SUPERVISOR.id,
      );

      // null devolve para a fila, sem responsável
      const semNinguem = await analista.post(
        `/api/solicitacoes/${criada.id}/atribuir`,
        { responsavelId: null },
      );
      expect(semNinguem.body.responsavel).toBeNull();
      const detalhe = await analista.get(`/api/solicitacoes/${criada.id}`);
      expect(detalhe.body.pode.atribuir).toBe(true);
      expect(detalhe.body.historico.at(-1).observacao).toMatch(/ninguém/);

      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { analistaAtribui: false },
      });
      try {
        const barrado = await analista.post(
          `/api/solicitacoes/${criada.id}/atribuir`,
          { responsavelId: empresa.usuarios.ANALISTA.id },
        );
        expect(barrado.status).toBe(403);
        expect(
          (await analista.get(`/api/solicitacoes/${criada.id}`)).body.pode
            .atribuir,
        ).toBe(false);
      } finally {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { analistaAtribui: true },
        });
      }

      const porSolicitante = await (
        await como('SOLICITANTE')
      ).post(`/api/solicitacoes/${criada.id}/atribuir`, {
        responsavelId: empresa.usuarios.ANALISTA.id,
      });
      expect(porSolicitante.status).toBe(403);
    });

    it('comentário interno não aparece para o solicitante', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');
      const solicitante = await como('SOLICITANTE');

      await analista.post(`/api/solicitacoes/${criada.id}/mensagens`, {
        conteudo: 'Conferir com o fiscal antes',
        interna: true,
      });
      await analista.post(`/api/solicitacoes/${criada.id}/mensagens`, {
        conteudo: 'Pode me enviar a NF?',
      });
      const resposta = await solicitante.post(
        `/api/solicitacoes/${criada.id}/mensagens`,
        { conteudo: 'Enviei por e-mail.' },
      );
      expect(resposta.status).toBe(201);

      const paraSolicitante = await solicitante.get(
        `/api/solicitacoes/${criada.id}`,
      );
      expect(
        paraSolicitante.body.mensagens.map(
          (m: { conteudo: string }) => m.conteudo,
        ),
      ).toEqual(['Pode me enviar a NF?', 'Enviei por e-mail.']);

      const paraAnalista = await analista.get(`/api/solicitacoes/${criada.id}`);
      expect(paraAnalista.body.mensagens).toHaveLength(3);

      const internaDoSolicitante = await solicitante.post(
        `/api/solicitacoes/${criada.id}/mensagens`,
        { conteudo: 'Tentando interna', interna: true },
      );
      expect(internaDoSolicitante.status).toBe(403);
    });
  });

  describe('vários documentos (fatura inteira)', () => {
    it('guarda a lista, usa o primeiro como principal e acha por qualquer um', async () => {
      const solicitante = await como('SOLICITANTE');
      const resposta = await solicitante.post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        ctes: ['88001', '088002', 'CTe 88003', '88001'],
        nfs: ['7001'],
        fatura: ' fat-9 ',
        descricao: 'Fatura inteira recusada, reverter todos os CTe.',
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        cte: '88001',
        ctes: ['88001', '88002', '88003'],
        nf: '7001',
        nfs: ['7001'],
        fatura: 'FAT-9',
      });

      const busca = await (
        await como('ANALISTA')
      ).get('/api/solicitacoes/lista?busca=88003');
      expect(busca.body.itens.map((i: { id: string }) => i.id)).toContain(
        resposta.body.id,
      );
    });

    it('um CTe em comum com outra solicitação já gera o alerta', async () => {
      const solicitante = await como('SOLICITANTE');
      await solicitante.post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        ctes: ['89001', '89002'],
        descricao: 'Primeira leva de CTe para reverter.',
      });
      const repetida = await solicitante.post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        ctes: ['89500', '89002'],
        descricao: 'Segunda leva, com um CTe repetido.',
      });

      expect(repetida.status).toBe(409);
      expect(repetida.body.detalhes.duplicidades[0]).toMatchObject({
        documento: 'CTE',
        valor: '89002',
      });
    });

    it('só a fatura já basta para abrir; a mesma fatura gera alerta', async () => {
      const solicitante = await como('SOLICITANTE');
      const primeira = await solicitante.post('/api/solicitacoes', {
        tipo: 'AJUSTE_FISCAL',
        fatura: 'F-777',
        descricao: 'Fatura com alíquota errada em todos os CTe.',
      });
      expect(primeira.status).toBe(201);

      const repetida = await solicitante.post('/api/solicitacoes', {
        tipo: 'AJUSTE_FISCAL',
        fatura: 'f-777',
        descricao: 'Mesma fatura de novo, por engano.',
      });
      expect(repetida.status).toBe(409);
      expect(repetida.body.detalhes.duplicidades[0].documento).toBe('FATURA');
    });
  });
});
