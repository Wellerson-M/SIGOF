import { describe, expect, it } from 'vitest';
import {
  AVISO_DE_NAO_RESPONDA,
  assuntoDe,
  emailDeTeste,
  escaparHtml,
  linhaDaNotificacao,
  montarEmail,
  type Ocorrido,
  type Retrato,
} from './modelos.js';

const RETRATO: Retrato = {
  id: 'id-1',
  protocolo: 'SOL-2026-10-0007',
  tipo: 'TROCA_PAGADOR',
  cte: '12345',
  nf: '998877',
  descricao: 'Pagador errado no CTe.',
  status: 'EM_ANDAMENTO',
  prioridade: 'ALTA',
  solicitante: 'Sofia',
  responsavel: 'André',
  slaVenceEm: new Date('2026-10-16T15:00:00Z'),
};

function email(ocorrido: Ocorrido, retrato: Retrato = RETRATO) {
  return montarEmail({
    ocorrido,
    retrato,
    autor: 'André',
    empresa: 'Transportadora Demo Ltda.',
    fusoHorario: 'America/Sao_Paulo',
    link: 'https://sigof.test/solicitacoes/id-1',
  });
}

describe('assunto', () => {
  it('é o mesmo em toda a vida do protocolo (mantém a conversa)', () => {
    const aberta = email({ tipo: 'ABERTA' }).assunto;
    const resolvida = email(
      {
        tipo: 'STATUS',
        de: 'EM_ANDAMENTO',
        para: 'RESOLVIDO',
        observacao: 'ok',
      },
      { ...RETRATO, status: 'RESOLVIDO' },
    ).assunto;
    expect(aberta).toBe(
      '[SIGOF SOL-2026-10-0007] Troca de pagador — CTe 12345',
    );
    expect(resolvida).toBe(aberta);
  });

  it('usa a NF quando não há CTe, e nada quando não há documento', () => {
    expect(assuntoDe({ ...RETRATO, cte: null })).toBe(
      '[SIGOF SOL-2026-10-0007] Troca de pagador — NF 998877',
    );
    expect(assuntoDe({ ...RETRATO, cte: null, nf: null, tipo: 'OUTRO' })).toBe(
      '[SIGOF SOL-2026-10-0007] Outro',
    );
  });
});

describe('corpo do e-mail', () => {
  it('avisa que é automático e que não deve ser respondido', () => {
    const { texto, html } = email({ tipo: 'ABERTA' });
    expect(texto).toContain(AVISO_DE_NAO_RESPONDA);
    expect(html).toContain('Não responda');
  });

  it('traz o que aconteceu, o motivo e o link', () => {
    const { texto, html } = email({
      tipo: 'STATUS',
      de: 'EM_ANDAMENTO',
      para: 'AGUARDANDO_DOC',
      observacao: 'Falta o XML da NF',
    });
    expect(texto).toContain('Em andamento → Aguardando documento, por André');
    expect(texto).toContain('Falta o XML da NF');
    expect(texto).toContain(
      'Abrir no SIGOF: https://sigof.test/solicitacoes/id-1',
    );
    expect(html).toContain('href="https://sigof.test/solicitacoes/id-1"');
  });

  it('mostra o prazo no fuso da empresa, e não depois de encerrada', () => {
    expect(email({ tipo: 'ABERTA' }).texto).toContain(
      'Prazo (SLA): 16/10/2026, 12:00',
    );
    expect(
      email({ tipo: 'ABERTA' }, { ...RETRATO, status: 'RESOLVIDO' }).texto,
    ).not.toContain('Prazo');
  });

  it('escapa o que o usuário escreveu (sem injetar HTML)', () => {
    const { html } = email({
      tipo: 'MENSAGEM',
      conteudo: '<script>alert(1)</script>',
      interna: false,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it.each<[Ocorrido, string]>([
    [
      { tipo: 'PRIORIDADE', de: 'MEDIA', para: 'URGENTE' },
      'Prioridade alterada de Média para Urgente',
    ],
    [{ tipo: 'RESPONSAVEL', nome: 'Bia' }, 'Responsável agora é Bia'],
    [
      { tipo: 'MENSAGEM', conteudo: 'Oi', interna: false },
      'Nova mensagem de André',
    ],
    [{ tipo: 'ANEXO', nomeArquivo: 'nf.pdf' }, 'André anexou o arquivo nf.pdf'],
  ])('manchete de %o', (ocorrido, esperado) => {
    expect(email(ocorrido).texto.split('\n')[0]).toContain(esperado);
  });

  it('sem responsável, diz que ainda não há', () => {
    expect(
      email({ tipo: 'ABERTA' }, { ...RETRATO, responsavel: null }).texto,
    ).toContain('Responsável: ainda ninguém');
  });
});

describe('linha da notificação', () => {
  it.each<[Ocorrido, string]>([
    [{ tipo: 'ABERTA' }, 'P1: nova solicitação aberta por Ana'],
    [
      { tipo: 'STATUS', de: 'NOVO', para: 'EM_ANDAMENTO', observacao: null },
      'P1: Novo → Em andamento (Ana)',
    ],
    [
      { tipo: 'PRIORIDADE', de: 'BAIXA', para: 'ALTA' },
      'P1: prioridade Alta (Ana)',
    ],
    [{ tipo: 'RESPONSAVEL', nome: 'Bia' }, 'P1: agora com Bia (Ana)'],
    [
      { tipo: 'MENSAGEM', conteudo: 'x', interna: true },
      'P1: nota interna de Ana',
    ],
    [
      { tipo: 'MENSAGEM', conteudo: 'x', interna: false },
      'P1: mensagem de Ana',
    ],
    [{ tipo: 'ANEXO', nomeArquivo: 'a.pdf' }, 'P1: Ana anexou a.pdf'],
  ])('%o', (ocorrido, esperado) => {
    expect(linhaDaNotificacao(ocorrido, 'P1', 'Ana')).toBe(esperado);
  });
});

describe('utilitários', () => {
  it('escaparHtml', () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('e-mail de teste', () => {
    const { assunto, texto } = emailDeTeste('Demo', 'Ana');
    expect(assunto).toBe('Teste de envio do SIGOF');
    expect(texto).toContain('Teste feito por Ana');
    expect(texto).toContain(AVISO_DE_NAO_RESPONDA);
  });
});
