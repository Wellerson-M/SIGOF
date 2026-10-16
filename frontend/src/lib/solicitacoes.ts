/**
 * Solicitações: tipos, chamadas à API e os rótulos mostrados nas telas.
 *
 * Quem pode fazer o quê vem pronto da API (`acoes` e `pode`): a tela só
 * mostra o que o servidor vai aceitar, e o servidor confere de novo.
 */
import { ErroDaApi, pedir } from './api';

export type Status =
  | 'NOVO'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_DOC'
  | 'ESCALADO'
  | 'RESOLVIDO'
  | 'CANCELADO';
export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type Tipo = 'REVERSAO' | 'TROCA_PAGADOR' | 'AJUSTE_FISCAL' | 'OUTRO';
export type SituacaoDoSla =
  'NO_PRAZO' | 'ATENCAO' | 'VENCIDO' | 'PAUSADO' | 'ENCERRADO';

export interface Pessoa {
  id: string;
  nome: string;
}

export interface Resumo {
  id: string;
  protocolo: string;
  tipo: Tipo;
  cte: string | null;
  nf: string | null;
  descricao: string;
  status: Status;
  prioridade: Prioridade;
  solicitante: Pessoa;
  responsavel: Pessoa | null;
  criadoEm: string;
  atualizadoEm: string;
  slaVenceEm: string | null;
  sla: { situacao: SituacaoDoSla; minutosRestantes: number | null };
  acoes: Status[];
}

export interface Mensagem {
  id: string;
  conteudo: string;
  interna: boolean;
  autor: Pessoa;
  criadoEm: string;
}

export interface Evento {
  id: string;
  statusAnterior: Status | null;
  statusNovo: Status;
  observacao: string | null;
  autor: Pessoa;
  criadoEm: string;
}

export interface Detalhe extends Resumo {
  pagadorCorreto: string | null;
  resolvidoEm: string | null;
  historico: Evento[];
  mensagens: Mensagem[];
  pode: {
    mudarPrioridade: boolean;
    atribuir: boolean;
    comentarInterno: boolean;
  };
}

export interface Duplicidade {
  id: string;
  protocolo: string;
  status: Status;
  criadoEm: string;
  documento: 'CTE' | 'NF';
  valor: string;
}

export interface DadosDeAbertura {
  tipo: Tipo;
  cte?: string;
  nf?: string;
  pagadorCorreto?: string;
  descricao: string;
  prioridade: Prioridade;
  confirmarDuplicidade?: boolean;
}

const json = (corpo: unknown) => ({ body: JSON.stringify(corpo) });

export const api = {
  listar: (busca?: string) =>
    pedir<Resumo[]>(
      `/solicitacoes${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`,
    ),
  detalhar: (id: string) => pedir<Detalhe>(`/solicitacoes/${id}`),
  abrir: (dados: DadosDeAbertura) =>
    pedir<Resumo>('/solicitacoes', { method: 'POST', ...json(dados) }),
  mover: (id: string, status: Status, observacao?: string) =>
    pedir<Resumo>(`/solicitacoes/${id}/status`, {
      method: 'POST',
      ...json({ status, observacao }),
    }),
  priorizar: (id: string, prioridade: Prioridade) =>
    pedir<Resumo>(`/solicitacoes/${id}/prioridade`, {
      method: 'PATCH',
      ...json({ prioridade }),
    }),
  atribuir: (id: string, responsavelId: string) =>
    pedir<Resumo>(`/solicitacoes/${id}/atribuir`, {
      method: 'POST',
      ...json({ responsavelId }),
    }),
  comentar: (id: string, conteudo: string, interna: boolean) =>
    pedir<Mensagem>(`/solicitacoes/${id}/mensagens`, {
      method: 'POST',
      ...json({ conteudo, interna }),
    }),
  responsaveis: () => pedir<Pessoa[]>('/solicitacoes/responsaveis'),
};

/** Colunas do quadro, na ordem do fluxo. */
export const COLUNAS: Status[] = [
  'NOVO',
  'EM_ANDAMENTO',
  'AGUARDANDO_DOC',
  'ESCALADO',
  'RESOLVIDO',
  'CANCELADO',
];

export const NOME_DO_STATUS: Record<Status, string> = {
  NOVO: 'Novo',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_DOC: 'Aguardando documento',
  ESCALADO: 'Escalado',
  RESOLVIDO: 'Resolvido',
  CANCELADO: 'Cancelado',
};

/** O verbo do botão: o que acontece ao mover para aquele status. */
export const ACAO_PARA: Record<Status, string> = {
  NOVO: 'Voltar para novo',
  EM_ANDAMENTO: 'Assumir / retomar',
  AGUARDANDO_DOC: 'Aguardar documento',
  ESCALADO: 'Escalar',
  RESOLVIDO: 'Resolver',
  CANCELADO: 'Cancelar',
};

/** Movimentos que pedem uma observação (a API recusa sem ela). */
export const PEDE_OBSERVACAO: Partial<Record<Status, string>> = {
  AGUARDANDO_DOC: 'Qual documento está faltando?',
  ESCALADO: 'Por que está escalando?',
  RESOLVIDO: 'O que foi feito para resolver?',
  CANCELADO: 'Por que está cancelando?',
};

export const NOME_DA_PRIORIDADE: Record<Prioridade, string> = {
  URGENTE: 'Urgente',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

export const PRIORIDADES: Prioridade[] = ['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'];

export const NOME_DO_TIPO: Record<Tipo, string> = {
  REVERSAO: 'Reversão',
  TROCA_PAGADOR: 'Troca de pagador',
  AJUSTE_FISCAL: 'Ajuste fiscal',
  OUTRO: 'Outro',
};

export const TIPOS: Tipo[] = [
  'REVERSAO',
  'TROCA_PAGADOR',
  'AJUSTE_FISCAL',
  'OUTRO',
];

/** Classes de cor (tokens do tema) de cada prioridade. */
export const COR_DA_PRIORIDADE: Record<Prioridade, string> = {
  URGENTE: 'bg-critico text-white',
  ALTA: 'bg-atencao text-white',
  MEDIA: 'bg-primaria/15 text-primaria',
  BAIXA: 'bg-fundo text-texto-suave',
};

export const COR_DO_SLA: Record<SituacaoDoSla, string> = {
  NO_PRAZO: 'text-ok',
  ATENCAO: 'text-atencao',
  VENCIDO: 'text-critico',
  PAUSADO: 'text-pausado',
  ENCERRADO: 'text-texto-suave',
};

/** "2h 15min úteis", "vencido", "pausado"... */
export function textoDoSla(sla: Resumo['sla']): string {
  switch (sla.situacao) {
    case 'VENCIDO':
      return 'SLA vencido';
    case 'PAUSADO':
      return 'SLA pausado';
    case 'ENCERRADO':
      return 'Encerrada';
    default: {
      const minutos = sla.minutosRestantes ?? 0;
      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;
      const tempo =
        horas > 0
          ? `${horas}h${resto > 0 ? ` ${resto}min` : ''}`
          : `${resto}min`;
      return `Vence em ${tempo} úteis`;
    }
  }
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function dataCurta(iso: string): string {
  return FORMATO_DATA.format(new Date(iso));
}

/** "CTe 12345 · NF 998877" */
export function documentos(s: Pick<Resumo, 'cte' | 'nf'>): string {
  return [s.cte && `CTe ${s.cte}`, s.nf && `NF ${s.nf}`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Mensagem pronta para mostrar. No 400, a API diz campo a campo o que está
 * errado: isso é mais útil do que "Dados inválidos".
 */
export function mensagemDoErro(erro: unknown): string {
  if (!(erro instanceof ErroDaApi)) {
    return 'Algo deu errado. Tente de novo em instantes.';
  }
  if (erro.status === 400 && Array.isArray(erro.detalhes)) {
    const motivos = (erro.detalhes as { mensagem?: unknown }[])
      .map((d) => d.mensagem)
      .filter((m): m is string => typeof m === 'string');
    if (motivos.length > 0) return motivos.join('. ');
  }
  return erro.message;
}
