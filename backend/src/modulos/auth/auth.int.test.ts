import type { PrismaClient } from '@prisma/client';
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
import { FALHAS_PARA_BLOQUEIO } from './servico.js';

describe.skipIf(!temBanco)('autenticação (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;

  beforeAll(async () => {
    prisma = conectar();
    // Limite alto: o rate limit tem teste próprio, com app separada
    app = criarApp({ prisma, env: envDeTeste(), limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
    outra = await criarEmpresaDeTeste(prisma);
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, outra.id);
    await prisma.$disconnect();
  });

  function login(slug: string, email: string, senha = SENHA) {
    return request(app)
      .post('/auth/login')
      .send({ empresa: slug, email, senha });
  }

  function comCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([nome, valor]) => `${nome}=${valor}`)
      .join('; ');
  }

  describe('POST /auth/login', () => {
    it('com credenciais certas, devolve 204 e os dois cookies protegidos', async () => {
      const resposta = await login(
        empresa.slug,
        empresa.usuarios.ANALISTA.email,
      );

      expect(resposta.status).toBe(204);
      const setCookie = (
        resposta.headers['set-cookie'] as unknown as string[]
      ).join('\n');
      expect(setCookie).toMatch(/sigof_acesso=.+; .*HttpOnly/);
      expect(setCookie).toMatch(/sigof_sessao=.+; Path=\/auth; .*HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);
    });

    it('ignora maiúsculas e espaços no e-mail e na empresa', async () => {
      const resposta = await login(
        ` ${empresa.slug.toUpperCase()} `,
        ` ${empresa.usuarios.ANALISTA.email.toUpperCase()} `,
      );

      expect(resposta.status).toBe(204);
    });

    it('responde igual para senha errada, e-mail inexistente e empresa errada', async () => {
      const respostas = await Promise.all([
        login(empresa.slug, empresa.usuarios.SUPERVISOR.email, 'senha-errada'),
        login(empresa.slug, 'ninguem@inexistente.test'),
        login('empresa-que-nao-existe', empresa.usuarios.SUPERVISOR.email),
        // Usuário existe, mas em outra empresa
        login(outra.slug, empresa.usuarios.SUPERVISOR.email),
      ]);

      for (const resposta of respostas) {
        expect(resposta.status).toBe(401);
        expect(resposta.body.erro).toBe('Empresa, e-mail ou senha inválidos');
        expect(resposta.headers['set-cookie']).toBeUndefined();
      }
    });

    it('recusa dados malformados com 400 e o campo errado', async () => {
      const resposta = await request(app)
        .post('/auth/login')
        .send({ empresa: '', email: 'nao-e-email', senha: '' });

      expect(resposta.status).toBe(400);
      const campos = (resposta.body.detalhes as { campo: string }[]).map(
        (d) => d.campo,
      );
      expect(campos).toEqual(
        expect.arrayContaining(['empresa', 'email', 'senha']),
      );
    });

    it('recusa usuário desativado', async () => {
      await prisma.usuario.update({
        where: { id: empresa.usuarios.SOLICITANTE.id },
        data: { ativo: false },
      });

      const resposta = await login(
        empresa.slug,
        empresa.usuarios.SOLICITANTE.email,
      );

      expect(resposta.status).toBe(401);
      await prisma.usuario.update({
        where: { id: empresa.usuarios.SOLICITANTE.id },
        data: { ativo: true },
      });
    });

    it(`bloqueia a conta após ${FALHAS_PARA_BLOQUEIO} senhas erradas, mesmo com a senha certa depois`, async () => {
      const { email, id } = outra.usuarios.ADMIN;
      for (let i = 0; i < FALHAS_PARA_BLOQUEIO; i++) {
        await login(outra.slug, email, 'senha-errada');
      }

      const comSenhaCerta = await login(outra.slug, email);
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id } });

      expect(comSenhaCerta.status).toBe(401);
      expect(usuario.bloqueadoAte!.getTime()).toBeGreaterThan(Date.now());

      // Passado o bloqueio, o login volta a funcionar e zera o contador
      await prisma.usuario.update({
        where: { id },
        data: { bloqueadoAte: new Date(Date.now() - 1000) },
      });
      expect((await login(outra.slug, email)).status).toBe(204);
      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id } });
      expect(depois.bloqueadoAte).toBeNull();
      expect(depois.falhasDeLogin).toBe(0);
    });
  });

  describe('GET /auth/eu', () => {
    it('devolve o usuário logado com a empresa dele', async () => {
      const cookies = cookiesDa(
        await login(empresa.slug, empresa.usuarios.ANALISTA.email),
      );

      const resposta = await request(app)
        .get('/auth/eu')
        .set('Cookie', comCookies(cookies));

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        email: empresa.usuarios.ANALISTA.email,
        perfil: 'ANALISTA',
        empresa: { slug: empresa.slug },
      });
      expect(resposta.body.senhaHash).toBeUndefined();
    });

    it('sem cookie ou com token adulterado, responde 401', async () => {
      const semCookie = await request(app).get('/auth/eu');
      const adulterado = await request(app)
        .get('/auth/eu')
        .set(
          'Cookie',
          'sigof_acesso=eyJhbGciOiJIUzI1NiJ9.e30.assinatura-falsa',
        );

      expect(semCookie.status).toBe(401);
      expect(adulterado.status).toBe(401);
    });
  });

  describe('POST /auth/renovar', () => {
    it('troca o token de sessão por um novo par', async () => {
      const primeiro = cookiesDa(
        await login(empresa.slug, empresa.usuarios.SUPERVISOR.email),
      );

      const resposta = await request(app)
        .post('/auth/renovar')
        .set('Cookie', comCookies({ sigof_sessao: primeiro.sigof_sessao! }));
      const novos = cookiesDa(resposta);

      expect(resposta.status).toBe(204);
      expect(novos.sigof_sessao).toBeDefined();
      expect(novos.sigof_sessao).not.toBe(primeiro.sigof_sessao);
      expect(novos.sigof_acesso).toBeDefined();
    });

    it('reuso de um token já trocado derruba a sessão inteira (roubo detectado)', async () => {
      const original = cookiesDa(
        await login(empresa.slug, empresa.usuarios.SUPERVISOR.email),
      );
      const renovar = (token: string) =>
        request(app)
          .post('/auth/renovar')
          .set('Cookie', `sigof_sessao=${token}`);

      const legitimo = cookiesDa(await renovar(original.sigof_sessao!));
      const atacante = await renovar(original.sigof_sessao!);
      const depoisDoAtaque = await renovar(legitimo.sigof_sessao!);

      expect(atacante.status).toBe(401);
      // O token mais novo também morreu: a família toda foi revogada
      expect(depoisDoAtaque.status).toBe(401);
    });

    it('sem cookie, responde 401', async () => {
      expect((await request(app).post('/auth/renovar')).status).toBe(401);
    });
  });

  describe('saída', () => {
    it('POST /auth/sair revoga a sessão e limpa os cookies', async () => {
      const cookies = cookiesDa(
        await login(empresa.slug, empresa.usuarios.ADMIN.email),
      );

      const saida = await request(app)
        .post('/auth/sair')
        .set('Cookie', `sigof_sessao=${cookies.sigof_sessao}`);
      const renovarDepois = await request(app)
        .post('/auth/renovar')
        .set('Cookie', `sigof_sessao=${cookies.sigof_sessao}`);

      expect(saida.status).toBe(204);
      expect(cookiesDa(saida).sigof_acesso).toBe('');
      expect(renovarDepois.status).toBe(401);
    });

    it('POST /auth/sair sem cookie também responde 204', async () => {
      expect((await request(app).post('/auth/sair')).status).toBe(204);
    });

    it('POST /auth/sair-de-todos derruba as sessões de todos os dispositivos', async () => {
      const { email } = empresa.usuarios.ADMIN;
      const celular = cookiesDa(await login(empresa.slug, email));
      const notebook = cookiesDa(await login(empresa.slug, email));

      const resposta = await request(app)
        .post('/auth/sair-de-todos')
        .set('Cookie', comCookies(notebook));
      const celularDepois = await request(app)
        .post('/auth/renovar')
        .set('Cookie', `sigof_sessao=${celular.sigof_sessao}`);

      expect(resposta.status).toBe(204);
      expect(celularDepois.status).toBe(401);
    });
  });

  it('limita tentativas de login por IP + e-mail (429)', async () => {
    const appLimitada = criarApp({
      prisma,
      env: envDeTeste(),
      limiteDeLoginPorMinuto: 2,
    });
    const tentar = () =>
      request(appLimitada)
        .post('/auth/login')
        .send({ empresa: empresa.slug, email: 'limite@x.test', senha: 'x' });

    await tentar();
    await tentar();
    const terceira = await tentar();

    expect(terceira.status).toBe(429);
    expect(terceira.body.codigo).toBe('MUITAS_TENTATIVAS');
  });
});
