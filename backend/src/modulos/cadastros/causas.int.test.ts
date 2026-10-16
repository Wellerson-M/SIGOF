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

describe.skipIf(!temBanco)('causas do erro (integração, banco real)', () => {
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

  let documento = 60_000;
  async function abertaEmAndamento() {
    documento += 1;
    const aberta = await (
      await como('SOLICITANTE')
    ).post('/api/solicitacoes', {
      tipo: 'REVERSAO',
      cte: String(documento),
      descricao: 'Mercadoria recusada, emitir reversão.',
    });
    await (
      await como('ANALISTA')
    ).post(`/api/solicitacoes/${aberta.body.id}/status`, {
      status: 'EM_ANDAMENTO',
    });
    return aberta.body.id as string;
  }

  let digitacao: string;
  let cliente: string;

  describe('cadastro', () => {
    it('o administrador cria causas com opções, sem vazios nem repetidas', async () => {
      const admin = await como('ADMIN');
      const criada = await admin.post('/api/cadastros/causas', {
        nome: 'Erro de digitação',
        opcoes: [' Ana ', 'Bruno', '', 'ana'],
        rotuloDasOpcoes: 'Digitador',
      });
      const outraCausa = await admin.post('/api/cadastros/causas', {
        nome: 'Erro do cliente',
      });

      expect(criada.status).toBe(201);
      expect(criada.body).toMatchObject({
        nome: 'Erro de digitação',
        opcoes: ['Ana', 'Bruno'],
        rotuloDasOpcoes: 'Digitador',
        ativa: true,
      });
      // A nova vai para o fim da lista
      expect(outraCausa.body.ordem).toBeGreaterThan(criada.body.ordem);
      digitacao = criada.body.id;
      cliente = outraCausa.body.id;
    });

    it('o administrador altera as opções; a mudança fica na auditoria', async () => {
      const admin = await como('ADMIN');
      const alterada = await admin.patch(`/api/cadastros/causas/${digitacao}`, {
        opcoes: ['Ana', 'Bruno', 'Carla'],
      });

      expect(alterada.body.opcoes).toEqual(['Ana', 'Bruno', 'Carla']);
      const evento = await prisma.eventoAuditoria.findFirst({
        where: { empresaId: empresa.id, acao: 'CADASTRO_ALTERADO' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(evento?.detalhes).toMatchObject({
        cadastro: 'causa de erro',
        opcoes: { para: ['Ana', 'Bruno', 'Carla'] },
      });
    });

    it('o solicitante não vê a lista; a equipe vê só as ativas', async () => {
      const admin = await como('ADMIN');
      const velha = await admin.post('/api/cadastros/causas', {
        nome: 'Desativada',
      });
      await admin.patch(`/api/cadastros/causas/${velha.body.id}`, {
        ativa: false,
      });

      expect(
        (await (await como('SOLICITANTE')).get('/api/cadastros/causas')).status,
      ).toBe(403);
      const daEquipe = await (
        await como('ANALISTA')
      ).get('/api/cadastros/causas?todas=1');
      expect(daEquipe.body.map((c: { nome: string }) => c.nome)).toEqual([
        'Erro de digitação',
        'Erro do cliente',
      ]);
      expect(
        (await admin.get('/api/cadastros/causas?todas=1')).body,
      ).toHaveLength(3);
    });

    it('só o administrador cria', async () => {
      expect(
        (
          await (
            await como('SUPERVISOR')
          ).post('/api/cadastros/causas', { nome: 'X' })
        ).status,
      ).toBe(403);
    });
  });

  describe('ao resolver', () => {
    it('grava a causa, o "qual" e o comentário, só para a equipe', async () => {
      const id = await abertaEmAndamento();
      const resolvida = await (
        await como('ANALISTA')
      ).post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'CTe de reversão emitido.',
        classificacao: {
          causaId: digitacao,
          detalhe: 'Bruno',
          comentario: 'Digitou o CNPJ do remetente.',
        },
      });
      expect(resolvida.status).toBe(200);

      const daEquipe = await (
        await como('SUPERVISOR')
      ).get(`/api/solicitacoes/${id}`);
      expect(daEquipe.body.causa).toEqual({
        id: digitacao,
        nome: 'Erro de digitação',
        detalhe: 'Bruno',
        comentario: 'Digitou o CNPJ do remetente.',
      });
      expect(daEquipe.body.pode.classificar).toBe(true);

      // O solicitante não fica sabendo de quem foi o erro
      const doSolicitante = await (
        await como('SOLICITANTE')
      ).get(`/api/solicitacoes/${id}`);
      expect(doSolicitante.body.causa).toBeNull();
      expect(JSON.stringify(doSolicitante.body)).not.toContain('Bruno');

      // Nem pelo e-mail ou pela notificação
      const avisos = await prisma.notificacao.findMany({
        where: { solicitacaoId: id },
      });
      expect(avisos.map((a) => a.mensagem).join(' ')).not.toContain('Bruno');
    });

    it('"qual" fora da lista é recusado; em causa sem opções, é ignorado', async () => {
      const analista = await como('ANALISTA');
      const id = await abertaEmAndamento();
      const fora = await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'Feito.',
        classificacao: { causaId: digitacao, detalhe: 'Zé' },
      });
      expect(fora.status).toBe(422);
      expect(fora.body.erro).toBe('Escolha digitador da lista');

      const semOpcoes = await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'Feito.',
        classificacao: { causaId: cliente, detalhe: 'qualquer coisa' },
      });
      expect(semOpcoes.status).toBe(200);
      const gravada = await prisma.solicitacao.findUniqueOrThrow({
        where: { id },
      });
      expect(gravada.causaDetalhe).toBeNull();
    });

    it('causa de outra empresa é recusada', async () => {
      const deFora = await (
        await como('ADMIN', outra)
      ).post('/api/cadastros/causas', { nome: 'Alheia' });
      const id = await abertaEmAndamento();
      const resposta = await (
        await como('ANALISTA')
      ).post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'Feito.',
        classificacao: { causaId: deFora.body.id },
      });
      expect(resposta.status).toBe(422);
    });

    it('a empresa decide se a causa é obrigatória', async () => {
      const analista = await como('ANALISTA');
      const semCausa = await abertaEmAndamento();
      expect(
        (
          await analista.post(`/api/solicitacoes/${semCausa}/status`, {
            status: 'RESOLVIDO',
            observacao: 'Feito.',
          })
        ).status,
      ).toBe(200);

      await (
        await como('ADMIN')
      ).patch('/api/admin/empresa', { exigirCausaAoResolver: true });
      const id = await abertaEmAndamento();
      const recusada = await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'Feito.',
      });
      expect(recusada.status).toBe(422);
      expect(recusada.body.erro).toBe('Informe de quem foi o erro');

      await (
        await como('ADMIN')
      ).patch('/api/admin/empresa', { exigirCausaAoResolver: false });
    });
  });

  describe('corrigir depois', () => {
    it('a equipe registra a causa de uma resolvida que ficou sem', async () => {
      const id = await abertaEmAndamento();
      const supervisor = await como('SUPERVISOR');
      await supervisor.post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
        observacao: 'Feito.',
      });

      const corrigida = await supervisor.put(`/api/solicitacoes/${id}/causa`, {
        causaId: digitacao,
        detalhe: 'Ana',
      });
      expect(corrigida.status).toBe(200);
      expect(corrigida.body).toMatchObject({
        nome: 'Erro de digitação',
        detalhe: 'Ana',
      });
    });

    it('não vale para solicitação em aberto nem para o solicitante', async () => {
      const id = await abertaEmAndamento();
      expect(
        (
          await (
            await como('ANALISTA')
          ).put(`/api/solicitacoes/${id}/causa`, { causaId: cliente })
        ).status,
      ).toBe(422);
      expect(
        (
          await (
            await como('SOLICITANTE')
          ).put(`/api/solicitacoes/${id}/causa`, { causaId: cliente })
        ).status,
      ).toBe(403);
    });
  });

  it('os indicadores contam por causa e por "qual"', async () => {
    const indicadores = await (
      await como('SUPERVISOR')
    ).get('/api/indicadores?dias=7');

    const digitacaoNoPainel = indicadores.body.porCausa.find(
      (c: { causa: string }) => c.causa === 'Erro de digitação',
    );
    expect(digitacaoNoPainel).toEqual({
      causa: 'Erro de digitação',
      total: 2,
      detalhes: [
        { detalhe: 'Ana', total: 1 },
        { detalhe: 'Bruno', total: 1 },
      ],
    });
    expect(indicadores.body.resolvidasSemCausa).toBe(1);
  });
});
