import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import { linhaDaNotificacao, montarEmail, type Ocorrido } from './modelos.js';

type Transacao = Prisma.TransactionClient;

export interface ConfigDosAvisos {
  /** Endereço das telas, para o link "Abrir no SIGOF" (FRONTEND_URL). */
  urlDoSistema: string;
}

/** Quem recebe e-mail: a empresa configurou e ligou o envio. */
export function emailConfigurado(empresa: {
  emailAtivo: boolean;
  smtpServidor: string | null;
  smtpUsuario: string | null;
  smtpSenhaCifrada: string | null;
}): boolean {
  return Boolean(
    empresa.emailAtivo &&
    empresa.smtpServidor &&
    empresa.smtpUsuario &&
    empresa.smtpSenhaCifrada,
  );
}

/**
 * Message-ID do primeiro e-mail de um protocolo. Todos os seguintes
 * respondem a ele (In-Reply-To/References): é o que mantém a conversa.
 */
export function raizDaConversa(solicitacaoId: string, dominio: string): string {
  return `<sigof.${solicitacaoId}@${dominio}>`;
}

/**
 * Avisos de cada movimentação (RF13 e RF14): a notificação dentro do
 * sistema e o e-mail para a caixa central da empresa e os envolvidos.
 *
 * Roda dentro da mesma transação da movimentação. Se a movimentação
 * falhar, nenhum aviso fica para trás; se der certo, o e-mail já está na
 * fila e sai mesmo que o provedor esteja fora do ar agora.
 */
export class ServicoDeAvisos {
  private readonly dominio: string;

  constructor(private readonly config: ConfigDosAvisos) {
    this.dominio = new URL(config.urlDoSistema).hostname;
  }

  async registrar(
    tx: Transacao,
    autor: UsuarioAutenticado,
    solicitacaoId: string,
    ocorrido: Ocorrido,
  ): Promise<void> {
    const s = await tx.solicitacao.findUniqueOrThrow({
      where: { id: solicitacaoId },
      include: {
        empresa: true,
        solicitante: {
          select: { id: true, nome: true, email: true, ativo: true },
        },
        responsavel: {
          select: { id: true, nome: true, email: true, ativo: true },
        },
      },
    });
    const quemFez = await tx.usuario.findUniqueOrThrow({
      where: { id: autor.id },
      select: { nome: true, email: true },
    });

    const destinatarios = await this.quemEhNotificado(tx, s, ocorrido);
    const linha = linhaDaNotificacao(ocorrido, s.protocolo, quemFez.nome);
    const notificados = destinatarios.filter((id) => id !== autor.id);
    if (notificados.length > 0) {
      await tx.notificacao.createMany({
        data: notificados.map((usuarioId) => ({
          empresaId: s.empresaId,
          usuarioId,
          solicitacaoId: s.id,
          mensagem: linha,
        })),
      });
    }

    // Nota interna é só da equipe: não sai por e-mail, que também vai para
    // o solicitante
    const ehNotaInterna = ocorrido.tipo === 'MENSAGEM' && ocorrido.interna;
    if (ehNotaInterna || !emailConfigurado(s.empresa)) {
      return;
    }

    const para = this.enderecos(
      [
        s.empresa.emailCaixaCentral,
        s.solicitante.ativo ? s.solicitante.email : null,
        s.responsavel?.ativo ? s.responsavel.email : null,
      ],
      // Quem fez a movimentação não precisa ser avisado dela; a caixa
      // central recebe sempre, como registro
      s.empresa.emailCaixaCentral === quemFez.email ? null : quemFez.email,
    );
    if (para.length === 0) {
      return;
    }

    const email = montarEmail({
      ocorrido,
      autor: quemFez.nome,
      empresa: s.empresa.razaoSocial,
      fusoHorario: s.empresa.fusoHorario,
      link: new URL(`/solicitacoes/${s.id}`, this.config.urlDoSistema).href,
      retrato: {
        id: s.id,
        protocolo: s.protocolo,
        tipo: s.tipo,
        cte: s.cte,
        nf: s.nf,
        descricao: s.descricao,
        status: s.status,
        prioridade: s.prioridade,
        solicitante: s.solicitante.nome,
        responsavel: s.responsavel?.nome ?? null,
        slaVenceEm: s.slaVenceEm,
      },
    });

    const raiz = raizDaConversa(s.id, this.dominio);
    const primeiro = ocorrido.tipo === 'ABERTA';
    await tx.emailSaida.create({
      data: {
        empresaId: s.empresaId,
        solicitacaoId: s.id,
        para,
        ...email,
        messageId: primeiro
          ? raiz
          : `<sigof.${s.id}.${randomUUID()}@${this.dominio}>`,
        respondendoA: primeiro ? null : raiz,
      },
    });
  }

  private async quemEhNotificado(
    tx: Transacao,
    s: {
      empresaId: string;
      solicitante: { id: string; ativo: boolean };
      responsavel: { id: string; ativo: boolean } | null;
    },
    ocorrido: Ocorrido,
  ): Promise<string[]> {
    const envolvidos = [s.solicitante, s.responsavel]
      .filter((p): p is { id: string; ativo: boolean } => p !== null && p.ativo)
      .map((p) => p.id);

    const daEquipe = async (perfis: ('ANALISTA' | 'SUPERVISOR')[]) =>
      (
        await tx.usuario.findMany({
          where: {
            empresaId: s.empresaId,
            ativo: true,
            perfil: { in: perfis },
          },
          select: { id: true },
        })
      ).map((u) => u.id);

    let ids: string[];
    switch (ocorrido.tipo) {
      case 'ABERTA':
        // Solicitação nova cai na fila: a equipe toda fica sabendo
        ids = await daEquipe(['ANALISTA', 'SUPERVISOR']);
        break;
      case 'STATUS':
        ids =
          ocorrido.para === 'ESCALADO'
            ? [...envolvidos, ...(await daEquipe(['SUPERVISOR']))]
            : envolvidos;
        break;
      case 'MENSAGEM':
        ids = ocorrido.interna
          ? envolvidos.filter((id) => id !== s.solicitante.id)
          : envolvidos;
        break;
      default:
        ids = envolvidos;
    }
    return [...new Set(ids)];
  }

  /** Sem vazios, sem repetidos (ignorando maiúsculas) e sem quem fez. */
  private enderecos(
    lista: (string | null | undefined)[],
    exceto: string | null,
  ): string[] {
    const vistos = new Set<string>();
    const fora = exceto?.trim().toLowerCase();
    const resultado: string[] = [];
    for (const item of lista) {
      const email = item?.trim().toLowerCase();
      if (!email || email === fora || vistos.has(email)) continue;
      vistos.add(email);
      resultado.push(email);
    }
    return resultado;
  }
}
