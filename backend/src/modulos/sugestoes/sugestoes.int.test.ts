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
import { LIMITE_POR_HORA, PREFIXO_DO_ASSUNTO } from './servico.js';

const ENV = envDeTeste();
const FRONTEND = ENV.FRONTEND_URL;
const DONO = 'dono@exemplo.test';

describe.skipIf(!temBanco)('caixa de sugestões (integração)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let desligada: Express;
  let empresa: EmpresaDeTeste;
  const cookies = new Map<string, string>();

  async function cookieDe(aplicacao: Express, chave: string) {
    if (!cookies.has(chave)) {
      const resposta = await request(aplicacao)
        .post('/api/auth/login')
        .set('Origin', FRONTEND)
        .send({
          empresa: empresa.slug,
          email: empresa.usuarios.SUPERVISOR.email,
          senha: SENHA,
        });
      cookies.set(chave, `sigof_acesso=${cookiesDa(resposta).sigof_acesso}`);
    }
    return cookies.get(chave) ?? '';
  }

  const enviar = async (corpo: object, aplicacao = app) =>
    request(aplicacao)
      .post('/api/sugestoes')
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe(aplicacao, aplicacao === app ? 'a' : 'b'))
      .send(corpo);

  const VALIDA = {
    categoria: 'SUGESTAO',
    titulo: 'Filtro por filial nos indicadores',
    texto: 'Seria bom filtrar o painel inteiro por uma filial só.',
    pagina: '/indicadores',
  };

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({
      prisma,
      env: { ...ENV, SUGESTOES_EMAIL: DONO },
      limiteDeLoginPorMinuto: 1000,
    });
    desligada = criarApp({ prisma, env: ENV, limiteDeLoginPorMinuto: 1000 });
    empresa = await criarEmpresaDeTeste(prisma);
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await prisma.$disconnect();
  });

  it('o /api/sistema avisa se a caixa de sugestões está ligada', async () => {
    expect((await request(app).get('/api/sistema')).body.sugestoes).toBe(true);
    expect((await request(desligada).get('/api/sistema')).body.sugestoes).toBe(
      false,
    );
  });

  it('exige login', async () => {
    const r = await request(app)
      .post('/api/sugestoes')
      .set('Origin', FRONTEND)
      .send(VALIDA);
    expect(r.status).toBe(401);
  });

  it('recusa quando a empresa ainda não configurou o envio de e-mail', async () => {
    const r = await enviar(VALIDA);
    expect(r.status).toBe(422);
    expect(r.body.erro).toContain('ainda não está configurado');
    const naFila = await prisma.emailSaida.count({
      where: { empresaId: empresa.id },
    });
    expect(naFila).toBe(0);
  });

  describe('com o e-mail da empresa configurado', () => {
    beforeAll(async () => {
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

    it('coloca na fila um e-mail para o dono, com assunto filtrável', async () => {
      const r = await enviar(VALIDA);
      expect(r.status).toBe(202);

      const email = await prisma.emailSaida.findFirstOrThrow({
        where: { empresaId: empresa.id },
      });
      expect(email.para).toEqual([DONO]);
      expect(email.assunto).toBe(
        `${PREFIXO_DO_ASSUNTO} Sugestão: Filtro por filial nos indicadores`,
      );
      expect(email.texto).toContain(
        `De: SUPERVISOR <${empresa.usuarios.SUPERVISOR.email}> (SUPERVISOR)`,
      );
      expect(email.texto).toContain('Tela: /indicadores');
      expect(email.texto).toContain('filtrar o painel inteiro');
      expect(email.situacao).toBe('PENDENTE');
      expect(email.solicitacaoId).toBeNull();
    });

    it('o título vira uma linha só (nada de quebra de linha no assunto)', async () => {
      const r = await enviar({
        ...VALIDA,
        categoria: 'PROBLEMA',
        titulo: 'Erro\r\nBcc: alguem@exemplo.test',
      });
      expect(r.status).toBe(202);
      const email = await prisma.emailSaida.findFirstOrThrow({
        where: { empresaId: empresa.id, assunto: { contains: 'Problema' } },
      });
      expect(email.assunto).toBe(
        `${PREFIXO_DO_ASSUNTO} Problema: Erro Bcc: alguem@exemplo.test`,
      );
    });

    it('recusa categoria inválida, título curto, texto vazio e campo extra', async () => {
      for (const ruim of [
        { ...VALIDA, categoria: 'ELOGIO' },
        { ...VALIDA, titulo: 'ab' },
        { ...VALIDA, texto: '   ' },
        { ...VALIDA, extra: 'campo desconhecido' },
      ]) {
        expect((await enviar(ruim)).status).toBe(400);
      }
    });

    it('limita quantas sugestões a empresa manda por hora', async () => {
      const ja = await prisma.emailSaida.count({
        where: { empresaId: empresa.id },
      });
      await prisma.emailSaida.createMany({
        data: Array.from({ length: LIMITE_POR_HORA - ja }, (_, i) => ({
          empresaId: empresa.id,
          para: [DONO],
          assunto: `${PREFIXO_DO_ASSUNTO} Sugestão: ${i}`,
          texto: 'x',
          html: 'x',
          messageId: `<limite.${empresa.id}.${i}@exemplo.test>`,
        })),
      });
      const r = await enviar(VALIDA);
      expect(r.status).toBe(429);
    });
  });

  it('com a caixa desligada no ambiente, recusa', async () => {
    const r = await enviar(VALIDA, desligada);
    expect(r.status).toBe(422);
    expect(r.body.erro).toContain('não está ligada');
  });
});
