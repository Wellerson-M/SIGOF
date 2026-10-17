import type { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import type { Cifra } from '../../seguranca/cifra.js';

/** Os dados de conexão SMTP de uma empresa, com a senha já decifrada. */
export interface ContaDeEnvio {
  servidor: string;
  porta: number;
  tlsDireto: boolean;
  usuario: string;
  senha: string;
  nomeDoRemetente: string;
}

export interface Mensagem {
  para: string[];
  assunto: string;
  texto: string;
  html: string;
  messageId: string;
  respondendoA: string | null;
}

/**
 * Quem de fato entrega a mensagem. Em produção é o SMTP da empresa (ex.:
 * Gmail); nos testes, um dublê que só anota o que recebeu.
 */
export type Remetente = (
  conta: ContaDeEnvio,
  mensagem: Mensagem,
) => Promise<void>;

function servidorLocal(servidor: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(servidor.toLowerCase());
}

/** Entrega pelo servidor SMTP configurado pela empresa. */
export const enviarPorSmtp: Remetente = async (conta, mensagem) => {
  const transporte = nodemailer.createTransport({
    host: conta.servidor,
    port: conta.porta,
    secure: conta.tlsDireto,
    // Sem TLS direto (porta 587), exige que a conexão suba para TLS antes
    // de mandar a senha: nunca envia credencial em texto puro. A exceção é
    // o servidor de testes na própria máquina (Mailpit, no docker-compose)
    requireTLS: !conta.tlsDireto && !servidorLocal(conta.servidor),
    auth: { user: conta.usuario, pass: conta.senha },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transporte.sendMail({
      // O Gmail só aceita como remetente a própria conta autenticada
      from: { name: conta.nomeDoRemetente, address: conta.usuario },
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      html: mensagem.html,
      messageId: mensagem.messageId,
      ...(mensagem.respondendoA
        ? {
            inReplyTo: mensagem.respondendoA,
            references: [mensagem.respondendoA],
          }
        : {}),
      headers: {
        // Pede aos provedores que não respondam automaticamente
        // ("estou de férias") a um e-mail que ninguém lê
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
      },
    });
  } finally {
    transporte.close();
  }
};

/** Espera antes de cada nova tentativa, em minutos: 1, 5, 15, 60. */
export const ESPERAS_EM_MINUTOS = [1, 5, 15, 60];
/** Depois disso o e-mail é dado como falho (e continua registrado). */
export const MAXIMO_DE_TENTATIVAS = ESPERAS_EM_MINUTOS.length + 1;
/** Reserva: por quanto tempo um e-mail pego para envio fica separado. */
const MINUTOS_DE_RESERVA = 5;
const POR_RODADA = 20;
const MINUTO = 60_000;

export function contaDaEmpresa(
  empresa: {
    razaoSocial: string;
    smtpServidor: string | null;
    smtpPorta: number | null;
    smtpTlsDireto: boolean;
    smtpUsuario: string | null;
    smtpSenhaCifrada: string | null;
    emailRemetenteNome: string | null;
  },
  cifra: Cifra,
): ContaDeEnvio | null {
  if (
    !empresa.smtpServidor ||
    !empresa.smtpUsuario ||
    !empresa.smtpSenhaCifrada
  ) {
    return null;
  }
  return {
    servidor: empresa.smtpServidor,
    porta: empresa.smtpPorta ?? (empresa.smtpTlsDireto ? 465 : 587),
    tlsDireto: empresa.smtpTlsDireto,
    usuario: empresa.smtpUsuario,
    senha: cifra.decifrar(empresa.smtpSenhaCifrada),
    nomeDoRemetente:
      empresa.emailRemetenteNome || `SIGOF — ${empresa.razaoSocial}`,
  };
}

/** Mensagem curta do erro, sem nada que pareça credencial. */
export function resumoDoErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.replaceAll(/\s+/g, ' ').slice(0, 500);
}

/**
 * Esvazia a fila de e-mails (padrão "outbox").
 *
 * Cada e-mail é **reservado** antes do envio com uma atualização
 * condicional (só reserva quem ainda está pendente e vencido). Se houver
 * duas instâncias da API rodando, só uma consegue a reserva e o e-mail não
 * sai em dobro. Se o processo cair no meio do envio, a reserva vence e o
 * e-mail volta para a fila.
 */
export class Carteiro {
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cifra: Cifra,
    private readonly remetente: Remetente = enviarPorSmtp,
    private readonly agora: () => Date = () => new Date(),
    private readonly registrarErro: (
      mensagem: string,
      erro: unknown,
    ) => void = () => {},
  ) {}

  iniciar(intervaloMs: number): void {
    this.timer ??= setInterval(() => void this.rodada(), intervaloMs);
    // Não segura o processo vivo no desligamento
    this.timer.unref();
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Uma passada pela fila. Devolve quantos e-mails foram enviados. */
  async rodada(): Promise<number> {
    if (this.rodando) return 0;
    this.rodando = true;
    try {
      return await this.processar();
    } catch (erro) {
      this.registrarErro('Falha ao processar a fila de e-mails', erro);
      return 0;
    } finally {
      this.rodando = false;
    }
  }

  private async processar(): Promise<number> {
    const agora = this.agora();
    const vencidos = await this.prisma.emailSaida.findMany({
      where: { situacao: 'PENDENTE', tentarEm: { lte: agora } },
      orderBy: { criadoEm: 'asc' },
      take: POR_RODADA,
      select: { id: true },
    });

    let enviados = 0;
    for (const { id } of vencidos) {
      const reserva = await this.prisma.emailSaida.updateMany({
        where: { id, situacao: 'PENDENTE', tentarEm: { lte: agora } },
        data: {
          tentarEm: new Date(agora.getTime() + MINUTOS_DE_RESERVA * MINUTO),
          // Reservado para envio: nada mais entra neste e-mail
          agruparAte: null,
        },
      });
      if (reserva.count === 1 && (await this.entregar(id))) {
        enviados += 1;
      }
    }
    return enviados;
  }

  private async entregar(id: string): Promise<boolean> {
    const email = await this.prisma.emailSaida.findUniqueOrThrow({
      where: { id },
      include: { empresa: true },
    });

    try {
      const conta = email.empresa.emailAtivo
        ? contaDaEmpresa(email.empresa, this.cifra)
        : null;
      if (!conta) {
        throw new Error(
          'O envio de e-mail da empresa está desligado ou incompleto',
        );
      }
      await this.remetente(conta, email);
      await this.prisma.emailSaida.update({
        where: { id },
        data: {
          situacao: 'ENVIADO',
          tentativas: { increment: 1 },
          enviadoEm: this.agora(),
          ultimoErro: null,
        },
      });
      return true;
    } catch (erro) {
      const tentativas = email.tentativas + 1;
      const esgotou = tentativas >= MAXIMO_DE_TENTATIVAS;
      const espera = ESPERAS_EM_MINUTOS[tentativas - 1] ?? 60;
      await this.prisma.emailSaida.update({
        where: { id },
        data: {
          tentativas,
          situacao: esgotou ? 'FALHOU' : 'PENDENTE',
          tentarEm: new Date(this.agora().getTime() + espera * MINUTO),
          ultimoErro: resumoDoErro(erro),
        },
      });
      return false;
    }
  }
}
