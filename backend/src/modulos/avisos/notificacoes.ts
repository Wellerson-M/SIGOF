import type { PrismaClient } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/tokens.js';

export interface Notificacao {
  id: string;
  mensagem: string;
  lida: boolean;
  solicitacaoId: string;
  criadoEm: Date;
}

/** Quantas aparecem no sino: as mais recentes. */
export const NOTIFICACOES_NA_LISTA = 30;

/** As notificações de cada pessoa (RF14): só as dela, da empresa dela. */
export class ServicoDeNotificacoes {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(
    usuario: UsuarioAutenticado,
  ): Promise<{ naoLidas: number; itens: Notificacao[] }> {
    // A notificação de uma solicitação excluída não leva a lugar nenhum
    const minhas = {
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      solicitacao: { excluidaEm: null },
    };
    const [naoLidas, itens] = await Promise.all([
      this.prisma.notificacao.count({ where: { ...minhas, lida: false } }),
      this.prisma.notificacao.findMany({
        where: minhas,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: NOTIFICACOES_NA_LISTA,
        select: {
          id: true,
          mensagem: true,
          lida: true,
          solicitacaoId: true,
          criadoEm: true,
        },
      }),
    ]);
    return { naoLidas, itens };
  }

  /**
   * Marca como lidas: as indicadas, as de uma solicitação (ao abrir o
   * detalhe) ou, sem filtro, todas.
   */
  async marcarLidas(
    usuario: UsuarioAutenticado,
    filtro: { ids?: string[] | undefined; solicitacaoId?: string | undefined },
  ): Promise<{ naoLidas: number }> {
    await this.prisma.notificacao.updateMany({
      where: {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        lida: false,
        ...(filtro.ids ? { id: { in: filtro.ids } } : {}),
        ...(filtro.solicitacaoId
          ? { solicitacaoId: filtro.solicitacaoId }
          : {}),
      },
      data: { lida: true },
    });
    const naoLidas = await this.prisma.notificacao.count({
      where: {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        lida: false,
      },
    });
    return { naoLidas };
  }
}
