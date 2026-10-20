import { randomInt, randomUUID } from 'node:crypto';
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
import { cnpjValido, criarAdministradorDaPlataforma } from './servico.js';

const FRONTEND = envDeTeste().FRONTEND_URL;

/** Um CNPJ válido qualquer (dígitos verificadores calculados). */
function cnpjDeTeste(): string {
  for (;;) {
    const base = Array.from({ length: 12 }, () => randomInt(10)).join('');
    for (let dv = 0; dv < 100; dv++) {
      const candidato = base + String(dv).padStart(2, '0');
      if (cnpjValido(candidato)) return candidato;
    }
  }
}

describe('CNPJ', () => {
  it('confere os dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe('11222333000181');
    expect(cnpjValido('11.222.333/0001-82')).toBeNull();
    expect(cnpjValido('11111111111111')).toBeNull();
    expect(cnpjValido('123')).toBeNull();
  });
});

describe.skipIf(!temBanco)('plataforma (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  const emailDoAdmin = `plataforma-${randomUUID()}@sigof.test`;
  let senhaDoAdmin: string;
  let cookie = '';
  const criadas: string[] = [];

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({ prisma, env: envDeTeste(), limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
    senhaDoAdmin = await criarAdministradorDaPlataforma(prisma, {
      nome: 'Dono do SIGOF',
      email: emailDoAdmin,
    });
  });

  afterAll(async () => {
    for (const id of criadas) await apagarEmpresaDeTeste(prisma, id);
    await apagarEmpresaDeTeste(prisma, empresa.id);
    const admin = await prisma.administradorDaPlataforma.findUnique({
      where: { email: emailDoAdmin },
    });
    if (admin) {
      // A trilha não aceita UPDATE, mas apagar o que o teste criou pode
      await prisma.eventoDaPlataforma.deleteMany({
        where: { administradorId: admin.id },
      });
      await prisma.administradorDaPlataforma.delete({
        where: { id: admin.id },
      });
    }
    await prisma.$disconnect();
  });

  const enviar = (metodo: 'post' | 'patch', url: string, corpo: object) => {
    const agente = request(app);
    return agente[metodo](url)
      .set('Origin', FRONTEND)
      .set('Cookie', cookie)
      .send(corpo);
  };

  it('senha errada é recusada; a certa abre a sessão num cookie próprio', async () => {
    const errada = await request(app)
      .post('/api/plataforma/entrar')
      .set('Origin', FRONTEND)
      .send({ email: emailDoAdmin, senha: 'errada123' });
    expect(errada.status).toBe(401);

    const certa = await request(app)
      .post('/api/plataforma/entrar')
      .set('Origin', FRONTEND)
      .send({ email: emailDoAdmin, senha: senhaDoAdmin });
    expect(certa.status).toBe(204);
    const setCookie = (
      certa.headers['set-cookie'] as unknown as string[]
    ).join();
    expect(setCookie).toMatch(/sigof_plataforma=.+Path=\/api\/plataforma/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    cookie = `sigof_plataforma=${cookiesDa(certa).sigof_plataforma}`;

    const eu = await request(app)
      .get('/api/plataforma/eu')
      .set('Cookie', cookie);
    expect(eu.body).toMatchObject({ email: emailDoAdmin, trocarSenha: true });
  });

  it('as sessões não se misturam: empresa não entra na plataforma e vice-versa', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', FRONTEND)
      .send({
        empresa: empresa.slug,
        email: empresa.usuarios.ADMIN.email,
        senha: SENHA,
      });
    const daEmpresa = `sigof_acesso=${cookiesDa(login).sigof_acesso}`;

    expect(
      (
        await request(app)
          .get('/api/plataforma/empresas')
          .set('Cookie', daEmpresa)
      ).status,
    ).toBe(401);
    // O token da plataforma no cookie da empresa também não serve
    const token = cookie.split('=')[1];
    expect(
      (
        await request(app)
          .get('/api/admin/usuarios')
          .set('Cookie', `sigof_acesso=${token}`)
      ).status,
    ).toBe(401);
  });

  it('cria a transportadora pronta para usar, com o primeiro administrador', async () => {
    const slug = `nova-${randomUUID().slice(0, 8)}`;
    const resposta = await enviar('post', '/api/plataforma/empresas', {
      razaoSocial: 'Transportadora Nova Ltda.',
      cnpj: cnpjDeTeste(),
      slug,
      administrador: { nome: 'TI da Nova', email: 'ti@nova.test' },
    });
    expect(resposta.status).toBe(201);
    criadas.push(resposta.body.empresa.id);
    expect(resposta.body.empresa).toMatchObject({
      slug,
      ativa: true,
      usuariosAtivos: 1,
      solicitacoesEmAberto: 0,
    });
    expect(resposta.body.senhaProvisoria).toHaveLength(12);

    // O administrador da empresa entra com a provisória
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', FRONTEND)
      .send({
        empresa: slug,
        email: 'ti@nova.test',
        senha: resposta.body.senhaProvisoria,
      });
    expect(login.status).toBe(204);
    expect(
      await prisma.causaDeErro.count({
        where: { empresaId: resposta.body.empresa.id },
      }),
    ).toBe(5);

    const repetida = await enviar('post', '/api/plataforma/empresas', {
      razaoSocial: 'Outra',
      cnpj: cnpjDeTeste(),
      slug,
      administrador: { nome: 'Xavier', email: 'x@x.test' },
    });
    expect(repetida.status).toBe(409);

    const cnpjRuim = await enviar('post', '/api/plataforma/empresas', {
      razaoSocial: 'Outra',
      cnpj: '11.222.333/0001-82',
      slug: `outra-${randomUUID().slice(0, 8)}`,
      administrador: { nome: 'Xavier', email: 'x@x.test' },
    });
    expect(cnpjRuim.status).toBe(422);
  });

  it('lista as transportadoras com os números, sem conteúdo das solicitações', async () => {
    const lista = await request(app)
      .get('/api/plataforma/empresas')
      .set('Cookie', cookie);
    const daTeste = lista.body.find((e: { id: string }) => e.id === empresa.id);
    expect(Object.keys(daTeste).sort()).toEqual(
      [
        'ativa',
        'cnpj',
        'criadoEm',
        'id',
        'modulosLiberados',
        'razaoSocial',
        'slug',
        'solicitacoesEmAberto',
        'solicitacoesNoMes',
        'ultimoAcessoEm',
        'usuariosAtivos',
      ].sort(),
    );
  });

  it('desativar a empresa derruba as sessões e barra o login', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', FRONTEND)
      .send({
        empresa: empresa.slug,
        email: empresa.usuarios.SUPERVISOR.email,
        senha: SENHA,
      });
    expect(login.status).toBe(204);

    const desativada = await enviar(
      'patch',
      `/api/plataforma/empresas/${empresa.id}`,
      { ativa: false },
    );
    expect(desativada.body.ativa).toBe(false);
    expect(
      await prisma.sessao.count({
        where: { empresaId: empresa.id, revogadaEm: null },
      }),
    ).toBe(0);
    const depois = await request(app)
      .post('/api/auth/login')
      .set('Origin', FRONTEND)
      .send({
        empresa: empresa.slug,
        email: empresa.usuarios.SUPERVISOR.email,
        senha: SENHA,
      });
    expect(depois.status).toBe(401);

    await enviar('patch', `/api/plataforma/empresas/${empresa.id}`, {
      ativa: true,
    });
  });

  it('libera e bloqueia módulos; a empresa só usa o que está liberado', async () => {
    const bloqueado = await enviar(
      'patch',
      `/api/plataforma/empresas/${empresa.id}`,
      { modulosLiberados: ['EMAIL', 'FILIAIS', 'EMAIL'] },
    );
    expect(bloqueado.status).toBe(200);
    expect(bloqueado.body.modulosLiberados).toEqual(['FILIAIS', 'EMAIL']);
    const registrada = await prisma.empresa.findUniqueOrThrow({
      where: { id: empresa.id },
    });
    // O que a empresa tinha ligado fica guardado; só deixa de valer
    expect(registrada.modulosAtivos).toContain('BALANCO');

    expect(
      (
        await enviar('patch', `/api/plataforma/empresas/${empresa.id}`, {
          modulosLiberados: ['INVENTADO'],
        })
      ).status,
    ).toBe(400);

    await enviar('patch', `/api/plataforma/empresas/${empresa.id}`, {
      modulosLiberados: registrada.modulosAtivos,
    });
  });

  it('cria mais um administrador na empresa e registra tudo na trilha', async () => {
    const novo = await enviar(
      'post',
      `/api/plataforma/empresas/${empresa.id}/administradores`,
      { nome: 'Novo TI', email: 'novo-ti@demo.test' },
    );
    expect(novo.status).toBe(201);
    expect(novo.body.senhaProvisoria).toHaveLength(12);

    const trilha = await request(app)
      .get('/api/plataforma/eventos')
      .set('Cookie', cookie);
    const acoes = (trilha.body.eventos as { acao: string }[]).map(
      (e) => e.acao,
    );
    expect(acoes).toEqual(
      expect.arrayContaining([
        'ENTROU',
        'ENTRADA_RECUSADA',
        'EMPRESA_CRIADA',
        'EMPRESA_ALTERADA',
        'ADMIN_DA_EMPRESA_CRIADO',
      ]),
    );

    const evento = await prisma.eventoDaPlataforma.findFirstOrThrow();
    await expect(
      prisma.eventoDaPlataforma.update({
        where: { id: evento.id },
        data: { ip: '0.0.0.0' },
      }),
    ).rejects.toThrow(/não podem ser alterados/);
  });

  it('troca a senha provisória; depois, sair limpa o cookie', async () => {
    const troca = await enviar('post', '/api/plataforma/senha', {
      senhaAtual: senhaDoAdmin,
      novaSenha: 'Plataforma2026',
    });
    expect(troca.status).toBe(204);
    const eu = await request(app)
      .get('/api/plataforma/eu')
      .set('Cookie', cookie);
    expect(eu.body.trocarSenha).toBe(false);

    const saida = await request(app)
      .post('/api/plataforma/sair')
      .set('Origin', FRONTEND)
      .set('Cookie', cookie);
    expect(cookiesDa(saida).sigof_plataforma).toBe('');
  });
});
