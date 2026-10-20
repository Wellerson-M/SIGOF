import { Prisma, type PrismaClient } from '@prisma/client';
import {
  ErroDeConflito,
  ErroDeRegraDeNegocio,
  ErroNaoEncontrado,
} from '../../http/erros.js';
import { diferencas, registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import { tiposConhecidos } from '../configuracao/servico.js';

export interface Filial {
  id: string;
  nome: string;
  ativa: boolean;
}

const camposDaFilial = { id: true, nome: true, ativa: true } as const;

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
  nome: string;
  opcoes?: string[] | undefined;
  rotuloDasOpcoes?: string | null | undefined;
  ordem?: number | undefined;
}

export type AlteracaoDaCausa = {
  [Campo in keyof DadosDaCausa]?: DadosDaCausa[Campo] | undefined;
} & { ativa?: boolean | undefined };

const camposDaCausa = {
  id: true,
  nome: true,
  opcoes: true,
  rotuloDasOpcoes: true,
  ordem: true,
  ativa: true,
} as const;

/** Código do tipo (um dos do sistema ou um criado pela empresa). */
export type TipoOcorrencia = string;
export type QuemMarca = 'SOLICITANTE' | 'EQUIPE' | 'QUALQUER';

export interface ItemDeVerificacao {
  id: string;
  texto: string;
  /** Tipos de ocorrência em que aparece; vazio = em todos. */
  tipos: TipoOcorrencia[];
  quemMarca: QuemMarca;
  obrigatorioParaResolver: boolean;
  ordem: number;
  ativo: boolean;
}

export interface DadosDaVerificacao {
  texto: string;
  tipos?: TipoOcorrencia[] | undefined;
  quemMarca?: QuemMarca | undefined;
  obrigatorioParaResolver?: boolean | undefined;
  ordem?: number | undefined;
}

export type AlteracaoDaVerificacao = {
  [Campo in keyof DadosDaVerificacao]?: DadosDaVerificacao[Campo] | undefined;
} & { ativo?: boolean | undefined };

const camposDaVerificacao = {
  id: true,
  texto: true,
  tipos: true,
  quemMarca: true,
  obrigatorioParaResolver: true,
  ordem: true,
  ativo: true,
} as const;

/**
 * Lista com que toda empresa nova começa (a migração deu a mesma às que já
 * existiam). Cada administrador renomeia, desativa e acrescenta as suas.
 */
export const CAUSAS_PADRAO: readonly {
  nome: string;
  rotuloDasOpcoes: string | null;
  ordem: number;
}[] = [
  { nome: 'Erro de digitação', rotuloDasOpcoes: 'Digitador', ordem: 1 },
  { nome: 'Erro do cliente', rotuloDasOpcoes: null, ordem: 2 },
  { nome: 'Erro comercial', rotuloDasOpcoes: null, ordem: 3 },
  { nome: 'Erro operacional', rotuloDasOpcoes: null, ordem: 4 },
  { nome: 'Outros', rotuloDasOpcoes: null, ordem: 5 },
];

/** Sem vazios nem repetidos (ignorando maiúsculas), na ordem digitada. */
function limparOpcoes(opcoes: string[]): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const opcao of opcoes) {
    const texto = opcao.trim();
    if (!texto || vistas.has(texto.toLowerCase())) continue;
    vistas.add(texto.toLowerCase());
    resultado.push(texto);
  }
  return resultado;
}

/**
 * Cadastros auxiliares que cada empresa monta do seu jeito (filiais, e
 * depois causas de erro). Quem usa os formulários lê os ativos; só o
 * administrador cria e altera. Nada é apagado: desativar tira o item dos
 * formulários sem perder o que já foi registrado com ele.
 */
export class ServicoDeCadastros {
  constructor(private readonly prisma: PrismaClient) {}

  async filiais(
    usuario: UsuarioAutenticado,
    incluirInativas = false,
  ): Promise<Filial[]> {
    return this.prisma.filial.findMany({
      where: {
        empresaId: usuario.empresaId,
        ...(incluirInativas ? {} : { ativa: true }),
      },
      select: camposDaFilial,
      orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
    });
  }

  async criarFilial(
    admin: UsuarioAutenticado,
    nome: string,
    ip?: string,
  ): Promise<Filial> {
    return this.semNomeRepetido(() =>
      this.prisma.$transaction(async (tx) => {
        const filial = await tx.filial.create({
          data: { empresaId: admin.empresaId, nome: nome.trim() },
          select: camposDaFilial,
        });
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'CADASTRO_ALTERADO',
          autorId: admin.id,
          detalhes: { cadastro: 'filial', criada: filial.nome },
          ip,
        });
        return filial;
      }),
    );
  }

  async alterarFilial(
    admin: UsuarioAutenticado,
    id: string,
    alteracao: { nome?: string | undefined; ativa?: boolean | undefined },
    ip?: string,
  ): Promise<Filial> {
    const atual = await this.prisma.filial.findFirst({
      where: { id, empresaId: admin.empresaId },
      select: camposDaFilial,
    });
    if (!atual) {
      throw new ErroNaoEncontrado('Filial não encontrada');
    }

    const novos = { nome: alteracao.nome?.trim(), ativa: alteracao.ativa };
    const mudou = diferencas(atual, novos);
    if (Object.keys(mudou).length === 0) {
      return atual;
    }

    return this.semNomeRepetido(() =>
      this.prisma.$transaction(async (tx) => {
        const filial = await tx.filial.update({
          where: { id: atual.id },
          data: {
            ...(novos.nome === undefined ? {} : { nome: novos.nome }),
            ...(novos.ativa === undefined ? {} : { ativa: novos.ativa }),
          },
          select: camposDaFilial,
        });
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'CADASTRO_ALTERADO',
          autorId: admin.id,
          detalhes: {
            cadastro: 'filial',
            filial: atual.nome,
            ...mudou,
          } as Prisma.InputJsonValue,
          ip,
        });
        return filial;
      }),
    );
  }

  async causas(
    usuario: UsuarioAutenticado,
    incluirInativas = false,
  ): Promise<CausaDeErro[]> {
    return this.prisma.causaDeErro.findMany({
      where: {
        empresaId: usuario.empresaId,
        ...(incluirInativas ? {} : { ativa: true }),
      },
      select: camposDaCausa,
      orderBy: [{ ativa: 'desc' }, { ordem: 'asc' }, { nome: 'asc' }],
    });
  }

  async criarCausa(
    admin: UsuarioAutenticado,
    dados: DadosDaCausa,
    ip?: string,
  ): Promise<CausaDeErro> {
    return this.semNomeRepetido(() =>
      this.prisma.$transaction(async (tx) => {
        const ultima = await tx.causaDeErro.aggregate({
          where: { empresaId: admin.empresaId },
          _max: { ordem: true },
        });
        const causa = await tx.causaDeErro.create({
          data: {
            empresaId: admin.empresaId,
            nome: dados.nome.trim(),
            opcoes: limparOpcoes(dados.opcoes ?? []),
            rotuloDasOpcoes: dados.rotuloDasOpcoes?.trim() || null,
            // Nova vai para o fim da lista, a não ser que digam onde
            ordem: dados.ordem ?? (ultima._max.ordem ?? 0) + 1,
          },
          select: camposDaCausa,
        });
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'CADASTRO_ALTERADO',
          autorId: admin.id,
          detalhes: { cadastro: 'causa de erro', criada: causa.nome },
          ip,
        });
        return causa;
      }),
    );
  }

  async alterarCausa(
    admin: UsuarioAutenticado,
    id: string,
    alteracao: AlteracaoDaCausa,
    ip?: string,
  ): Promise<CausaDeErro> {
    const atual = await this.prisma.causaDeErro.findFirst({
      where: { id, empresaId: admin.empresaId },
      select: camposDaCausa,
    });
    if (!atual) {
      throw new ErroNaoEncontrado('Causa não encontrada');
    }

    const novos = {
      nome: alteracao.nome?.trim(),
      opcoes:
        alteracao.opcoes === undefined
          ? undefined
          : limparOpcoes(alteracao.opcoes),
      rotuloDasOpcoes:
        alteracao.rotuloDasOpcoes === undefined
          ? undefined
          : alteracao.rotuloDasOpcoes?.trim() || null,
      ordem: alteracao.ordem,
      ativa: alteracao.ativa,
    };
    const mudou = diferencas(atual, novos);
    if (Object.keys(mudou).length === 0) {
      return atual;
    }

    return this.semNomeRepetido(() =>
      this.prisma.$transaction(async (tx) => {
        const causa = await tx.causaDeErro.update({
          where: { id: atual.id },
          data: Object.fromEntries(
            Object.entries(novos).filter(([, valor]) => valor !== undefined),
          ) as Prisma.CausaDeErroUpdateInput,
          select: camposDaCausa,
        });
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'CADASTRO_ALTERADO',
          autorId: admin.id,
          detalhes: {
            cadastro: 'causa de erro',
            causa: atual.nome,
            ...mudou,
          } as Prisma.InputJsonValue,
          ip,
        });
        return causa;
      }),
    );
  }

  async verificacoes(
    usuario: UsuarioAutenticado,
    incluirInativas = false,
  ): Promise<ItemDeVerificacao[]> {
    return this.prisma.itemDeVerificacao.findMany({
      where: {
        empresaId: usuario.empresaId,
        ...(incluirInativas ? {} : { ativo: true }),
      },
      select: camposDaVerificacao,
      orderBy: [{ ativo: 'desc' }, { ordem: 'asc' }, { criadoEm: 'asc' }],
    });
  }

  /** Só tipos que a empresa tem (os do sistema e os que ela criou). */
  private async conferirTipos(
    empresaId: string,
    tipos: TipoOcorrencia[] | undefined,
  ): Promise<void> {
    if (!tipos?.length) return;
    const conhecidos = new Set(
      (await tiposConhecidos(this.prisma, empresaId)).map((t) => t.tipo),
    );
    if (tipos.some((t) => !conhecidos.has(t))) {
      throw new ErroDeRegraDeNegocio('Tipo de ocorrência desconhecido');
    }
  }

  async criarVerificacao(
    admin: UsuarioAutenticado,
    dados: DadosDaVerificacao,
    ip?: string,
  ): Promise<ItemDeVerificacao> {
    await this.conferirTipos(admin.empresaId, dados.tipos);
    return this.prisma.$transaction(async (tx) => {
      const ultima = await tx.itemDeVerificacao.aggregate({
        where: { empresaId: admin.empresaId },
        _max: { ordem: true },
      });
      const item = await tx.itemDeVerificacao.create({
        data: {
          empresaId: admin.empresaId,
          texto: dados.texto.trim(),
          tipos: [...new Set(dados.tipos ?? [])],
          quemMarca: dados.quemMarca ?? 'QUALQUER',
          obrigatorioParaResolver: dados.obrigatorioParaResolver ?? false,
          ordem: dados.ordem ?? (ultima._max.ordem ?? 0) + 1,
        },
        select: camposDaVerificacao,
      });
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'CADASTRO_ALTERADO',
        autorId: admin.id,
        detalhes: { cadastro: 'verificação', criada: item.texto },
        ip,
      });
      return item;
    });
  }

  async alterarVerificacao(
    admin: UsuarioAutenticado,
    id: string,
    alteracao: AlteracaoDaVerificacao,
    ip?: string,
  ): Promise<ItemDeVerificacao> {
    const atual = await this.prisma.itemDeVerificacao.findFirst({
      where: { id, empresaId: admin.empresaId },
      select: camposDaVerificacao,
    });
    if (!atual) {
      throw new ErroNaoEncontrado('Verificação não encontrada');
    }
    await this.conferirTipos(admin.empresaId, alteracao.tipos);
    const novos = {
      texto: alteracao.texto?.trim(),
      tipos:
        alteracao.tipos === undefined
          ? undefined
          : [...new Set(alteracao.tipos)],
      quemMarca: alteracao.quemMarca,
      obrigatorioParaResolver: alteracao.obrigatorioParaResolver,
      ordem: alteracao.ordem,
      ativo: alteracao.ativo,
    };
    const mudou = diferencas(atual, novos);
    if (Object.keys(mudou).length === 0) {
      return atual;
    }
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemDeVerificacao.update({
        where: { id: atual.id },
        data: Object.fromEntries(
          Object.entries(novos).filter(([, valor]) => valor !== undefined),
        ) as Prisma.ItemDeVerificacaoUpdateInput,
        select: camposDaVerificacao,
      });
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'CADASTRO_ALTERADO',
        autorId: admin.id,
        detalhes: {
          cadastro: 'verificação',
          verificacao: atual.texto,
          ...mudou,
        } as Prisma.InputJsonValue,
        ip,
      });
      return item;
    });
  }

  private async semNomeRepetido<T>(trabalho: () => Promise<T>): Promise<T> {
    try {
      return await trabalho();
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new ErroDeConflito('Já existe um item com este nome');
      }
      throw erro;
    }
  }
}
