import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErroDeAplicacao, ErroDeRegraDeNegocio } from '../../http/erros.js';
import { emailConfigurado } from '../avisos/avisos.js';
import { escaparHtml, type Email } from '../avisos/modelos.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';

export const CATEGORIAS = ['SUGESTAO', 'PROBLEMA', 'DUVIDA'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const NOME_DA_CATEGORIA: Record<Categoria, string> = {
  SUGESTAO: 'Sugestão',
  PROBLEMA: 'Problema',
  DUVIDA: 'Dúvida',
};

/** Começo fixo do assunto: é por ele que o destinatário cria o filtro. */
export const PREFIXO_DO_ASSUNTO = '[SIGOF Sugestão]';

/** Freio contra abuso: quantas sugestões uma empresa manda por hora. */
export const LIMITE_POR_HORA = 20;

const HORA = 60 * 60_000;

export interface NovaSugestao {
  categoria: Categoria;
  titulo: string;
  texto: string;
  /** Tela em que a pessoa estava (ex.: "/indicadores"). */
  pagina?: string | undefined;
}

export interface ContextoDaSugestao {
  nome: string;
  email: string;
  perfil: string;
  empresa: string;
  ambiente: string;
  versao: string;
  enviadaEm: string;
}

/** O e-mail que chega ao dono do sistema: assunto filtrável e contexto. */
export function emailDeSugestao(
  sugestao: NovaSugestao,
  contexto: ContextoDaSugestao,
): Email {
  const categoria = NOME_DA_CATEGORIA[sugestao.categoria];
  const linhas: [string, string][] = [
    ['Categoria', categoria],
    ['De', `${contexto.nome} <${contexto.email}> (${contexto.perfil})`],
    ['Empresa', contexto.empresa],
    ['Ambiente', `${contexto.ambiente} · versão ${contexto.versao}`],
    ['Tela', sugestao.pagina ?? 'não informada'],
    ['Enviada em', contexto.enviadaEm],
  ];
  return {
    assunto: `${PREFIXO_DO_ASSUNTO} ${categoria}: ${sugestao.titulo}`,
    texto: `${linhas.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${sugestao.texto}\n`,
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#142033;"><h1 style="font-size:18px;">${escaparHtml(sugestao.titulo)}</h1><table style="font-size:13px;color:#56637a;border-collapse:collapse;">${linhas
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 12px 2px 0;font-weight:bold;">${k}</td><td>${escaparHtml(v)}</td></tr>`,
      )
      .join(
        '',
      )}</table><p style="white-space:pre-wrap;margin-top:16px;">${escaparHtml(sugestao.texto)}</p></body></html>`,
  };
}

export interface OpcoesDeSugestoes {
  /** Quem recebe. Nulo: a caixa de sugestões está desligada neste ambiente. */
  destino: string | null;
  /** Endereço das telas; o domínio vira o do Message-ID. */
  urlDoSistema: string;
  ambiente: string;
  versao: string;
  agora?: (() => Date) | undefined;
}

/**
 * Caixa de sugestões do ambiente de testes. Entra na fila de e-mails da
 * própria empresa (o carteiro envia pelo SMTP configurado ali) e vai para
 * um endereço fixo, definido pelo operador do sistema na variável de
 * ambiente SUGESTOES_EMAIL.
 */
export class ServicoDeSugestoes {
  private readonly dominio: string;
  private readonly agora: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opcoes: OpcoesDeSugestoes,
  ) {
    this.dominio = new URL(opcoes.urlDoSistema).hostname;
    this.agora = opcoes.agora ?? (() => new Date());
  }

  get ligada(): boolean {
    return this.opcoes.destino !== null;
  }

  async enviar(
    usuario: UsuarioAutenticado,
    sugestao: NovaSugestao,
  ): Promise<void> {
    const { destino } = this.opcoes;
    if (destino === null) {
      throw new ErroDeRegraDeNegocio(
        'A caixa de sugestões não está ligada neste ambiente',
      );
    }
    const [empresa, eu] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({
        where: { id: usuario.empresaId },
      }),
      this.prisma.usuario.findUniqueOrThrow({
        where: { id: usuario.id },
        select: { nome: true, email: true },
      }),
    ]);
    if (!emailConfigurado(empresa)) {
      throw new ErroDeRegraDeNegocio(
        'O envio de e-mail desta empresa ainda não está configurado ' +
          '(Administração → E-mail). Avise o administrador.',
      );
    }

    const agora = this.agora();
    const recentes = await this.prisma.emailSaida.count({
      where: {
        empresaId: empresa.id,
        assunto: { startsWith: PREFIXO_DO_ASSUNTO },
        criadoEm: { gte: new Date(agora.getTime() - HORA) },
      },
    });
    if (recentes >= LIMITE_POR_HORA) {
      throw new ErroDeAplicacao(
        429,
        'LIMITE',
        'Muitas sugestões em pouco tempo. Tente de novo daqui a pouco.',
      );
    }

    const email = emailDeSugestao(sugestao, {
      nome: eu.nome,
      email: eu.email,
      perfil: usuario.perfil,
      empresa: empresa.razaoSocial,
      ambiente: this.opcoes.ambiente,
      versao: this.opcoes.versao,
      enviadaEm: new Intl.DateTimeFormat('pt-BR', {
        timeZone: empresa.fusoHorario,
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(agora),
    });
    await this.prisma.emailSaida.create({
      data: {
        empresaId: empresa.id,
        para: [destino],
        ...email,
        messageId: `<sigof.sugestao.${randomUUID()}@${this.dominio}>`,
      },
    });
  }
}
