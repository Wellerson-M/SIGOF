import { describe, expect, it } from 'vitest';
import {
  calcularIndicadores,
  celulaCsv,
  diaLocal,
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
    });
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
