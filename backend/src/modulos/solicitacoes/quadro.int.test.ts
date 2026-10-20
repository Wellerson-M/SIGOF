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

describe.skipIf(!temBanco)(
  'quadro: exclusão e movimentação (integração, banco real)',
  () => {
    let prisma: PrismaClient;
    let app: Express;
    let empresa: EmpresaDeTeste;
    let outra: EmpresaDeTeste;
    const cookies = new Map<string, string>();

    beforeAll(async () => {
      prisma = conectar();
      app = criarApp({
        prisma,
        env: envDeTeste(),
        limiteDeLoginPorMinuto: 1000,
      });
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
      return {
        get: (url: string) => request(app).get(url).set('Cookie', cookie),
        post: (url: string, corpo: object = {}) =>
          request(app)
            .post(url)
            .set('Origin', FRONTEND)
            .set('Cookie', cookie)
            .send(corpo),
      };
    }

    let documento = 90_000;
    async function abrir() {
      documento += 1;
      const resposta = await (
        await como('SOLICITANTE')
      ).post('/api/solicitacoes', {
        tipo: 'REVERSAO',
        cte: String(documento),
        descricao: 'Mercadoria recusada, emitir reversão.',
      });
      expect(resposta.status).toBe(201);
      return resposta.body as { id: string; protocolo: string };
    }

    async function encerrar(id: string) {
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      const resolvida = await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'RESOLVIDO',
      });
      expect(resolvida.status).toBe(200);
    }

    describe('excluir solicitação encerrada', () => {
      it('supervisor exclui a resolvida: some de tudo, mas fica na auditoria', async () => {
        const criada = await abrir();
        const supervisor = await como('SUPERVISOR');

        const aberta = await supervisor.post(
          `/api/solicitacoes/${criada.id}/excluir`,
        );
        expect(aberta.status).toBe(422);
        expect(aberta.body.erro).toMatch(/resolvida ou cancelada/);

        await encerrar(criada.id);
        expect(
          (await supervisor.get(`/api/solicitacoes/${criada.id}`)).body.pode
            .excluir,
        ).toBe(true);
        expect(
          (await (await como('ANALISTA')).get(`/api/solicitacoes/${criada.id}`))
            .body.pode.excluir,
        ).toBe(false);

        const excluida = await supervisor.post(
          `/api/solicitacoes/${criada.id}/excluir`,
          { motivo: 'Aberta em duplicidade, por engano' },
        );
        expect(excluida.status).toBe(204);

        expect(
          (await supervisor.get(`/api/solicitacoes/${criada.id}`)).status,
        ).toBe(404);
        const quadro = await supervisor.get('/api/solicitacoes');
        expect(
          quadro.body.some((s: { id: string }) => s.id === criada.id),
        ).toBe(false);
        const lista = await supervisor.get(
          `/api/solicitacoes/lista?busca=${criada.protocolo}`,
        );
        expect(lista.body.total).toBe(0);
        const solicitante = await (
          await como('SOLICITANTE')
        ).get('/api/solicitacoes');
        expect(
          solicitante.body.some((s: { id: string }) => s.id === criada.id),
        ).toBe(false);

        const trilha = await prisma.eventoAuditoria.findFirstOrThrow({
          where: { empresaId: empresa.id, acao: 'SOLICITACAO_EXCLUIDA' },
        });
        expect(trilha.detalhes).toMatchObject({
          protocolo: criada.protocolo,
          motivo: 'Aberta em duplicidade, por engano',
        });

        // Excluir de novo: já não existe
        expect(
          (await supervisor.post(`/api/solicitacoes/${criada.id}/excluir`))
            .status,
        ).toBe(404);
      });

      it('a excluída não dispara alerta de duplicidade', async () => {
        const criada = await abrir();
        await encerrar(criada.id);
        await (
          await como('ADMIN')
        ).post(`/api/solicitacoes/${criada.id}/excluir`);
        const deNovo = await (
          await como('SOLICITANTE')
        ).post('/api/solicitacoes', {
          tipo: 'REVERSAO',
          cte: String(documento),
          descricao: 'Mesmo CTe da que foi excluída.',
        });
        expect(deNovo.status).toBe(201);
      });

      it('analista e solicitante não excluem; módulo desligado também não', async () => {
        const criada = await abrir();
        await encerrar(criada.id);
        for (const perfil of ['ANALISTA', 'SOLICITANTE'] as const) {
          expect(
            (
              await (
                await como(perfil)
              ).post(`/api/solicitacoes/${criada.id}/excluir`)
            ).status,
          ).toBe(403);
        }
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { modulosAtivos: { set: [] } },
        });
        try {
          expect(
            (
              await (
                await como('SUPERVISOR')
              ).post(`/api/solicitacoes/${criada.id}/excluir`)
            ).status,
          ).toBe(422);
        } finally {
          const { modulosLiberados } = await prisma.empresa.findUniqueOrThrow({
            where: { id: empresa.id },
          });
          await prisma.empresa.update({
            where: { id: empresa.id },
            data: { modulosAtivos: modulosLiberados },
          });
        }
      });

      it('de outra empresa não existe', async () => {
        const criada = await abrir();
        await encerrar(criada.id);
        expect(
          (
            await (
              await como('SUPERVISOR', outra)
            ).post(`/api/solicitacoes/${criada.id}/excluir`)
          ).status,
        ).toBe(404);
      });
    });

    it('a empresa decide quantos dias a encerrada fica no quadro', async () => {
      const criada = await abrir();
      await encerrar(criada.id);
      const supervisor = await como('SUPERVISOR');
      const noQuadro = async () =>
        (await supervisor.get('/api/solicitacoes')).body.some(
          (s: { id: string }) => s.id === criada.id,
        );
      expect(await noQuadro()).toBe(true);

      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { diasNoQuadroDepoisDeEncerrar: 0 },
      });
      try {
        expect(await noQuadro()).toBe(false);
      } finally {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { diasNoQuadroDepoisDeEncerrar: 30 },
        });
      }
    });

    it('a última movimentação conta histórico e mensagem, mas não nota interna', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');
      const inicio = (await analista.get(`/api/solicitacoes/${criada.id}`)).body
        .ultimaMovimentacaoEm;

      await new Promise((pronto) => setTimeout(pronto, 20));
      await analista.post(`/api/solicitacoes/${criada.id}/mensagens`, {
        conteudo: 'Só a equipe vê isto',
        interna: true,
      });
      const depoisDaNota = (await analista.get('/api/solicitacoes')).body.find(
        (s: { id: string }) => s.id === criada.id,
      ).ultimaMovimentacaoEm;
      expect(depoisDaNota).toBe(inicio);

      await analista.post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      await new Promise((pronto) => setTimeout(pronto, 20));
      const mensagem = await analista.post(
        `/api/solicitacoes/${criada.id}/mensagens`,
        { conteudo: 'Pode mandar o canhoto?' },
      );
      const noQuadro = (await analista.get('/api/solicitacoes')).body.find(
        (s: { id: string }) => s.id === criada.id,
      );
      expect(noQuadro.ultimaMovimentacaoEm).toBe(mensagem.body.criadoEm);
      const detalhe = await analista.get(`/api/solicitacoes/${criada.id}`);
      expect(detalhe.body.ultimaMovimentacaoEm).toBe(mensagem.body.criadoEm);
    });

    it('quem retoma uma solicitação que voltou para a fila vira o responsável', async () => {
      const criada = await abrir();
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      await analista.post(`/api/solicitacoes/${criada.id}/status`, {
        status: 'AGUARDANDO_DOC',
        observacao: 'Falta o canhoto',
      });
      await analista.post(`/api/solicitacoes/${criada.id}/atribuir`, {
        responsavelId: null,
      });
      const supervisor = await como('SUPERVISOR');
      const retomada = await supervisor.post(
        `/api/solicitacoes/${criada.id}/status`,
        { status: 'EM_ANDAMENTO' },
      );
      expect(retomada.body.responsavel.id).toBe(empresa.usuarios.SUPERVISOR.id);
    });
  },
);
