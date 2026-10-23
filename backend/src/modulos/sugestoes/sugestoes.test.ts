import { describe, expect, it } from 'vitest';
import { PREFIXO_DO_ASSUNTO, emailDeSugestao } from './servico.js';

const CONTEXTO = {
  nome: 'Ana',
  email: 'ana@exemplo.test',
  perfil: 'SUPERVISOR',
  empresa: 'Transportadora Demo Ltda.',
  ambiente: 'staging',
  versao: 'a1b2c3d',
  enviadaEm: '22/10/2026 14:03',
};

describe('emailDeSugestao', () => {
  const email = emailDeSugestao(
    {
      categoria: 'PROBLEMA',
      titulo: 'Botão <b>sumiu</b>',
      texto: 'Na tela de indicadores\nnão acho o filtro.',
      pagina: '/indicadores',
    },
    CONTEXTO,
  );

  it('o assunto começa por um prefixo fixo, para filtrar na caixa de entrada', () => {
    expect(email.assunto).toBe(
      `${PREFIXO_DO_ASSUNTO} Problema: Botão <b>sumiu</b>`,
    );
    expect(email.assunto.startsWith('[SIGOF Sugestão]')).toBe(true);
  });

  it('o texto traz quem mandou, onde estava e a mensagem', () => {
    expect(email.texto).toContain('De: Ana <ana@exemplo.test> (SUPERVISOR)');
    expect(email.texto).toContain('Tela: /indicadores');
    expect(email.texto).toContain('Ambiente: staging · versão a1b2c3d');
    expect(email.texto).toContain('não acho o filtro.');
  });

  it('o HTML escapa o que a pessoa digitou', () => {
    expect(email.html).toContain('&lt;b&gt;sumiu&lt;/b&gt;');
    expect(email.html).not.toContain('<b>sumiu</b>');
  });

  it('sem a tela informada, diz que não foi informada', () => {
    const sem = emailDeSugestao(
      { categoria: 'SUGESTAO', titulo: 'Ideia', texto: 'Uma ideia boa.' },
      CONTEXTO,
    );
    expect(sem.texto).toContain('Tela: não informada');
    expect(sem.assunto).toContain('Sugestão: Ideia');
  });
});
