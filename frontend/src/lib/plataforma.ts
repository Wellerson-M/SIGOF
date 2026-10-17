/**
 * Conversa com a API da plataforma (/api/plataforma). Separada de `api.ts`
 * de propósito: a sessão aqui é outra (outro cookie, sem renovação), e um
 * 401 significa entrar de novo na tela da plataforma.
 */
import { ErroDaApi } from './api';

export interface AdministradorDaPlataforma {
  id: string;
  nome: string;
  email: string;
  trocarSenha: boolean;
}

export interface EmpresaNaPlataforma {
  id: string;
  razaoSocial: string;
  cnpj: string;
  slug: string;
  ativa: boolean;
  criadoEm: string;
  usuariosAtivos: number;
  solicitacoesEmAberto: number;
  solicitacoesNoMes: number;
  ultimoAcessoEm: string | null;
}

export interface NovaEmpresa {
  razaoSocial: string;
  cnpj: string;
  slug: string;
  administrador: { nome: string; email: string };
}

export interface EventoDaPlataforma {
  id: string;
  acao: string;
  empresaId: string | null;
  detalhes: unknown;
  ip: string | null;
  criadoEm: string;
  administrador: { id: string; nome: string } | null;
}

async function chamar<T>(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/plataforma${caminho}`, {
      ...opcoes,
      credentials: 'same-origin',
      headers:
        typeof opcoes.body === 'string'
          ? { 'Content-Type': 'application/json' }
          : {},
    });
  } catch {
    throw new ErroDaApi(
      0,
      'SEM_CONEXAO',
      'Não foi possível falar com o servidor. Confira sua conexão.',
    );
  }
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => ({}))) as {
      erro?: string;
      codigo?: string;
      detalhes?: unknown;
    };
    throw new ErroDaApi(
      resposta.status,
      corpo.codigo ?? 'ERRO',
      corpo.erro ?? 'Algo deu errado. Tente de novo em instantes.',
      corpo.detalhes,
    );
  }
  return (resposta.status === 204 ? undefined : await resposta.json()) as T;
}

const json = (corpo: unknown) => ({ body: JSON.stringify(corpo) });

export const plataforma = {
  entrar: (email: string, senha: string) =>
    chamar<void>('/entrar', { method: 'POST', ...json({ email, senha }) }),
  sair: () => chamar<void>('/sair', { method: 'POST' }),
  eu: () => chamar<AdministradorDaPlataforma>('/eu'),
  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    chamar<void>('/senha', {
      method: 'POST',
      ...json({ senhaAtual, novaSenha }),
    }),
  empresas: () => chamar<EmpresaNaPlataforma[]>('/empresas'),
  criarEmpresa: (dados: NovaEmpresa) =>
    chamar<{ empresa: EmpresaNaPlataforma; senhaProvisoria: string }>(
      '/empresas',
      { method: 'POST', ...json(dados) },
    ),
  alterarEmpresa: (
    id: string,
    alteracao: { ativa?: boolean; razaoSocial?: string },
  ) =>
    chamar<EmpresaNaPlataforma>(`/empresas/${id}`, {
      method: 'PATCH',
      ...json(alteracao),
    }),
  criarAdministrador: (empresaId: string, nome: string, email: string) =>
    chamar<{ email: string; senhaProvisoria: string }>(
      `/empresas/${empresaId}/administradores`,
      { method: 'POST', ...json({ nome, email }) },
    ),
  eventos: (pagina = 1) =>
    chamar<{ eventos: EventoDaPlataforma[]; total: number; pagina: number }>(
      `/eventos?pagina=${pagina}`,
    ),
};

/** "Transportadora Sul Ltda." → "transportadora-sul" (código do login). */
export function sugerirCodigo(razaoSocial: string): string {
  return razaoSocial
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|s\/?a|eireli|me|epp)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const NOME_DO_EVENTO: Record<string, string> = {
  ENTROU: 'Entrou',
  ENTRADA_RECUSADA: 'Entrada recusada',
  SENHA_ALTERADA: 'Trocou a senha',
  EMPRESA_CRIADA: 'Transportadora criada',
  EMPRESA_ALTERADA: 'Transportadora alterada',
  ADMIN_DA_EMPRESA_CRIADO: 'Administrador da empresa criado',
};
