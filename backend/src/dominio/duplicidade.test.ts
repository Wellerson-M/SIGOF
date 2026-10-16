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
  it('mantém só os dígitos, descartando prefixo, pontuação e espaços', () => {
    expect(normalizarDocumento('cte 12.345')).toBe('12345');
    expect(normalizarDocumento('CT-e nº 12.345')).toBe('12345');
    expect(normalizarDocumento('NF-e 555')).toBe('555');
  });

  it('extrai o número de uma chave de acesso de 44 dígitos', () => {
    // UF 42, 2609, CNPJ, modelo 57, série 001, número 000012345, ...
    const chave = '4226091234567800019957001000012345100000001' + '0';

    expect(chave).toHaveLength(44);
    expect(normalizarDocumento(chave)).toBe('12345');
    expect(normalizarDocumento(chave.replace(/(\d{4})/g, '$1 '))).toBe('12345');
  });

  it('não confunde número comprido com chave de acesso', () => {
    expect(normalizarDocumento('123456789012')).toBe('123456789012');
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

  it('acusa mesmo CTe quando um tem prefixo "CTE" e o outro não', () => {
    // Caso apontado no code review: o prefixo impedia a detecção.
    const motivos = encontrarDuplicidades(candidata({ cte: 'CTE 12.345' }), [
      solicitacao({ cte: '12345' }),
    ]);

    expect(motivos).toHaveLength(1);
    expect(motivos[0]?.valor).toBe('12345');
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

describe('filiais', () => {
  it('mesmo CTe em filiais diferentes não é duplicidade', () => {
    const motivos = encontrarDuplicidades(candidata({ filialId: 'curitiba' }), [
      solicitacao({ filialId: 'joinville' }),
    ]);

    expect(motivos).toHaveLength(0);
  });

  it('mesmo CTe na mesma filial é duplicidade', () => {
    const motivos = encontrarDuplicidades(candidata({ filialId: 'curitiba' }), [
      solicitacao({ filialId: 'curitiba' }),
    ]);

    expect(motivos).toHaveLength(1);
  });

  it('sem filial de um dos lados, avisa (na dúvida, é a mesma)', () => {
    expect(
      encontrarDuplicidades(candidata({ filialId: 'curitiba' }), [
        solicitacao({ filialId: null }),
      ]),
    ).toHaveLength(1);
    expect(
      encontrarDuplicidades(candidata({ filialId: null }), [
        solicitacao({ filialId: 'curitiba' }),
      ]),
    ).toHaveLength(1);
  });

  it('a NF também respeita a filial', () => {
    const motivos = encontrarDuplicidades(
      candidata({ cte: null, nf: '555', filialId: 'curitiba' }),
      [solicitacao({ cte: null, nf: '555', filialId: 'joinville' })],
    );

    expect(motivos).toHaveLength(0);
  });
});

describe('arquivos anexados', () => {
  const HASH = 'a'.repeat(64);

  it('o mesmo arquivo com outro CTe e outra NF é duplicidade', () => {
    const motivos = encontrarDuplicidades(
      candidata({ cte: '999', nf: '888', hashesDosAnexos: [HASH] }),
      [
        solicitacao({
          cte: '111',
          nf: '222',
          anexos: [{ nomeArquivo: 'cte.pdf', sha256: HASH.toUpperCase() }],
        }),
      ],
    );

    expect(motivos).toEqual([
      expect.objectContaining({ documento: 'ANEXO', valor: 'cte.pdf' }),
    ]);
  });

  it('vale mesmo em outra filial e sem documento digitado', () => {
    const motivos = encontrarDuplicidades(
      candidata({
        cte: null,
        nf: null,
        filialId: 'curitiba',
        hashesDosAnexos: [HASH],
      }),
      [
        solicitacao({
          filialId: 'joinville',
          anexos: [{ nomeArquivo: 'nota.xml', sha256: HASH }],
        }),
      ],
    );

    expect(motivos).toHaveLength(1);
  });

  it('arquivo diferente ou anexo antigo sem hash não acusam', () => {
    const motivos = encontrarDuplicidades(
      candidata({ cte: '999', hashesDosAnexos: [HASH] }),
      [
        solicitacao({
          cte: '111',
          anexos: [
            { nomeArquivo: 'outro.pdf', sha256: 'b'.repeat(64) },
            { nomeArquivo: 'antigo.pdf', sha256: null },
          ],
        }),
      ],
    );

    expect(motivos).toHaveLength(0);
  });

  it('respeita a janela e ignora canceladas, como os documentos', () => {
    const anexos = [{ nomeArquivo: 'cte.pdf', sha256: HASH }];
    const motivos = encontrarDuplicidades(
      candidata({ cte: '999', hashesDosAnexos: [HASH] }),
      [
        solicitacao({ cte: '1', anexos, status: 'CANCELADO' }),
        solicitacao({
          cte: '2',
          anexos,
          criadoEm: new Date('2026-09-01T12:00:00Z'),
        }),
      ],
    );

    expect(motivos).toHaveLength(0);
  });
});

describe('haDuplicidade', () => {
  it('resume o resultado em booleano', () => {
    expect(haDuplicidade(candidata(), [solicitacao()])).toBe(true);
    expect(haDuplicidade(candidata(), [])).toBe(false);
  });
});
