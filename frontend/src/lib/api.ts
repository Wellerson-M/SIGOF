/**
 * Conversa com a API do SIGOF.
 *
 * As telas e a API ficam no mesmo endereço (a API em /api), então os
 * cookies de sessão vão sozinhos em cada pedido: o JavaScript da página
 * nunca vê nem guarda token nenhum.
 */

export type Perfil = 'SOLICITANTE' | 'ANALISTA' | 'SUPERVISOR' | 'ADMIN';

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  area: 'FINANCEIRO' | 'COMERCIAL' | 'OPERACIONAL' | null;
  /** Ainda com a senha provisória: precisa trocar antes de usar o sistema. */
  trocarSenha: boolean;
  empresa: { razaoSocial: string; slug: string };
}

/** Erro devolvido pela API, com a mensagem pronta para mostrar ao usuário. */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    /** Dados extras do erro (ex.: as solicitações duplicadas no 409). */
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }

  /** Sessão inválida de verdade (e não servidor fora do ar, por exemplo). */
  get semSessao(): boolean {
    return this.status === 401;
  }
}

const MENSAGEM_SEM_CONEXAO =
  'Não foi possível falar com o servidor. Confira sua conexão e tente de novo.';

async function chamar(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(`/api${caminho}`, {
      ...opcoes,
      credentials: 'same-origin',
      headers: {
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
        ...opcoes.headers,
      },
    });
  } catch {
    throw new ErroDaApi(0, 'SEM_CONEXAO', MENSAGEM_SEM_CONEXAO);
  }
}

async function erroDa(resposta: Response): Promise<ErroDaApi> {
  const corpo = (await resposta.json().catch(() => ({}))) as {
    erro?: string;
    codigo?: string;
    detalhes?: unknown;
  };
  return new ErroDaApi(
    resposta.status,
    corpo.codigo ?? 'ERRO',
    corpo.erro ?? 'Algo deu errado. Tente de novo em instantes.',
    corpo.detalhes,
  );
}

/**
 * Renovação em andamento, compartilhada: se vários pedidos da tela
 * descobrem juntos que o token venceu, só um "renovar" vai à API e todos
 * esperam por ele. Devolve o erro da renovação, ou null se deu certo.
 */
let renovacaoEmAndamento: Promise<ErroDaApi | null> | null = null;

function renovarSessao(): Promise<ErroDaApi | null> {
  renovacaoEmAndamento ??= chamar('/auth/renovar', { method: 'POST' })
    .then(async (resposta) => (resposta.ok ? null : await erroDa(resposta)))
    .catch((erro: unknown) =>
      erro instanceof ErroDaApi
        ? erro
        : new ErroDaApi(0, 'SEM_CONEXAO', MENSAGEM_SEM_CONEXAO),
    )
    .finally(() => {
      renovacaoEmAndamento = null;
    });
  return renovacaoEmAndamento;
}

/**
 * Faz o pedido; se a sessão de 15 minutos venceu (401), renova com o cookie
 * de sessão e repete. Se a renovação for recusada (401), o usuário precisa
 * entrar de novo; se falhar por outro motivo (servidor fora do ar), o erro
 * é esse, e não "sessão expirada".
 */
export async function pedir<T>(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<T> {
  let resposta = await chamar(caminho, opcoes);

  if (resposta.status === 401) {
    const erroNaRenovacao = await renovarSessao();
    if (erroNaRenovacao && erroNaRenovacao.status !== 401) {
      throw erroNaRenovacao;
    }
    if (!erroNaRenovacao) {
      resposta = await chamar(caminho, opcoes);
    }
  }

  if (!resposta.ok) {
    throw await erroDa(resposta);
  }

  return (resposta.status === 204 ? undefined : await resposta.json()) as T;
}

export async function entrar(
  empresa: string,
  email: string,
  senha: string,
): Promise<void> {
  const resposta = await chamar('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ empresa, email, senha }),
  });
  if (!resposta.ok) {
    throw await erroDa(resposta);
  }
}

export function sair(): Promise<void> {
  return pedir<void>('/auth/sair', { method: 'POST' });
}

export function usuarioLogado(): Promise<UsuarioLogado> {
  return pedir<UsuarioLogado>('/auth/eu');
}

export const NOME_DO_PERFIL: Record<Perfil, string> = {
  SOLICITANTE: 'Solicitante',
  ANALISTA: 'Analista',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrador',
};
