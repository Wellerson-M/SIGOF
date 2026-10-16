/**
 * Avisos: notificações dentro do sistema (o sino) e a configuração do
 * e-mail de envio da empresa.
 */
import { pedir } from './api';

export interface Notificacao {
  id: string;
  mensagem: string;
  lida: boolean;
  solicitacaoId: string;
  criadoEm: string;
}

export interface ListaDeNotificacoes {
  naoLidas: number;
  itens: Notificacao[];
}

export interface ConfiguracaoDeEmail {
  ativo: boolean;
  servidor: string | null;
  porta: number | null;
  tlsDireto: boolean;
  usuario: string | null;
  temSenha: boolean;
  nomeDoRemetente: string | null;
  /** Recebem cópia de tudo (registro e backup). */
  caixasCentrais: string[];
}

export interface AlteracaoDeEmail {
  ativo?: boolean;
  servidor?: string | null;
  porta?: number | null;
  tlsDireto?: boolean;
  usuario?: string | null;
  senha?: string;
  nomeDoRemetente?: string | null;
  caixasCentrais?: string[];
}

export type SituacaoDoEmail = 'PENDENTE' | 'ENVIADO' | 'FALHOU';

export interface EnvioRegistrado {
  id: string;
  assunto: string;
  para: string[];
  situacao: SituacaoDoEmail;
  tentativas: number;
  ultimoErro: string | null;
  enviadoEm: string | null;
  criadoEm: string;
  protocolo: string | null;
}

export const ENVIOS_POR_PAGINA = 30;

const json = (metodo: string, corpo: unknown) => ({
  method: metodo,
  body: JSON.stringify(corpo),
});

export const notificacoes = {
  listar: () => pedir<ListaDeNotificacoes>('/notificacoes'),
  marcarLidas: (filtro: { ids?: string[]; solicitacaoId?: string } = {}) =>
    pedir<{ naoLidas: number }>('/notificacoes/lidas', json('POST', filtro)),
};

export const email = {
  obter: () => pedir<ConfiguracaoDeEmail>('/admin/email'),
  alterar: (alteracao: AlteracaoDeEmail) =>
    pedir<ConfiguracaoDeEmail>('/admin/email', json('PATCH', alteracao)),
  testar: (para?: string) =>
    pedir<{ enviadoPara: string }>(
      '/admin/email/teste',
      json('POST', para ? { para } : {}),
    ),
  envios: (pagina = 1) =>
    pedir<{ envios: EnvioRegistrado[]; total: number; pagina: number }>(
      `/admin/email/envios?pagina=${pagina}`,
    ),
};

/** Preenche os campos com os dados do Gmail (envio com senha de app). */
export const GMAIL = {
  servidor: 'smtp.gmail.com',
  porta: 465,
  tlsDireto: true,
} as const;

export const NOME_DA_SITUACAO: Record<SituacaoDoEmail, string> = {
  PENDENTE: 'Na fila',
  ENVIADO: 'Enviado',
  FALHOU: 'Falhou',
};

export const COR_DA_SITUACAO: Record<SituacaoDoEmail, string> = {
  PENDENTE: 'text-atencao',
  ENVIADO: 'text-ok',
  FALHOU: 'text-critico',
};

/** "agora", "há 5 min", "há 2 h", "há 3 dias". */
export function haQuantoTempo(iso: string, agora = new Date()): string {
  const minutos = Math.floor(
    (agora.getTime() - new Date(iso).getTime()) / 60_000,
  );
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}
