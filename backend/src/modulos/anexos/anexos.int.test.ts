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
import { ArmazenamentoEmMemoria } from './armazenamento.js';
import { ANEXOS_POR_SOLICITACAO, TAMANHO_MAXIMO_BYTES } from './servico.js';

const ENV = envDeTeste();
const FRONTEND = ENV.FRONTEND_URL;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');
const XML = Buffer.from('<?xml version="1.0"?><nfeProc><NFe/></nfeProc>');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

describe.skipIf(!temBanco)('anexos (integração, banco real)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let empresa: EmpresaDeTeste;
  let outra: EmpresaDeTeste;
  const armazenamento = new ArmazenamentoEmMemoria();
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    prisma = conectar();
    app = criarApp({
      prisma,
      env: ENV,
      limiteDeLoginPorMinuto: 1000,
      armazenamento,
    });
    empresa = await criarEmpresaDeTeste(prisma);
    outra = await criarEmpresaDeTeste(prisma);
  });

  afterAll(async () => {
    await apagarEmpresaDeTeste(prisma, empresa.id);
    await apagarEmpresaDeTeste(prisma, outra.id);
    await prisma.$disconnect();
  });

  async function cookieDe(perfil: Perfil, de: EmpresaDeTeste = empresa) {
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
    return cookies.get(chave) ?? '';
  }

  async function enviar(
    perfil: Perfil,
    solicitacaoId: string,
    conteudo: Buffer,
    nome: string,
    de: EmpresaDeTeste = empresa,
  ) {
    return request(app)
      .post(`/api/solicitacoes/${solicitacaoId}/anexos`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe(perfil, de))
      .attach('arquivo', conteudo, nome);
  }

  async function baixar(
    perfil: Perfil,
    solicitacaoId: string,
    anexoId: string,
    de = empresa,
  ) {
    return request(app)
      .get(`/api/solicitacoes/${solicitacaoId}/anexos/${anexoId}`)
      .set('Cookie', await cookieDe(perfil, de))
      .buffer(true)
      .parse((res, pronto) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => pronto(null, Buffer.concat(partes)));
      });
  }

  let documento = 50_000;
  async function abrir(perfil: Perfil = 'SOLICITANTE') {
    documento += 1;
    const resposta = await request(app)
      .post('/api/solicitacoes')
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe(perfil))
      .send({
        tipo: 'AJUSTE_FISCAL',
        nf: String(documento),
        descricao: 'Alíquota divergente, segue a NF anexa.',
      });
    expect(resposta.status).toBe(201);
    return resposta.body.id as string;
  }

  it('anexa um PDF, guarda separado por empresa e baixa o mesmo conteúdo', async () => {
    const id = await abrir();
    const resposta = await enviar(
      'SOLICITANTE',
      id,
      PDF,
      'Canhoto São Paulo.pdf',
    );
    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      nomeArquivo: 'Canhoto São Paulo.pdf',
      tipoMime: 'application/pdf',
      tamanhoBytes: PDF.length,
    });

    const anexo = await prisma.anexo.findUniqueOrThrow({
      where: { id: resposta.body.id },
    });
    expect(anexo.chaveStorage).toMatch(
      new RegExp(
        `^empresas/${empresa.id}/solicitacoes/${id}/[0-9a-f-]+\\.pdf$`,
      ),
    );

    const download = await baixar('ANALISTA', id, anexo.id);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toContain('inline');
    expect(download.headers['content-disposition']).toContain(
      "filename*=UTF-8''Canhoto%20S%C3%A3o%20Paulo.pdf",
    );
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(download.body as Buffer, PDF)).toBe(0);
  });

  it('XML é baixado como arquivo, nunca exibido', async () => {
    const id = await abrir();
    const { body } = await enviar('ANALISTA', id, XML, 'nfe.xml');
    const download = await baixar('ANALISTA', id, body.id);
    expect(download.headers['content-type']).toBe('application/xml');
    expect(download.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('recusa executável renomeado para .pdf', async () => {
    const id = await abrir();
    const resposta = await enviar('SOLICITANTE', id, EXE, 'nota.pdf');
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro).toContain('Tipo de arquivo não aceito');
  });

  it('recusa extensão que não bate com o conteúdo', async () => {
    const id = await abrir();
    const resposta = await enviar('SOLICITANTE', id, PDF, 'foto.jpg');
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro).toContain('PDF');
  });

  it('recusa arquivo acima de 5 MB e arquivo vazio', async () => {
    const id = await abrir();
    const grande = Buffer.concat([PDF, Buffer.alloc(TAMANHO_MAXIMO_BYTES)]);
    expect((await enviar('SOLICITANTE', id, grande, 'grande.pdf')).status).toBe(
      413,
    );
    expect(
      (await enviar('SOLICITANTE', id, Buffer.alloc(0), 'vazio.pdf')).status,
    ).toBe(422);
  });

  it('pede o arquivo no campo certo', async () => {
    const id = await abrir();
    const semArquivo = await request(app)
      .post(`/api/solicitacoes/${id}/anexos`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe('SOLICITANTE'))
      .field('outro', 'x');
    expect(semArquivo.status).toBe(400);

    const campoErrado = await request(app)
      .post(`/api/solicitacoes/${id}/anexos`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe('SOLICITANTE'))
      .attach('documento', PDF, 'a.pdf');
    expect(campoErrado.status).toBe(400);
  });

  it(`aceita no máximo ${ANEXOS_POR_SOLICITACAO} por solicitação`, async () => {
    const id = await abrir();
    for (let i = 0; i < ANEXOS_POR_SOLICITACAO; i++) {
      expect((await enviar('SOLICITANTE', id, PDF, `${i}.pdf`)).status).toBe(
        201,
      );
    }
    expect((await enviar('SOLICITANTE', id, PDF, 'mais.pdf')).status).toBe(422);
  });

  it('solicitação encerrada não recebe anexos', async () => {
    const id = await abrir();
    await request(app)
      .post(`/api/solicitacoes/${id}/status`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe('SOLICITANTE'))
      .send({ status: 'CANCELADO', observacao: 'Aberta por engano' });
    expect((await enviar('SOLICITANTE', id, PDF, 'a.pdf')).status).toBe(422);
  });

  it('outra empresa não anexa nem baixa (responde como inexistente)', async () => {
    const id = await abrir();
    const { body } = await enviar('SOLICITANTE', id, PDF, 'a.pdf');
    expect((await enviar('ANALISTA', id, PDF, 'b.pdf', outra)).status).toBe(
      404,
    );
    expect((await baixar('ANALISTA', id, body.id, outra)).status).toBe(404);
  });

  it('o id do anexo sozinho não dá acesso: precisa ser da solicitação certa', async () => {
    const id = await abrir();
    const outraSolicitacao = await abrir();
    const { body } = await enviar('SOLICITANTE', id, PDF, 'a.pdf');
    expect((await baixar('ANALISTA', outraSolicitacao, body.id)).status).toBe(
      404,
    );
    expect((await baixar('ANALISTA', id, 'nao-e-uuid')).status).toBe(404);
  });

  it('solicitante não baixa anexo de solicitação de outra pessoa', async () => {
    const id = await abrir('ANALISTA');
    const { body } = await enviar('ANALISTA', id, PDF, 'interno.pdf');
    expect((await baixar('SOLICITANTE', id, body.id)).status).toBe(404);
  });

  it('o detalhe lista os anexos e o quadro mostra a contagem', async () => {
    const id = await abrir();
    await enviar('SOLICITANTE', id, PDF, 'um.pdf');
    await enviar('ANALISTA', id, XML, 'dois.xml');

    const detalhe = await request(app)
      .get(`/api/solicitacoes/${id}`)
      .set('Cookie', await cookieDe('ANALISTA'));
    expect(
      detalhe.body.anexos.map((a: { nomeArquivo: string }) => a.nomeArquivo),
    ).toEqual(['um.pdf', 'dois.xml']);
    expect(detalhe.body.totais).toEqual({ anexos: 2, mensagens: 0 });

    // Quem abriu fica sabendo do anexo que a equipe mandou
    const notificacao = await prisma.notificacao.findFirst({
      where: {
        solicitacaoId: id,
        usuarioId: empresa.usuarios.SOLICITANTE.id,
        mensagem: { contains: 'anexou dois.xml' },
      },
    });
    expect(notificacao).not.toBeNull();
  });

  it('sem armazenamento configurado, responde 503', async () => {
    const semArmazenamento = criarApp({
      prisma,
      env: { ...ENV, STORAGE_ENDPOINT: undefined },
      limiteDeLoginPorMinuto: 1000,
    });
    const id = await abrir();
    const resposta = await request(semArmazenamento)
      .post(`/api/solicitacoes/${id}/anexos`)
      .set('Origin', FRONTEND)
      .set('Cookie', await cookieDe('SOLICITANTE'))
      .attach('arquivo', PDF, 'a.pdf');
    expect(resposta.status).toBe(503);
  });

  describe('etapa e conversa', () => {
    function enviarCom(
      perfil: Perfil,
      solicitacaoId: string,
      campos: Record<string, string>,
      conteudo: Buffer = PDF,
    ) {
      return cookieDe(perfil).then((cookie) => {
        let pedido = request(app)
          .post(`/api/solicitacoes/${solicitacaoId}/anexos`)
          .set('Origin', FRONTEND)
          .set('Cookie', cookie);
        for (const [campo, valor] of Object.entries(campos)) {
          pedido = pedido.field(campo, valor);
        }
        return pedido.attach('arquivo', conteudo, 'doc.pdf');
      });
    }

    it('guarda a etapa; o solicitante não anexa como resolução', async () => {
      const id = await abrir();
      const abertura = await enviarCom('SOLICITANTE', id, {
        etapa: 'ABERTURA',
      });
      expect(abertura.body.etapa).toBe('ABERTURA');

      const resolucao = await enviarCom('SOLICITANTE', id, {
        etapa: 'RESOLUCAO',
      });
      expect(resolucao.status).toBe(422);

      const daEquipe = await enviarCom('ANALISTA', id, { etapa: 'RESOLUCAO' });
      expect(daEquipe.body.etapa).toBe('RESOLUCAO');

      const invalida = await enviarCom('ANALISTA', id, { etapa: 'QUALQUER' });
      expect(invalida.status).toBe(400);
    });

    it('arquivo na conversa: fica ligado à mensagem e aparece nela', async () => {
      const id = await abrir();
      const mensagem = await request(app)
        .post(`/api/solicitacoes/${id}/mensagens`)
        .set('Origin', FRONTEND)
        .set('Cookie', await cookieDe('SOLICITANTE'))
        .send({ conteudo: '', comAnexos: true });
      expect(mensagem.status).toBe(201);

      const anexo = await enviarCom('SOLICITANTE', id, {
        mensagemId: mensagem.body.id,
      });
      expect(anexo.status).toBe(201);
      expect(anexo.body).toMatchObject({
        mensagemId: mensagem.body.id,
        etapa: 'ANDAMENTO',
      });

      const detalhe = await request(app)
        .get(`/api/solicitacoes/${id}`)
        .set('Cookie', await cookieDe('ANALISTA'));
      expect(detalhe.body.mensagens[0].anexos).toEqual([
        {
          id: anexo.body.id,
          nomeArquivo: 'doc.pdf',
          tipoMime: 'application/pdf',
        },
      ]);

      // Mensagem de outra pessoa não recebe arquivo meu
      const alheia = await enviarCom('ANALISTA', id, {
        mensagemId: mensagem.body.id,
      });
      expect(alheia.status).toBe(404);
    });

    it('mensagem vazia sem arquivo é recusada', async () => {
      const id = await abrir();
      const vazia = await request(app)
        .post(`/api/solicitacoes/${id}/mensagens`)
        .set('Origin', FRONTEND)
        .set('Cookie', await cookieDe('SOLICITANTE'))
        .send({ conteudo: '  ' });
      expect(vazia.status).toBe(400);
    });
  });

  describe('excluir anexo', () => {
    async function excluir(perfil: Perfil, id: string, anexoId: string) {
      return request(app)
        .delete(`/api/solicitacoes/${id}/anexos/${anexoId}`)
        .set('Origin', FRONTEND)
        .set('Cookie', await cookieDe(perfil));
    }

    it('quem enviou exclui dentro do prazo; fica no histórico e sai do armazenamento', async () => {
      const id = await abrir();
      const enviado = await enviar('SOLICITANTE', id, PDF, 'errado.pdf');
      const chave = (
        await prisma.anexo.findUniqueOrThrow({
          where: { id: enviado.body.id },
        })
      ).chaveStorage;

      // O detalhe diz até quando dá para excluir, só para quem enviou
      const meu = await request(app)
        .get(`/api/solicitacoes/${id}`)
        .set('Cookie', await cookieDe('SOLICITANTE'));
      expect(meu.body.anexos[0].podeExcluirAte).not.toBeNull();
      const daEquipe = await request(app)
        .get(`/api/solicitacoes/${id}`)
        .set('Cookie', await cookieDe('ANALISTA'));
      expect(daEquipe.body.anexos[0].podeExcluirAte).toBeNull();
      expect((await excluir('ANALISTA', id, enviado.body.id)).status).toBe(403);

      expect((await excluir('SOLICITANTE', id, enviado.body.id)).status).toBe(
        204,
      );
      expect(armazenamento.arquivos.has(chave)).toBe(false);
      const depois = await request(app)
        .get(`/api/solicitacoes/${id}`)
        .set('Cookie', await cookieDe('SOLICITANTE'));
      expect(depois.body.anexos).toHaveLength(0);
      expect(depois.body.historico.at(-1).observacao).toBe(
        'Anexo excluído: errado.pdf',
      );
    });

    it('depois do prazo, ou com o módulo desligado, não exclui', async () => {
      const id = await abrir();
      const enviado = await enviar('SOLICITANTE', id, PDF, 'velho.pdf');
      await prisma.anexo.update({
        where: { id: enviado.body.id },
        data: { criadoEm: new Date(Date.now() - 16 * 60_000) },
      });
      const tarde = await excluir('SOLICITANTE', id, enviado.body.id);
      expect(tarde.status).toBe(422);
      expect(tarde.body.erro).toMatch(/15 min/);

      const outro = await enviar('SOLICITANTE', id, PDF, 'novo.pdf');
      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { modulosAtivos: { set: [] } },
      });
      try {
        expect((await excluir('SOLICITANTE', id, outro.body.id)).status).toBe(
          422,
        );
      } finally {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: {
            modulosAtivos: (
              await prisma.empresa.findUniqueOrThrow({
                where: { id: empresa.id },
              })
            ).modulosLiberados,
          },
        });
      }
    });

    it('anexo de outra empresa não existe', async () => {
      const id = await abrir();
      const enviado = await enviar('SOLICITANTE', id, PDF, 'meu.pdf');
      const deFora = await request(app)
        .delete(`/api/solicitacoes/${id}/anexos/${enviado.body.id}`)
        .set('Origin', FRONTEND)
        .set('Cookie', await cookieDe('SOLICITANTE', outra));
      expect(deFora.status).toBe(404);
    });
  });
});
