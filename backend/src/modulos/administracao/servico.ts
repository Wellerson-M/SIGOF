import { Prisma, type PrismaClient } from '@prisma/client';
import type { Perfil } from '../../dominio/status.js';
import {
  ErroDeConflito,
  ErroDeRegraDeNegocio,
  ErroNaoEncontrado,
} from '../../http/erros.js';
import { gerarHashDeSenha } from '../../seguranca/senha.js';
import { diferencas, registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import { gerarSenhaProvisoria } from './senha-provisoria.js';

export type Area = 'FINANCEIRO' | 'COMERCIAL' | 'OPERACIONAL';

export interface UsuarioDaEmpresa {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  area: Area | null;
  ativo: boolean;
  /** Ainda com a senha provisória: não fez o primeiro acesso. */
  trocarSenha: boolean;
  /** Bloqueado agora por excesso de senhas erradas. */
  bloqueado: boolean;
  ultimoAcessoEm: Date | null;
  criadoEm: Date;
}

export interface DadosDeUsuario {
  nome: string;
  email: string;
  perfil: Perfil;
  area?: Area | null | undefined;
}

export interface AlteracaoDeUsuario {
  nome?: string | undefined;
  email?: string | undefined;
  perfil?: Perfil | undefined;
  area?: Area | null | undefined;
  ativo?: boolean | undefined;
}

/** A senha provisória só é mostrada uma vez, na resposta. */
export interface ComSenhaProvisoria {
  usuario: UsuarioDaEmpresa;
  senhaProvisoria: string;
}

export interface ParametrosDaEmpresa {
  razaoSocial: string;
  cnpj: string;
  slug: string;
  fusoHorario: string;
  expedienteInicioMinuto: number;
  expedienteFimMinuto: number;
  diasUteis: number[];
  slaAtendimentoMinutos: number;
  janelaDuplicidadeDias: number;
  exigirCausaAoResolver: boolean;
}

export type AlteracaoDaEmpresa = {
  [Campo in keyof Omit<ParametrosDaEmpresa, 'cnpj' | 'slug'>]?:
    ParametrosDaEmpresa[Campo] | undefined;
};

export interface EventoDaTrilha {
  id: string;
  acao: string;
  autor: { id: string; nome: string } | null;
  alvo: { id: string; nome: string } | null;
  detalhes: Prisma.JsonValue;
  ip: string | null;
  criadoEm: Date;
}

export const EVENTOS_POR_PAGINA = 50;

const camposDoUsuario = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  area: true,
  ativo: true,
  trocarSenha: true,
  bloqueadoAte: true,
  ultimoAcessoEm: true,
  criadoEm: true,
} satisfies Prisma.UsuarioSelect;

type RegistroDeUsuario = Prisma.UsuarioGetPayload<{
  select: typeof camposDoUsuario;
}>;

const camposDaEmpresa = {
  razaoSocial: true,
  cnpj: true,
  slug: true,
  fusoHorario: true,
  expedienteInicioMinuto: true,
  expedienteFimMinuto: true,
  diasUteis: true,
  slaAtendimentoMinutos: true,
  janelaDuplicidadeDias: true,
  exigirCausaAoResolver: true,
} satisfies Prisma.EmpresaSelect;

/**
 * Administração da empresa (RF01 e RF02): funcionários e parâmetros de
 * atendimento. As rotas só deixam o perfil ADMIN chegar aqui, e toda
 * consulta é filtrada pela empresa de quem está logado.
 *
 * Usuário nunca é apagado, só desativado: as solicitações, mensagens e o
 * histórico dele continuam apontando para alguém.
 */
export class ServicoDeAdministracao {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async listarUsuarios(admin: UsuarioAutenticado): Promise<UsuarioDaEmpresa[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: { empresaId: admin.empresaId },
      select: camposDoUsuario,
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return usuarios.map((u) => this.apresentar(u));
  }

  async criarUsuario(
    admin: UsuarioAutenticado,
    dados: DadosDeUsuario,
    ip?: string,
  ): Promise<ComSenhaProvisoria> {
    const senhaProvisoria = gerarSenhaProvisoria();
    const senhaHash = await gerarHashDeSenha(senhaProvisoria);
    const email = dados.email.trim().toLowerCase();

    const criado = await this.semEmailRepetido(() =>
      this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            empresaId: admin.empresaId,
            nome: dados.nome.trim(),
            email,
            perfil: dados.perfil,
            area: dados.area ?? null,
            senhaHash,
            trocarSenha: true,
          },
          select: camposDoUsuario,
        });
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'USUARIO_CRIADO',
          autorId: admin.id,
          alvoId: usuario.id,
          detalhes: {
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            area: usuario.area,
          },
          ip,
        });
        return usuario;
      }),
    );

    return { usuario: this.apresentar(criado), senhaProvisoria };
  }

  async alterarUsuario(
    admin: UsuarioAutenticado,
    id: string,
    alteracao: AlteracaoDeUsuario,
    ip?: string,
  ): Promise<UsuarioDaEmpresa> {
    const atual = await this.carregarUsuario(admin, id);

    // O administrador não se tranca para fora: desativar a si mesmo ou
    // perder o perfil ADMIN deixaria a empresa sem ninguém para administrar
    if (
      atual.id === admin.id &&
      (alteracao.ativo === false ||
        (alteracao.perfil !== undefined && alteracao.perfil !== 'ADMIN'))
    ) {
      throw new ErroDeRegraDeNegocio(
        'Você não pode desativar a sua própria conta nem tirar dela o perfil de administrador',
      );
    }

    const novos = {
      nome: alteracao.nome?.trim(),
      email: alteracao.email?.trim().toLowerCase(),
      perfil: alteracao.perfil,
      area: alteracao.area,
      ativo: alteracao.ativo,
    };
    const mudou = diferencas(atual, novos);
    if (Object.keys(mudou).length === 0) {
      return this.apresentar(atual);
    }

    // Perfil novo ou conta desativada: as sessões abertas caem, para a
    // pessoa não continuar com o acesso antigo até a sessão vencer
    const derrubarSessoes = 'perfil' in mudou || 'ativo' in mudou;

    const alterado = await this.semEmailRepetido(() =>
      this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.update({
          where: { id: atual.id },
          data: {
            ...(novos.nome === undefined ? {} : { nome: novos.nome }),
            ...(novos.email === undefined ? {} : { email: novos.email }),
            ...(novos.perfil === undefined ? {} : { perfil: novos.perfil }),
            ...(novos.area === undefined ? {} : { area: novos.area }),
            ...(novos.ativo === undefined ? {} : { ativo: novos.ativo }),
          },
          select: camposDoUsuario,
        });
        if (derrubarSessoes) {
          await this.encerrarSessoes(tx, atual.id);
        }
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'USUARIO_ALTERADO',
          autorId: admin.id,
          alvoId: atual.id,
          detalhes: mudou as Prisma.InputJsonValue,
          ip,
        });
        return usuario;
      }),
    );

    return this.apresentar(alterado);
  }

  /**
   * Gera uma senha provisória nova (a pessoa esqueceu a dela). Também
   * desbloqueia a conta e encerra as sessões abertas.
   */
  async redefinirSenha(
    admin: UsuarioAutenticado,
    id: string,
    ip?: string,
  ): Promise<ComSenhaProvisoria> {
    const atual = await this.carregarUsuario(admin, id);
    if (!atual.ativo) {
      throw new ErroDeRegraDeNegocio(
        'Reative o usuário antes de redefinir a senha',
      );
    }

    const senhaProvisoria = gerarSenhaProvisoria();
    const senhaHash = await gerarHashDeSenha(senhaProvisoria);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const alterado = await tx.usuario.update({
        where: { id: atual.id },
        data: {
          senhaHash,
          trocarSenha: true,
          falhasDeLogin: 0,
          bloqueadoAte: null,
        },
        select: camposDoUsuario,
      });
      await this.encerrarSessoes(tx, atual.id);
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'SENHA_REDEFINIDA',
        autorId: admin.id,
        alvoId: atual.id,
        ip,
      });
      return alterado;
    });

    return { usuario: this.apresentar(usuario), senhaProvisoria };
  }

  async parametrosDaEmpresa(
    admin: UsuarioAutenticado,
  ): Promise<ParametrosDaEmpresa> {
    return this.prisma.empresa.findUniqueOrThrow({
      where: { id: admin.empresaId },
      select: camposDaEmpresa,
    });
  }

  /**
   * Muda expediente, SLA e afins. Vale para as solicitações abertas daqui
   * para frente: o prazo de quem já está na fila foi calculado na abertura
   * e não muda.
   */
  async alterarEmpresa(
    admin: UsuarioAutenticado,
    alteracao: AlteracaoDaEmpresa,
    ip?: string,
  ): Promise<ParametrosDaEmpresa> {
    const atual = await this.parametrosDaEmpresa(admin);
    const inicio =
      alteracao.expedienteInicioMinuto ?? atual.expedienteInicioMinuto;
    const fim = alteracao.expedienteFimMinuto ?? atual.expedienteFimMinuto;
    if (inicio >= fim) {
      throw new ErroDeRegraDeNegocio(
        'O fim do expediente precisa ser depois do início',
      );
    }

    const dados = {
      ...alteracao,
      ...(alteracao.razaoSocial === undefined
        ? {}
        : { razaoSocial: alteracao.razaoSocial.trim() }),
      ...(alteracao.diasUteis === undefined
        ? {}
        : {
            diasUteis: [...new Set(alteracao.diasUteis)].sort((a, b) => a - b),
          }),
    };
    const mudou = diferencas(atual, dados);
    if (Object.keys(mudou).length === 0) {
      return atual;
    }

    return this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.update({
        where: { id: admin.empresaId },
        // Só os campos informados: undefined não chega ao banco
        data: Object.fromEntries(
          Object.entries(dados).filter(([, valor]) => valor !== undefined),
        ) as Prisma.EmpresaUpdateInput,
        select: camposDaEmpresa,
      });
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'EMPRESA_ALTERADA',
        autorId: admin.id,
        detalhes: mudou as Prisma.InputJsonValue,
        ip,
      });
      return empresa;
    });
  }

  /** Trilha de auditoria, do mais novo para o mais antigo. */
  async trilha(
    admin: UsuarioAutenticado,
    pagina = 1,
  ): Promise<{ eventos: EventoDaTrilha[]; total: number; pagina: number }> {
    const onde = { empresaId: admin.empresaId };
    const [eventos, total] = await Promise.all([
      this.prisma.eventoAuditoria.findMany({
        where: onde,
        include: {
          autor: { select: { id: true, nome: true } },
          alvo: { select: { id: true, nome: true } },
        },
        // O id desempata eventos do mesmo milissegundo: a paginação não
        // repete nem pula linhas
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * EVENTOS_POR_PAGINA,
        take: EVENTOS_POR_PAGINA,
      }),
      this.prisma.eventoAuditoria.count({ where: onde }),
    ]);

    return {
      pagina,
      total,
      eventos: eventos.map((e) => ({
        id: e.id,
        acao: e.acao,
        autor: e.autor,
        alvo: e.alvo,
        detalhes: e.detalhes,
        ip: e.ip,
        criadoEm: e.criadoEm,
      })),
    };
  }

  // ------------------------------------------------------------ Internos

  private async carregarUsuario(
    admin: UsuarioAutenticado,
    id: string,
  ): Promise<RegistroDeUsuario> {
    // De outra empresa ou inexistente: a mesma resposta (RFC seção 5.5)
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, empresaId: admin.empresaId },
      select: camposDoUsuario,
    });
    if (!usuario) {
      throw new ErroNaoEncontrado('Usuário não encontrado');
    }
    return usuario;
  }

  private async encerrarSessoes(
    tx: Prisma.TransactionClient,
    usuarioId: string,
  ): Promise<void> {
    await tx.sessao.updateMany({
      where: { usuarioId, revogadaEm: null },
      data: { revogadaEm: this.agora() },
    });
  }

  /** O e-mail é único na empresa: a violação vira uma mensagem clara. */
  private async semEmailRepetido<T>(trabalho: () => Promise<T>): Promise<T> {
    try {
      return await trabalho();
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new ErroDeConflito('Já existe um usuário com este e-mail');
      }
      throw erro;
    }
  }

  private apresentar(u: RegistroDeUsuario): UsuarioDaEmpresa {
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      area: u.area,
      ativo: u.ativo,
      trocarSenha: u.trocarSenha,
      bloqueado: u.bloqueadoAte !== null && u.bloqueadoAte > this.agora(),
      ultimoAcessoEm: u.ultimoAcessoEm,
      criadoEm: u.criadoEm,
    };
  }
}
