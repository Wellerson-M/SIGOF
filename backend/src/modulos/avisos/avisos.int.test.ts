import type { Perfil, PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../http/app.js';
import { ArmazenamentoEmMemoria } from '../anexos/armazenamento.js';
import { Cifra } from '../../seguranca/cifra.js';
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
import {
  Carteiro,
  MAXIMO_DE_TENTATIVAS,
  type ContaDeEnvio,
  type Mensagem,
  type Remetente,
} from './carteiro.js';

const ENV = envDeTeste();
const FRONTEND = ENV.FRONTEND_URL;

/** Dublê do SMTP: anota cada envio; `falhar` simula o provedor fora do ar. */
function remetenteDeTeste() {
  const enviados: { conta: ContaDeEnvio; mensagem: Mensagem }[] = [];
  let falha: string | null = null;
  const enviar: Remetente = async (conta, mensagem) => {
    if (falha) throw new Error(falha);
    enviados.push({ conta, mensagem });
  };
  return {
    enviar,
    enviados,
    falhar: (mensagem: string | null) => {
      falha = mensagem;
    },
  };
}

describe.skipIf(!temBanco)('avisos: e-mail e notificações (integração)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;
  const smtp = remetenteDeTeste();
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({
      prisma,
      env: ENV,
      limiteDeLoginPorMinuto: 1000,
      remetenteDeEmail: smtp.enviar,
      // Cada movimentação vira um e-mail na hora; o agrupamento tem
      // testes próprios no fim do arquivo
      segundosParaAgruparEmails: 0,
    });
    empresa = await criarEmpresaDeTeste(prisma);
    outra = await criarEmpresaDeTeste(prisma);
  });

  afterAll(async () => {
    await prisma.emailSaida.deleteMany({
      where: { empresaId: { in: [empresa.id, outra.id] } },
    });
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, outra.id);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    smtp.enviados.length = 0;
    smtp.falhar(null);
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
    const comCorpo =
      (metodo: 'post' | 'patch') =>
      (url: string, corpo: object = {}) => {
        const pedido =
          metodo === 'post' ? request(app).post(url) : request(app).patch(url);
        return pedido.set('Origin', FRONTEND).set('Cookie', cookie).send(corpo);
      };
    return {
      cookie,
      get: (url: string) => request(app).get(url).set('Cookie', cookie),
      post: comCorpo('post'),
      patch: comCorpo('patch'),
    };
  }

  const GMAIL = {
    servidor: 'smtp.gmail.com',
    porta: 465,
    tlsDireto: true,
    usuario: 'Envio@Demo.test',
    senha: 'abcd efgh ijkl mnop',
    nomeDoRemetente: 'SIGOF Demo',
    caixasCentrais: ['Ocorrencias@Demo.test', 'gerente@demo.test'],
  };

  async function ligarEmail(de: EmpresaDeTeste = empresa) {
    const admin = await como('ADMIN', de);
    const resposta = await admin.patch('/api/admin/email', {
      ...GMAIL,
      ativo: true,
    });
    expect(resposta.status).toBe(200);
  }

  let documento = 90_000;
  async function abrir(perfil: Perfil = 'SOLICITANTE') {
    documento += 1;
    const resposta = await (
      await como(perfil)
    ).post('/api/solicitacoes', {
      tipo: 'REVERSAO',
      cte: String(documento),
      descricao: 'Mercadoria recusada, emitir reversão.',
    });
    expect(resposta.status).toBe(201);
    return resposta.body as { id: string; protocolo: string };
  }

  const emailsDa = (solicitacaoId: string) =>
    prisma.emailSaida.findMany({
      where: { solicitacaoId },
      orderBy: { criadoEm: 'asc' },
    });

  describe('configuração pela tela do administrador', () => {
    it('só o administrador acessa', async () => {
      for (const perfil of ['SOLICITANTE', 'ANALISTA', 'SUPERVISOR'] as const) {
        expect(
          (await (await como(perfil)).get('/api/admin/email')).status,
        ).toBe(403);
      }
    });

    it('não liga o envio sem servidor, e-mail e senha', async () => {
      const admin = await como('ADMIN', outra);
      const resposta = await admin.patch('/api/admin/email', {
        ativo: true,
        servidor: 'smtp.gmail.com',
      });
      expect(resposta.status).toBe(422);
    });

    it('guarda a senha cifrada e nunca a devolve', async () => {
      await ligarEmail();
      const admin = await como('ADMIN');
      const config = (await admin.get('/api/admin/email')).body;
      expect(config).toEqual({
        ativo: true,
        servidor: 'smtp.gmail.com',
        porta: 465,
        tlsDireto: true,
        usuario: 'envio@demo.test',
        temSenha: true,
        nomeDoRemetente: 'SIGOF Demo',
        caixasCentrais: ['ocorrencias@demo.test', 'gerente@demo.test'],
        eventos: ['ABERTA', 'STATUS', 'MENSAGEM', 'ANEXO'],
      });
      expect(JSON.stringify(config)).not.toContain('abcd');

      const registro = await prisma.empresa.findUniqueOrThrow({
        where: { id: empresa.id },
      });
      expect(registro.smtpSenhaCifrada).not.toContain('abcd');
      expect(
        new Cifra(ENV.CHAVE_CIFRA).decifrar(registro.smtpSenhaCifrada ?? ''),
      ).toBe('abcd efgh ijkl mnop');

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { empresaId: empresa.id, acao: 'EMAIL_CONFIGURADO' },
      });
      expect(evento?.detalhes).toMatchObject({ senha: 'alterada' });
      expect(JSON.stringify(evento?.detalhes)).not.toContain('abcd');
    });

    it('salvar sem a senha mantém a guardada', async () => {
      await ligarEmail();
      const admin = await como('ADMIN');
      const antes = await prisma.empresa.findUniqueOrThrow({
        where: { id: empresa.id },
      });
      await admin.patch('/api/admin/email', {
        nomeDoRemetente: 'Outro nome',
        senha: '',
      });
      const depois = await prisma.empresa.findUniqueOrThrow({
        where: { id: empresa.id },
      });
      expect(depois.smtpSenhaCifrada).toBe(antes.smtpSenhaCifrada);
      expect(depois.emailRemetenteNome).toBe('Outro nome');
    });

    it('o teste envia na hora e registra; a falha volta com o motivo', async () => {
      await ligarEmail();
      const admin = await como('ADMIN');

      const ok = await admin.post('/api/admin/email/teste', {});
      expect(ok.status).toBe(200);
      expect(ok.body.enviadoPara).toBe(empresa.usuarios.ADMIN.email);
      expect(smtp.enviados[0]?.conta).toMatchObject({
        servidor: 'smtp.gmail.com',
        usuario: 'envio@demo.test',
        senha: 'abcd efgh ijkl mnop',
      });

      smtp.falhar('Invalid login: 535 Username and Password not accepted');
      const falha = await admin.post('/api/admin/email/teste', {
        para: 'x@demo.test',
      });
      expect(falha.status).toBe(422);
      expect(falha.body.erro).toContain('Username and Password not accepted');

      const envios = (await admin.get('/api/admin/email/envios')).body;
      expect(
        envios.envios.slice(0, 2).map((e: { situacao: string }) => e.situacao),
      ).toEqual(['FALHOU', 'ENVIADO']);
    });

    it('não testa sem configuração salva', async () => {
      const admin = await como('ADMIN', outra);
      expect((await admin.post('/api/admin/email/teste', {})).status).toBe(422);
    });
  });

  describe('e-mail de cada movimentação', () => {
    beforeAll(async () => {
      await ligarEmail();
    });

    it('a abertura vai para a caixa central e abre a conversa do protocolo', async () => {
      const { id, protocolo } = await abrir();
      const [primeiro] = await emailsDa(id);

      // Quem abriu não recebe aviso do que ele mesmo fez
      expect(primeiro?.para).toEqual([
        'ocorrencias@demo.test',
        'gerente@demo.test',
      ]);
      expect(primeiro?.assunto).toContain(`[SIGOF ${protocolo}]`);
      expect(primeiro?.messageId).toBe(`<sigof.${id}@localhost>`);
      expect(primeiro?.respondendoA).toBeNull();
      expect(primeiro?.texto).toContain('Não responda');
    });

    it('as movimentações seguintes respondem ao primeiro e-mail', async () => {
      const { id } = await abrir();
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      await analista.patch(`/api/solicitacoes/${id}/prioridade`, {
        prioridade: 'URGENTE',
      });
      await analista.post(`/api/solicitacoes/${id}/mensagens`, {
        conteudo: 'Já estou vendo.',
      });

      // Prioridade fica só no sino: por padrão não gera e-mail
      const emails = await emailsDa(id);
      expect(emails).toHaveLength(3);
      const raiz = emails[0]?.messageId;
      for (const email of emails.slice(1)) {
        expect(email.respondendoA).toBe(raiz);
        expect(email.assunto).toBe(emails[0]?.assunto);
        // Analista fez: vai para o solicitante e a caixa central, não para ele
        expect(email.para).toEqual(
          expect.arrayContaining([
            'ocorrencias@demo.test',
            'gerente@demo.test',
            empresa.usuarios.SOLICITANTE.email,
          ]),
        );
        expect(email.para).not.toContain(empresa.usuarios.ANALISTA.email);
      }
    });

    it('nota interna não sai por e-mail', async () => {
      const { id } = await abrir();
      await (
        await como('ANALISTA')
      ).post(`/api/solicitacoes/${id}/mensagens`, {
        conteudo: 'Cliente difícil.',
        interna: true,
      });
      expect(await emailsDa(id)).toHaveLength(1);
    });

    it('com o envio desligado, nada entra na fila', async () => {
      const admin = await como('ADMIN');
      await admin.patch('/api/admin/email', { ativo: false });
      const { id } = await abrir();
      expect(await emailsDa(id)).toHaveLength(0);
      await admin.patch('/api/admin/email', { ativo: true });
    });

    it('o detalhe mostra os envios para a equipe e não para o solicitante', async () => {
      const { id } = await abrir();
      const daEquipe = (
        await (await como('ANALISTA')).get(`/api/solicitacoes/${id}`)
      ).body;
      const doSolicitante = (
        await (await como('SOLICITANTE')).get(`/api/solicitacoes/${id}`)
      ).body;
      expect(daEquipe.emails).toHaveLength(1);
      expect(daEquipe.emails[0].situacao).toBe('PENDENTE');
      expect(doSolicitante.emails).toEqual([]);
    });
  });

  describe('carteiro (fila de envio)', () => {
    beforeAll(async () => {
      await ligarEmail();
    });

    it('envia o que está na fila com os cabeçalhos da conversa', async () => {
      const { id } = await abrir();
      await (
        await como('ANALISTA')
      ).post(`/api/solicitacoes/${id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      const carteiro = new Carteiro(
        prisma,
        new Cifra(ENV.CHAVE_CIFRA),
        smtp.enviar,
      );

      // Rodadas até esvaziar a fila (outros testes também enfileiram)
      while ((await carteiro.rodada()) > 0);

      const emails = await emailsDa(id);
      expect(emails.every((e) => e.situacao === 'ENVIADO' && e.enviadoEm)).toBe(
        true,
      );
      const daSolicitacao = smtp.enviados.filter((e) =>
        e.mensagem.messageId.includes(id),
      );
      expect(daSolicitacao).toHaveLength(2);
      expect(daSolicitacao[1]?.mensagem.respondendoA).toBe(
        daSolicitacao[0]?.mensagem.messageId,
      );
    });

    it('provedor fora do ar: tenta de novo mais tarde e, no limite, marca como falho', async () => {
      const { id } = await abrir();
      let relogio = new Date();
      const carteiro = new Carteiro(
        prisma,
        new Cifra(ENV.CHAVE_CIFRA),
        smtp.enviar,
        () => relogio,
      );
      smtp.falhar('connect ETIMEDOUT');

      await carteiro.rodada();
      let [email] = await emailsDa(id);
      expect(email).toMatchObject({ situacao: 'PENDENTE', tentativas: 1 });
      expect(email?.ultimoErro).toContain('ETIMEDOUT');
      expect(email!.tentarEm.getTime()).toBeGreaterThan(relogio.getTime());

      // Ainda dentro da espera: não tenta
      await carteiro.rodada();
      [email] = await emailsDa(id);
      expect(email?.tentativas).toBe(1);

      for (let i = 1; i < MAXIMO_DE_TENTATIVAS; i++) {
        relogio = new Date(relogio.getTime() + 2 * 60 * 60_000);
        await carteiro.rodada();
      }
      [email] = await emailsDa(id);
      expect(email).toMatchObject({
        situacao: 'FALHOU',
        tentativas: MAXIMO_DE_TENTATIVAS,
      });
    });

    it('duas rodadas ao mesmo tempo não enviam o mesmo e-mail duas vezes', async () => {
      const { id } = await abrir();
      const cifra = new Cifra(ENV.CHAVE_CIFRA);
      await Promise.all([
        new Carteiro(prisma, cifra, smtp.enviar).rodada(),
        new Carteiro(prisma, cifra, smtp.enviar).rodada(),
      ]);
      const vezes = smtp.enviados.filter((e) =>
        e.mensagem.messageId.includes(id),
      ).length;
      expect(vezes).toBe(1);
    });

    it('empresa que desligou o envio: o e-mail pendente não sai', async () => {
      const { id } = await abrir();
      const admin = await como('ADMIN');
      await admin.patch('/api/admin/email', { ativo: false });
      await new Carteiro(
        prisma,
        new Cifra(ENV.CHAVE_CIFRA),
        smtp.enviar,
      ).rodada();
      const [email] = await emailsDa(id);
      expect(email?.situacao).toBe('PENDENTE');
      expect(email?.ultimoErro).toContain('desligado');
      await admin.patch('/api/admin/email', { ativo: true });
    });
  });

  describe('notificações', () => {
    it('solicitação nova avisa a equipe, não quem abriu', async () => {
      const { protocolo } = await abrir();
      const analista = (await (await como('ANALISTA')).get('/api/notificacoes'))
        .body;
      const solicitante = (
        await (await como('SOLICITANTE')).get('/api/notificacoes')
      ).body;
      expect(
        analista.itens.map((n: { mensagem: string }) => n.mensagem),
      ).toContain(`${protocolo}: nova solicitação aberta por SOLICITANTE`);
      expect(
        solicitante.itens.some((n: { mensagem: string }) =>
          n.mensagem.startsWith(protocolo),
        ),
      ).toBe(false);
    });

    it('mudança de status avisa o solicitante; escalar avisa os supervisores', async () => {
      const { id, protocolo } = await abrir();
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'ESCALADO',
        observacao: 'Precisa de aprovação',
      });

      const doSolicitante = await prisma.notificacao.findMany({
        where: {
          solicitacaoId: id,
          usuarioId: empresa.usuarios.SOLICITANTE.id,
        },
      });
      expect(doSolicitante.map((n) => n.mensagem)).toEqual(
        expect.arrayContaining([
          `${protocolo}: Novo → Em andamento (ANALISTA)`,
          `${protocolo}: Em andamento → Escalado (ANALISTA)`,
        ]),
      );
      const doSupervisor = await prisma.notificacao.findMany({
        where: { solicitacaoId: id, usuarioId: empresa.usuarios.SUPERVISOR.id },
      });
      expect(doSupervisor.map((n) => n.mensagem)).toContain(
        `${protocolo}: Em andamento → Escalado (ANALISTA)`,
      );
    });

    it('nota interna não avisa o solicitante', async () => {
      const { id } = await abrir();
      const analista = await como('ANALISTA');
      await analista.post(`/api/solicitacoes/${id}/status`, {
        status: 'EM_ANDAMENTO',
      });
      const antes = await prisma.notificacao.count({
        where: {
          solicitacaoId: id,
          usuarioId: empresa.usuarios.SOLICITANTE.id,
        },
      });
      await (
        await como('SUPERVISOR')
      ).post(`/api/solicitacoes/${id}/mensagens`, {
        conteudo: 'Interna',
        interna: true,
      });
      const depois = await prisma.notificacao.count({
        where: {
          solicitacaoId: id,
          usuarioId: empresa.usuarios.SOLICITANTE.id,
        },
      });
      expect(depois).toBe(antes);
      expect(
        await prisma.notificacao.count({
          where: {
            solicitacaoId: id,
            usuarioId: empresa.usuarios.ANALISTA.id,
            mensagem: { contains: 'nota interna' },
          },
        }),
      ).toBe(1);
    });

    it('marca como lidas por solicitação, por id e todas, só as próprias', async () => {
      const { id } = await abrir();
      const outroId = (await abrir()).id;
      const analista = await como('ANALISTA');
      const supervisor = await como('SUPERVISOR');
      const antesDoSupervisor = (await supervisor.get('/api/notificacoes')).body
        .naoLidas;

      const porSolicitacao = await analista.post('/api/notificacoes/lidas', {
        solicitacaoId: id,
      });
      expect(porSolicitacao.status).toBe(200);
      const lista = (await analista.get('/api/notificacoes')).body;
      const daSolicitacao = lista.itens.filter(
        (n: { solicitacaoId: string }) => n.solicitacaoId === id,
      );
      expect(daSolicitacao.every((n: { lida: boolean }) => n.lida)).toBe(true);

      const outra = lista.itens.find(
        (n: { solicitacaoId: string }) => n.solicitacaoId === outroId,
      );
      await analista.post('/api/notificacoes/lidas', { ids: [outra.id] });
      const todas = await analista.post('/api/notificacoes/lidas', {});
      expect(todas.body.naoLidas).toBe(0);

      // As do supervisor continuam como estavam
      expect((await supervisor.get('/api/notificacoes')).body.naoLidas).toBe(
        antesDoSupervisor,
      );
    });

    it('não enxerga notificações de outra empresa', async () => {
      const daOutra = (
        await (await como('ANALISTA', outra)).get('/api/notificacoes')
      ).body;
      expect(daOutra).toEqual({ naoLidas: 0, itens: [] });
    });

    it('exige login', async () => {
      expect((await request(app).get('/api/notificacoes')).status).toBe(401);
    });
  });

  describe('e-mails agrupados (janela de 60 s)', () => {
    let agrupador: Express;
    const PDF = Buffer.from('%PDF-1.7 1 0 obj << >> endobj %%EOF agrupar');

    beforeAll(async () => {
      agrupador = criarApp({
        prisma,
        env: ENV,
        limiteDeLoginPorMinuto: 1000,
        remetenteDeEmail: smtp.enviar,
        armazenamento: new ArmazenamentoEmMemoria(),
      });
      await ligarEmail();
    });

    async function comCookie(perfil: Perfil) {
      return (await como(perfil)).cookie;
    }

    it('abrir e anexar dois arquivos vira um e-mail só, com o link de cada arquivo', async () => {
      const cookie = await comCookie('SOLICITANTE');
      const aberta = await request(agrupador)
        .post('/api/solicitacoes')
        .set('Origin', ENV.FRONTEND_URL)
        .set('Cookie', cookie)
        .send({
          tipo: 'REVERSAO',
          cte: '99001',
          descricao: 'Mercadoria recusada, emitir reversão.',
        });
      for (const nome of ['cte.pdf', 'nf.pdf']) {
        const anexo = await request(agrupador)
          .post(`/api/solicitacoes/${aberta.body.id}/anexos`)
          .set('Origin', ENV.FRONTEND_URL)
          .set('Cookie', cookie)
          .field('etapa', 'ABERTURA')
          .attach('arquivo', Buffer.concat([PDF, Buffer.from(nome)]), nome);
        expect(anexo.status).toBe(201);
      }

      const emails = await emailsDa(aberta.body.id);
      expect(emails).toHaveLength(1);
      const [email] = emails;
      expect(email!.messageId).toBe(`<sigof.${aberta.body.id}@localhost>`);
      expect(email!.tentarEm.getTime()).toBeGreaterThan(Date.now() + 30_000);
      expect(email!.texto).toContain('Solicitação aberta por');
      expect(email!.texto).toContain('anexou 2 arquivos');
      expect(email!.html).toMatch(
        new RegExp(`/anexos/${aberta.body.id}/[0-9a-f-]{36}`),
      );
    });

    it('depois que o e-mail saiu para envio, o próximo acontecimento vira outro e-mail', async () => {
      const cookie = await comCookie('SOLICITANTE');
      const aberta = await request(agrupador)
        .post('/api/solicitacoes')
        .set('Origin', ENV.FRONTEND_URL)
        .set('Cookie', cookie)
        .send({
          tipo: 'REVERSAO',
          cte: '99002',
          descricao: 'Mercadoria recusada, emitir reversão.',
        });
      // O carteiro reservou o e-mail: a janela fecha
      await prisma.emailSaida.updateMany({
        where: { solicitacaoId: aberta.body.id },
        data: { agruparAte: null },
      });
      await request(agrupador)
        .post(`/api/solicitacoes/${aberta.body.id}/mensagens`)
        .set('Origin', ENV.FRONTEND_URL)
        .set('Cookie', cookie)
        .send({ conteudo: 'Segue mais uma informação.' });

      const emails = await emailsDa(aberta.body.id);
      expect(emails).toHaveLength(2);
      expect(emails[1]!.respondendoA).toBe(emails[0]!.messageId);
    });

    it('a empresa escolhe quais acontecimentos geram e-mail', async () => {
      const admin = await como('ADMIN');
      await admin.patch('/api/admin/email', { eventos: ['ABERTA'] });
      const config = (await admin.get('/api/admin/email')).body;
      expect(config.eventos).toEqual(['ABERTA']);

      const { id } = await abrir();
      await (
        await como('ANALISTA')
      ).post(`/api/solicitacoes/${id}/mensagens`, { conteudo: 'Vendo.' });
      expect(await emailsDa(id)).toHaveLength(1);

      await admin.patch('/api/admin/email', {
        eventos: ['ABERTA', 'STATUS', 'MENSAGEM', 'ANEXO'],
      });
    });
  });
});
