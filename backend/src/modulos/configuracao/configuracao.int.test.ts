import type { Perfil, PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  configuracaoPadrao,
  type TipoOcorrencia,
} from '../../dominio/formulario.js';
import { MODULOS } from '../../dominio/modulos.js';
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
  'módulos e formulário (integração, banco real)',
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

    // Cada teste começa com tudo liberado e ligado, e o formulário padrão
    beforeEach(async () => {
      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { modulosLiberados: [...MODULOS], modulosAtivos: [...MODULOS] },
      });
      await prisma.configuracaoDoFormulario.deleteMany({
        where: { empresaId: empresa.id },
      });
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
        (metodo: 'post' | 'put' | 'delete') =>
        (url: string, corpo: object = {}) => {
          const agente = request(app);
          return agente[metodo](url)
            .set('Origin', FRONTEND)
            .set('Cookie', cookie)
            .send(corpo);
        };
      return {
        get: (url: string) => request(app).get(url).set('Cookie', cookie),
        post: enviar('post'),
        put: enviar('put'),
        delete: enviar('delete'),
      };
    }

    let documento = 70_000;
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

    function formularioDe(tipo: TipoOcorrencia) {
      const { ativo, exigirDocumento, campos, motivos } =
        configuracaoPadrao(tipo);
      return { ativo, exigirDocumento, campos, motivos };
    }

    describe('módulos', () => {
      it('o /eu traz os módulos em uso; a empresa liga só os liberados', async () => {
        const admin = await como('ADMIN');
        expect((await admin.get('/api/auth/eu')).body.empresa.modulos).toEqual([
          ...MODULOS,
        ]);

        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { modulosLiberados: ['FILIAIS', 'EMAIL', 'FORMULARIO'] },
        });
        const lidos = await admin.get('/api/configuracao/modulos');
        expect(lidos.body.liberados).toEqual([
          'FILIAIS',
          'EMAIL',
          'FORMULARIO',
        ]);
        expect(lidos.body.ligados).toEqual(['FILIAIS', 'EMAIL', 'FORMULARIO']);

        const naoLiberado = await admin.put('/api/configuracao/modulos', {
          ativos: ['FILIAIS', 'BALANCO'],
        });
        expect(naoLiberado.status).toBe(422);

        const salvo = await admin.put('/api/configuracao/modulos', {
          ativos: ['EMAIL'],
        });
        expect(salvo.status).toBe(200);
        expect(salvo.body.ligados).toEqual(['EMAIL']);
        // O que a plataforma bloqueou continua guardado como estava
        expect(salvo.body.ativos).toContain('BALANCO');

        const trilha = await prisma.eventoAuditoria.findFirst({
          where: { empresaId: empresa.id, acao: 'MODULOS_ALTERADOS' },
        });
        expect(trilha).not.toBeNull();
      });

      it('só o administrador liga e desliga', async () => {
        const supervisor = await como('SUPERVISOR');
        expect(
          (await supervisor.put('/api/configuracao/modulos', { ativos: [] }))
            .status,
        ).toBe(403);
        expect((await supervisor.get('/api/configuracao/modulos')).status).toBe(
          200,
        );
      });

      it('registro rápido desligado é recusado', async () => {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: {
            modulosAtivos: MODULOS.filter((m) => m !== 'REGISTRO_RAPIDO'),
          },
        });
        const resposta = await abrir('ANALISTA', {
          registro: { acaoTomada: 'Resolvido por telefone' },
        });
        expect(resposta.status).toBe(422);
        expect(resposta.body.erro).toMatch(/registro rápido/);
      });

      it('sem o módulo de causa, resolver não pede causa nem a mostra', async () => {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: {
            exigirCausaAoResolver: true,
            modulosAtivos: MODULOS.filter((m) => m !== 'CAUSA_DO_ERRO'),
          },
        });
        try {
          const aberta = await abrir('SOLICITANTE');
          const analista = await como('ANALISTA');
          await analista.post(`/api/solicitacoes/${aberta.body.id}/status`, {
            status: 'EM_ANDAMENTO',
          });
          const resolvida = await analista.post(
            `/api/solicitacoes/${aberta.body.id}/status`,
            { status: 'RESOLVIDO' },
          );
          expect(resolvida.status).toBe(200);
          const detalhe = await analista.get(
            `/api/solicitacoes/${aberta.body.id}`,
          );
          expect(detalhe.body.pode.classificar).toBe(false);
          expect(detalhe.body.causa).toBeNull();
        } finally {
          await prisma.empresa.update({
            where: { id: empresa.id },
            data: { exigirCausaAoResolver: false },
          });
        }
      });

      it('sem o módulo de verificações, item obrigatório não trava a resolução', async () => {
        const item = await prisma.itemDeVerificacao.create({
          data: {
            empresaId: empresa.id,
            texto: 'Desacordo feito?',
            obrigatorioParaResolver: true,
          },
        });
        try {
          await prisma.empresa.update({
            where: { id: empresa.id },
            data: {
              modulosAtivos: MODULOS.filter((m) => m !== 'VERIFICACOES'),
            },
          });
          const aberta = await abrir('SOLICITANTE');
          const analista = await como('ANALISTA');
          expect(
            (
              await analista.put(
                `/api/solicitacoes/${aberta.body.id}/verificacoes/${item.id}`,
                { marcada: true },
              )
            ).status,
          ).toBe(422);
          await analista.post(`/api/solicitacoes/${aberta.body.id}/status`, {
            status: 'EM_ANDAMENTO',
          });
          const resolvida = await analista.post(
            `/api/solicitacoes/${aberta.body.id}/status`,
            { status: 'RESOLVIDO' },
          );
          expect(resolvida.status).toBe(200);
          expect(
            (await analista.get(`/api/solicitacoes/${aberta.body.id}`)).body
              .verificacoes,
          ).toEqual([]);
        } finally {
          await prisma.itemDeVerificacao.update({
            where: { id: item.id },
            data: { ativo: false },
          });
        }
      });

      it('sem o módulo de balanço, a planilha de produção é recusada', async () => {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { modulosLiberados: MODULOS.filter((m) => m !== 'BALANCO') },
        });
        const resposta = await (
          await como('SUPERVISOR')
        ).put('/api/indicadores/producao', {
          mes: '2026-10',
          linhas: [{ digitador: 'Ana', ctesEmitidos: 10 }],
        });
        expect(resposta.status).toBe(422);
      });

      it('sem o módulo de filiais, a filial é ignorada', async () => {
        const filial = await prisma.filial.create({
          data: { empresaId: empresa.id, nome: `Matriz ${documento}` },
        });
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { modulosAtivos: MODULOS.filter((m) => m !== 'FILIAIS') },
        });
        const aberta = await abrir('SOLICITANTE', { filialId: filial.id });
        expect(aberta.status).toBe(201);
        expect(aberta.body.filial).toBeNull();
        const formulario = await (
          await como('SOLICITANTE')
        ).get('/api/configuracao/formulario');
        expect(
          formulario.body.tipos.every(
            (t: { campos: { filial: { modo: string } } }) =>
              t.campos.filial.modo === 'OCULTO',
          ),
        ).toBe(true);
      });
    });

    describe('formulário', () => {
      it('todos leem o formulário; só o admin altera e vê os tipos desligados', async () => {
        const solicitante = await como('SOLICITANTE');
        const lido = await solicitante.get('/api/configuracao/formulario');
        expect(lido.status).toBe(200);
        expect(lido.body.personalizavel).toBe(true);
        expect(lido.body.tipos).toHaveLength(4);

        expect(
          (
            await solicitante.put(
              '/api/configuracao/formulario/OUTRO',
              formularioDe('OUTRO'),
            )
          ).status,
        ).toBe(403);

        const admin = await como('ADMIN');
        const desligado = await admin.put(
          '/api/configuracao/formulario/OUTRO',
          {
            ...formularioDe('OUTRO'),
            ativo: false,
          },
        );
        expect(desligado.status).toBe(200);
        expect(
          (await solicitante.get('/api/configuracao/formulario')).body.tipos,
        ).toHaveLength(3);
        expect(
          (await admin.get('/api/configuracao/formulario?todos=1')).body.tipos,
        ).toHaveLength(4);

        const aberta = await (
          await como('SOLICITANTE')
        ).post('/api/solicitacoes', {
          tipo: 'OUTRO',
          descricao: 'Tipo desligado não deveria abrir.',
        });
        expect(aberta.status).toBe(422);
        expect(aberta.body.erro).toMatch(/desativado/);
      });

      it('obrigatórios, escondidos e padrões valem na abertura', async () => {
        const admin = await como('ADMIN');
        const base = formularioDe('REVERSAO');
        const salvo = await admin.put('/api/configuracao/formulario/REVERSAO', {
          ...base,
          campos: {
            ...base.campos,
            motivo: { modo: 'OBRIGATORIO', padrao: 'Erro de emissão' },
            prioridade: { modo: 'OCULTO', padrao: 'ALTA' },
            nf: { modo: 'OCULTO' },
          },
          motivos: [
            'Erro de emissão',
            '  Mercadoria devolvida ',
            'erro de emissão',
          ],
        });
        expect(salvo.status).toBe(200);
        expect(salvo.body.motivos).toEqual([
          'Erro de emissão',
          'Mercadoria devolvida',
        ]);

        const semMotivo = await abrir('SOLICITANTE');
        expect(semMotivo.status).toBe(422);
        expect(semMotivo.body.erro).toMatch(/motivo/);

        const foraDaLista = await abrir('SOLICITANTE', { motivo: 'Inventado' });
        expect(foraDaLista.status).toBe(422);

        const certa = await abrir('SOLICITANTE', {
          motivo: 'Mercadoria devolvida',
          prioridade: 'BAIXA',
          nf: '555',
        });
        expect(certa.status).toBe(201);
        expect(certa.body.motivo).toBe('Mercadoria devolvida');
        // Prioridade escondida: vale o padrão, não o que veio
        expect(certa.body.prioridade).toBe('ALTA');
        // NF escondida: ignorada
        expect(certa.body.nf).toBeNull();
      });

      it('recusa configuração incoerente e restaura o padrão', async () => {
        const admin = await como('ADMIN');
        const base = formularioDe('OUTRO');
        const semMotivos = await admin.put(
          '/api/configuracao/formulario/OUTRO',
          {
            ...base,
            campos: { ...base.campos, motivo: { modo: 'OPCIONAL' } },
            motivos: [],
          },
        );
        expect(semMotivos.status).toBe(422);

        const descricaoEscondida = await admin.put(
          '/api/configuracao/formulario/OUTRO',
          {
            ...base,
            campos: { ...base.campos, descricao: { modo: 'OCULTO' } },
          },
        );
        expect(descricaoEscondida.status).toBe(422);

        const prioridadeRuim = await admin.put(
          '/api/configuracao/formulario/OUTRO',
          {
            ...base,
            campos: {
              ...base.campos,
              prioridade: { modo: 'OPCIONAL', padrao: 'ALTISSIMA' },
            },
          },
        );
        expect(prioridadeRuim.status).toBe(422);

        expect(
          (await admin.put('/api/configuracao/formulario/NADA', base)).status,
        ).toBe(404);

        await admin.put('/api/configuracao/formulario/OUTRO', {
          ...base,
          exigirDocumento: true,
        });
        const restaurado = await admin.delete(
          '/api/configuracao/formulario/OUTRO',
        );
        expect(restaurado.body.exigirDocumento).toBe(false);
      });

      it('não deixa desligar todos os tipos', async () => {
        const admin = await como('ADMIN');
        for (const tipo of [
          'REVERSAO',
          'TROCA_PAGADOR',
          'AJUSTE_FISCAL',
        ] as const) {
          expect(
            (
              await admin.put(`/api/configuracao/formulario/${tipo}`, {
                ...formularioDe(tipo),
                ativo: false,
              })
            ).status,
          ).toBe(200);
        }
        const ultimo = await admin.put('/api/configuracao/formulario/OUTRO', {
          ...formularioDe('OUTRO'),
          ativo: false,
        });
        expect(ultimo.status).toBe(422);
      });

      it('sem o módulo "Formulário", vale o padrão e nada pode ser salvo', async () => {
        const admin = await como('ADMIN');
        await admin.put('/api/configuracao/formulario/OUTRO', {
          ...formularioDe('OUTRO'),
          exigirDocumento: true,
        });
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: { modulosAtivos: MODULOS.filter((m) => m !== 'FORMULARIO') },
        });
        const lido = await admin.get('/api/configuracao/formulario');
        expect(lido.body.personalizavel).toBe(false);
        expect(
          lido.body.tipos.find((t: { tipo: string }) => t.tipo === 'OUTRO')
            .exigirDocumento,
        ).toBe(false);
        expect(
          (
            await admin.put(
              '/api/configuracao/formulario/OUTRO',
              formularioDe('OUTRO'),
            )
          ).status,
        ).toBe(403);
      });

      it('a configuração de uma empresa não vale para a outra', async () => {
        const admin = await como('ADMIN');
        await admin.put('/api/configuracao/formulario/OUTRO', {
          ...formularioDe('OUTRO'),
          ativo: false,
        });
        const daOutra = await (
          await como('SOLICITANTE', outra)
        ).get('/api/configuracao/formulario');
        expect(daOutra.body.tipos).toHaveLength(4);
      });
    });
  },
);
