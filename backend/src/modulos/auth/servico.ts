import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErroDeRegraDeNegocio, ErroNaoAutenticado } from '../../http/erros.js';
import { gerarHashDeSenha, verificarSenha } from '../../seguranca/senha.js';
import { registrar } from '../auditoria/auditoria.js';
import {
  emitirTokenDeAcesso,
  gerarTokenDeSessao,
  hashDoToken,
  type UsuarioAutenticado,
} from './tokens.js';

export interface ConfigDeAutenticacao {
  jwtSecret: string;
  acessoMinutos: number;
  sessaoDias: number;
}

export interface Credenciais {
  empresa: string;
  email: string;
  senha: string;
}

export interface Contexto {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface Tokens {
  acesso: string;
  sessao: string;
  sessaoExpiraEm: Date;
}

/** Falhas seguidas que bloqueiam a conta, e por quanto tempo. */
export const FALHAS_PARA_BLOQUEIO = 10;
export const MINUTOS_DE_BLOQUEIO = 15;

/**
 * Tolerância para renovações simultâneas do mesmo token de sessão. Duas
 * abas abertas (ou dois pedidos da mesma tela) podem perceber juntas que o
 * token de acesso venceu e renovar ao mesmo tempo. Nos primeiros segundos
 * após a troca, o reuso é tratado como isso; depois, só quem copiou o
 * token o usaria de novo. É a mesma ideia do "reuse interval" do Auth0.
 */
export const SEGUNDOS_DE_RENOVACAO_CONCORRENTE = 30;

/** Quantas respostas de renovação perdidas uma sessão aguenta (ver abaixo). */
export const RECUPERACOES_POR_FAMILIA = 5;

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

/**
 * A mesma mensagem para empresa inexistente, e-mail inexistente, senha
 * errada, usuário inativo e conta bloqueada: qualquer diferença diria a um
 * atacante quais e-mails existem (enumeração de usuários).
 */
const CREDENCIAIS_INVALIDAS = 'Empresa, e-mail ou senha inválidos';

export class ServicoDeAutenticacao {
  /**
   * Hash de uma senha qualquer, usado quando o usuário não existe: verificar
   * contra ele leva o mesmo tempo de uma verificação real, então o tempo de
   * resposta também não revela se o e-mail existe.
   */
  private readonly hashFicticio: Promise<string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigDeAutenticacao,
    private readonly agora: () => Date = () => new Date(),
  ) {
    this.hashFicticio = gerarHashDeSenha(randomUUID());
  }

  async entrar(
    credenciais: Credenciais,
    contexto: Contexto = {},
  ): Promise<Tokens> {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        email: credenciais.email.trim().toLowerCase(),
        empresa: {
          slug: credenciais.empresa.trim().toLowerCase(),
          ativa: true,
        },
      },
    });

    if (!usuario) {
      await verificarSenha(await this.hashFicticio, credenciais.senha);
      throw new ErroNaoAutenticado(CREDENCIAIS_INVALIDAS);
    }

    const agora = this.agora();
    const bloqueado =
      usuario.bloqueadoAte !== null && usuario.bloqueadoAte > agora;
    const senhaCorreta = await verificarSenha(
      usuario.senhaHash,
      credenciais.senha,
    );

    const recusar = async (motivo: string) => {
      await registrar(this.prisma, {
        empresaId: usuario.empresaId,
        acao: 'LOGIN_RECUSADO',
        alvoId: usuario.id,
        detalhes: { motivo },
        ip: contexto.ip,
      });
      return new ErroNaoAutenticado(CREDENCIAIS_INVALIDAS);
    };

    if (!usuario.ativo) {
      throw await recusar('usuário desativado');
    }
    if (bloqueado) {
      throw await recusar('conta bloqueada por tentativas');
    }

    if (!senhaCorreta) {
      // Incremento feito pelo próprio banco: tentativas simultâneas somam
      // todas, em vez de uma sobrescrever a contagem da outra
      const { falhasDeLogin } = await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { falhasDeLogin: { increment: 1 } },
        select: { falhasDeLogin: true },
      });

      if (falhasDeLogin >= FALHAS_PARA_BLOQUEIO) {
        await this.prisma.usuario.update({
          where: { id: usuario.id },
          data: {
            falhasDeLogin: 0,
            bloqueadoAte: new Date(
              agora.getTime() + MINUTOS_DE_BLOQUEIO * MINUTO,
            ),
          },
        });
      }
      throw await recusar('senha errada');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { falhasDeLogin: 0, bloqueadoAte: null, ultimoAcessoEm: agora },
    });
    await registrar(this.prisma, {
      empresaId: usuario.empresaId,
      acao: 'LOGIN',
      autorId: usuario.id,
      alvoId: usuario.id,
      ip: contexto.ip,
    });

    return this.abrirSessao(
      { id: usuario.id, empresaId: usuario.empresaId, perfil: usuario.perfil },
      randomUUID(),
      contexto,
    );
  }

  /**
   * Troca um token de sessão por um par novo (rotação). Cada token de sessão
   * vale uma única vez: se um já usado aparecer de novo depois da janela de
   * renovação concorrente, ele foi copiado por alguém, e todas as sessões
   * daquela família são revogadas.
   */
  async renovar(
    tokenDeSessao: string,
    contexto: Contexto = {},
  ): Promise<Tokens> {
    const agora = this.agora();
    const sessao = await this.prisma.sessao.findUnique({
      where: { tokenHash: hashDoToken(tokenDeSessao) },
      include: { usuario: { include: { empresa: true } } },
    });

    if (!sessao || sessao.revogadaEm !== null || sessao.expiraEm <= agora) {
      throw new ErroNaoAutenticado('Sessão expirada');
    }

    // Marca como usada só se ainda não estiver (operação atômica no banco)
    const { count } = await this.prisma.sessao.updateMany({
      where: { id: sessao.id, substituidaEm: null },
      data: { substituidaEm: agora },
    });

    let sucessoraDescartada: string | null = null;
    if (count === 0 && !(await this.foiTrocadaAgoraHaPouco(sessao.id, agora))) {
      sucessoraDescartada = await this.descartarSucessoraNuncaUsada(
        sessao,
        agora,
      );
      if (sucessoraDescartada === null) {
        await this.revogarFamilia(sessao.familia);
        throw new ErroNaoAutenticado('Sessão expirada');
      }
    }

    // Usuário desativado ou empresa desativada perdem o acesso na hora
    if (!sessao.usuario.ativo || !sessao.usuario.empresa.ativa) {
      await this.revogarFamilia(sessao.familia);
      throw new ErroNaoAutenticado('Sessão expirada');
    }

    const { sessaoId, ...tokens } = await this.abrirSessao(
      {
        id: sessao.usuario.id,
        empresaId: sessao.usuario.empresaId,
        perfil: sessao.usuario.perfil,
      },
      sessao.familia,
      contexto,
      sucessoraDescartada !== null,
    );

    // Quem substituiu quem: é o que permite reconhecer, numa próxima vez,
    // uma resposta de renovação que se perdeu no caminho
    await this.prisma.sessao.updateMany({
      where: {
        id: {
          in: [
            sessao.id,
            ...(sucessoraDescartada ? [sucessoraDescartada] : []),
          ],
        },
      },
      data: { substituidaPorId: sessaoId },
    });

    // Uma saída (ou detecção de reuso) que aconteceu enquanto esta
    // renovação rodava revogou a família antes de a sessão nova existir.
    // Conferir depois de criar fecha essa janela: se algo da família foi
    // revogado, a sessão nova também é.
    const revogadas = await this.prisma.sessao.count({
      where: { familia: sessao.familia, revogadaEm: { not: null } },
    });
    if (revogadas > 0) {
      await this.revogarFamilia(sessao.familia);
      throw new ErroNaoAutenticado('Sessão expirada');
    }

    return tokens;
  }

  /** Encerra a sessão deste dispositivo. Token desconhecido não é erro. */
  async sair(tokenDeSessao: string, contexto: Contexto = {}): Promise<void> {
    const sessao = await this.prisma.sessao.findUnique({
      where: { tokenHash: hashDoToken(tokenDeSessao) },
    });

    if (sessao) {
      await this.revogarFamilia(sessao.familia);
      await registrar(this.prisma, {
        empresaId: sessao.empresaId,
        acao: 'SAIDA',
        autorId: sessao.usuarioId,
        alvoId: sessao.usuarioId,
        ip: contexto.ip,
      });
    }
  }

  /**
   * Troca a própria senha. As outras sessões do usuário são encerradas
   * (quem trocou a senha por suspeita de vazamento derruba o invasor); a
   * deste dispositivo continua.
   */
  async trocarSenha(
    usuario: UsuarioAutenticado,
    senhaAtual: string,
    novaSenha: string,
    tokenDeSessao: string | undefined,
    contexto: Contexto = {},
  ): Promise<void> {
    const registro = await this.prisma.usuario.findFirst({
      where: { id: usuario.id, empresaId: usuario.empresaId, ativo: true },
    });
    if (!registro || !(await verificarSenha(registro.senhaHash, senhaAtual))) {
      throw new ErroDeRegraDeNegocio('A senha atual não confere');
    }
    if (senhaAtual === novaSenha) {
      throw new ErroDeRegraDeNegocio(
        'A nova senha precisa ser diferente da atual',
      );
    }

    const atual = tokenDeSessao
      ? await this.prisma.sessao.findUnique({
          where: { tokenHash: hashDoToken(tokenDeSessao) },
          select: { familia: true },
        })
      : null;
    const senhaHash = await gerarHashDeSenha(novaSenha);

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: registro.id },
        data: { senhaHash, trocarSenha: false },
      });
      await tx.sessao.updateMany({
        where: {
          usuarioId: registro.id,
          revogadaEm: null,
          ...(atual ? { familia: { not: atual.familia } } : {}),
        },
        data: { revogadaEm: this.agora() },
      });
      await registrar(tx, {
        empresaId: registro.empresaId,
        acao: 'SENHA_ALTERADA',
        autorId: registro.id,
        alvoId: registro.id,
        ip: contexto.ip,
      });
    });
  }

  /** Encerra as sessões do usuário em todos os dispositivos. */
  async sairDeTodos(usuarioId: string): Promise<void> {
    await this.prisma.sessao.updateMany({
      where: { usuarioId, revogadaEm: null },
      data: { revogadaEm: this.agora() },
    });
  }

  private async foiTrocadaAgoraHaPouco(
    id: string,
    agora: Date,
  ): Promise<boolean> {
    const { substituidaEm } = await this.prisma.sessao.findUniqueOrThrow({
      where: { id },
      select: { substituidaEm: true },
    });
    return (
      substituidaEm !== null &&
      agora.getTime() - substituidaEm.getTime() <=
        SEGUNDOS_DE_RENOVACAO_CONCORRENTE * 1000
    );
  }

  /**
   * Resposta de renovação perdida: o servidor trocou o token, mas a
   * resposta com o token novo não chegou ao navegador (notebook que
   * hibernou no meio do pedido, Wi-Fi que caiu, página recarregada, servidor
   * reiniciando numa entrega). O navegador continua com o token antigo e,
   * sem esta regra, a próxima renovação seria tomada por roubo e
   * derrubaria a sessão no meio do expediente.
   *
   * O sinal é a sucessora nunca ter sido usada: ninguém provou ter o token
   * novo. Ela é descartada (marcada como substituída) e a renovação segue.
   * Se o token antigo estava mesmo com um invasor, o dono legítimo, ao usar
   * o dele, cai na mesma regra; mas assim que um dos dois renovar de novo,
   * o outro apresenta um token cuja sucessora já foi usada e a família
   * inteira é revogada. O teto de recuperações por família impede que os
   * dois fiquem se alternando indefinidamente.
   *
   * Devolve o id da sucessora descartada, ou null se não é o caso.
   */
  private async descartarSucessoraNuncaUsada(
    sessao: { familia: string; substituidaPorId: string | null },
    agora: Date,
  ): Promise<string | null> {
    if (sessao.substituidaPorId === null) {
      return null;
    }

    const recuperacoes = await this.prisma.sessao.count({
      where: { familia: sessao.familia, recuperada: true },
    });
    if (recuperacoes >= RECUPERACOES_POR_FAMILIA) {
      return null;
    }

    const { count } = await this.prisma.sessao.updateMany({
      where: {
        id: sessao.substituidaPorId,
        familia: sessao.familia,
        substituidaEm: null,
        revogadaEm: null,
        expiraEm: { gt: agora },
      },
      data: { substituidaEm: agora },
    });
    return count === 1 ? sessao.substituidaPorId : null;
  }

  private async revogarFamilia(familia: string): Promise<void> {
    await this.prisma.sessao.updateMany({
      where: { familia, revogadaEm: null },
      data: { revogadaEm: this.agora() },
    });
  }

  private async abrirSessao(
    usuario: UsuarioAutenticado,
    familia: string,
    contexto: Contexto,
    recuperada = false,
  ): Promise<Tokens & { sessaoId: string }> {
    const sessao = gerarTokenDeSessao();
    const sessaoExpiraEm = new Date(
      this.agora().getTime() + this.config.sessaoDias * DIA,
    );

    const { id } = await this.prisma.sessao.create({
      data: {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        familia,
        tokenHash: hashDoToken(sessao),
        expiraEm: sessaoExpiraEm,
        recuperada,
        ip: contexto.ip ?? null,
        userAgent: contexto.userAgent?.slice(0, 255) ?? null,
      },
      select: { id: true },
    });

    const acesso = await emitirTokenDeAcesso(
      usuario,
      this.config.jwtSecret,
      this.config.acessoMinutos,
    );

    return { acesso, sessao, sessaoExpiraEm, sessaoId: id };
  }
}
