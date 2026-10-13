import { describe, expect, it } from 'vitest';
import {
  ehTerminal,
  podeTransicionar,
  STATUS_TERMINAIS,
  TRANSICOES,
  TransicaoInvalidaError,
  transicoesPermitidas,
  validarTransicao,
  type Status,
} from './status.js';

describe('fluxo feliz (RFC seção 3.3, fluxo 1)', () => {
  it('permite NOVO -> EM_ANDAMENTO -> RESOLVIDO pelo analista', () => {
    expect(podeTransicionar('NOVO', 'EM_ANDAMENTO', 'ANALISTA')).toBe(true);
    expect(podeTransicionar('EM_ANDAMENTO', 'RESOLVIDO', 'ANALISTA')).toBe(true);
  });
});

describe('pausa de SLA (RFC seção 3.3, fluxo 2)', () => {
  it('permite ir e voltar de AGUARDANDO_DOC', () => {
    expect(podeTransicionar('EM_ANDAMENTO', 'AGUARDANDO_DOC', 'ANALISTA')).toBe(
      true,
    );
    expect(podeTransicionar('AGUARDANDO_DOC', 'EM_ANDAMENTO', 'ANALISTA')).toBe(
      true,
    );
  });
});

describe('escalonamento (RFC seção 3.3, fluxo 3)', () => {
  it('permite o analista escalar', () => {
    expect(podeTransicionar('EM_ANDAMENTO', 'ESCALADO', 'ANALISTA')).toBe(true);
  });

  it('somente o supervisor reatribui uma solicitação escalada', () => {
    expect(podeTransicionar('ESCALADO', 'EM_ANDAMENTO', 'SUPERVISOR')).toBe(
      true,
    );
    expect(podeTransicionar('ESCALADO', 'EM_ANDAMENTO', 'ANALISTA')).toBe(false);
  });
});

describe('restrições de perfil', () => {
  it('impede que o solicitante assuma uma solicitação', () => {
    expect(podeTransicionar('NOVO', 'EM_ANDAMENTO', 'SOLICITANTE')).toBe(false);
  });

  it('impede que o solicitante resolva uma solicitação', () => {
    expect(podeTransicionar('EM_ANDAMENTO', 'RESOLVIDO', 'SOLICITANTE')).toBe(
      false,
    );
  });

  it('permite que o solicitante cancele antes de alguém assumir', () => {
    expect(podeTransicionar('NOVO', 'CANCELADO', 'SOLICITANTE')).toBe(true);
  });

  it('impede que o solicitante cancele depois de assumida', () => {
    expect(podeTransicionar('EM_ANDAMENTO', 'CANCELADO', 'SOLICITANTE')).toBe(
      false,
    );
  });
});

describe('estados terminais', () => {
  it('RESOLVIDO e CANCELADO são terminais', () => {
    expect(ehTerminal('RESOLVIDO')).toBe(true);
    expect(ehTerminal('CANCELADO')).toBe(true);
    expect(ehTerminal('NOVO')).toBe(false);
  });

  it('nenhuma transição parte de um status terminal', () => {
    for (const terminal of STATUS_TERMINAIS) {
      expect(TRANSICOES.some((t) => t.de === terminal)).toBe(false);
    }
  });

  it('não existe transição que exclua a solicitação, apenas finalização', () => {
    const destinos = new Set(TRANSICOES.map((t) => t.para));
    const statusConhecidos: Status[] = [
      'NOVO',
      'EM_ANDAMENTO',
      'AGUARDANDO_DOC',
      'ESCALADO',
      'RESOLVIDO',
      'CANCELADO',
    ];

    for (const destino of destinos) {
      expect(statusConhecidos).toContain(destino);
    }
  });
});

describe('validarTransicao', () => {
  it('não lança para transição permitida', () => {
    expect(() =>
      validarTransicao('NOVO', 'EM_ANDAMENTO', 'ANALISTA'),
    ).not.toThrow();
  });

  it('rejeita transição para o mesmo status', () => {
    expect(() => validarTransicao('NOVO', 'NOVO', 'ANALISTA')).toThrow(
      /já está em NOVO/,
    );
  });

  it('rejeita alteração de solicitação já resolvida', () => {
    expect(() =>
      validarTransicao('RESOLVIDO', 'EM_ANDAMENTO', 'SUPERVISOR'),
    ).toThrow(/status final/);
  });

  it('distingue transição inexistente de perfil sem permissão', () => {
    expect(() => validarTransicao('NOVO', 'RESOLVIDO', 'ANALISTA')).toThrow(
      /Não há transição/,
    );

    expect(() =>
      validarTransicao('NOVO', 'EM_ANDAMENTO', 'SOLICITANTE'),
    ).toThrow(/não pode mover/);
  });

  it('expõe origem, destino e perfil no erro', () => {
    try {
      validarTransicao('NOVO', 'EM_ANDAMENTO', 'SOLICITANTE');
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(TransicaoInvalidaError);
      const invalida = erro as TransicaoInvalidaError;
      expect(invalida.de).toBe('NOVO');
      expect(invalida.para).toBe('EM_ANDAMENTO');
      expect(invalida.perfil).toBe('SOLICITANTE');
    }
  });
});

describe('transicoesPermitidas', () => {
  it('lista apenas o que o perfil pode fazer', () => {
    const doSolicitante = transicoesPermitidas('NOVO', 'SOLICITANTE');

    expect(doSolicitante.map((t) => t.para)).toEqual(['CANCELADO']);
  });

  it('retorna vazio para status terminal', () => {
    expect(transicoesPermitidas('RESOLVIDO', 'SUPERVISOR')).toHaveLength(0);
  });
});
