import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ErroDeRegraDeNegocio } from '../../http/erros.js';
import type { Cifra } from '../../seguranca/cifra.js';
import { diferencas, registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import {
  contaDaEmpresa,
  enviarPorSmtp,
  resumoDoErro,
  type Remetente,
} from './carteiro.js';
import { emailDeTeste } from './modelos.js';

/** Como a configuração aparece na tela: a senha nunca volta, só se existe. */
export interface ConfiguracaoDeEmail {
  ativo: boolean;
  servidor: string | null;
  porta: number | null;
  tlsDireto: boolean;
  usuario: string | null;
  temSenha: boolean;
  nomeDoRemetente: string | null;
  /** Recebem cópia de tudo (registro e backup). */
  caixasCentrais: string[];
  /** Acontecimentos que geram e-mail. */
  eventos: string[];
}

export interface AlteracaoDeEmail {
  ativo?: boolean | undefined;
  servidor?: string | null | undefined;
  porta?: number | null | undefined;
  tlsDireto?: boolean | undefined;
  usuario?: string | null | undefined;
  /** Só quando for trocar; ausente mantém a senha guardada. */
  senha?: string | undefined;
  nomeDoRemetente?: string | null | undefined;
  caixasCentrais?: string[] | undefined;
  eventos?: string[] | undefined;
}

export interface EnvioRegistrado {
  id: string;
  assunto: string;
  para: string[];
  situacao: 'PENDENTE' | 'ENVIADO' | 'FALHOU';
  tentativas: number;
  ultimoErro: string | null;
  enviadoEm: Date | null;
  criadoEm: Date;
  protocolo: string | null;
}

export const ENVIOS_POR_PAGINA = 30;

/** Configuração do e-mail de envio e da caixa central, pelo administrador. */
export class ServicoDeConfiguracaoDeEmail {
  private readonly dominio: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cifra: Cifra,
    urlDoSistema: string,
    private readonly remetente: Remetente = enviarPorSmtp,
  ) {
    this.dominio = new URL(urlDoSistema).hostname;
  }

  async obter(admin: UsuarioAutenticado): Promise<ConfiguracaoDeEmail> {
    const e = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: admin.empresaId },
    });
    return {
      ativo: e.emailAtivo,
      servidor: e.smtpServidor,
      porta: e.smtpPorta,
      tlsDireto: e.smtpTlsDireto,
      usuario: e.smtpUsuario,
      temSenha: e.smtpSenhaCifrada !== null,
      nomeDoRemetente: e.emailRemetenteNome,
      caixasCentrais: e.emailsCaixaCentral,
      eventos: e.emailEventos,
    };
  }

  async alterar(
    admin: UsuarioAutenticado,
    alteracao: AlteracaoDeEmail,
    ip?: string,
  ): Promise<ConfiguracaoDeEmail> {
    const atual = await this.obter(admin);
    const vazioViraNulo = (valor: string | null | undefined) =>
      valor === undefined ? undefined : valor?.trim() || null;

    const novos = {
      ativo: alteracao.ativo,
      servidor: vazioViraNulo(alteracao.servidor),
      porta: alteracao.porta,
      tlsDireto: alteracao.tlsDireto,
      usuario: vazioViraNulo(alteracao.usuario)?.toLowerCase(),
      nomeDoRemetente: vazioViraNulo(alteracao.nomeDoRemetente),
      caixasCentrais:
        alteracao.caixasCentrais === undefined
          ? undefined
          : [
              ...new Set(
                alteracao.caixasCentrais
                  .map((c) => c.trim().toLowerCase())
                  .filter(Boolean),
              ),
            ],
      eventos:
        alteracao.eventos === undefined
          ? undefined
          : [...new Set(alteracao.eventos)],
    };
    const senhaNova = alteracao.senha?.trim() ? alteracao.senha.trim() : null;

    const ficaAtivo = novos.ativo ?? atual.ativo;
    const completo =
      Boolean(novos.servidor === undefined ? atual.servidor : novos.servidor) &&
      Boolean(novos.usuario === undefined ? atual.usuario : novos.usuario) &&
      (senhaNova !== null || atual.temSenha);
    if (ficaAtivo && !completo) {
      throw new ErroDeRegraDeNegocio(
        'Para ligar o envio, preencha o servidor, o e-mail e a senha de envio',
      );
    }

    const mudou: Record<string, unknown> = diferencas(atual, novos);
    if (senhaNova !== null) {
      // A senha em si nunca vai para a auditoria
      mudou.senha = 'alterada';
    }
    if (Object.keys(mudou).length === 0) {
      return atual;
    }

    const dados: Prisma.EmpresaUpdateInput = {};
    if (novos.ativo !== undefined) dados.emailAtivo = novos.ativo;
    if (novos.servidor !== undefined) dados.smtpServidor = novos.servidor;
    if (novos.porta !== undefined) dados.smtpPorta = novos.porta;
    if (novos.tlsDireto !== undefined) dados.smtpTlsDireto = novos.tlsDireto;
    if (novos.usuario !== undefined) dados.smtpUsuario = novos.usuario;
    if (novos.nomeDoRemetente !== undefined)
      dados.emailRemetenteNome = novos.nomeDoRemetente;
    if (novos.caixasCentrais !== undefined)
      dados.emailsCaixaCentral = novos.caixasCentrais;
    if (novos.eventos !== undefined) dados.emailEventos = novos.eventos;
    if (senhaNova !== null)
      dados.smtpSenhaCifrada = this.cifra.cifrar(senhaNova);

    await this.prisma.$transaction(async (tx) => {
      await tx.empresa.update({ where: { id: admin.empresaId }, data: dados });
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'EMAIL_CONFIGURADO',
        autorId: admin.id,
        detalhes: mudou as Prisma.InputJsonValue,
        ip,
      });
    });
    return this.obter(admin);
  }

  /**
   * Envia agora (sem passar pela fila) para o administrador ver na hora se
   * a configuração funciona. Vale mesmo com o envio ainda desligado.
   */
  async testar(
    admin: UsuarioAutenticado,
    para?: string,
  ): Promise<{ enviadoPara: string }> {
    const [empresa, eu] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({ where: { id: admin.empresaId } }),
      this.prisma.usuario.findUniqueOrThrow({
        where: { id: admin.id },
        select: { nome: true, email: true },
      }),
    ]);
    const conta = contaDaEmpresa(empresa, this.cifra);
    if (!conta) {
      throw new ErroDeRegraDeNegocio(
        'Salve o servidor, o e-mail e a senha de envio antes de testar',
      );
    }

    const destino = (para ?? eu.email).trim().toLowerCase();
    const email = emailDeTeste(empresa.razaoSocial, eu.nome);
    const mensagem = {
      para: [destino],
      ...email,
      messageId: `<sigof.teste.${randomUUID()}@${this.dominio}>`,
      respondendoA: null,
    };

    try {
      await this.remetente(conta, mensagem);
    } catch (erro) {
      await this.prisma.emailSaida.create({
        data: {
          empresaId: empresa.id,
          ...mensagem,
          situacao: 'FALHOU',
          tentativas: 1,
          ultimoErro: resumoDoErro(erro),
        },
      });
      throw new ErroDeRegraDeNegocio(
        `O servidor de e-mail recusou o envio: ${resumoDoErro(erro)}`,
      );
    }

    await this.prisma.emailSaida.create({
      data: {
        empresaId: empresa.id,
        ...mensagem,
        situacao: 'ENVIADO',
        tentativas: 1,
        enviadoEm: new Date(),
      },
    });
    return { enviadoPara: destino };
  }

  async envios(
    admin: UsuarioAutenticado,
    pagina = 1,
  ): Promise<{ envios: EnvioRegistrado[]; total: number; pagina: number }> {
    const onde = { empresaId: admin.empresaId };
    const [envios, total] = await Promise.all([
      this.prisma.emailSaida.findMany({
        where: onde,
        include: { solicitacao: { select: { protocolo: true } } },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * ENVIOS_POR_PAGINA,
        take: ENVIOS_POR_PAGINA,
      }),
      this.prisma.emailSaida.count({ where: onde }),
    ]);
    return {
      pagina,
      total,
      envios: envios.map((e) => ({
        id: e.id,
        assunto: e.assunto,
        para: e.para,
        situacao: e.situacao,
        tentativas: e.tentativas,
        ultimoErro: e.ultimoErro,
        enviadoEm: e.enviadoEm,
        criadoEm: e.criadoEm,
        protocolo: e.solicitacao?.protocolo ?? null,
      })),
    };
  }
}
