import { describe, expect, it } from 'vitest';
import {
  balancoDoMes,
  calcularIndicadores,
  celulaCsv,
  contarReversoesPorCte,
  diaLocal,
  indiceDeReversao,
  montarCsv,
  type SolicitacaoParaIndicadores,
} from './indicadores.js';
import { EXPEDIENTE_PADRAO } from './sla.js';

const AGORA = new Date('2026-10-16T15:00:00Z'); // 12:00 em São Paulo, sexta
const HORA = 60 * 60_000;
const DIA = 24 * HORA;
const antes = (ms: number) => new Date(AGORA.getTime() - ms);

function s(
  parte: Partial<SolicitacaoParaIndicadores> = {},
): SolicitacaoParaIndicadores {
  return {
    status: 'NOVO',
    tipo: 'REVERSAO',
    prioridade: 'MEDIA',
    criadoEm: antes(2 * HORA),
    resolvidoEm: null,
    assumidaEm: null,
    slaVenceEm: new Date(AGORA.getTime() + 2 * HORA),
    slaPausadoEm: null,
    slaMinutosPausados: 0,
    responsavel: null,
    abertaComAlertaDeDuplicidade: false,
    ...parte,
  };
}

const ANDRE = { id: 'a', nome: 'André' };
const BIA = { id: 'b', nome: 'Bia' };

describe('calcularIndicadores', () => {
  const lista = [
    // Na fila, sem responsável, no prazo
    s(),
    // Em andamento, assumida em 30 min, dentro do prazo
    s({
      status: 'EM_ANDAMENTO',
      tipo: 'AJUSTE_FISCAL',
      assumidaEm: antes(90 * 60_000),
      responsavel: ANDRE,
    }),
    // Vencida: prazo passou e ainda não foi assumida
    s({
      slaVenceEm: antes(HORA),
      criadoEm: antes(6 * HORA),
      abertaComAlertaDeDuplicidade: true,
    }),
    // Resolvida ontem, assumida depois do prazo
    s({
      status: 'RESOLVIDO',
      tipo: 'AJUSTE_FISCAL',
      criadoEm: antes(2 * DIA),
      assumidaEm: antes(DIA + 20 * HORA),
      slaVenceEm: antes(DIA + 22 * HORA),
      resolvidoEm: antes(DIA),
      responsavel: BIA,
    }),
    // Cancelada no período
    s({ status: 'CANCELADO', criadoEm: antes(3 * DIA) }),
    // Resolvida há muito tempo: fora do período
    s({
      status: 'RESOLVIDO',
      criadoEm: antes(60 * DIA),
      assumidaEm: antes(60 * DIA),
      resolvidoEm: antes(59 * DIA),
      responsavel: BIA,
    }),
  ];
  const r = calcularIndicadores(lista, AGORA, 30, EXPEDIENTE_PADRAO);

  it('o retrato de agora conta só o que está em aberto', () => {
    expect(r.agora).toMatchObject({
      abertas: 3,
      slaVencido: 1,
      semResponsavel: 2,
    });
    expect(r.agora.porStatus).toMatchObject({
      NOVO: 2,
      EM_ANDAMENTO: 1,
      RESOLVIDO: 1,
      CANCELADO: 1,
    });
  });

  it('no período: abertas, resolvidas, prazo e tempos médios', () => {
    expect(r.noPeriodo).toEqual({
      abertas: 5,
      resolvidas: 1,
      canceladas: 1,
      atendidas: 2,
      atendidasNoPrazo: 1,
      percentualNoPrazo: 50,
      // (30 min + 4 h) / 2
      minutosMedioAteAssumir: 135,
      minutosMedioAteResolver: 24 * 60,
      abertasComAlertaDeDuplicidade: 1,
      registrosRapidos: 0,
    });
  });

  it('registro rápido conta como resolvida, mas fica fora do tempo médio', () => {
    const resultado = calcularIndicadores(
      [
        s({
          status: 'RESOLVIDO',
          criadoEm: antes(2 * HORA),
          resolvidoEm: antes(HORA),
        }),
        s({
          status: 'RESOLVIDO',
          criadoEm: antes(HORA),
          resolvidoEm: antes(HORA),
          registroRapido: true,
        }),
      ],
      AGORA,
      7,
      EXPEDIENTE_PADRAO,
    );

    expect(resultado.noPeriodo.resolvidas).toBe(2);
    expect(resultado.noPeriodo.registrosRapidos).toBe(1);
    expect(resultado.noPeriodo.minutosMedioAteResolver).toBe(60);
  });

  it('por tipo, do mais comum para o menos', () => {
    expect(r.porTipo).toEqual([
      { tipo: 'REVERSAO', total: 3 },
      { tipo: 'AJUSTE_FISCAL', total: 2 },
    ]);
  });

  it('por responsável: em aberto e resolvidas no período', () => {
    expect(r.porResponsavel).toEqual([
      { id: 'a', nome: 'André', emAberto: 1, resolvidasNoPeriodo: 0 },
      { id: 'b', nome: 'Bia', emAberto: 0, resolvidasNoPeriodo: 1 },
    ]);
  });

  it('um ponto por dia, no fuso da empresa, inclusive os vazios', () => {
    expect(r.porDia).toHaveLength(30);
    expect(r.porDia.at(-1)).toEqual({
      dia: '2026-10-16',
      abertas: 3,
      resolvidas: 0,
    });
    expect(r.porDia.at(-2)).toEqual({
      dia: '2026-10-15',
      abertas: 0,
      resolvidas: 1,
    });
    expect(r.porDia.reduce((t, d) => t + d.abertas, 0)).toBe(5);
  });

  it('sem nada assumido, percentual e médias ficam vazios', () => {
    const vazio = calcularIndicadores([s()], AGORA, 7, EXPEDIENTE_PADRAO);
    expect(vazio.noPeriodo.percentualNoPrazo).toBeNull();
    expect(vazio.noPeriodo.minutosMedioAteAssumir).toBeNull();
    expect(vazio.noPeriodo.minutosMedioAteResolver).toBeNull();
  });

  it('pausada não conta como vencida; sem prazo conta como no prazo', () => {
    const r2 = calcularIndicadores(
      [
        s({
          status: 'AGUARDANDO_DOC',
          slaVenceEm: antes(HORA),
          slaPausadoEm: antes(2 * HORA),
        }),
        s({
          status: 'EM_ANDAMENTO',
          slaVenceEm: null,
          assumidaEm: antes(HORA),
        }),
      ],
      AGORA,
      7,
      EXPEDIENTE_PADRAO,
    );
    expect(r2.agora.slaVencido).toBe(0);
    expect(r2.noPeriodo.percentualNoPrazo).toBe(100);
  });
});

describe('por causa do erro', () => {
  const resolvida = (
    causa: { nome: string; detalhe: string | null } | null,
    resolvidoEm = antes(HORA),
  ) =>
    s({
      status: 'RESOLVIDO',
      criadoEm: antes(2 * DIA),
      resolvidoEm,
      causa,
    });

  it('conta as resolvidas no período por causa e por "qual"', () => {
    const resultado = calcularIndicadores(
      [
        resolvida({ nome: 'Erro de digitação', detalhe: 'Ana' }),
        resolvida({ nome: 'Erro de digitação', detalhe: 'Ana' }),
        resolvida({ nome: 'Erro de digitação', detalhe: 'Bruno' }),
        resolvida({ nome: 'Erro de digitação', detalhe: null }),
        resolvida({ nome: 'Erro do cliente', detalhe: null }),
        resolvida(null),
        // Fora do período: não entra
        resolvida({ nome: 'Erro comercial', detalhe: null }, antes(40 * DIA)),
        // Em aberto não tem causa ainda
        s(),
      ],
      AGORA,
      30,
      EXPEDIENTE_PADRAO,
    );

    expect(resultado.porCausa).toEqual([
      {
        causa: 'Erro de digitação',
        total: 4,
        detalhes: [
          { detalhe: 'Ana', total: 2 },
          { detalhe: 'Bruno', total: 1 },
        ],
      },
      { causa: 'Erro do cliente', total: 1, detalhes: [] },
    ]);
    expect(resultado.resolvidasSemCausa).toBe(1);
  });

  it('empate no total: ordem alfabética', () => {
    const resultado = calcularIndicadores(
      [
        resolvida({ nome: 'Outros', detalhe: null }),
        resolvida({ nome: 'Erro operacional', detalhe: null }),
      ],
      AGORA,
      30,
      EXPEDIENTE_PADRAO,
    );

    expect(resultado.porCausa.map((c) => c.causa)).toEqual([
      'Erro operacional',
      'Outros',
    ]);
  });
});

describe('CSV', () => {
  it('escapa separador e aspas e neutraliza fórmulas', () => {
    expect(celulaCsv('simples')).toBe('simples');
    expect(celulaCsv('a;b')).toBe('"a;b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaCsv('+5511')).toBe("'+5511");
    expect(celulaCsv(null)).toBe('');
    expect(celulaCsv(42)).toBe('42');
  });

  it('começa com BOM e usa ; e quebra de linha do Windows', () => {
    const csv = montarCsv(['A', 'B'], [['1', null]]);
    expect(csv).toBe('﻿A;B\r\n1;\r\n');
  });

  it('diaLocal usa o fuso', () => {
    expect(
      diaLocal(new Date('2026-10-17T01:00:00Z'), 'America/Sao_Paulo'),
    ).toBe('2026-10-16');
  });
});

describe('balanço do mês por digitador', () => {
  it('cruza a produção com os erros e calcula a taxa a cada 100 CTe', () => {
    const linhas = balancoDoMes(
      [
        { digitador: 'Ana', ctesEmitidos: 400 },
        { digitador: 'Bruno', ctesEmitidos: 100 },
        { digitador: 'Carla', ctesEmitidos: 50 },
      ],
      [
        { digitador: 'ana ' },
        { digitador: 'Ana' },
        { digitador: 'Bruno' },
        { digitador: 'Bruno' },
        { digitador: 'Bruno' },
        { digitador: 'Zé' },
      ],
    );

    expect(linhas).toEqual([
      { digitador: 'Bruno', ctesEmitidos: 100, erros: 3, taxaDeErro: 3 },
      { digitador: 'Ana', ctesEmitidos: 400, erros: 2, taxaDeErro: 0.5 },
      { digitador: 'Carla', ctesEmitidos: 50, erros: 0, taxaDeErro: 0 },
      // Errou, mas a produção dele não veio na planilha
      { digitador: 'Zé', ctesEmitidos: null, erros: 1, taxaDeErro: null },
    ]);
  });
});

describe('painel: filial, quem abre e tempo por tipo', () => {
  it('agrupa as abertas por filial e por solicitante; tempo médio por tipo sem registro rápido', () => {
    const resultado = calcularIndicadores(
      [
        s({ filial: 'Curitiba', solicitante: 'Sofia' }),
        s({ filial: 'Curitiba', solicitante: 'Sofia' }),
        s({ filial: null, solicitante: 'Pedro' }),
        s({
          status: 'RESOLVIDO',
          tipo: 'AJUSTE_FISCAL',
          criadoEm: antes(3 * HORA),
          resolvidoEm: antes(HORA),
          solicitante: 'Pedro',
        }),
        s({
          status: 'RESOLVIDO',
          tipo: 'AJUSTE_FISCAL',
          criadoEm: antes(HORA),
          resolvidoEm: antes(HORA),
          registroRapido: true,
        }),
      ],
      AGORA,
      7,
      EXPEDIENTE_PADRAO,
    );

    expect(resultado.porFilial).toEqual([
      { filial: 'Sem filial', total: 3 },
      { filial: 'Curitiba', total: 2 },
    ]);
    expect(resultado.porSolicitante).toEqual([
      { nome: 'Pedro', total: 2 },
      { nome: 'Sofia', total: 2 },
    ]);
    expect(resultado.tempoAteResolverPorTipo).toEqual([
      { tipo: 'AJUSTE_FISCAL', resolvidas: 1, minutos: 120 },
    ]);
  });
});

describe('reversões por CTe', () => {
  const reversao = (parte: Partial<SolicitacaoParaIndicadores> = {}) =>
    s({ tipo: 'REVERSAO', ...parte });

  it('conta os CTe, e não os tickets: uma fatura com três CTe são três', () => {
    const r = contarReversoesPorCte([
      reversao({ ctes: ['100', '101', '102'] }),
      reversao({ ctes: ['200'] }),
      s({ tipo: 'AJUSTE_FISCAL', ctes: ['300', '301'] }),
    ]);
    expect(r.tickets).toBe(2);
    expect(r.ctes).toBe(4);
  });

  it('o mesmo CTe pedido duas vezes na mesma filial conta uma vez só', () => {
    const r = contarReversoesPorCte([
      reversao({ filial: 'Curitiba', ctes: ['12345'] }),
      reversao({ filial: 'Curitiba', ctes: ['CTe 012.345'] }),
    ]);
    expect(r.tickets).toBe(2);
    expect(r.ctes).toBe(1);
  });

  it('o mesmo número em filiais diferentes são CTe diferentes', () => {
    const r = contarReversoesPorCte([
      reversao({ filial: 'Curitiba', ctes: ['500'] }),
      reversao({ filial: 'Joinville', ctes: ['500', '501'] }),
      reversao({ ctes: ['900'] }),
    ]);
    expect(r.ctes).toBe(4);
    expect(r.porFilial).toEqual([
      { filial: 'Joinville', ctes: 2 },
      { filial: 'Curitiba', ctes: 1 },
      { filial: 'Sem filial', ctes: 1 },
    ]);
  });

  it('cancelada não conta; reversão sem CTe conta só como ticket', () => {
    const r = contarReversoesPorCte([
      reversao({ status: 'CANCELADO', ctes: ['1', '2'] }),
      reversao(),
      reversao({ ctes: ['  ', 'abc'] }),
    ]);
    expect(r.tickets).toBe(2);
    // "abc" não tem dígitos: vale como texto; o vazio é ignorado
    expect(r.ctes).toBe(1);
  });

  it('entra nos indicadores do período, só com o que foi aberto nele', () => {
    const r = calcularIndicadores(
      [
        reversao({ ctes: ['1', '2'] }),
        reversao({ ctes: ['3'], criadoEm: antes(60 * DIA) }),
      ],
      AGORA,
      30,
      EXPEDIENTE_PADRAO,
    );
    expect(r.reversoes).toMatchObject({ tickets: 1, ctes: 2 });
  });
});

describe('índice de reversão', () => {
  it('é a quantidade de reversões a cada 100 CTe emitidos', () => {
    expect(indiceDeReversao(3, 1200)).toBe(0.25);
    expect(indiceDeReversao(0, 500)).toBe(0);
  });

  it('sem produção importada, não há índice', () => {
    expect(indiceDeReversao(3, null)).toBeNull();
    expect(indiceDeReversao(3, 0)).toBeNull();
  });
});

describe('erros por filial', () => {
  const resolvida = (filial: string | null, causa: string | null) =>
    s({
      status: 'RESOLVIDO',
      criadoEm: antes(2 * DIA),
      resolvidoEm: antes(HORA),
      filial,
      causa: causa ? { nome: causa, detalhe: null } : null,
    });

  it('agrupa por filial, com a causa de cada erro', () => {
    const r = calcularIndicadores(
      [
        resolvida('Curitiba', 'Erro de digitação'),
        resolvida('Curitiba', 'Erro de digitação'),
        resolvida('Curitiba', 'Erro do cliente'),
        resolvida('Joinville', 'Erro de digitação'),
        resolvida(null, 'Erro do cliente'),
        // sem causa informada não é erro registrado
        resolvida('Joinville', null),
      ],
      AGORA,
      7,
      EXPEDIENTE_PADRAO,
    );
    expect(r.errosPorFilial).toEqual([
      {
        filial: 'Curitiba',
        total: 3,
        porCausa: [
          { causa: 'Erro de digitação', total: 2 },
          { causa: 'Erro do cliente', total: 1 },
        ],
      },
      {
        filial: 'Joinville',
        total: 1,
        porCausa: [{ causa: 'Erro de digitação', total: 1 }],
      },
      {
        filial: 'Sem filial',
        total: 1,
        porCausa: [{ causa: 'Erro do cliente', total: 1 }],
      },
    ]);
  });
});
