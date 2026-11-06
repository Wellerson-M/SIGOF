import { describe, expect, it } from 'vitest';
import {
  ServicoDeRecuperacao,
  VALIDADE_DO_LINK_MINUTOS,
  emailDeRecuperacao,
  emailDeSenhaRecuperada,
} from './recuperacao.js';

describe('link de redefinição', () => {
  const servico = new ServicoDeRecuperacao({} as never, {
    urlDoSistema: 'https://sigof.exemplo.com',
  });

  it('leva o token no fragmento (#), que o navegador não envia ao servidor', () => {
    const link = new URL(servico.linkDeRedefinicao('abc_DEF-123'));

    expect(link.origin).toBe('https://sigof.exemplo.com');
    expect(link.pathname).toBe('/redefinir-senha');
    expect(link.search).toBe('');
    expect(link.hash).toBe('#abc_DEF-123');
  });

  it('ignora barra e caminho no fim do endereço do sistema', () => {
    const com = new ServicoDeRecuperacao({} as never, {
      urlDoSistema: 'https://sigof.exemplo.com/',
    });
    expect(com.linkDeRedefinicao('t')).toBe(
      'https://sigof.exemplo.com/redefinir-senha#t',
    );
  });
});

describe('e-mail de recuperação', () => {
  const dados = {
    empresa: 'Transporte <b>X</b>',
    nome: 'Ana "Silva"',
    link: 'https://sigof.exemplo.com/redefinir-senha#abc',
  };

  it('diz a validade, traz o link e avisa o que fazer se não foi a pessoa', () => {
    const email = emailDeRecuperacao(dados);

    expect(email.texto).toContain(dados.link);
    expect(email.texto).toContain(`${VALIDADE_DO_LINK_MINUTOS} minutos`);
    expect(email.texto).toContain('ignore este e-mail');
    expect(email.html).toContain(`href="${dados.link}"`);
  });

  it('escapa o que vem do cadastro no HTML', () => {
    const { html } = emailDeRecuperacao(dados);

    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).toContain('Ana &quot;Silva&quot;');
  });
});

describe('aviso de senha trocada', () => {
  it('conta quando foi trocada e manda procurar o administrador', () => {
    const email = emailDeSenhaRecuperada({
      empresa: 'Transporte X',
      nome: 'Ana',
      quando: '06/11/2026 09:30',
    });

    expect(email.assunto).toContain('foi trocada');
    expect(email.texto).toContain('06/11/2026 09:30');
    expect(email.texto).toContain('avise o administrador');
  });
});
