/**
 * O formulário de abertura de cada tipo de ocorrência, do jeito que a
 * empresa configurou: que campos aparecem, quais são obrigatórios, o que
 * já vem preenchido e quais motivos o solicitante escolhe.
 *
 * O padrão abaixo reproduz as regras que valiam antes de a empresa poder
 * configurar; o que a empresa salva é aplicado por cima dele, campo a
 * campo. Assim, um campo novo que o sistema ganhar no futuro aparece com o
 * comportamento padrão sem quebrar as configurações já salvas.
 */

/**
 * Código do tipo: um dos quatro do sistema ou um criado pela empresa. O
 * código não muda quando o tipo é renomeado (é o que fica gravado).
 */
export type TipoOcorrencia = string;

export const TIPOS_DO_SISTEMA = [
  'REVERSAO',
  'TROCA_PAGADOR',
  'AJUSTE_FISCAL',
  'OUTRO',
] as const;

export type TipoDoSistema = (typeof TIPOS_DO_SISTEMA)[number];

export const NOME_DO_TIPO_DO_SISTEMA: Record<TipoDoSistema, string> = {
  REVERSAO: 'Reversão',
  TROCA_PAGADOR: 'Troca de pagador',
  AJUSTE_FISCAL: 'Ajuste fiscal',
  OUTRO: 'Outro',
};

export function ehDoSistema(tipo: string): tipo is TipoDoSistema {
  return (TIPOS_DO_SISTEMA as readonly string[]).includes(tipo);
}

/** O nome do tipo: o que a empresa deu, o do sistema ou, por fim, o código. */
export function nomeDoTipo(
  tipo: string,
  nomes?: ReadonlyMap<string, string>,
): string {
  return (
    nomes?.get(tipo) ??
    (ehDoSistema(tipo) ? NOME_DO_TIPO_DO_SISTEMA[tipo] : tipo)
  );
}

/**
 * Código para um tipo novo, tirado do nome: "Cobrança em duplicidade" vira
 * COBRANCA_EM_DUPLICIDADE (com _2, _3... se já existir).
 */
export function codigoParaTipo(nome: string, usados: Iterable<string>): string {
  const base =
    nome
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      // Palavras unidas por um _ só (sem _ no começo nem no fim)
      .split(/[^A-Z0-9]/)
      .filter(Boolean)
      .join('_')
      .slice(0, 36)
      .replace(/_$/, '') || 'TIPO';
  const ocupados = new Set([...TIPOS_DO_SISTEMA, ...usados]);
  let n = 1;
  let codigo = base;
  while (ocupados.has(codigo)) {
    n += 1;
    codigo = `${base}_${n}`;
  }
  return codigo;
}

export type Modo = 'OCULTO' | 'OPCIONAL' | 'OBRIGATORIO';

export const CAMPOS = [
  'cte',
  'nf',
  'fatura',
  'filial',
  'pagadorCorreto',
  'motivo',
  'prioridade',
  'descricao',
  'anexos',
] as const;

export type NomeDoCampo = (typeof CAMPOS)[number];

export interface Campo {
  modo: Modo;
  /** Valor que já vem preenchido (o solicitante pode trocar, se o campo aparecer). */
  padrao?: string | undefined;
}

export interface ConfiguracaoDoTipo {
  tipo: TipoOcorrencia;
  /** Como aparece nas telas (a empresa pode renomear). */
  nome: string;
  /** Um dos quatro do sistema (volta ao padrão; não é excluído). */
  doSistema: boolean;
  /** Desligado, o tipo some do formulário (as antigas continuam valendo). */
  ativo: boolean;
  /** Pelo menos um entre CTe, NF e fatura. */
  exigirDocumento: boolean;
  campos: Record<NomeDoCampo, Campo>;
  /** As escolhas do campo "Motivo" (ex.: os motivos da reversão). */
  motivos: string[];
}

export const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const;

/** Campos que não fazem sentido escondidos (sem eles, não há solicitação). */
const NUNCA_OCULTOS: readonly NomeDoCampo[] = ['descricao'];

function campos(
  mudancas: Partial<Record<NomeDoCampo, Campo>>,
): Record<NomeDoCampo, Campo> {
  return {
    cte: { modo: 'OPCIONAL' },
    nf: { modo: 'OPCIONAL' },
    fatura: { modo: 'OPCIONAL' },
    // Opcional, com aviso na tela se ficar em branco: sem a filial, a
    // duplicidade não sabe se dois CTe de mesmo número são o mesmo
    filial: { modo: 'OPCIONAL' },
    pagadorCorreto: { modo: 'OCULTO' },
    motivo: { modo: 'OCULTO' },
    prioridade: { modo: 'OPCIONAL', padrao: 'MEDIA' },
    descricao: { modo: 'OBRIGATORIO' },
    anexos: { modo: 'OPCIONAL' },
    ...mudancas,
  };
}

/** Como cada tipo começa. A empresa altera o que quiser na Administração. */
export function configuracaoPadrao(tipo: TipoOcorrencia): ConfiguracaoDoTipo {
  return {
    ...regrasPadrao(tipo),
    nome: nomeDoTipo(tipo),
    doSistema: ehDoSistema(tipo),
  };
}

function regrasPadrao(
  tipo: TipoOcorrencia,
): Omit<ConfiguracaoDoTipo, 'nome' | 'doSistema'> {
  switch (tipo) {
    case 'REVERSAO':
      return {
        tipo,
        ativo: true,
        exigirDocumento: true,
        campos: campos({ motivo: { modo: 'OPCIONAL' } }),
        motivos: [
          'Erro de emissão',
          'Desacordo do tomador',
          'Mercadoria devolvida',
          'Frete não realizado',
          'Outro',
        ],
      };
    case 'TROCA_PAGADOR':
      return {
        tipo,
        ativo: true,
        exigirDocumento: true,
        campos: campos({ pagadorCorreto: { modo: 'OBRIGATORIO' } }),
        motivos: [],
      };
    case 'OUTRO':
      return {
        tipo,
        ativo: true,
        exigirDocumento: false,
        campos: campos({}),
        motivos: [],
      };
    default:
      // Ajuste fiscal e os tipos criados pela empresa: o formulário comum
      return {
        tipo,
        ativo: true,
        exigirDocumento: true,
        campos: campos({}),
        motivos: [],
      };
  }
}

/** O que fica gravado no banco: só o que a empresa definiu. */
export interface ConfiguracaoSalva {
  nome?: string | null | undefined;
  ativo: boolean;
  exigirDocumento: boolean | null;
  campos: unknown;
  motivos: string[];
}

function ehModo(valor: unknown): valor is Modo {
  return valor === 'OCULTO' || valor === 'OPCIONAL' || valor === 'OBRIGATORIO';
}

/**
 * Junta o salvo com o padrão. Qualquer coisa estranha no JSON gravado é
 * ignorada e fica o padrão: o formulário nunca quebra por causa disso.
 */
export function mesclarConfiguracao(
  tipo: TipoOcorrencia,
  salva: ConfiguracaoSalva | null,
): ConfiguracaoDoTipo {
  const padrao = configuracaoPadrao(tipo);
  if (!salva) return padrao;

  const gravados =
    salva.campos && typeof salva.campos === 'object'
      ? (salva.campos as Record<string, unknown>)
      : {};
  const resultado = { ...padrao.campos };
  for (const nome of CAMPOS) {
    const valor = gravados[nome] as { modo?: unknown; padrao?: unknown } | null;
    if (!valor || typeof valor !== 'object' || !ehModo(valor.modo)) continue;
    const modo =
      valor.modo === 'OCULTO' && NUNCA_OCULTOS.includes(nome)
        ? 'OPCIONAL'
        : valor.modo;
    const texto =
      typeof valor.padrao === 'string' && valor.padrao.trim()
        ? valor.padrao
        : undefined;
    resultado[nome] = texto === undefined ? { modo } : { modo, padrao: texto };
  }

  return {
    tipo,
    nome: salva.nome?.trim() || padrao.nome,
    doSistema: padrao.doSistema,
    ativo: salva.ativo,
    exigirDocumento: salva.exigirDocumento ?? padrao.exigirDocumento,
    campos: resultado,
    motivos: salva.motivos,
  };
}

/** Os dados da abertura que o formulário confere. */
export interface DadosDoFormulario {
  ctes: string[];
  nfs: string[];
  fatura: string | null;
  filialId: string | null;
  pagadorCorreto: string | null;
  motivo: string | null;
  descricao: string;
}

/**
 * Confere a abertura contra a configuração do tipo e devolve o primeiro
 * problema (para a mensagem de erro), ou null se estiver tudo certo.
 *
 * Campo escondido não é cobrado. A filial é cobrada à parte (depende de a
 * empresa ter filiais cadastradas) e os anexos, na tela (os arquivos sobem
 * depois de a solicitação existir).
 */
export function problemaNaAbertura(
  config: ConfiguracaoDoTipo,
  dados: DadosDoFormulario,
  registroRapido = false,
): string | null {
  const { campos: c } = config;
  const visivel = (nome: NomeDoCampo) => c[nome].modo !== 'OCULTO';
  const obrigatorio = (nome: NomeDoCampo) => c[nome].modo === 'OBRIGATORIO';

  if (obrigatorio('cte') && dados.ctes.length === 0) return 'Informe o CTe';
  if (obrigatorio('nf') && dados.nfs.length === 0) return 'Informe a NF';
  if (obrigatorio('fatura') && !dados.fatura) return 'Informe a fatura';

  const temDocumento =
    (visivel('cte') && dados.ctes.length > 0) ||
    (visivel('nf') && dados.nfs.length > 0) ||
    (visivel('fatura') && dados.fatura !== null);
  const algumVisivel = visivel('cte') || visivel('nf') || visivel('fatura');
  if (config.exigirDocumento && algumVisivel && !temDocumento) {
    const nomes = [
      visivel('cte') && 'o CTe',
      visivel('nf') && 'a NF',
      visivel('fatura') && 'a fatura',
    ].filter(Boolean) as string[];
    return `Informe ${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} ou ${nomes.at(-1)}` : nomes[0]}`;
  }

  if (obrigatorio('pagadorCorreto') && !dados.pagadorCorreto) {
    return 'Informe quem é o pagador correto';
  }
  if (visivel('motivo') && dados.motivo !== null) {
    if (config.motivos.length > 0 && !config.motivos.includes(dados.motivo)) {
      return 'Escolha um dos motivos da lista';
    }
  }
  if (obrigatorio('motivo') && dados.motivo === null) {
    return 'Escolha o motivo';
  }
  if (obrigatorio('descricao')) {
    // No registro rápido (já resolvido), basta dizer o que era
    if (registroRapido && dados.descricao.length < 3) return 'Diga o que era';
    if (!registroRapido && dados.descricao.length < 10) {
      return 'Descreva o problema com pelo menos 10 caracteres';
    }
  }
  return null;
}
