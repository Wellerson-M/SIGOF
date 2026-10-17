import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import {
  linhaDaNotificacao,
  montarEmailDeItens,
  type ItemDoEmail,
  type Ocorrido,
} from './modelos.js';

type Transacao = Prisma.TransactionClient;

export interface ConfigDosAvisos {
  /** Endereço das telas, para o link "Abrir no SIGOF" (FRONTEND_URL). */
  urlDoSistema: string;
  /**
   * Por quanto tempo o e-mail espera acontecimentos seguidos da mesma
   * solicitação antes de sair (abrir e anexar três arquivos = um e-mail).
   */
  segundosParaAgrupar?: number | undefined;
  agora?: (() => Date) | undefined;
}

export const SEGUNDOS_PARA_AGRUPAR_PADRAO = 60;

/** Os acontecimentos que podem gerar e-mail, para a tela de configuração. */
export const EVENTOS_DE_EMAIL = [
  'ABERTA',
  'STATUS',
  'MENSAGEM',
  'ANEXO',
  'PRIORIDADE',
  'RESPONSAVEL',
] as const;

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
  private readonly segundosParaAgrupar: number;
  private readonly agora: () => Date;

  constructor(private readonly config: ConfigDosAvisos) {
    this.dominio = new URL(config.urlDoSistema).hostname;
    this.segundosParaAgrupar =
      config.segundosParaAgrupar ?? SEGUNDOS_PARA_AGRUPAR_PADRAO;
    this.agora = config.agora ?? (() => new Date());
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
    if (
      ehNotaInterna ||
      !emailConfigurado(s.empresa) ||
      // A empresa escolhe o que vale um e-mail; o resto fica só no sino
      !s.empresa.emailEventos.includes(ocorrido.tipo)
    ) {
      return;
    }

    // Para quem vai: as caixas centrais configuradas pelo administrador e,
    // do cadastro de usuários, quem abriu e o responsável (se ativos)
    const caixas = s.empresa.emailsCaixaCentral;
    const para = this.enderecos(
      [
        ...caixas,
        s.solicitante.ativo ? s.solicitante.email : null,
        s.responsavel?.ativo ? s.responsavel.email : null,
      ],
      // Quem fez a movimentação não precisa ser avisado dela; as caixas
      // centrais recebem sempre, como registro
      caixas.some((c) => c.toLowerCase() === quemFez.email.toLowerCase())
        ? null
        : quemFez.email,
    );
    const agora = this.agora();
    const item: ItemDoEmail = { ocorrido, autor: quemFez.nome };
    // E-mail desta solicitação que ainda está esperando para sair: o
    // acontecimento novo entra nele, em vez de virar outro e-mail
    const aberto = await tx.emailSaida.findFirst({
      where: {
        solicitacaoId: s.id,
        situacao: 'PENDENTE',
        tentativas: 0,
        agruparAte: { gt: agora },
      },
      orderBy: { criadoEm: 'desc' },
    });
    const itens = [...((aberto?.itens as ItemDoEmail[] | null) ?? []), item];
    const enviarPara = this.enderecos([...(aberto?.para ?? []), ...para], null);
    if (enviarPara.length === 0) {
      return;
    }

    const email = montarEmailDeItens({
      itens,
      empresa: s.empresa.razaoSocial,
      fusoHorario: s.empresa.fusoHorario,
      link: new URL(`/solicitacoes/${s.id}`, this.config.urlDoSistema).href,
      linkDoAnexo: (anexoId) =>
        new URL(`/anexos/${s.id}/${anexoId}`, this.config.urlDoSistema).href,
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

    if (aberto) {
      await tx.emailSaida.update({
        where: { id: aberto.id },
        data: {
          para: enviarPara,
          ...email,
          itens: itens as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }

    const raiz = raizDaConversa(s.id, this.dominio);
    // O primeiro e-mail do protocolo abre a conversa no Gmail/Outlook
    const primeiro = !(await tx.emailSaida.findFirst({
      where: { solicitacaoId: s.id, messageId: raiz },
      select: { id: true },
    }));
    const saiEm = new Date(agora.getTime() + this.segundosParaAgrupar * 1000);
    await tx.emailSaida.create({
      data: {
        empresaId: s.empresaId,
        solicitacaoId: s.id,
        para: enviarPara,
        ...email,
        itens: itens as unknown as Prisma.InputJsonValue,
        tentarEm: saiEm,
        agruparAte: this.segundosParaAgrupar > 0 ? saiEm : null,
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
