/**
 * Cadastros que cada empresa monta do seu jeito (filiais, causas de erro).
 * Todos leem os ativos; só o administrador cria e altera.
 */
import { pedir } from './api';

export interface Filial {
  id: string;
  nome: string;
  ativa: boolean;
}

/** De quem foi o erro (controle interno; o solicitante não vê). */
export interface CausaDeErro {
  id: string;
  nome: string;
  /** Escolhas do "qual" (ex.: os digitadores). Vazio: sem detalhe. */
  opcoes: string[];
  rotuloDasOpcoes: string | null;
  ordem: number;
  ativa: boolean;
}

export interface DadosDaCausa {
  nome?: string;
  opcoes?: string[];
  rotuloDasOpcoes?: string | null;
  ordem?: number;
  ativa?: boolean;
}

/** Código do tipo (um dos do sistema ou um criado pela empresa). */
export type TipoDeOcorrencia = string;
export type QuemMarca = 'SOLICITANTE' | 'EQUIPE' | 'QUALQUER';

/** Item que a empresa pede para marcar (ex.: "Desacordo fiscal feito"). */
export interface ItemDeVerificacao {
  id: string;
  texto: string;
  /** Vazio: vale para todos os tipos. */
  tipos: TipoDeOcorrencia[];
  quemMarca: QuemMarca;
  obrigatorioParaResolver: boolean;
  ordem: number;
  ativo: boolean;
}

export type DadosDaVerificacao = Partial<Omit<ItemDeVerificacao, 'id'>>;

export const NOME_DE_QUEM_MARCA: Record<QuemMarca, string> = {
  SOLICITANTE: 'Quem abriu',
  EQUIPE: 'A equipe',
  QUALQUER: 'Qualquer um',
};

/** O item aparece para este tipo e este perfil pode marcá-lo. */
export function marcaNaAbertura(
  item: ItemDeVerificacao,
  tipo: TipoDeOcorrencia,
  perfil: 'SOLICITANTE' | 'ANALISTA' | 'SUPERVISOR' | 'ADMIN',
): boolean {
  const doTipo = item.tipos.length === 0 || item.tipos.includes(tipo);
  const doPerfil =
    perfil !== 'ADMIN' &&
    (item.quemMarca === 'QUALQUER' ||
      (item.quemMarca === 'SOLICITANTE') === (perfil === 'SOLICITANTE'));
  return item.ativo && doTipo && doPerfil;
}

const json = (corpo: unknown) => ({ body: JSON.stringify(corpo) });

export const cadastros = {
  filiais: (todas = false) =>
    pedir<Filial[]>(`/cadastros/filiais${todas ? '?todas=1' : ''}`),
  criarFilial: (nome: string) =>
    pedir<Filial>('/cadastros/filiais', { method: 'POST', ...json({ nome }) }),
  alterarFilial: (id: string, alteracao: { nome?: string; ativa?: boolean }) =>
    pedir<Filial>(`/cadastros/filiais/${id}`, {
      method: 'PATCH',
      ...json(alteracao),
    }),
  verificacoes: (todas = false) =>
    pedir<ItemDeVerificacao[]>(
      `/cadastros/verificacoes${todas ? '?todas=1' : ''}`,
    ),
  criarVerificacao: (dados: DadosDaVerificacao & { texto: string }) =>
    pedir<ItemDeVerificacao>('/cadastros/verificacoes', {
      method: 'POST',
      ...json(dados),
    }),
  alterarVerificacao: (id: string, alteracao: DadosDaVerificacao) =>
    pedir<ItemDeVerificacao>(`/cadastros/verificacoes/${id}`, {
      method: 'PATCH',
      ...json(alteracao),
    }),
  causas: (todas = false) =>
    pedir<CausaDeErro[]>(`/cadastros/causas${todas ? '?todas=1' : ''}`),
  criarCausa: (dados: DadosDaCausa & { nome: string }) =>
    pedir<CausaDeErro>('/cadastros/causas', {
      method: 'POST',
      ...json(dados),
    }),
  alterarCausa: (id: string, alteracao: DadosDaCausa) =>
    pedir<CausaDeErro>(`/cadastros/causas/${id}`, {
      method: 'PATCH',
      ...json(alteracao),
    }),
};

/**
 * SHA-256 do arquivo, em hexadecimal, calculado no navegador. Só serve
 * para o alerta de "este arquivo já foi enviado"; sem Web Crypto (página
 * fora de HTTPS), não há alerta, e a abertura segue normalmente.
 */
export async function hashDoArquivo(arquivo: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const resumo = await subtle.digest(
      'SHA-256',
      new Uint8Array(await arquivo.arrayBuffer()),
    );
    return [...new Uint8Array(resumo)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}
