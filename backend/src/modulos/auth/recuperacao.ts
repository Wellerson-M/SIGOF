import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErroDeRegraDeNegocio } from '../../http/erros.js';
import { gerarHashDeSenha } from '../../seguranca/senha.js';
import { emailConfigurado } from '../avisos/avisos.js';
import {
  AVISO_DE_NAO_RESPONDA,
  escaparHtml,
  type Email,
} from '../avisos/modelos.js';
import { registrar } from '../auditoria/auditoria.js';
import { hashDoToken } from './tokens.js';

/** Quanto tempo o link vale. Curto: quem pede costuma abrir o e-mail já. */
export const VALIDADE_DO_LINK_MINUTOS = 30;

/**
 * Quantos links o mesmo usuário recebe por hora. Sem teto, qualquer pessoa
 * que soubesse o e-mail de alguém encheria a caixa dele de mensagens.
 */
export const LINKS_POR_HORA = 3;

/**
 * A mesma mensagem para link errado, vencido, já usado ou de usuário
 * desativado: quem tenta adivinhar não descobre qual deles aconteceu.
 */
export const LINK_INVALIDO =
  'Este link não vale mais. Peça um novo em "Esqueci minha senha".';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export interface PedidoDeRecuperacao {
  empresa: string;
  email: string;
}

export interface ContextoDaRecuperacao {
  ip?: string | undefined;
}

export interface OpcoesDaRecuperacao {
  /** Endereço das telas: o link do e-mail e o domínio do Message-ID. */
  urlDoSistema: string;
  agora?: (() => Date) | undefined;
}

/** O e-mail com o link. O token vai depois do "#": ver `linkDeRedefinicao`. */
export function emailDeRecuperacao(dados: {
  empresa: string;
  nome: string;
  link: string;
}): Email {
  const { empresa, nome, link } = dados;
  const corpo = `Recebemos um pedido para trocar a senha do seu acesso ao SIGOF (${empresa}). O link abaixo vale por ${VALIDADE_DO_LINK_MINUTOS} minutos e só pode ser usado uma vez.`;
  const aviso =
    'Se não foi você, ignore este e-mail: sua senha continua a mesma.';
  return {
    assunto: 'SIGOF: link para trocar a sua senha',
    texto: [
      `Olá, ${nome}.`,
      '',
      corpo,
      '',
      link,
      '',
      aviso,
      '',
      '--',
      AVISO_DE_NAO_RESPONDA,
    ].join('\n'),
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#142033;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d9e0ea;border-radius:8px;overflow:hidden;">
<div style="background:#0b3a6e;color:#ffffff;padding:14px 20px;font-size:14px;font-weight:bold;">SIGOF · ${escaparHtml(empresa)}</div>
<div style="padding:20px;">
<h1 style="margin:0 0 16px;font-size:18px;">Trocar a sua senha</h1>
<p style="font-size:14px;">Olá, ${escaparHtml(nome)}.</p>
<p style="font-size:14px;">${escaparHtml(corpo)}</p>
<p style="margin:20px 0;"><a href="${escaparHtml(link)}" style="display:inline-block;background:#0b3a6e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:bold;">Escolher uma nova senha</a></p>
<p style="font-size:13px;color:#56637a;">${escaparHtml(aviso)}</p>
</div>
<div style="padding:14px 20px;border-top:1px solid #d9e0ea;font-size:12px;color:#56637a;">${escaparHtml(AVISO_DE_NAO_RESPONDA)}</div>
</div>
</body></html>`,
  };
}

/** Aviso depois da troca: se não foi a pessoa, ela fica sabendo na hora. */
export function emailDeSenhaRecuperada(dados: {
  empresa: string;
  nome: string;
  quando: string;
}): Email {
  const { empresa, nome, quando } = dados;
  const corpo = `A senha do seu acesso ao SIGOF (${empresa}) foi trocada em ${quando}, pelo link de "Esqueci minha senha". Todas as sessões abertas foram encerradas.`;
  const aviso =
    'Se não foi você, avise o administrador da sua empresa agora mesmo.';
  return {
    assunto: 'SIGOF: sua senha foi trocada',
    texto: [
      `Olá, ${nome}.`,
      '',
      corpo,
      '',
      aviso,
      '',
      '--',
      AVISO_DE_NAO_RESPONDA,
    ].join('\n'),
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#142033;"><h1 style="font-size:18px;">Sua senha foi trocada</h1><p>Olá, ${escaparHtml(nome)}.</p><p>${escaparHtml(corpo)}</p><p><strong>${escaparHtml(aviso)}</strong></p><p style="font-size:12px;color:#56637a;">${escaparHtml(AVISO_DE_NAO_RESPONDA)}</p></body></html>`,
  };
}

/**
 * "Esqueci minha senha": o usuário pede um link por e-mail e, com ele,
 * escolhe uma senha nova sem saber a antiga.
 *
 * O desenho segue o que a OWASP recomenda (Forgot Password Cheat Sheet):
 * token aleatório de 256 bits, só o hash no banco, validade curta, uso
 * único e a mesma resposta exista o e-mail ou não.
 */
export class ServicoDeRecuperacao {
  private readonly dominio: string;
  private readonly agora: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opcoes: OpcoesDaRecuperacao,
  ) {
    this.dominio = new URL(opcoes.urlDoSistema).hostname;
    this.agora = opcoes.agora ?? (() => new Date());
  }

  /**
   * Não devolve nada de propósito: quem chama responde sempre o mesmo
   * texto, então a resposta não revela se o e-mail está cadastrado. Também
   * fica quieto quando a empresa não configurou o envio de e-mail, e
   * quando o usuário já pediu links demais na última hora.
   */
  async solicitar(
    pedido: PedidoDeRecuperacao,
    contexto: ContextoDaRecuperacao = {},
  ): Promise<void> {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        email: pedido.email.trim().toLowerCase(),
        ativo: true,
        empresa: { slug: pedido.empresa.trim().toLowerCase(), ativa: true },
      },
      include: { empresa: true },
    });
    if (!usuario || !emailConfigurado(usuario.empresa)) {
      return;
    }

    const agora = this.agora();
    const token = randomBytes(32).toString('base64url');

    await this.prisma.$transaction(async (tx) => {
      // Um pedido de cada vez por usuário: sem a trava, pedidos simultâneos
      // leriam a mesma contagem e passariam todos do limite
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recuperacao:${usuario.id}`}))`;
      const recentes = await tx.recuperacaoDeSenha.count({
        where: {
          usuarioId: usuario.id,
          criadoEm: { gte: new Date(agora.getTime() - HORA) },
        },
      });
      if (recentes >= LINKS_POR_HORA) {
        return;
      }

      await tx.recuperacaoDeSenha.create({
        data: {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          tokenHash: hashDoToken(token),
          expiraEm: new Date(
            agora.getTime() + VALIDADE_DO_LINK_MINUTOS * MINUTO,
          ),
          ip: contexto.ip ?? null,
        },
      });
      await tx.emailSaida.create({
        data: {
          empresaId: usuario.empresaId,
          para: [usuario.email],
          ...emailDeRecuperacao({
            empresa: usuario.empresa.razaoSocial,
            nome: usuario.nome,
            link: this.linkDeRedefinicao(token),
          }),
          messageId: `<sigof.recuperacao.${randomUUID()}@${this.dominio}>`,
        },
      });
      await registrar(tx, {
        empresaId: usuario.empresaId,
        acao: 'RECUPERACAO_SOLICITADA',
        alvoId: usuario.id,
        ip: contexto.ip,
      });
    });
  }

  /**
   * Troca a senha pelo link. Tudo acontece numa transação: se qualquer
   * passo falhar, o link continua valendo e a senha continua a antiga.
   */
  async redefinir(
    token: string,
    novaSenha: string,
    contexto: ContextoDaRecuperacao = {},
  ): Promise<void> {
    // O hash da senha (lento de propósito) é calculado antes de abrir a
    // transação, para ela não ficar segurando o banco durante esse tempo
    const senhaHash = await gerarHashDeSenha(novaSenha);
    const tokenHash = hashDoToken(token);
    const agora = this.agora();

    await this.prisma.$transaction(async (tx) => {
      // "Gasta" o link só se ainda estiver livre e dentro da validade. É
      // uma única instrução no banco: dois pedidos com o mesmo link ao
      // mesmo tempo não passam os dois (um deles encontra count = 0)
      const { count } = await tx.recuperacaoDeSenha.updateMany({
        where: { tokenHash, usadoEm: null, expiraEm: { gt: agora } },
        data: { usadoEm: agora },
      });
      if (count === 0) {
        throw new ErroDeRegraDeNegocio(LINK_INVALIDO);
      }

      const { usuario } = await tx.recuperacaoDeSenha.findUniqueOrThrow({
        where: { tokenHash },
        include: { usuario: { include: { empresa: true } } },
      });
      if (!usuario.ativo || !usuario.empresa.ativa) {
        throw new ErroDeRegraDeNegocio(LINK_INVALIDO);
      }

      await tx.usuario.update({
        where: { id: usuario.id },
        data: {
          senhaHash,
          trocarSenha: false,
          // Quem esqueceu a senha pode ter errado até ser bloqueado: o
          // link prova a posse do e-mail, então o bloqueio também sai
          falhasDeLogin: 0,
          bloqueadoAte: null,
        },
      });
      // Os outros links pendentes deste usuário morrem junto
      await tx.recuperacaoDeSenha.updateMany({
        where: { usuarioId: usuario.id, usadoEm: null },
        data: { usadoEm: agora },
      });
      // Quem tinha a senha antiga (inclusive um invasor) perde o acesso
      await tx.sessao.updateMany({
        where: { usuarioId: usuario.id, revogadaEm: null },
        data: { revogadaEm: agora },
      });
      await registrar(tx, {
        empresaId: usuario.empresaId,
        acao: 'SENHA_RECUPERADA',
        autorId: usuario.id,
        alvoId: usuario.id,
        ip: contexto.ip,
      });

      if (emailConfigurado(usuario.empresa)) {
        await tx.emailSaida.create({
          data: {
            empresaId: usuario.empresaId,
            para: [usuario.email],
            ...emailDeSenhaRecuperada({
              empresa: usuario.empresa.razaoSocial,
              nome: usuario.nome,
              quando: new Intl.DateTimeFormat('pt-BR', {
                timeZone: usuario.empresa.fusoHorario,
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(agora),
            }),
            messageId: `<sigof.senha-recuperada.${randomUUID()}@${this.dominio}>`,
          },
        });
      }
    });
  }

  /**
   * O token vai depois do "#" (fragmento): o navegador nunca o envia ao
   * servidor nem o repassa no cabeçalho Referer para outro site, e ele não
   * aparece nos logs de acesso. A tela lê o fragmento e o apaga da barra
   * de endereço.
   */
  linkDeRedefinicao(token: string): string {
    const url = new URL('/redefinir-senha', this.opcoes.urlDoSistema);
    url.hash = token;
    return url.toString();
  }
}
