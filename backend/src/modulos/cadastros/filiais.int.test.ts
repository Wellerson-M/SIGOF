import { createHash } from 'node:crypto';
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
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF filiais');
const HASH_DO_PDF = createHash('sha256').update(PDF).digest('hex');

describe.skipIf(!temBanco)(
  'filiais e duplicidade (integração, banco real)',
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
        armazenamento: new ArmazenamentoEmMemoria(),
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
        patch: (url: string, corpo: object) =>
          request(app)
            .patch(url)
            .set('Origin', FRONTEND)
            .set('Cookie', cookie)
            .send(corpo),
        anexar: (id: string, conteudo: Buffer, nome: string) =>
          request(app)
            .post(`/api/solicitacoes/${id}/anexos`)
            .set('Origin', FRONTEND)
            .set('Cookie', cookie)
            .attach('arquivo', conteudo, nome),
      };
    }

    let curitiba: string;
    let joinville: string;

    describe('cadastro de filiais', () => {
      it('o administrador cria, renomeia e desativa; fica na auditoria', async () => {
        const admin = await como('ADMIN');
        const criada = await admin.post('/api/cadastros/filiais', {
          nome: ' Curitiba ',
        });
        const outraFilial = await admin.post('/api/cadastros/filiais', {
          nome: 'Joinvile',
        });
        expect(criada.status).toBe(201);
        expect(criada.body).toMatchObject({ nome: 'Curitiba', ativa: true });
        curitiba = criada.body.id;
        joinville = outraFilial.body.id;

        const renomeada = await admin.patch(
          `/api/cadastros/filiais/${joinville}`,
          {
            nome: 'Joinville',
          },
        );
        expect(renomeada.body.nome).toBe('Joinville');

        const repetida = await admin.post('/api/cadastros/filiais', {
          nome: 'Curitiba',
        });
        expect(repetida.status).toBe(409);

        const eventos = await prisma.eventoAuditoria.count({
          where: { empresaId: empresa.id, acao: 'CADASTRO_ALTERADO' },
        });
        expect(eventos).toBe(3);
      });

      it('todos leem as ativas; só o administrador pede as desativadas', async () => {
        const admin = await como('ADMIN');
        const temporaria = await admin.post('/api/cadastros/filiais', {
          nome: 'Temporária',
        });
        await admin.patch(`/api/cadastros/filiais/${temporaria.body.id}`, {
          ativa: false,
        });

        const doSolicitante = await (
          await como('SOLICITANTE')
        ).get('/api/cadastros/filiais?todas=1');
        const doAdmin = await admin.get('/api/cadastros/filiais?todas=1');

        expect(doSolicitante.body.map((f: { nome: string }) => f.nome)).toEqual(
          ['Curitiba', 'Joinville'],
        );
        expect(doAdmin.body).toHaveLength(3);
      });

      it('quem não é administrador não cria nem altera', async () => {
        const analista = await como('ANALISTA');
        expect(
          (await analista.post('/api/cadastros/filiais', { nome: 'X' })).status,
        ).toBe(403);
        expect(
          (
            await analista.patch(`/api/cadastros/filiais/${curitiba}`, {
              ativa: false,
            })
          ).status,
        ).toBe(403);
      });

      it('filial de outra empresa não existe para quem é de fora', async () => {
        const deFora = await como('ADMIN', outra);
        expect(
          (
            await deFora.patch(`/api/cadastros/filiais/${curitiba}`, {
              nome: 'Invadida',
            })
          ).status,
        ).toBe(404);
        expect((await deFora.get('/api/cadastros/filiais')).body).toEqual([]);
      });
    });

    describe('abertura com filial', () => {
      const base = {
        tipo: 'REVERSAO',
        descricao: 'Mercadoria recusada, emitir reversão.',
      };

      it('com filiais cadastradas, CTe sem filial é recusado', async () => {
        const resposta = await (
          await como('SOLICITANTE')
        ).post('/api/solicitacoes', {
          ...base,
          cte: '81001',
        });
        expect(resposta.status).toBe(422);
        expect(resposta.body.erro).toMatch(/filial/);
      });

      it('filial de outra empresa é recusada', async () => {
        const deOutra = await prisma.filial.create({
          data: { empresaId: outra.id, nome: 'Alheia' },
        });
        const resposta = await (
          await como('SOLICITANTE')
        ).post('/api/solicitacoes', {
          ...base,
          cte: '81002',
          filialId: deOutra.id,
        });
        expect(resposta.status).toBe(422);
      });

      it('mesmo CTe em filiais diferentes abre sem alerta; na mesma filial, alerta', async () => {
        const solicitante = await como('SOLICITANTE');
        const primeira = await solicitante.post('/api/solicitacoes', {
          ...base,
          cte: '81003',
          filialId: curitiba,
        });
        expect(primeira.status).toBe(201);
        expect(primeira.body.filial).toEqual({
          id: curitiba,
          nome: 'Curitiba',
        });

        const outraFilial = await solicitante.post('/api/solicitacoes', {
          ...base,
          cte: '81003',
          filialId: joinville,
        });
        expect(outraFilial.status).toBe(201);

        const mesmaFilial = await solicitante.post('/api/solicitacoes', {
          ...base,
          cte: '81003',
          filialId: curitiba,
        });
        expect(mesmaFilial.status).toBe(409);
        expect(mesmaFilial.body.detalhes.duplicidades).toEqual([
          expect.objectContaining({
            protocolo: primeira.body.protocolo,
            documento: 'CTE',
          }),
        ]);
      });
    });

    describe('duplicidade pelo arquivo anexado', () => {
      it('o mesmo arquivo com outro CTe e outra NF gera alerta', async () => {
        const solicitante = await como('SOLICITANTE');
        const primeira = await solicitante.post('/api/solicitacoes', {
          tipo: 'REVERSAO',
          cte: '82001',
          nf: '92001',
          filialId: curitiba,
          descricao: 'Primeiro envio, com o PDF do CTe.',
        });
        const anexo = await solicitante.anexar(
          primeira.body.id,
          PDF,
          'cte-82001.pdf',
        );
        expect(anexo.status).toBe(201);
        const gravado = await prisma.anexo.findUniqueOrThrow({
          where: { id: anexo.body.id },
        });
        expect(gravado.sha256).toBe(HASH_DO_PDF);

        const segunda = await solicitante.post('/api/solicitacoes', {
          tipo: 'REVERSAO',
          cte: '82999',
          nf: '92999',
          filialId: joinville,
          descricao: 'Mesmo arquivo, outro número digitado.',
          hashesDosAnexos: [HASH_DO_PDF.toUpperCase()],
        });
        expect(segunda.status).toBe(409);
        expect(segunda.body.detalhes.duplicidades).toEqual([
          expect.objectContaining({
            protocolo: primeira.body.protocolo,
            documento: 'ANEXO',
            valor: 'cte-82001.pdf',
          }),
        ]);

        // Quem confere e decide abrir mesmo assim consegue
        const confirmada = await solicitante.post('/api/solicitacoes', {
          tipo: 'REVERSAO',
          cte: '82999',
          filialId: joinville,
          descricao: 'Mesmo arquivo, outro número digitado.',
          hashesDosAnexos: [HASH_DO_PDF],
          confirmarDuplicidade: true,
        });
        expect(confirmada.status).toBe(201);
      });

      it('o arquivo de outra empresa não acusa', async () => {
        const deFora = await como('SOLICITANTE', outra);
        const resposta = await deFora.post('/api/solicitacoes', {
          tipo: 'OUTRO',
          descricao: 'Arquivo igual, mas em outra transportadora.',
          hashesDosAnexos: [HASH_DO_PDF],
        });
        expect(resposta.status).toBe(201);
      });

      it('hash malformado é recusado na validação', async () => {
        const resposta = await (
          await como('SOLICITANTE')
        ).post('/api/solicitacoes', {
          tipo: 'OUTRO',
          descricao: 'Hash que não é SHA-256.',
          hashesDosAnexos: ['abc'],
        });
        expect(resposta.status).toBe(400);
      });
    });
  },
);
