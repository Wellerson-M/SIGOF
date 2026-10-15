import { describe, expect, it } from 'vitest';
import {
  analisarProtocolo,
  competenciaDe,
  formatarProtocolo,
  ProtocoloInvalidoError,
  SEQUENCIAL_MAXIMO,
} from './protocolo.js';

describe('formatarProtocolo', () => {
  it('monta o protocolo no formato SOL-AAAA-MM-NNNN', () => {
    expect(formatarProtocolo({ ano: 2026, mes: 4, sequencial: 1 })).toBe(
      'SOL-2026-04-0001',
    );
  });

  it('preenche mês e sequencial com zeros à esquerda', () => {
    expect(formatarProtocolo({ ano: 2026, mes: 12, sequencial: 347 })).toBe(
      'SOL-2026-12-0347',
    );
  });

  it('aceita o último sequencial do intervalo', () => {
    expect(
      formatarProtocolo({ ano: 2026, mes: 1, sequencial: SEQUENCIAL_MAXIMO }),
    ).toBe('SOL-2026-01-9999');
  });

  it('rejeita sequencial acima do limite em vez de truncar o número', () => {
    expect(() =>
      formatarProtocolo({
        ano: 2026,
        mes: 1,
        sequencial: SEQUENCIAL_MAXIMO + 1,
      }),
    ).toThrow(ProtocoloInvalidoError);
  });

  it('rejeita sequencial zero ou negativo', () => {
    expect(() =>
      formatarProtocolo({ ano: 2026, mes: 1, sequencial: 0 }),
    ).toThrow(ProtocoloInvalidoError);
    expect(() =>
      formatarProtocolo({ ano: 2026, mes: 1, sequencial: -5 }),
    ).toThrow(ProtocoloInvalidoError);
  });

  it('rejeita mês fora de 1..12', () => {
    expect(() =>
      formatarProtocolo({ ano: 2026, mes: 13, sequencial: 1 }),
    ).toThrow(/Mês fora do intervalo/);
    expect(() =>
      formatarProtocolo({ ano: 2026, mes: 0, sequencial: 1 }),
    ).toThrow(/Mês fora do intervalo/);
  });

  it('rejeita sequencial fracionário', () => {
    expect(() =>
      formatarProtocolo({ ano: 2026, mes: 1, sequencial: 1.5 }),
    ).toThrow(ProtocoloInvalidoError);
  });
});

describe('analisarProtocolo', () => {
  it('extrai os componentes de um protocolo válido', () => {
    expect(analisarProtocolo('SOL-2026-04-0001')).toEqual({
      ano: 2026,
      mes: 4,
      sequencial: 1,
    });
  });

  it('ignora espaços em volta', () => {
    expect(analisarProtocolo('  SOL-2026-04-0001  ').sequencial).toBe(1);
  });

  it('rejeita formato diferente', () => {
    expect(() => analisarProtocolo('SOL-2026-4-1')).toThrow(
      ProtocoloInvalidoError,
    );
    expect(() => analisarProtocolo('2026-04-0001')).toThrow(
      ProtocoloInvalidoError,
    );
  });

  it('rejeita protocolo com formato certo mas mês inexistente', () => {
    expect(() => analisarProtocolo('SOL-2026-13-0001')).toThrow(
      /Mês fora do intervalo/,
    );
  });

  it('é o inverso de formatarProtocolo', () => {
    const componentes = { ano: 2026, mes: 9, sequencial: 42 };

    expect(analisarProtocolo(formatarProtocolo(componentes))).toEqual(
      componentes,
    );
  });
});

describe('competenciaDe', () => {
  it('retorna ano e mês com o mês começando em 1', () => {
    expect(competenciaDe(new Date(2026, 0, 15))).toEqual({ ano: 2026, mes: 1 });
    expect(competenciaDe(new Date(2026, 11, 31))).toEqual({
      ano: 2026,
      mes: 12,
    });
  });
});
