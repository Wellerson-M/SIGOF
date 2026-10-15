import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErroNaoAutenticado } from '../../http/erros.js';
import { gerarHashDeSenha, verificarSenha } from '../../seguranca/senha.js';
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

    if (bloqueado || !usuario.ativo) {
      throw new ErroNaoAutenticado(CREDENCIAIS_INVALIDAS);
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
      throw new ErroNaoAutenticado(CREDENCIAIS_INVALIDAS);
    }

    if (usuario.falhasDeLogin > 0 || usuario.bloqueadoAte !== null) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { falhasDeLogin: 0, bloqueadoAte: null },
      });
    }

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

    if (count === 0 && !(await this.foiTrocadaAgoraHaPouco(sessao.id, agora))) {
      await this.revogarFamilia(sessao.familia);
      throw new ErroNaoAutenticado('Sessão expirada');
    }

    // Usuário desativado ou empresa desativada perdem o acesso na hora
    if (!sessao.usuario.ativo || !sessao.usuario.empresa.ativa) {
      await this.revogarFamilia(sessao.familia);
      throw new ErroNaoAutenticado('Sessão expirada');
    }

    const tokens = await this.abrirSessao(
      {
        id: sessao.usuario.id,
        empresaId: sessao.usuario.empresaId,
        perfil: sessao.usuario.perfil,
      },
      sessao.familia,
      contexto,
    );

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
  async sair(tokenDeSessao: string): Promise<void> {
    const sessao = await this.prisma.sessao.findUnique({
      where: { tokenHash: hashDoToken(tokenDeSessao) },
    });

    if (sessao) {
      await this.revogarFamilia(sessao.familia);
    }
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
  ): Promise<Tokens> {
    const sessao = gerarTokenDeSessao();
    const sessaoExpiraEm = new Date(
      this.agora().getTime() + this.config.sessaoDias * DIA,
    );

    await this.prisma.sessao.create({
      data: {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        familia,
        tokenHash: hashDoToken(sessao),
        expiraEm: sessaoExpiraEm,
        ip: contexto.ip ?? null,
        userAgent: contexto.userAgent?.slice(0, 255) ?? null,
      },
    });

    const acesso = await emitirTokenDeAcesso(
      usuario,
      this.config.jwtSecret,
      this.config.acessoMinutos,
    );

    return { acesso, sessao, sessaoExpiraEm };
  }
}
