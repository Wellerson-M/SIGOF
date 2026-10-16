/**
 * Administração da empresa: funcionários, parâmetros de atendimento e
 * trilha de auditoria. Só o perfil Administrador chega a estas telas, e a
 * API confere de novo em cada pedido.
 */
import { pedir, type Perfil } from './api';

export type Area = 'FINANCEIRO' | 'COMERCIAL' | 'OPERACIONAL';

export interface UsuarioDaEmpresa {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  area: Area | null;
  ativo: boolean;
  trocarSenha: boolean;
  bloqueado: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
}

export interface DadosDeUsuario {
  nome: string;
  email: string;
  perfil: Perfil;
  area: Area | null;
}

export interface ComSenhaProvisoria {
  usuario: UsuarioDaEmpresa;
  senhaProvisoria: string;
}

export interface ParametrosDaEmpresa {
  razaoSocial: string;
  cnpj: string;
  slug: string;
  fusoHorario: string;
  expedienteInicioMinuto: number;
  expedienteFimMinuto: number;
  diasUteis: number[];
  slaAtendimentoMinutos: number;
  janelaDuplicidadeDias: number;
  /** Ao resolver, a causa do erro (controle interno) é obrigatória. */
  exigirCausaAoResolver: boolean;
}

export type AcaoDeAuditoria =
  | 'LOGIN'
  | 'LOGIN_RECUSADO'
  | 'SAIDA'
  | 'SENHA_ALTERADA'
  | 'USUARIO_CRIADO'
  | 'USUARIO_ALTERADO'
  | 'SENHA_REDEFINIDA'
  | 'EMPRESA_ALTERADA'
  | 'EMAIL_CONFIGURADO'
  | 'CADASTRO_ALTERADO';

export interface FiltrosDaTrilha {
  acoes?: AcaoDeAuditoria[];
  usuarioId?: string;
  de?: string;
  ate?: string;
}

export interface EventoDaTrilha {
  id: string;
  acao: AcaoDeAuditoria;
  autor: { id: string; nome: string } | null;
  alvo: { id: string; nome: string } | null;
  detalhes: unknown;
  ip: string | null;
  criadoEm: string;
}

export interface PaginaDaTrilha {
  eventos: EventoDaTrilha[];
  total: number;
  pagina: number;
}

export const EVENTOS_POR_PAGINA = 50;

const json = (metodo: string, corpo: unknown) => ({
  method: metodo,
  body: JSON.stringify(corpo),
});

export const admin = {
  usuarios: () => pedir<UsuarioDaEmpresa[]>('/admin/usuarios'),
  criarUsuario: (dados: DadosDeUsuario) =>
    pedir<ComSenhaProvisoria>('/admin/usuarios', json('POST', dados)),
  alterarUsuario: (
    id: string,
    alteracao: Partial<DadosDeUsuario & { ativo: boolean }>,
  ) =>
    pedir<UsuarioDaEmpresa>(`/admin/usuarios/${id}`, json('PATCH', alteracao)),
  redefinirSenha: (id: string) =>
    pedir<ComSenhaProvisoria>(`/admin/usuarios/${id}/redefinir-senha`, {
      method: 'POST',
    }),
  empresa: () => pedir<ParametrosDaEmpresa>('/admin/empresa'),
  alterarEmpresa: (
    alteracao: Partial<Omit<ParametrosDaEmpresa, 'cnpj' | 'slug'>>,
  ) => pedir<ParametrosDaEmpresa>('/admin/empresa', json('PATCH', alteracao)),
  auditoria: (pagina: number, filtros: FiltrosDaTrilha = {}) => {
    const consulta = new URLSearchParams({ pagina: String(pagina) });
    if (filtros.acoes?.length) consulta.set('acao', filtros.acoes.join(','));
    if (filtros.usuarioId) consulta.set('usuarioId', filtros.usuarioId);
    if (filtros.de) consulta.set('de', filtros.de);
    if (filtros.ate) consulta.set('ate', filtros.ate);
    return pedir<PaginaDaTrilha>(`/admin/auditoria?${consulta.toString()}`);
  },
};

export function trocarMinhaSenha(senhaAtual: string, novaSenha: string) {
  return pedir<void>('/auth/senha', json('POST', { senhaAtual, novaSenha }));
}

export const NOME_DA_AREA: Record<Area, string> = {
  FINANCEIRO: 'Financeiro',
  COMERCIAL: 'Comercial',
  OPERACIONAL: 'Operacional',
};

export const AREAS: Area[] = ['FINANCEIRO', 'COMERCIAL', 'OPERACIONAL'];

export const PERFIS: Perfil[] = [
  'SOLICITANTE',
  'ANALISTA',
  'SUPERVISOR',
  'ADMIN',
];

/** O que cada perfil faz, para o administrador escolher sem adivinhar. */
export const O_QUE_O_PERFIL_FAZ: Record<Perfil, string> = {
  SOLICITANTE: 'Abre solicitações e acompanha as que abriu.',
  ANALISTA: 'Atende a fila: assume, prioriza, conversa e resolve.',
  SUPERVISOR: 'Tudo do analista, mais reatribuir e retomar escalonadas.',
  ADMIN: 'Cuida dos usuários e dos parâmetros da empresa.',
};

export const NOME_DA_ACAO: Record<AcaoDeAuditoria, string> = {
  LOGIN: 'Entrou',
  LOGIN_RECUSADO: 'Login recusado',
  SAIDA: 'Saiu',
  SENHA_ALTERADA: 'Trocou a senha',
  USUARIO_CRIADO: 'Usuário criado',
  USUARIO_ALTERADO: 'Usuário alterado',
  SENHA_REDEFINIDA: 'Senha redefinida',
  EMPRESA_ALTERADA: 'Parâmetros alterados',
  EMAIL_CONFIGURADO: 'E-mail configurado',
  CADASTRO_ALTERADO: 'Cadastro alterado',
};

/** Grupos do filtro da auditoria: o que o administrador costuma procurar. */
export const GRUPOS_DE_ACAO: { rotulo: string; acoes: AcaoDeAuditoria[] }[] = [
  { rotulo: 'Entradas e saídas', acoes: ['LOGIN', 'SAIDA'] },
  { rotulo: 'Logins recusados', acoes: ['LOGIN_RECUSADO'] },
  {
    rotulo: 'Usuários e senhas',
    acoes: [
      'USUARIO_CRIADO',
      'USUARIO_ALTERADO',
      'SENHA_REDEFINIDA',
      'SENHA_ALTERADA',
    ],
  },
  {
    rotulo: 'Configurações',
    acoes: ['EMPRESA_ALTERADA', 'EMAIL_CONFIGURADO', 'CADASTRO_ALTERADO'],
  },
];

export const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Fusos do Brasil (IANA). */
export const FUSOS: { valor: string; nome: string }[] = [
  {
    valor: 'America/Sao_Paulo',
    nome: 'Brasília (SP, RJ, MG, Sul, GO, DF, BA…)',
  },
  { valor: 'America/Manaus', nome: 'Amazonas, RO, RR, MT, MS (−1h)' },
  { valor: 'America/Rio_Branco', nome: 'Acre (−2h)' },
  { valor: 'America/Noronha', nome: 'Fernando de Noronha (+1h)' },
  { valor: 'America/Belem', nome: 'Pará, Amapá (Brasília)' },
  { valor: 'America/Fortaleza', nome: 'Nordeste (Brasília)' },
];

/** 480 → "08:00" */
export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "08:30" → 510 */
export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Uma linha legível sobre o que mudou num evento de auditoria. */
export function resumoDosDetalhes(detalhes: unknown): string {
  if (!detalhes || typeof detalhes !== 'object') return '';
  const registro = detalhes as Record<string, unknown>;
  if (typeof registro.motivo === 'string') return registro.motivo;

  return Object.entries(registro)
    .map(([campo, valor]) => {
      if (valor && typeof valor === 'object' && 'para' in valor) {
        const { de, para } = valor as { de: unknown; para: unknown };
        return `${campo}: ${texto(de)} → ${texto(para)}`;
      }
      return `${campo}: ${texto(valor)}`;
    })
    .join(' · ');
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (Array.isArray(valor)) return valor.join(', ');
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  return String(valor);
}
