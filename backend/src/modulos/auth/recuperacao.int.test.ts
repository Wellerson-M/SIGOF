import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../http/app.js';
import {
  SENHA,
  apagarEmpresaDeTeste,
  conectar,
  criarEmpresaDeTeste,
  envDeTeste,
  temBanco,
  type EmpresaDeTeste,
} from '../../testes/banco-de-teste.js';
import { LINKS_POR_HORA, LINK_INVALIDO } from './recuperacao.js';
import { RESPOSTA_DO_PEDIDO } from './rotas-recuperacao.js';
import { hashDoToken } from './tokens.js';

const FRONTEND = envDeTeste().FRONTEND_URL;
const NOVA_SENHA = 'Outra@Senha456';

describe.skipIf(!temBanco)('recuperação de senha (integração)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let semEmail: EmpresaDeTeste;

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({ prisma, env: envDeTeste(), limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
    semEmail = await criarEmpresaDeTeste(prisma);
    await prisma.empresa.update({
      where: { id: empresa.id },
      data: {
        emailAtivo: true,
        smtpServidor: 'smtp.exemplo.test',
        smtpUsuario: 'envio@exemplo.test',
        smtpSenhaCifrada: 'qualquer-coisa',
      },
    });
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, semEmail.id);
    await prisma.$disconnect();
  });

  // Cada teste parte de um usuário sem pedidos, e-mails nem bloqueio
  beforeEach(async () => {
    await prisma.recuperacaoDeSenha.deleteMany({
      where: { empresaId: empresa.id },
    });
    await prisma.emailSaida.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.eventoAuditoria.deleteMany({
      where: { empresaId: empresa.id },
    });
    await prisma.usuario.updateMany({
      where: { empresaId: empresa.id },
      data: { ativo: true, bloqueadoAte: null, falhasDeLogin: 0 },
    });
    const analista = empresa.usuarios.ANALISTA;
    const { gerarHashDeSenha } = await import('../../seguranca/senha.js');
    await prisma.usuario.update({
      where: { id: analista.id },
      data: { senhaHash: await gerarHashDeSenha(SENHA) },
    });
  });

  const pedir = (slug: string, email: string) =>
    request(app)
      .post('/api/auth/esqueci-senha')
      .set('Origin', FRONTEND)
      .send({ empresa: slug, email });

  const redefinir = (token: string, novaSenha = NOVA_SENHA) =>
    request(app)
      .post('/api/auth/redefinir-senha')
      .set('Origin', FRONTEND)
      .send({ token, novaSenha });

  const entrar = (email: string, senha: string) =>
    request(app)
      .post('/api/auth/login')
      .set('Origin', FRONTEND)
      .send({ empresa: empresa.slug, email, senha });

  /** Pede o link e devolve o token que o e-mail levaria à pessoa. */
  async function pedirETirarOToken(): Promise<string> {
    const analista = empresa.usuarios.ANALISTA;
    const resposta = await pedir(empresa.slug, analista.email);
    expect(resposta.status).toBe(202);
    const email = await prisma.emailSaida.findFirstOrThrow({
      where: { empresaId: empresa.id, assunto: { contains: 'trocar a sua' } },
      orderBy: { criadoEm: 'desc' },
    });
    const achado = /redefinir-senha#([\w-]{43})/.exec(email.texto);
    expect(achado).not.toBeNull();
    return achado![1]!;
  }

  describe('POST /api/auth/esqueci-senha', () => {
    it('com e-mail cadastrado: guarda só o hash, enfileira o e-mail e audita', async () => {
      const analista = empresa.usuarios.ANALISTA;
      const token = await pedirETirarOToken();

      const registro = await prisma.recuperacaoDeSenha.findFirstOrThrow({
        where: { usuarioId: analista.id },
      });
      expect(registro.tokenHash).toBe(hashDoToken(token));
      expect(registro.tokenHash).not.toContain(token);
      expect(registro.usadoEm).toBeNull();
      const minutos = (registro.expiraEm.getTime() - Date.now()) / 60_000;
      expect(minutos).toBeGreaterThan(28);
      expect(minutos).toBeLessThanOrEqual(30);

      const email = await prisma.emailSaida.findFirstOrThrow({
        where: { empresaId: empresa.id },
      });
      expect(email.para).toEqual([analista.email]);
      expect(email.texto).toContain(`${FRONTEND}/redefinir-senha#${token}`);
      // O token só existe depois do "#": nunca na parte que vai ao servidor
      expect(email.texto).not.toMatch(/redefinir-senha\?/);

      const auditoria = await prisma.eventoAuditoria.count({
        where: { empresaId: empresa.id, acao: 'RECUPERACAO_SOLICITADA' },
      });
      expect(auditoria).toBe(1);
    });

    it('responde igual para e-mail cadastrado, inexistente e de outra empresa', async () => {
      const respostas = await Promise.all([
        pedir(empresa.slug, empresa.usuarios.ANALISTA.email),
        pedir(empresa.slug, 'ninguem@inexistente.test'),
        pedir('empresa-que-nao-existe', empresa.usuarios.ANALISTA.email),
        // O e-mail existe, mas em outra empresa
        pedir(semEmail.slug, empresa.usuarios.ANALISTA.email),
      ]);

      for (const r of respostas) {
        expect(r.status).toBe(202);
        expect(r.body).toEqual({ mensagem: RESPOSTA_DO_PEDIDO });
      }
      // Só o primeiro gerou link
      expect(await prisma.recuperacaoDeSenha.count()).toBeGreaterThanOrEqual(1);
      expect(
        await prisma.recuperacaoDeSenha.count({
          where: { empresaId: semEmail.id },
        }),
      ).toBe(0);
    });

    it('ignora maiúsculas e espaços no e-mail e na empresa', async () => {
      const r = await pedir(
        ` ${empresa.slug.toUpperCase()} `,
        ` ${empresa.usuarios.ANALISTA.email.toUpperCase()} `,
      );
      expect(r.status).toBe(202);
      expect(
        await prisma.recuperacaoDeSenha.count({
          where: { usuarioId: empresa.usuarios.ANALISTA.id },
        }),
      ).toBe(1);
    });

    it('não gera link para usuário desativado', async () => {
      await prisma.usuario.update({
        where: { id: empresa.usuarios.ANALISTA.id },
        data: { ativo: false },
      });
      const r = await pedir(empresa.slug, empresa.usuarios.ANALISTA.email);

      expect(r.status).toBe(202);
      expect(await prisma.recuperacaoDeSenha.count()).toBe(0);
    });

    it('fica quieto (mesma resposta) quando a empresa não configurou o e-mail', async () => {
      const r = await pedir(semEmail.slug, semEmail.usuarios.ANALISTA.email);

      expect(r.status).toBe(202);
      expect(r.body).toEqual({ mensagem: RESPOSTA_DO_PEDIDO });
      expect(
        await prisma.recuperacaoDeSenha.count({
          where: { empresaId: semEmail.id },
        }),
      ).toBe(0);
      expect(
        await prisma.emailSaida.count({ where: { empresaId: semEmail.id } }),
      ).toBe(0);
    });

    it(`limita a ${LINKS_POR_HORA} links por hora para o mesmo usuário`, async () => {
      for (let i = 0; i < LINKS_POR_HORA + 2; i++) {
        const r = await pedir(empresa.slug, empresa.usuarios.ANALISTA.email);
        expect(r.status).toBe(202);
      }
      expect(
        await prisma.recuperacaoDeSenha.count({
          where: { usuarioId: empresa.usuarios.ANALISTA.id },
        }),
      ).toBe(LINKS_POR_HORA);
      expect(
        await prisma.emailSaida.count({ where: { empresaId: empresa.id } }),
      ).toBe(LINKS_POR_HORA);
    });

    it('pedidos simultâneos também respeitam o limite', async () => {
      await Promise.all(
        Array.from({ length: 8 }, () =>
          pedir(empresa.slug, empresa.usuarios.ANALISTA.email),
        ),
      );
      expect(
        await prisma.recuperacaoDeSenha.count({
          where: { usuarioId: empresa.usuarios.ANALISTA.id },
        }),
      ).toBe(LINKS_POR_HORA);
    });

    it('recusa corpo sem e-mail válido', async () => {
      const r = await pedir(empresa.slug, 'isto-nao-e-email');
      expect(r.status).toBe(400);
    });

    it('limita pedidos repetidos do mesmo IP e e-mail (429)', async () => {
      const limitada = criarApp({
        prisma,
        env: envDeTeste(),
        limiteDeLoginPorMinuto: 2,
      });
      const chamar = () =>
        request(limitada)
          .post('/api/auth/esqueci-senha')
          .set('Origin', FRONTEND)
          .send({ empresa: 'x', email: 'quem@exemplo.test' });

      expect((await chamar()).status).toBe(202);
      expect((await chamar()).status).toBe(202);
      const terceira = await chamar();
      expect(terceira.status).toBe(429);
      expect(terceira.body.codigo).toBe('MUITAS_TENTATIVAS');
    });
  });

  describe('POST /api/auth/redefinir-senha', () => {
    it('troca a senha: a nova entra, a antiga não', async () => {
      const analista = empresa.usuarios.ANALISTA;
      const token = await pedirETirarOToken();

      const r = await redefinir(token);

      expect(r.status).toBe(204);
      expect((await entrar(analista.email, NOVA_SENHA)).status).toBe(204);
      expect((await entrar(analista.email, SENHA)).status).toBe(401);
    });

    it('o link vale uma vez só', async () => {
      const token = await pedirETirarOToken();

      expect((await redefinir(token)).status).toBe(204);
      const segunda = await redefinir(token, 'Terceira@Senha789');

      expect(segunda.status).toBe(422);
      expect(segunda.body.erro).toBe(LINK_INVALIDO);
      // A segunda senha não foi aplicada
      expect(
        (await entrar(empresa.usuarios.ANALISTA.email, NOVA_SENHA)).status,
      ).toBe(204);
    });

    it('dois pedidos simultâneos com o mesmo link: só um passa', async () => {
      const token = await pedirETirarOToken();

      const respostas = await Promise.all([
        redefinir(token, 'Primeira@Senha111'),
        redefinir(token, 'Segunda@Senha222'),
      ]);

      expect(respostas.map((r) => r.status).sort()).toEqual([204, 422]);
    });

    it('recusa link vencido', async () => {
      const token = await pedirETirarOToken();
      await prisma.recuperacaoDeSenha.updateMany({
        where: { tokenHash: hashDoToken(token) },
        data: { expiraEm: new Date(Date.now() - 1000) },
      });

      const r = await redefinir(token);

      expect(r.status).toBe(422);
      expect(r.body.erro).toBe(LINK_INVALIDO);
      expect(
        (await entrar(empresa.usuarios.ANALISTA.email, SENHA)).status,
      ).toBe(204);
    });

    it('recusa token inventado com a mesma mensagem do vencido', async () => {
      const inventado = 'A'.repeat(43);
      const r = await redefinir(inventado);

      expect(r.status).toBe(422);
      expect(r.body.erro).toBe(LINK_INVALIDO);
    });

    it('recusa token fora do formato antes de consultar o banco', async () => {
      const r = await redefinir('curto');
      expect(r.status).toBe(400);
    });

    it('senha fraca é recusada e o link continua valendo', async () => {
      const token = await pedirETirarOToken();

      const fraca = await redefinir(token, 'curta1');
      expect(fraca.status).toBe(400);

      expect((await redefinir(token)).status).toBe(204);
    });

    it('encerra todas as sessões abertas do usuário', async () => {
      const analista = empresa.usuarios.ANALISTA;
      await entrar(analista.email, SENHA);
      await entrar(analista.email, SENHA);
      const token = await pedirETirarOToken();

      await redefinir(token);

      const abertas = await prisma.sessao.count({
        where: { usuarioId: analista.id, revogadaEm: null },
      });
      expect(abertas).toBe(0);
    });

    it('tira o bloqueio por tentativas', async () => {
      const analista = empresa.usuarios.ANALISTA;
      await prisma.usuario.update({
        where: { id: analista.id },
        data: {
          bloqueadoAte: new Date(Date.now() + 10 * 60_000),
          falhasDeLogin: 4,
        },
      });
      const token = await pedirETirarOToken();

      await redefinir(token);

      expect((await entrar(analista.email, NOVA_SENHA)).status).toBe(204);
    });

    it('invalida os outros links pendentes do mesmo usuário', async () => {
      const primeiro = await pedirETirarOToken();
      const segundo = await pedirETirarOToken();
      expect(primeiro).not.toBe(segundo);

      expect((await redefinir(segundo)).status).toBe(204);

      const r = await redefinir(primeiro, 'Quarta@Senha333');
      expect(r.status).toBe(422);
    });

    it('usuário desativado depois do pedido não consegue usar o link', async () => {
      const token = await pedirETirarOToken();
      await prisma.usuario.update({
        where: { id: empresa.usuarios.ANALISTA.id },
        data: { ativo: false },
      });

      const r = await redefinir(token);

      expect(r.status).toBe(422);
      // A transação voltou atrás: o link não foi "gasto" à toa
      const registro = await prisma.recuperacaoDeSenha.findUniqueOrThrow({
        where: { tokenHash: hashDoToken(token) },
      });
      expect(registro.usadoEm).toBeNull();
    });

    it('audita a troca e avisa o dono por e-mail', async () => {
      const token = await pedirETirarOToken();

      await redefinir(token);

      expect(
        await prisma.eventoAuditoria.count({
          where: { empresaId: empresa.id, acao: 'SENHA_RECUPERADA' },
        }),
      ).toBe(1);
      const aviso = await prisma.emailSaida.findFirstOrThrow({
        where: { empresaId: empresa.id, assunto: { contains: 'foi trocada' } },
      });
      expect(aviso.para).toEqual([empresa.usuarios.ANALISTA.email]);
      // O aviso nunca leva a senha nem o token
      expect(aviso.texto).not.toContain(NOVA_SENHA);
      expect(aviso.texto).not.toContain(token);
    });

    it('limita tentativas de redefinição do mesmo IP (429)', async () => {
      const limitada = criarApp({
        prisma,
        env: envDeTeste(),
        limiteDeLoginPorMinuto: 2,
      });
      const chamar = () =>
        request(limitada)
          .post('/api/auth/redefinir-senha')
          .set('Origin', FRONTEND)
          .send({ token: 'B'.repeat(43), novaSenha: NOVA_SENHA });

      expect((await chamar()).status).toBe(422);
      expect((await chamar()).status).toBe(422);
      expect((await chamar()).status).toBe(429);
    });
  });
});
