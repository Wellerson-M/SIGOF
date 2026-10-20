import { describe, expect, it } from 'vitest';
import {
  codigoParaTipo,
  configuracaoPadrao,
  mesclarConfiguracao,
  nomeDoTipo,
  problemaNaAbertura,
  type DadosDoFormulario,
} from './formulario.js';
import { moduloLigado, modulosLigados, normalizarModulos } from './modulos.js';

const vazio: DadosDoFormulario = {
  ctes: [],
  nfs: [],
  fatura: null,
  filialId: null,
  pagadorCorreto: null,
  motivo: null,
  descricao: 'Descrição com tamanho suficiente.',
};

describe('formulário de abertura', () => {
  it('o padrão mantém as regras de antes (documento e pagador)', () => {
    expect(problemaNaAbertura(configuracaoPadrao('REVERSAO'), vazio)).toMatch(
      /CTe, a NF ou a fatura/,
    );
    expect(
      problemaNaAbertura(configuracaoPadrao('TROCA_PAGADOR'), {
        ...vazio,
        ctes: ['1'],
      }),
    ).toMatch(/pagador/);
    expect(problemaNaAbertura(configuracaoPadrao('OUTRO'), vazio)).toBeNull();
  });

  it('a filial começa opcional e a reversão traz motivos prontos', () => {
    const reversao = configuracaoPadrao('REVERSAO');
    expect(reversao.campos.filial.modo).toBe('OPCIONAL');
    expect(reversao.campos.motivo.modo).toBe('OPCIONAL');
    expect(reversao.motivos.length).toBeGreaterThan(0);
  });

  it('descrição curta: 10 caracteres na abertura, 3 no registro rápido', () => {
    const config = configuracaoPadrao('OUTRO');
    expect(
      problemaNaAbertura(config, { ...vazio, descricao: 'curta' }),
    ).toMatch(/10 caracteres/);
    expect(
      problemaNaAbertura(config, { ...vazio, descricao: 'curta' }, true),
    ).toBeNull();
    expect(
      problemaNaAbertura(config, { ...vazio, descricao: 'oi' }, true),
    ).toMatch(/Diga/);
  });

  it('campo escondido não é cobrado nem conta como documento', () => {
    const config = mesclarConfiguracao('REVERSAO', {
      ativo: true,
      exigirDocumento: true,
      campos: { cte: { modo: 'OCULTO' }, fatura: { modo: 'OCULTO' } },
      motivos: [],
    });
    expect(problemaNaAbertura(config, { ...vazio, ctes: ['1'] })).toBe(
      'Informe a NF',
    );
    expect(problemaNaAbertura(config, { ...vazio, nfs: ['9'] })).toBeNull();
  });

  it('cobra o obrigatório e confere o motivo contra a lista', () => {
    const config = mesclarConfiguracao('OUTRO', {
      ativo: true,
      exigirDocumento: null,
      campos: {
        fatura: { modo: 'OBRIGATORIO' },
        motivo: { modo: 'OBRIGATORIO' },
      },
      motivos: ['A', 'B'],
    });
    expect(problemaNaAbertura(config, vazio)).toBe('Informe a fatura');
    const comFatura = { ...vazio, fatura: 'F1' };
    expect(problemaNaAbertura(config, comFatura)).toBe('Escolha o motivo');
    expect(problemaNaAbertura(config, { ...comFatura, motivo: 'C' })).toMatch(
      /lista/,
    );
    expect(
      problemaNaAbertura(config, { ...comFatura, motivo: 'B' }),
    ).toBeNull();
  });

  it('ignora lixo gravado e nunca esconde a descrição', () => {
    const config = mesclarConfiguracao('AJUSTE_FISCAL', {
      ativo: false,
      exigirDocumento: null,
      campos: {
        cte: { modo: 'TALVEZ' },
        descricao: { modo: 'OCULTO' },
        pagadorCorreto: { modo: 'OPCIONAL', padrao: '  ' },
        prioridade: { modo: 'OCULTO', padrao: 'ALTA' },
      },
      motivos: [],
    });
    expect(config.ativo).toBe(false);
    expect(config.exigirDocumento).toBe(true);
    expect(config.campos.cte.modo).toBe('OPCIONAL');
    expect(config.campos.descricao.modo).toBe('OPCIONAL');
    expect(config.campos.pagadorCorreto).toEqual({ modo: 'OPCIONAL' });
    expect(config.campos.prioridade).toEqual({
      modo: 'OCULTO',
      padrao: 'ALTA',
    });
    expect(
      mesclarConfiguracao('OUTRO', {
        ativo: true,
        exigirDocumento: null,
        campos: null,
        motivos: [],
      }).campos,
    ).toEqual(configuracaoPadrao('OUTRO').campos);
  });
});

describe('módulos', () => {
  const empresa = {
    modulosLiberados: ['FILIAIS', 'EMAIL'],
    modulosAtivos: ['EMAIL', 'BALANCO'],
  };

  it('só vale o que está liberado e ligado', () => {
    expect(moduloLigado(empresa, 'EMAIL')).toBe(true);
    expect(moduloLigado(empresa, 'FILIAIS')).toBe(false);
    expect(moduloLigado(empresa, 'BALANCO')).toBe(false);
    expect(modulosLigados(empresa)).toEqual(['EMAIL']);
  });

  it('normaliza: só nomes conhecidos, sem repetir, na ordem do catálogo', () => {
    expect(normalizarModulos(['EMAIL', 'X', 'FILIAIS', 'EMAIL'])).toEqual([
      'FILIAIS',
      'EMAIL',
    ]);
  });
});

describe('tipos criados pela empresa', () => {
  it('o código sai do nome, sem acento, e não repete', () => {
    expect(codigoParaTipo('Cobrança em duplicidade', [])).toBe(
      'COBRANCA_EM_DUPLICIDADE',
    );
    expect(codigoParaTipo('Avaria', ['AVARIA', 'AVARIA_2'])).toBe('AVARIA_3');
    // Nunca o código de um tipo do sistema
    expect(codigoParaTipo('Reversão', [])).toBe('REVERSAO_2');
    expect(codigoParaTipo('!!!', [])).toBe('TIPO');
  });

  it('o nome: o que a empresa deu, o do sistema ou o código', () => {
    const nomes = new Map([['AJUSTE_FISCAL', 'Correção fiscal']]);
    expect(nomeDoTipo('AJUSTE_FISCAL', nomes)).toBe('Correção fiscal');
    expect(nomeDoTipo('REVERSAO', nomes)).toBe('Reversão');
    expect(nomeDoTipo('SUMIU')).toBe('SUMIU');
  });

  it('tipo novo começa com o formulário comum', () => {
    const config = configuracaoPadrao('AVARIA');
    expect(config).toMatchObject({ doSistema: false, exigirDocumento: true });
    expect(config.campos.motivo.modo).toBe('OCULTO');
    expect(
      mesclarConfiguracao('AVARIA', {
        nome: 'Avaria na entrega',
        ativo: true,
        exigirDocumento: null,
        campos: {},
        motivos: [],
      }).nome,
    ).toBe('Avaria na entrega');
  });
});
