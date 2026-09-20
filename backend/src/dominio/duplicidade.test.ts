import { describe, expect, it } from 'vitest';
import {
  encontrarDuplicidades,
  haDuplicidade,
  normalizarDocumento,
  type SolicitacaoComparavel,
} from './duplicidade.js';

const EMPRESA_A = 'empresa-a';
const EMPRESA_B = 'empresa-b';

const AGORA = new Date('2026-09-20T12:00:00Z');

function solicitacao(
  parcial: Partial<SolicitacaoComparavel> = {},
): SolicitacaoComparavel {
  return {
    id: 'id-1',
    empresaId: EMPRESA_A,
    protocolo: 'SOL-2026-09-0001',
    cte: '12345',
    nf: null,
    status: 'EM_ANDAMENTO',
    criadoEm: new Date('2026-09-18T09:00:00Z'),
    ...parcial,
  };
}

function candidata(parcial: Partial<Parameters<typeof haDuplicidade>[0]> = {}) {
  return {
    empresaId: EMPRESA_A,
    cte: '12345',
    nf: null,
    criadoEm: AGORA,
    ...parcial,
  };
}

describe('normalizarDocumento', () => {
  it('ignora pontuação, espaços e caixa', () => {
    expect(normalizarDocumento('cte 12.345')).toBe('CTE12345');
  });

  it('ignora zeros à esquerda', () => {
    expect(normalizarDocumento('00012345')).toBe('12345');
  });

  it('trata documento vazio como ausente', () => {
    expect(normalizarDocumento('   ')).toBeNull();
    expect(normalizarDocumento('0000')).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
  });
});

describe('encontrarDuplicidades', () => {
  it('acusa mesmo CTe dentro da janela de 7 dias', () => {
    const motivos = encontrarDuplicidades(candidata(), [solicitacao()]);

    expect(motivos).toHaveLength(1);
    expect(motivos[0]?.documento).toBe('CTE');
  });

  it('acusa mesmo CTe digitado com formatação diferente', () => {
    const motivos = encontrarDuplicidades(candidata({ cte: '012.345' }), [
      solicitacao({ cte: '12345' }),
    ]);

    expect(motivos).toHaveLength(1);
  });

  it('acusa mesma NF quando o CTe não bate', () => {
    const motivos = encontrarDuplicidades(
      candidata({ cte: '999', nf: '555' }),
      [solicitacao({ cte: '111', nf: '555' })],
    );

    expect(motivos).toHaveLength(1);
    expect(motivos[0]?.documento).toBe('NF');
  });

  it('não acusa duas vezes a mesma solicitação quando CTe e NF batem', () => {
    const motivos = encontrarDuplicidades(
      candidata({ cte: '111', nf: '555' }),
      [solicitacao({ cte: '111', nf: '555' })],
    );

    expect(motivos).toHaveLength(1);
  });

  it('ignora solicitação fora da janela de 7 dias', () => {
    const motivos = encontrarDuplicidades(candidata(), [
      solicitacao({ criadoEm: new Date('2026-09-10T09:00:00Z') }),
    ]);

    expect(motivos).toHaveLength(0);
  });

  it('inclui solicitação exatamente no limite da janela', () => {
    const motivos = encontrarDuplicidades(candidata(), [
      solicitacao({ criadoEm: new Date('2026-09-13T12:00:00Z') }),
    ]);

    expect(motivos).toHaveLength(1);
  });

  it('ignora solicitação cancelada', () => {
    const motivos = encontrarDuplicidades(candidata(), [
      solicitacao({ status: 'CANCELADO' }),
    ]);

    expect(motivos).toHaveLength(0);
  });

  it('considera solicitação já resolvida dentro da janela', () => {
    const motivos = encontrarDuplicidades(candidata(), [
      solicitacao({ status: 'RESOLVIDO' }),
    ]);

    expect(motivos).toHaveLength(1);
  });

  it('nunca compara documentos de outra empresa (cross-tenant)', () => {
    const motivos = encontrarDuplicidades(candidata(), [
      solicitacao({ empresaId: EMPRESA_B }),
    ]);

    expect(motivos).toHaveLength(0);
  });

  it('não acusa nada quando a candidata não tem CTe nem NF', () => {
    const motivos = encontrarDuplicidades(candidata({ cte: null, nf: null }), [
      solicitacao(),
    ]);

    expect(motivos).toHaveLength(0);
  });

  it('não confunde ausência de documento com igualdade', () => {
    const motivos = encontrarDuplicidades(candidata({ cte: '111', nf: null }), [
      solicitacao({ cte: '222', nf: null }),
    ]);

    expect(motivos).toHaveLength(0);
  });

  it('respeita janela customizada', () => {
    const existentes = [
      solicitacao({ criadoEm: new Date('2026-09-17T12:00:00Z') }),
    ];

    expect(encontrarDuplicidades(candidata(), existentes, 2)).toHaveLength(0);
    expect(encontrarDuplicidades(candidata(), existentes, 5)).toHaveLength(1);
  });

  it('retorna todas as solicitações conflitantes', () => {
    const motivos = encontrarDuplicidades(candidata(), [
      solicitacao({ id: 'a' }),
      solicitacao({ id: 'b', protocolo: 'SOL-2026-09-0002' }),
    ]);

    expect(motivos.map((m) => m.solicitacao.id)).toEqual(['a', 'b']);
  });
});

describe('haDuplicidade', () => {
  it('resume o resultado em booleano', () => {
    expect(haDuplicidade(candidata(), [solicitacao()])).toBe(true);
    expect(haDuplicidade(candidata(), [])).toBe(false);
  });
});
