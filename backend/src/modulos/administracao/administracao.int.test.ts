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

describe.skipIf(!temBanco)('administração (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;

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

  async function entrar(slug: string, email: string, senha: string) {
    return request(app)
      .post('/api/auth/login')
      .set('Origin', FRONTEND)
      .send({ empresa: slug, email, senha });
  }

  /** Cliente com os cookies de quem entrou (acesso e sessão). */
  async function sessaoDe(slug: string, email: string, senha: string) {
    const resposta = await entrar(slug, email, senha);
    expect(resposta.status).toBe(204);
    const { sigof_acesso, sigof_sessao } = cookiesDa(resposta);
    const cookie = `sigof_acesso=${sigof_acesso}; sigof_sessao=${sigof_sessao}`;
    const comCorpo =
      (metodo: 'post' | 'patch') =>
      (url: string, corpo: object = {}) => {
        const pedido =
          metodo === 'post' ? request(app).post(url) : request(app).patch(url);
        return pedido.set('Origin', FRONTEND).set('Cookie', cookie).send(corpo);
      };
    return {
      get: (url: string) => request(app).get(url).set('Cookie', cookie),
      post: comCorpo('post'),
      patch: comCorpo('patch'),
    };
  }

  const como = (perfil: Perfil, de: EmpresaDeTeste = empresa) =>
    sessaoDe(de.slug, de.usuarios[perfil].email, SENHA);

  let sequencia = 0;
  function emailNovo(): string {
    sequencia += 1;
    return `pessoa${sequencia}@${empresa.slug}.test`;
  }

  async function criar(perfil: Perfil = 'ANALISTA') {
    const admin = await como('ADMIN');
    const resposta = await admin.post('/api/admin/usuarios', {
      nome: 'Pessoa Nova',
      email: emailNovo(),
      perfil,
      area: 'FINANCEIRO',
    });
    expect(resposta.status).toBe(201);
    return resposta.body as {
      usuario: { id: string; email: string; trocarSenha: boolean };
      senhaProvisoria: string;
    };
  }

  describe('acesso', () => {
    it.each(['SOLICITANTE', 'ANALISTA', 'SUPERVISOR'] as const)(
      'recusa o perfil %s',
      async (perfil) => {
        const cliente = await como(perfil);
        expect((await cliente.get('/api/admin/usuarios')).status).toBe(403);
        expect((await cliente.get('/api/admin/empresa')).status).toBe(403);
      },
    );

    it('exige login', async () => {
      expect((await request(app).get('/api/admin/usuarios')).status).toBe(401);
    });
  });

  describe('usuários', () => {
    it('lista só os usuários da própria empresa', async () => {
      const admin = await como('ADMIN');
      const resposta = await admin.get('/api/admin/usuarios');
      expect(resposta.status).toBe(200);
      const emails = (resposta.body as { email: string }[]).map((u) => u.email);
      expect(emails).toContain(empresa.usuarios.ANALISTA.email);
      expect(emails).not.toContain(outra.usuarios.ANALISTA.email);
    });

    it('cria com senha provisória, que obriga a trocar no primeiro acesso', async () => {
      const { usuario, senhaProvisoria } = await criar();
      expect(usuario.trocarSenha).toBe(true);
      expect(senhaProvisoria).toHaveLength(12);

      const novo = await sessaoDe(empresa.slug, usuario.email, senhaProvisoria);
      expect((await novo.get('/api/auth/eu')).body.trocarSenha).toBe(true);

      const troca = await novo.post('/api/auth/senha', {
        senhaAtual: senhaProvisoria,
        novaSenha: 'MinhaSenha2026',
      });
      expect(troca.status).toBe(204);
      expect((await novo.get('/api/auth/eu')).body.trocarSenha).toBe(false);
      expect(
        (await entrar(empresa.slug, usuario.email, 'MinhaSenha2026')).status,
      ).toBe(204);
    });

    it('recusa e-mail repetido na empresa, sem diferenciar maiúsculas', async () => {
      const admin = await como('ADMIN');
      const resposta = await admin.post('/api/admin/usuarios', {
        nome: 'Repetido',
        email: empresa.usuarios.ANALISTA.email.toUpperCase(),
        perfil: 'ANALISTA',
      });
      expect(resposta.status).toBe(409);
    });

    it('aceita o mesmo e-mail em outra empresa', async () => {
      const admin = await como('ADMIN', outra);
      const resposta = await admin.post('/api/admin/usuarios', {
        nome: 'Mesmo e-mail',
        email: `pessoa-compartilhada@${empresa.slug}.test`,
        perfil: 'SOLICITANTE',
      });
      expect(resposta.status).toBe(201);
      const daqui = await (
        await como('ADMIN')
      ).post('/api/admin/usuarios', {
        nome: 'Mesmo e-mail',
        email: `pessoa-compartilhada@${empresa.slug}.test`,
        perfil: 'SOLICITANTE',
      });
      expect(daqui.status).toBe(201);
    });

    it('valida os campos', async () => {
      const admin = await como('ADMIN');
      const resposta = await admin.post('/api/admin/usuarios', {
        nome: 'X',
        email: 'nao-e-email',
        perfil: 'CHEFE',
      });
      expect(resposta.status).toBe(400);
      expect(
        (resposta.body.detalhes as { campo: string }[]).map((d) => d.campo),
      ).toEqual(expect.arrayContaining(['nome', 'email', 'perfil']));
    });

    it('desativado não entra mais e perde as sessões abertas', async () => {
      const { usuario, senhaProvisoria } = await criar();
      const sessao = await entrar(empresa.slug, usuario.email, senhaProvisoria);
      const { sigof_sessao } = cookiesDa(sessao);

      const admin = await como('ADMIN');
      const resposta = await admin.patch(`/api/admin/usuarios/${usuario.id}`, {
        ativo: false,
      });
      expect(resposta.status).toBe(200);
      expect(resposta.body.ativo).toBe(false);

      expect(
        (await entrar(empresa.slug, usuario.email, senhaProvisoria)).status,
      ).toBe(401);
      const renovar = await request(app)
        .post('/api/auth/renovar')
        .set('Origin', FRONTEND)
        .set('Cookie', `sigof_sessao=${sigof_sessao}`);
      expect(renovar.status).toBe(401);
    });

    it('muda perfil e área e registra o antes e o depois na auditoria', async () => {
      const { usuario } = await criar('SOLICITANTE');
      const admin = await como('ADMIN');
      const resposta = await admin.patch(`/api/admin/usuarios/${usuario.id}`, {
        perfil: 'SUPERVISOR',
        area: null,
      });
      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({ perfil: 'SUPERVISOR', area: null });

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { alvoId: usuario.id, acao: 'USUARIO_ALTERADO' },
      });
      expect(evento?.detalhes).toEqual({
        perfil: { de: 'SOLICITANTE', para: 'SUPERVISOR' },
        area: { de: 'FINANCEIRO', para: null },
      });
    });

    it('não grava nada quando nada mudou', async () => {
      const { usuario } = await criar();
      const admin = await como('ADMIN');
      await admin.patch(`/api/admin/usuarios/${usuario.id}`, {
        nome: 'Pessoa Nova',
      });
      const eventos = await prisma.eventoAuditoria.count({
        where: { alvoId: usuario.id, acao: 'USUARIO_ALTERADO' },
      });
      expect(eventos).toBe(0);
    });

    it('o administrador não desativa a si mesmo nem perde o perfil', async () => {
      const admin = await como('ADMIN');
      const id = empresa.usuarios.ADMIN.id;
      expect(
        (await admin.patch(`/api/admin/usuarios/${id}`, { ativo: false }))
          .status,
      ).toBe(422);
      expect(
        (await admin.patch(`/api/admin/usuarios/${id}`, { perfil: 'ANALISTA' }))
          .status,
      ).toBe(422);
    });

    it('usuário de outra empresa é tratado como inexistente', async () => {
      const admin = await como('ADMIN');
      const id = outra.usuarios.ANALISTA.id;
      expect(
        (await admin.patch(`/api/admin/usuarios/${id}`, { ativo: false }))
          .status,
      ).toBe(404);
      expect(
        (await admin.post(`/api/admin/usuarios/${id}/redefinir-senha`)).status,
      ).toBe(404);
      expect(
        (await admin.patch('/api/admin/usuarios/nao-e-uuid', { ativo: false }))
          .status,
      ).toBe(404);
    });

    it('redefinir a senha desbloqueia a conta e invalida a senha antiga', async () => {
      const { usuario, senhaProvisoria } = await criar();
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { bloqueadoAte: new Date(Date.now() + 60 * 60_000) },
      });

      const admin = await como('ADMIN');
      const lista = await admin.get('/api/admin/usuarios');
      expect(
        (lista.body as { id: string; bloqueado: boolean }[]).find(
          (u) => u.id === usuario.id,
        )?.bloqueado,
      ).toBe(true);

      const resposta = await admin.post(
        `/api/admin/usuarios/${usuario.id}/redefinir-senha`,
      );
      expect(resposta.status).toBe(200);
      const nova = resposta.body.senhaProvisoria as string;
      expect(nova).not.toBe(senhaProvisoria);
      expect(resposta.body.usuario.bloqueado).toBe(false);

      expect(
        (await entrar(empresa.slug, usuario.email, senhaProvisoria)).status,
      ).toBe(401);
      expect((await entrar(empresa.slug, usuario.email, nova)).status).toBe(
        204,
      );
    });

    it('não redefine a senha de quem está desativado', async () => {
      const { usuario } = await criar();
      const admin = await como('ADMIN');
      await admin.patch(`/api/admin/usuarios/${usuario.id}`, { ativo: false });
      expect(
        (await admin.post(`/api/admin/usuarios/${usuario.id}/redefinir-senha`))
          .status,
      ).toBe(422);
    });
  });

  describe('troca da própria senha', () => {
    it('recusa senha atual errada e senha fraca', async () => {
      const { usuario, senhaProvisoria } = await criar();
      const cliente = await sessaoDe(
        empresa.slug,
        usuario.email,
        senhaProvisoria,
      );
      expect(
        (
          await cliente.post('/api/auth/senha', {
            senhaAtual: 'errada',
            novaSenha: 'OutraSenha2026',
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await cliente.post('/api/auth/senha', {
            senhaAtual: senhaProvisoria,
            novaSenha: 'curta1',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await cliente.post('/api/auth/senha', {
            senhaAtual: senhaProvisoria,
            novaSenha: 'semnumeroaqui',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await cliente.post('/api/auth/senha', {
            senhaAtual: senhaProvisoria,
            novaSenha: senhaProvisoria,
          })
        ).status,
      ).toBe(422);
    });

    it('encerra as outras sessões e mantém a atual', async () => {
      const { usuario, senhaProvisoria } = await criar();
      const outroAparelho = cookiesDa(
        await entrar(empresa.slug, usuario.email, senhaProvisoria),
      );
      const cliente = await sessaoDe(
        empresa.slug,
        usuario.email,
        senhaProvisoria,
      );

      await cliente.post('/api/auth/senha', {
        senhaAtual: senhaProvisoria,
        novaSenha: 'SenhaDefinitiva9',
      });

      const renovarOutro = await request(app)
        .post('/api/auth/renovar')
        .set('Origin', FRONTEND)
        .set('Cookie', `sigof_sessao=${outroAparelho.sigof_sessao}`);
      expect(renovarOutro.status).toBe(401);
      expect((await cliente.get('/api/auth/eu')).status).toBe(200);
    });
  });

  describe('parâmetros da empresa', () => {
    it('mostra e altera expediente, dias úteis e SLA', async () => {
      const admin = await como('ADMIN');
      expect((await admin.get('/api/admin/empresa')).body).toMatchObject({
        slug: empresa.slug,
        expedienteInicioMinuto: 480,
      });

      const resposta = await admin.patch('/api/admin/empresa', {
        expedienteInicioMinuto: 7 * 60,
        diasUteis: [6, 1, 2, 2, 3],
        slaAtendimentoMinutos: 120,
        fusoHorario: 'America/Manaus',
      });
      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        expedienteInicioMinuto: 420,
        diasUteis: [1, 2, 3, 6],
        slaAtendimentoMinutos: 120,
        fusoHorario: 'America/Manaus',
      });

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { empresaId: empresa.id, acao: 'EMPRESA_ALTERADA' },
      });
      expect(evento?.detalhes).toMatchObject({
        slaAtendimentoMinutos: { de: 240, para: 120 },
      });
    });

    it('recusa expediente invertido, fuso desconhecido e campo extra', async () => {
      const admin = await como('ADMIN');
      expect(
        (
          await admin.patch('/api/admin/empresa', {
            expedienteInicioMinuto: 1000,
            expedienteFimMinuto: 900,
          })
        ).status,
      ).toBe(422);
      expect(
        (await admin.patch('/api/admin/empresa', { fusoHorario: 'Marte/Base' }))
          .status,
      ).toBe(400);
      expect(
        (await admin.patch('/api/admin/empresa', { slug: 'outra-coisa' }))
          .status,
      ).toBe(400);
      expect(
        (await admin.patch('/api/admin/empresa', { diasUteis: [] })).status,
      ).toBe(400);
    });

    it('não altera a outra empresa', async () => {
      const antes = await prisma.empresa.findUniqueOrThrow({
        where: { id: outra.id },
      });
      const admin = await como('ADMIN');
      await admin.patch('/api/admin/empresa', { janelaDuplicidadeDias: 3 });
      const depois = await prisma.empresa.findUniqueOrThrow({
        where: { id: outra.id },
      });
      expect(depois.janelaDuplicidadeDias).toBe(antes.janelaDuplicidadeDias);
    });
  });

  describe('auditoria', () => {
    it('registra login, login recusado e saída, com IP', async () => {
      const email = empresa.usuarios.SUPERVISOR.email;
      await entrar(empresa.slug, email, 'senha-errada');
      const sessao = await entrar(empresa.slug, email, SENHA);
      await request(app)
        .post('/api/auth/sair')
        .set('Origin', FRONTEND)
        .set('Cookie', `sigof_sessao=${cookiesDa(sessao).sigof_sessao}`);

      const acoes = (
        await prisma.eventoAuditoria.findMany({
          where: { alvoId: empresa.usuarios.SUPERVISOR.id },
          orderBy: { criadoEm: 'asc' },
        })
      ).map((e) => e.acao);
      expect(acoes).toEqual(
        expect.arrayContaining(['LOGIN_RECUSADO', 'LOGIN', 'SAIDA']),
      );

      const recusado = await prisma.eventoAuditoria.findFirst({
        where: {
          alvoId: empresa.usuarios.SUPERVISOR.id,
          acao: 'LOGIN_RECUSADO',
        },
      });
      expect(recusado?.detalhes).toEqual({ motivo: 'senha errada' });
      expect(recusado?.ip).toBeTruthy();
    });

    it('a trilha é paginada e só mostra a própria empresa', async () => {
      const admin = await como('ADMIN');
      const resposta = await admin.get('/api/admin/auditoria?pagina=1');
      expect(resposta.status).toBe(200);
      expect(resposta.body.total).toBeGreaterThan(0);
      const empresas = await prisma.eventoAuditoria.findMany({
        where: {
          id: {
            in: (resposta.body.eventos as { id: string }[]).map((e) => e.id),
          },
        },
        select: { empresaId: true },
      });
      expect(new Set(empresas.map((e) => e.empresaId))).toEqual(
        new Set([empresa.id]),
      );
    });

    it('filtra por ação, por pessoa (quem fez ou sobre quem) e por período', async () => {
      const admin = await como('ADMIN');
      const supervisor = empresa.usuarios.SUPERVISOR.id;

      const recusados = await admin.get(
        `/api/admin/auditoria?acao=LOGIN_RECUSADO,SAIDA&usuarioId=${supervisor}`,
      );
      expect(recusados.status).toBe(200);
      expect(recusados.body.total).toBeGreaterThan(0);
      for (const evento of recusados.body.eventos as {
        acao: string;
        autor: { id: string } | null;
        alvo: { id: string } | null;
      }[]) {
        expect(['LOGIN_RECUSADO', 'SAIDA']).toContain(evento.acao);
        expect([evento.autor?.id, evento.alvo?.id]).toContain(supervisor);
      }

      const hoje = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
      }).format(new Date());
      const deHoje = await admin.get(
        `/api/admin/auditoria?de=${hoje}&ate=${hoje}`,
      );
      const doAnoPassado = await admin.get(
        '/api/admin/auditoria?de=2025-01-01&ate=2025-12-31',
      );
      expect(deHoje.body.total).toBeGreaterThan(0);
      expect(doAnoPassado.body.total).toBe(0);

      expect(
        (await admin.get('/api/admin/auditoria?acao=INVENTADA')).status,
      ).toBe(400);
    });

    it('o banco recusa alterar um evento já gravado', async () => {
      const evento = await prisma.eventoAuditoria.findFirstOrThrow({
        where: { empresaId: empresa.id },
      });
      await expect(
        prisma.eventoAuditoria.update({
          where: { id: evento.id },
          data: { ip: '0.0.0.0' },
        }),
      ).rejects.toThrow(/não podem ser alterados/);
    });
  });
});
