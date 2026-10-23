/**
 * Indicadores do painel gerencial (RF10 e RNF de gestão; RFC seção 4.2,
 * Tela 6). Função pura: recebe as solicitações já lidas do banco e o
 * instante de referência, e devolve os números. Assim cada fórmula é
 * testada sem banco.
 *
 * Definições (as mesmas que aparecem na tela):
 *  - **Atendida no prazo:** foi assumida (primeira passagem para "Em
 *    andamento") antes de o SLA vencer. É o que o SLA da RFC mede: o prazo
 *    de *atendimento inicial*, não o de resolução.
 *  - **Tempo até assumir / até resolver:** tempo corrido, em minutos, da
 *    abertura até o evento. Corrido, e não útil, porque é o tempo que o
 *    cliente de fato esperou.
 */
import { normalizarDocumento } from './duplicidade.js';
import { indicadorDeSla, type Prioridade } from './fila.js';
import type { Expediente } from './sla.js';
import type { Status } from './status.js';

/** Código do tipo (um dos do sistema ou um criado pela empresa). */
export type Tipo = string;

export interface SolicitacaoParaIndicadores {
  status: Status;
  tipo: Tipo;
  prioridade: Prioridade;
  criadoEm: Date;
  resolvidoEm: Date | null;
  assumidaEm: Date | null;
  slaVenceEm: Date | null;
  slaPausadoEm: Date | null;
  slaMinutosPausados: number;
  responsavel: { id: string; nome: string } | null;
  abertaComAlertaDeDuplicidade: boolean;
  filial?: string | null | undefined;
  solicitante?: string | undefined;
  /** Todos os CTe da solicitação (uma fatura pode trazer vários). */
  ctes?: readonly string[] | undefined;
  /** Já resolvida por fora: não conta no tempo até resolver. */
  registroRapido?: boolean | undefined;
  /** Causa do erro registrada ao resolver (controle interno). */
  causa?: { nome: string; detalhe: string | null } | null | undefined;
}

export interface Indicadores {
  periodo: { dias: number; de: Date; ate: Date };
  agora: {
    abertas: number;
    porStatus: Record<Status, number>;
    slaVencido: number;
    semResponsavel: number;
  };
  noPeriodo: {
    abertas: number;
    resolvidas: number;
    canceladas: number;
    atendidasNoPrazo: number;
    atendidas: number;
    /** Percentual 0–100, ou null se nenhuma foi assumida ainda. */
    percentualNoPrazo: number | null;
    minutosMedioAteAssumir: number | null;
    minutosMedioAteResolver: number | null;
    abertasComAlertaDeDuplicidade: number;
    /** Registradas já resolvidas (resolvidas por fora). */
    registrosRapidos: number;
  };
  porTipo: { tipo: Tipo; total: number }[];
  porResponsavel: {
    id: string;
    nome: string;
    emAberto: number;
    resolvidasNoPeriodo: number;
  }[];
  porDia: { dia: string; abertas: number; resolvidas: number }[];
  /**
   * De quem foi o erro, entre as resolvidas no período, com o "qual"
   * (ex.: cada digitador) quando a causa tem opções.
   */
  porCausa: {
    causa: string;
    total: number;
    detalhes: { detalhe: string; total: number }[];
  }[];
  resolvidasSemCausa: number;
  /** Abertas no período por filial ("Sem filial" quando não informada). */
  porFilial: { filial: string; total: number }[];
  /** Quem mais abriu no período (os 8 primeiros). */
  porSolicitante: { nome: string; total: number }[];
  /** Tempo médio até resolver, por tipo, entre as resolvidas no período. */
  tempoAteResolverPorTipo: {
    tipo: Tipo;
    minutos: number;
    resolvidas: number;
  }[];
  /** Reversões abertas no período, contadas por CTe (e não por ticket). */
  reversoes: ReversoesPorCte;
  /**
   * Em que filial estava o documento das solicitações resolvidas com causa
   * do erro no período, com a causa de cada uma.
   */
  errosPorFilial: {
    filial: string;
    total: number;
    porCausa: { causa: string; total: number }[];
  }[];
}

/** Código do tipo de ocorrência "reversão" (um dos do sistema). */
export const TIPO_REVERSAO = 'REVERSAO';

export interface ReversoesPorCte {
  /** Solicitações de reversão (tickets) abertas e não canceladas. */
  tickets: number;
  /**
   * CTe distintos nessas solicitações: o mesmo CTe em dois tickets conta
   * uma vez só (mesma filial e mesmo número).
   */
  ctes: number;
  porFilial: { filial: string; ctes: number }[];
}

const SEM_FILIAL = 'Sem filial';

/**
 * Conta as reversões por CTe. A chave é filial + número normalizado: duas
 * filiais podem ter o mesmo número de CTe, mas o mesmo CTe pedido em duas
 * solicitações é uma reversão só.
 */
export function contarReversoesPorCte(
  solicitacoes: readonly Pick<
    SolicitacaoParaIndicadores,
    'tipo' | 'status' | 'filial' | 'ctes'
  >[],
): ReversoesPorCte {
  const reversoes = solicitacoes.filter(
    (s) => s.tipo === TIPO_REVERSAO && s.status !== 'CANCELADO',
  );
  const vistos = new Set<string>();
  const porFilial = new Map<string, number>();
  for (const s of reversoes) {
    const filial = s.filial ?? SEM_FILIAL;
    for (const cte of s.ctes ?? []) {
      const numero = normalizarDocumento(cte) ?? cte.trim();
      if (numero === '') continue;
      const chave = `${filial}|${numero}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      porFilial.set(filial, (porFilial.get(filial) ?? 0) + 1);
    }
  }
  return {
    tickets: reversoes.length,
    ctes: vistos.size,
    porFilial: [...porFilial.entries()]
      .map(([filial, ctes]) => ({ filial, ctes }))
      .sort((a, b) => b.ctes - a.ctes || a.filial.localeCompare(b.filial)),
  };
}

/**
 * Índice de reversão: reversões (CTe) a cada 100 CTe emitidos. Null sem a
 * produção do mês importada.
 */
export function indiceDeReversao(
  ctesRevertidos: number,
  ctesEmitidos: number | null,
): number | null {
  if (ctesEmitidos === null || ctesEmitidos <= 0) return null;
  return Math.round((ctesRevertidos / ctesEmitidos) * 10_000) / 100;
}

/** Uma linha do balanço mensal: o que o digitador emitiu e quanto errou. */
export interface LinhaDoBalanco {
  digitador: string;
  /** Null: a produção do mês ainda não foi importada para ele. */
  ctesEmitidos: number | null;
  erros: number;
  /** Erros a cada 100 CTe emitidos; null sem produção. */
  taxaDeErro: number | null;
}

/**
 * Junta a produção importada com os erros registrados no mês. O nome é
 * comparado sem diferença de maiúsculas e espaços ("ana " = "Ana").
 */
export function balancoDoMes(
  producao: readonly { digitador: string; ctesEmitidos: number }[],
  erros: readonly { digitador: string }[],
): LinhaDoBalanco[] {
  const chave = (nome: string) =>
    nome.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  const linhas = new Map<string, LinhaDoBalanco>();
  for (const p of producao) {
    linhas.set(chave(p.digitador), {
      digitador: p.digitador.trim(),
      ctesEmitidos: p.ctesEmitidos,
      erros: 0,
      taxaDeErro: null,
    });
  }
  for (const e of erros) {
    const linha = linhas.get(chave(e.digitador)) ?? {
      digitador: e.digitador.trim(),
      ctesEmitidos: null,
      erros: 0,
      taxaDeErro: null,
    };
    linha.erros += 1;
    linhas.set(chave(e.digitador), linha);
  }
  return [...linhas.values()]
    .map((l) => ({
      ...l,
      taxaDeErro:
        l.ctesEmitidos && l.ctesEmitidos > 0
          ? Math.round((l.erros / l.ctesEmitidos) * 10_000) / 100
          : null,
    }))
    .sort(
      (a, b) =>
        (b.taxaDeErro ?? -1) - (a.taxaDeErro ?? -1) ||
        b.erros - a.erros ||
        a.digitador.localeCompare(b.digitador),
    );
}

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const STATUS: Status[] = [
  'NOVO',
  'EM_ANDAMENTO',
  'AGUARDANDO_DOC',
  'ESCALADO',
  'RESOLVIDO',
  'CANCELADO',
];

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** "2026-10-16" no fuso da empresa (o dia de quem trabalha, não o UTC). */
export function diaLocal(data: Date, fusoHorario: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}

export function ehEmAberto(status: Status): boolean {
  return status !== 'RESOLVIDO' && status !== 'CANCELADO';
}

export function calcularIndicadores(
  solicitacoes: readonly SolicitacaoParaIndicadores[],
  agora: Date,
  dias: number,
  expediente: Expediente,
): Indicadores {
  const de = new Date(agora.getTime() - dias * DIA);
  const noPeriodo = (data: Date | null) =>
    data !== null && data >= de && data <= agora;

  const porStatus = Object.fromEntries(STATUS.map((s) => [s, 0])) as Record<
    Status,
    number
  >;
  let abertas = 0;
  let slaVencido = 0;
  let semResponsavel = 0;

  const abertasNoPeriodo = solicitacoes.filter((s) => noPeriodo(s.criadoEm));
  const resolvidasNoPeriodo = solicitacoes.filter(
    (s) => s.status === 'RESOLVIDO' && noPeriodo(s.resolvidoEm),
  );

  for (const s of solicitacoes) {
    if (!ehEmAberto(s.status)) continue;
    abertas += 1;
    porStatus[s.status] += 1;
    if (!s.responsavel) semResponsavel += 1;
    const sla = indicadorDeSla(
      s.status,
      s.slaVenceEm
        ? {
            venceEm: s.slaVenceEm,
            pausadoEm: s.slaPausadoEm,
            minutosPausados: s.slaMinutosPausados,
          }
        : null,
      agora,
      expediente,
    );
    if (sla.situacao === 'VENCIDO') slaVencido += 1;
  }
  // Encerradas só contam as do período (as antigas não dizem nada de agora)
  porStatus.RESOLVIDO = resolvidasNoPeriodo.length;
  porStatus.CANCELADO = abertasNoPeriodo.filter(
    (s) => s.status === 'CANCELADO',
  ).length;

  const assumidas = abertasNoPeriodo.filter((s) => s.assumidaEm !== null);
  const noPrazo = assumidas.filter(
    (s) => s.slaVenceEm === null || (s.assumidaEm as Date) <= s.slaVenceEm,
  );

  // Os tipos que aparecem nos dados (a empresa pode ter criado os seus)
  const tipos = [...new Set(solicitacoes.map((s) => s.tipo))];
  const porTipo = tipos
    .map((tipo) => ({
      tipo,
      total: abertasNoPeriodo.filter((s) => s.tipo === tipo).length,
    }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);

  const responsaveis = new Map<string, Indicadores['porResponsavel'][number]>();
  for (const s of solicitacoes) {
    if (!s.responsavel) continue;
    const linha = responsaveis.get(s.responsavel.id) ?? {
      id: s.responsavel.id,
      nome: s.responsavel.nome,
      emAberto: 0,
      resolvidasNoPeriodo: 0,
    };
    if (ehEmAberto(s.status)) linha.emAberto += 1;
    if (s.status === 'RESOLVIDO' && noPeriodo(s.resolvidoEm))
      linha.resolvidasNoPeriodo += 1;
    responsaveis.set(s.responsavel.id, linha);
  }

  // Um ponto por dia do período, inclusive os dias sem nada (zero também é dado)
  const fuso = expediente.fusoHorario;
  const porDia = new Map<string, { abertas: number; resolvidas: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    porDia.set(diaLocal(new Date(agora.getTime() - i * DIA), fuso), {
      abertas: 0,
      resolvidas: 0,
    });
  }
  for (const s of abertasNoPeriodo) {
    const dia = porDia.get(diaLocal(s.criadoEm, fuso));
    if (dia) dia.abertas += 1;
  }
  for (const s of resolvidasNoPeriodo) {
    const dia = porDia.get(diaLocal(s.resolvidoEm as Date, fuso));
    if (dia) dia.resolvidas += 1;
  }

  const causas = new Map<
    string,
    { total: number; detalhes: Map<string, number> }
  >();
  let resolvidasSemCausa = 0;
  for (const s of resolvidasNoPeriodo) {
    if (!s.causa) {
      resolvidasSemCausa += 1;
      continue;
    }
    const linha = causas.get(s.causa.nome) ?? {
      total: 0,
      detalhes: new Map<string, number>(),
    };
    linha.total += 1;
    if (s.causa.detalhe) {
      linha.detalhes.set(
        s.causa.detalhe,
        (linha.detalhes.get(s.causa.detalhe) ?? 0) + 1,
      );
    }
    causas.set(s.causa.nome, linha);
  }
  const maisPrimeiro = (
    a: { total: number; nome: string },
    b: { total: number; nome: string },
  ) => b.total - a.total || a.nome.localeCompare(b.nome);
  const porCausa = [...causas.entries()]
    .map(([nome, linha]) => ({ nome, ...linha }))
    .sort(maisPrimeiro)
    .map(({ nome, total, detalhes }) => ({
      causa: nome,
      total,
      detalhes: [...detalhes.entries()]
        .map(([detalhe, n]) => ({ nome: detalhe, total: n }))
        .sort(maisPrimeiro)
        .map(({ nome: detalhe, total: n }) => ({ detalhe, total: n })),
    }));

  const contar = (valores: string[]) => {
    const totais = new Map<string, number>();
    for (const v of valores) totais.set(v, (totais.get(v) ?? 0) + 1);
    return [...totais.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  };
  const porFilial = contar(
    abertasNoPeriodo.map((s) => s.filial ?? 'Sem filial'),
  ).map(([filial, total]) => ({ filial, total }));
  const porSolicitante = contar(
    abertasNoPeriodo.flatMap((s) => (s.solicitante ? [s.solicitante] : [])),
  )
    .slice(0, 8)
    .map(([nome, total]) => ({ nome, total }));
  const comCausa = resolvidasNoPeriodo.flatMap((s) =>
    s.causa ? [{ filial: s.filial ?? SEM_FILIAL, causa: s.causa.nome }] : [],
  );
  const errosPorFilial = contar(comCausa.map((e) => e.filial)).map(
    ([filial, total]) => ({
      filial,
      total,
      porCausa: contar(
        comCausa.filter((e) => e.filial === filial).map((e) => e.causa),
      ).map(([causa, n]) => ({ causa, total: n })),
    }),
  );
  const tempoAteResolverPorTipo = tipos
    .map((tipo) => {
      const daqui = resolvidasNoPeriodo.filter(
        (s) => s.tipo === tipo && !s.registroRapido,
      );
      return {
        tipo,
        resolvidas: daqui.length,
        minutos:
          media(
            daqui.map(
              (s) =>
                ((s.resolvidoEm as Date).getTime() - s.criadoEm.getTime()) /
                MINUTO,
            ),
          ) ?? 0,
      };
    })
    .filter((t) => t.resolvidas > 0)
    .sort((a, b) => b.minutos - a.minutos);

  return {
    periodo: { dias, de, ate: agora },
    agora: { abertas, porStatus, slaVencido, semResponsavel },
    noPeriodo: {
      abertas: abertasNoPeriodo.length,
      resolvidas: resolvidasNoPeriodo.length,
      canceladas: porStatus.CANCELADO,
      atendidas: assumidas.length,
      atendidasNoPrazo: noPrazo.length,
      percentualNoPrazo:
        assumidas.length === 0
          ? null
          : Math.round((noPrazo.length / assumidas.length) * 100),
      minutosMedioAteAssumir: media(
        assumidas.map(
          (s) =>
            ((s.assumidaEm as Date).getTime() - s.criadoEm.getTime()) / MINUTO,
        ),
      ),
      minutosMedioAteResolver: media(
        resolvidasNoPeriodo
          .filter((s) => !s.registroRapido)
          .map(
            (s) =>
              ((s.resolvidoEm as Date).getTime() - s.criadoEm.getTime()) /
              MINUTO,
          ),
      ),
      abertasComAlertaDeDuplicidade: abertasNoPeriodo.filter(
        (s) => s.abertaComAlertaDeDuplicidade,
      ).length,
      registrosRapidos: abertasNoPeriodo.filter((s) => s.registroRapido).length,
    },
    porTipo,
    porResponsavel: [...responsaveis.values()].sort(
      (a, b) =>
        b.emAberto +
          b.resolvidasNoPeriodo -
          (a.emAberto + a.resolvidasNoPeriodo) || a.nome.localeCompare(b.nome),
    ),
    porDia: [...porDia.entries()].map(([dia, n]) => ({ dia, ...n })),
    porCausa,
    resolvidasSemCausa,
    porFilial,
    porSolicitante,
    tempoAteResolverPorTipo,
    reversoes: contarReversoesPorCte(abertasNoPeriodo),
    errosPorFilial,
  };
}

/** Uma célula de CSV: aspas escapadas e fórmula neutralizada. */
export function celulaCsv(valor: string | number | null): string {
  if (valor === null) return '';
  let texto = String(valor);
  // Excel executa célula que começa com = + - @ como fórmula (CSV injection)
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/**
 * CSV no formato que o Excel em português abre direto: separador ";" e
 * BOM no início (sem ele, os acentos viram lixo).
 */
export function montarCsv(
  cabecalho: string[],
  linhas: (string | number | null)[][],
): string {
  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map(celulaCsv).join(';'))
    .join('\r\n');
  return `\uFEFF${corpo}\r\n`;
}
