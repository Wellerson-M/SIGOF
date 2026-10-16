import { Prisma, type PrismaClient } from '@prisma/client';
import { ErroDeConflito, ErroNaoEncontrado } from '../../http/erros.js';
import { diferencas, registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';

export interface Filial {
  id: string;
  nome: string;
  ativa: boolean;
}

const camposDaFilial = { id: true, nome: true, ativa: true } as const;

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
