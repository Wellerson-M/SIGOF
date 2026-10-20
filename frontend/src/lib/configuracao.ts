/**
 * Módulos e formulário de abertura de cada empresa.
 *
 * A plataforma libera os módulos; o administrador da empresa liga os que
 * quer usar e monta o formulário de cada tipo de ocorrência (campos que
 * aparecem, obrigatórios, valores que já vêm preenchidos e motivos). As
 * telas leem daqui o que mostrar; a API confere tudo de novo.
 */
import { useEffect, useState } from 'react';
import { pedir, type UsuarioLogado } from './api';
import type { Tipo } from './solicitacoes';

export type Modulo =
  | 'FILIAIS'
  | 'CAUSA_DO_ERRO'
  | 'VERIFICACOES'
  | 'REGISTRO_RAPIDO'
  | 'EMAIL'
  | 'BALANCO'
  | 'FORMULARIO'
  | 'EXCLUSAO_DE_SOLICITACOES'
  | 'EXCLUSAO_DE_ANEXOS';

/** O catálogo, na ordem em que aparece nas telas. */
export const MODULOS: { id: Modulo; nome: string; descricao: string }[] = [
  {
    id: 'FORMULARIO',
    nome: 'Formulário personalizado',
    descricao:
      'Escolher, para cada tipo de ocorrência, os campos que aparecem, os obrigatórios, o que já vem preenchido e os motivos.',
  },
  {
    id: 'FILIAIS',
    nome: 'Filiais',
    descricao:
      'Informar a filial que emitiu o documento; a duplicidade compara documento + filial.',
  },
  {
    id: 'CAUSA_DO_ERRO',
    nome: 'Causa do erro',
    descricao:
      'Ao resolver, registrar de quem foi o erro (controle interno; o solicitante não vê).',
  },
  {
    id: 'VERIFICACOES',
    nome: 'Verificações',
    descricao:
      'Itens para marcar na solicitação (ex.: “desacordo fiscal feito”), obrigatórios ou não para resolver.',
  },
  {
    id: 'REGISTRO_RAPIDO',
    nome: 'Registro rápido',
    descricao:
      'A equipe registra o que já resolveu por fora (WhatsApp, telefone) para ter o histórico.',
  },
  {
    id: 'EMAIL',
    nome: 'Avisos por e-mail',
    descricao:
      'Enviar e-mail a cada movimentação (sem ele, os avisos ficam só no sino).',
  },
  {
    id: 'BALANCO',
    nome: 'Balanço por digitador',
    descricao:
      'Importar a produção do mês e ver a taxa de erro de cada digitador nos Indicadores.',
  },
  {
    id: 'EXCLUSAO_DE_SOLICITACOES',
    nome: 'Excluir solicitações encerradas',
    descricao:
      'Supervisor e administrador excluem resolvidas e canceladas (somem das telas e dos números; ficam na auditoria).',
  },
  {
    id: 'EXCLUSAO_DE_ANEXOS',
    nome: 'Excluir anexo enviado',
    descricao:
      'Quem enviou um arquivo pode excluí-lo por alguns minutos (o prazo fica em Empresa e expediente).',
  },
];

/**
 * O módulo está em uso na empresa de quem está logado. Sem a lista (API
 * antiga), considera ligado: melhor mostrar a mais do que esconder.
 */
export function usaModulo(usuario: UsuarioLogado, modulo: Modulo): boolean {
  const modulos = usuario.empresa.modulos;
  return modulos === undefined || modulos.includes(modulo);
}

export interface ModulosDaEmpresa {
  liberados: Modulo[];
  ativos: Modulo[];
  ligados: Modulo[];
}

export type Modo = 'OCULTO' | 'OPCIONAL' | 'OBRIGATORIO';

export type NomeDoCampo =
  | 'cte'
  | 'nf'
  | 'fatura'
  | 'filial'
  | 'pagadorCorreto'
  | 'motivo'
  | 'prioridade'
  | 'descricao'
  | 'anexos';

export interface Campo {
  modo: Modo;
  padrao?: string;
}

export interface ConfiguracaoDoTipo {
  tipo: Tipo;
  ativo: boolean;
  /** Pelo menos um entre CTe, NF e fatura. */
  exigirDocumento: boolean;
  campos: Record<NomeDoCampo, Campo>;
  motivos: string[];
}

export interface FormularioDaEmpresa {
  personalizavel: boolean;
  tipos: ConfiguracaoDoTipo[];
}

export const NOME_DO_CAMPO: Record<NomeDoCampo, string> = {
  cte: 'CTe',
  nf: 'NF',
  fatura: 'Fatura',
  filial: 'Filial',
  pagadorCorreto: 'Pagador correto',
  motivo: 'Motivo',
  prioridade: 'Prioridade',
  descricao: 'Descrição',
  anexos: 'Anexos',
};

export const NOME_DO_MODO: Record<Modo, string> = {
  OCULTO: 'Não aparece',
  OPCIONAL: 'Opcional',
  OBRIGATORIO: 'Obrigatório',
};

/** Campos que aceitam um valor já preenchido. */
export const CAMPOS_COM_PADRAO: readonly NomeDoCampo[] = [
  'pagadorCorreto',
  'motivo',
  'prioridade',
  'descricao',
];

const json = (corpo: unknown) => ({ body: JSON.stringify(corpo) });

export const configuracao = {
  modulos: () => pedir<ModulosDaEmpresa>('/configuracao/modulos'),
  alterarModulos: (ativos: Modulo[]) =>
    pedir<ModulosDaEmpresa>('/configuracao/modulos', {
      method: 'PUT',
      ...json({ ativos }),
    }),
  formulario: (todos = false) =>
    pedir<FormularioDaEmpresa>(
      `/configuracao/formulario${todos ? '?todos=1' : ''}`,
    ),
  alterarFormulario: (tipo: Tipo, dados: Omit<ConfiguracaoDoTipo, 'tipo'>) =>
    pedir<ConfiguracaoDoTipo>(`/configuracao/formulario/${tipo}`, {
      method: 'PUT',
      ...json(dados),
    }),
  restaurarFormulario: (tipo: Tipo) =>
    pedir<ConfiguracaoDoTipo>(`/configuracao/formulario/${tipo}`, {
      method: 'DELETE',
    }),
};

/**
 * Quando a configuração não carrega (sem conexão por um instante), o
 * formulário mostra tudo como opcional: a API ainda confere e diz o que
 * faltou.
 */
export function configuracaoLivre(tipo: Tipo): ConfiguracaoDoTipo {
  const opcional: Campo = { modo: 'OPCIONAL' };
  return {
    tipo,
    ativo: true,
    exigirDocumento: false,
    campos: {
      cte: opcional,
      nf: opcional,
      fatura: opcional,
      filial: opcional,
      pagadorCorreto: tipo === 'TROCA_PAGADOR' ? opcional : { modo: 'OCULTO' },
      motivo: { modo: 'OCULTO' },
      prioridade: { modo: 'OPCIONAL', padrao: 'MEDIA' },
      descricao: { modo: 'OBRIGATORIO' },
      anexos: opcional,
    },
    motivos: [],
  };
}

/** Os tipos ativos e a configuração de cada um, para os formulários. */
export function useFormulario(): {
  tipos: ConfiguracaoDoTipo[] | null;
  doTipo: (tipo: Tipo) => ConfiguracaoDoTipo;
} {
  const [tipos, setTipos] = useState<ConfiguracaoDoTipo[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    configuracao.formulario().then(
      (dados) => {
        if (!cancelado) setTipos(dados.tipos);
      },
      () => {
        if (!cancelado) setTipos([]);
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);
  return {
    tipos,
    doTipo: (tipo) =>
      tipos?.find((t) => t.tipo === tipo) ?? configuracaoLivre(tipo),
  };
}
