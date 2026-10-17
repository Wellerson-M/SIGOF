import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import {
  ErroDeConflito,
  ErroDeRegraDeNegocio,
  ErroNaoAutenticado,
  ErroNaoEncontrado,
} from '../../http/erros.js';
import { gerarHashDeSenha, verificarSenha } from '../../seguranca/senha.js';
import { gerarSenhaProvisoria } from '../administracao/senha-provisoria.js';
import { CAUSAS_PADRAO } from '../cadastros/servico.js';

/**
 * Administração da plataforma: quem opera o SIGOF como serviço.
 *
 * Separada da administração de cada empresa de propósito:
 *  - os administradores ficam numa tabela própria, sem empresa;
 *  - o token tem outro emissor e outra chave derivada, e vai num cookie
 *    só das rotas /api/plataforma; um token de empresa não serve aqui, e
 *    este não serve nas rotas das empresas;
 *  - enxerga cadastro e números das transportadoras, nunca o conteúdo das
 *    solicitações (LGPD: só o necessário para operar o serviço).
 */

export interface AdministradorAutenticado {
  id: string;
}

export interface ResumoDaEmpresa {
  id: string;
  razaoSocial: string;
  cnpj: string;
  slug: string;
  ativa: boolean;
  criadoEm: Date;
  usuariosAtivos: number;
  solicitacoesEmAberto: number;
  solicitacoesNoMes: number;
  ultimoAcessoEm: Date | null;
}

export interface NovaEmpresa {
  razaoSocial: string;
  cnpj: string;
  slug: string;
  administrador: { nome: string; email: string };
}

export const HORAS_DE_SESSAO = 12;
const EMISSOR = 'sigof-plataforma';
const FALHAS_PARA_BLOQUEIO = 5;
const MINUTOS_DE_BLOQUEIO = 30;
const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos';

/** Chave própria: o mesmo segredo, mas outro uso, então outra chave. */
function chaveDaPlataforma(segredo: string): Uint8Array {
  return new TextEncoder().encode(`plataforma:${segredo}`);
}

export async function emitirTokenDaPlataforma(
  administradorId: string,
  segredo: string,
): Promise<string> {
  return new SignJWT({ tipo: 'plataforma' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(administradorId)
    .setIssuer(EMISSOR)
    .setIssuedAt()
    .setExpirationTime(`${HORAS_DE_SESSAO}h`)
    .sign(chaveDaPlataforma(segredo));
}

export async function verificarTokenDaPlataforma(
  token: string,
  segredo: string,
): Promise<AdministradorAutenticado | null> {
  try {
    const { payload } = await jwtVerify(token, chaveDaPlataforma(segredo), {
      issuer: EMISSOR,
      algorithms: ['HS256'],
    });
    return typeof payload.sub === 'string' && payload.tipo === 'plataforma'
      ? { id: payload.sub }
      : null;
  } catch {
    return null;
  }
}

/** CNPJ: só os 14 dígitos, com os dois dígitos verificadores certos. */
export function cnpjValido(valor: string): string | null {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return null;
  const digito = (base: string) => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((t, c, i) => t + Number(c) * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(d.slice(0, 12));
  const segundo = digito(d.slice(0, 12) + primeiro);
  return d.endsWith(`${primeiro}${segundo}`) ? d : null;
}

export class ServicoDaPlataforma {
  private readonly hashFicticio: Promise<string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly segredo: string,
    private readonly agora: () => Date = () => new Date(),
  ) {
    this.hashFicticio = gerarHashDeSenha(randomUUID());
  }

  private async registrar(
    gravador:
      Pick<PrismaClient, 'eventoDaPlataforma'> | Prisma.TransactionClient,
    evento: {
      acao: string;
      administradorId?: string | null;
      empresaId?: string | null;
      detalhes?: Prisma.InputJsonValue;
      ip?: string | undefined;
    },
  ): Promise<void> {
    await gravador.eventoDaPlataforma.create({
      data: {
        acao: evento.acao,
        administradorId: evento.administradorId ?? null,
        empresaId: evento.empresaId ?? null,
        ...(evento.detalhes === undefined ? {} : { detalhes: evento.detalhes }),
        ip: evento.ip ?? null,
      },
    });
  }

  /** Mesma proteção do login das empresas, com bloqueio mais rígido. */
  async entrar(email: string, senha: string, ip?: string): Promise<string> {
    const admin = await this.prisma.administradorDaPlataforma.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!admin || !admin.ativo) {
      await verificarSenha(await this.hashFicticio, senha);
      throw new ErroNaoAutenticado(CREDENCIAIS_INVALIDAS);
    }
    const agora = this.agora();
    const bloqueado = admin.bloqueadoAte !== null && admin.bloqueadoAte > agora;
    const certa = await verificarSenha(admin.senhaHash, senha);

    if (bloqueado || !certa) {
      const falhas = certa ? admin.falhasDeLogin : admin.falhasDeLogin + 1;
      await this.prisma.administradorDaPlataforma.update({
        where: { id: admin.id },
        data: {
          falhasDeLogin: falhas,
          ...(falhas >= FALHAS_PARA_BLOQUEIO && !bloqueado
            ? {
                bloqueadoAte: new Date(
                  agora.getTime() + MINUTOS_DE_BLOQUEIO * 60_000,
                ),
              }
            : {}),
        },
      });
      await this.registrar(this.prisma, {
        acao: 'ENTRADA_RECUSADA',
        administradorId: admin.id,
        detalhes: { motivo: bloqueado ? 'bloqueado' : 'senha errada' },
        ip,
      });
      throw new ErroNaoAutenticado(CREDENCIAIS_INVALIDAS);
    }

    await this.prisma.administradorDaPlataforma.update({
      where: { id: admin.id },
      data: { falhasDeLogin: 0, bloqueadoAte: null, ultimoAcessoEm: agora },
    });
    await this.registrar(this.prisma, {
      acao: 'ENTROU',
      administradorId: admin.id,
      ip,
    });
    return emitirTokenDaPlataforma(admin.id, this.segredo);
  }

  /** O administrador logado (ativo), ou 401. */
  async eu(admin: AdministradorAutenticado) {
    const registro = await this.prisma.administradorDaPlataforma.findFirst({
      where: { id: admin.id, ativo: true },
      select: { id: true, nome: true, email: true, trocarSenha: true },
    });
    if (!registro) throw new ErroNaoAutenticado();
    return registro;
  }

  async trocarSenha(
    admin: AdministradorAutenticado,
    senhaAtual: string,
    novaSenha: string,
    ip?: string,
  ): Promise<void> {
    const registro = await this.prisma.administradorDaPlataforma.findFirst({
      where: { id: admin.id, ativo: true },
    });
    if (!registro || !(await verificarSenha(registro.senhaHash, senhaAtual))) {
      throw new ErroDeRegraDeNegocio('A senha atual não confere');
    }
    if (senhaAtual === novaSenha) {
      throw new ErroDeRegraDeNegocio(
        'A nova senha precisa ser diferente da atual',
      );
    }
    await this.prisma.administradorDaPlataforma.update({
      where: { id: registro.id },
      data: {
        senhaHash: await gerarHashDeSenha(novaSenha),
        trocarSenha: false,
      },
    });
    await this.registrar(this.prisma, {
      acao: 'SENHA_ALTERADA',
      administradorId: registro.id,
      ip,
    });
  }

  /** As transportadoras com os números de uso (sem conteúdo de solicitação). */
  async empresas(): Promise<ResumoDaEmpresa[]> {
    const agora = this.agora();
    const inicioDoMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
    );
    const empresas = await this.prisma.empresa.findMany({
      orderBy: [{ ativa: 'desc' }, { razaoSocial: 'asc' }],
      select: {
        id: true,
        razaoSocial: true,
        cnpj: true,
        slug: true,
        ativa: true,
        criadoEm: true,
        _count: {
          select: {
            usuarios: { where: { ativo: true } },
            solicitacoes: {
              where: { status: { notIn: ['RESOLVIDO', 'CANCELADO'] } },
            },
          },
        },
      },
    });
    const [noMes, acessos] = await Promise.all([
      this.prisma.solicitacao.groupBy({
        by: ['empresaId'],
        where: { criadoEm: { gte: inicioDoMes } },
        _count: { _all: true },
      }),
      this.prisma.usuario.groupBy({
        by: ['empresaId'],
        _max: { ultimoAcessoEm: true },
      }),
    ]);
    return empresas.map((e) => ({
      id: e.id,
      razaoSocial: e.razaoSocial,
      cnpj: e.cnpj,
      slug: e.slug,
      ativa: e.ativa,
      criadoEm: e.criadoEm,
      usuariosAtivos: e._count.usuarios,
      solicitacoesEmAberto: e._count.solicitacoes,
      solicitacoesNoMes:
        noMes.find((n) => n.empresaId === e.id)?._count._all ?? 0,
      ultimoAcessoEm:
        acessos.find((a) => a.empresaId === e.id)?._max.ultimoAcessoEm ?? null,
    }));
  }

  /**
   * Cadastra a transportadora já pronta para usar: a lista padrão de causas
   * de erro e o primeiro administrador dela, com senha provisória (mostrada
   * uma vez, para entregar a quem vai administrar a empresa).
   */
  async criarEmpresa(
    admin: AdministradorAutenticado,
    dados: NovaEmpresa,
    ip?: string,
  ): Promise<{ empresa: ResumoDaEmpresa; senhaProvisoria: string }> {
    const cnpj = cnpjValido(dados.cnpj);
    if (!cnpj) throw new ErroDeRegraDeNegocio('CNPJ inválido');
    const slug = dados.slug.trim().toLowerCase();
    const senhaProvisoria = gerarSenhaProvisoria();
    const senhaHash = await gerarHashDeSenha(senhaProvisoria);

    let empresaId: string;
    try {
      empresaId = await this.prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({
          data: { razaoSocial: dados.razaoSocial.trim(), cnpj, slug },
        });
        await tx.causaDeErro.createMany({
          data: CAUSAS_PADRAO.map((c) => ({ empresaId: empresa.id, ...c })),
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nome: dados.administrador.nome.trim(),
            email: dados.administrador.email.trim().toLowerCase(),
            perfil: 'ADMIN',
            senhaHash,
            trocarSenha: true,
          },
        });
        await this.registrar(tx, {
          acao: 'EMPRESA_CRIADA',
          administradorId: admin.id,
          empresaId: empresa.id,
          detalhes: {
            razaoSocial: empresa.razaoSocial,
            slug,
            administrador: usuario.email,
          },
          ip,
        });
        return empresa.id;
      });
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new ErroDeConflito('Já existe empresa com este CNPJ ou código');
      }
      throw erro;
    }
    const empresa = (await this.empresas()).find((e) => e.id === empresaId)!;
    return { empresa, senhaProvisoria };
  }

  /**
   * Muda o nome ou ativa/desativa. Desativar derruba as sessões de todos
   * os usuários da empresa na hora; os dados ficam guardados.
   */
  async alterarEmpresa(
    admin: AdministradorAutenticado,
    id: string,
    alteracao: {
      razaoSocial?: string | undefined;
      ativa?: boolean | undefined;
    },
    ip?: string,
  ): Promise<ResumoDaEmpresa> {
    const atual = await this.prisma.empresa.findUnique({ where: { id } });
    if (!atual) throw new ErroNaoEncontrado('Empresa não encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.empresa.update({
        where: { id },
        data: {
          ...(alteracao.razaoSocial
            ? { razaoSocial: alteracao.razaoSocial.trim() }
            : {}),
          ...(alteracao.ativa === undefined ? {} : { ativa: alteracao.ativa }),
        },
      });
      if (alteracao.ativa === false && atual.ativa) {
        await tx.sessao.updateMany({
          where: { empresaId: id, revogadaEm: null },
          data: { revogadaEm: this.agora() },
        });
      }
      await this.registrar(tx, {
        acao: 'EMPRESA_ALTERADA',
        administradorId: admin.id,
        empresaId: id,
        detalhes: alteracao as Prisma.InputJsonValue,
        ip,
      });
    });
    return (await this.empresas()).find((e) => e.id === id)!;
  }

  /**
   * Cria mais um administrador na empresa (o anterior saiu, esqueceu a
   * senha e não há outro admin para redefinir...).
   */
  async criarAdministradorDaEmpresa(
    admin: AdministradorAutenticado,
    empresaId: string,
    dados: { nome: string; email: string },
    ip?: string,
  ): Promise<{ email: string; senhaProvisoria: string }> {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
    });
    if (!empresa) throw new ErroNaoEncontrado('Empresa não encontrada');
    const senhaProvisoria = gerarSenhaProvisoria();
    const email = dados.email.trim().toLowerCase();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.create({
          data: {
            empresaId,
            nome: dados.nome.trim(),
            email,
            perfil: 'ADMIN',
            senhaHash: await gerarHashDeSenha(senhaProvisoria),
            trocarSenha: true,
          },
        });
        await this.registrar(tx, {
          acao: 'ADMIN_DA_EMPRESA_CRIADO',
          administradorId: admin.id,
          empresaId,
          detalhes: { email },
          ip,
        });
      });
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new ErroDeConflito(
          'Já existe um usuário com este e-mail na empresa',
        );
      }
      throw erro;
    }
    return { email, senhaProvisoria };
  }

  async eventos(pagina = 1) {
    const [eventos, total] = await Promise.all([
      this.prisma.eventoDaPlataforma.findMany({
        include: { administrador: { select: { id: true, nome: true } } },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * 50,
        take: 50,
      }),
      this.prisma.eventoDaPlataforma.count(),
    ]);
    return { eventos, total, pagina };
  }
}

/**
 * Cria um administrador da plataforma (usado pelo script do servidor).
 * Devolve a senha provisória, que ele troca no primeiro acesso.
 */
/**
 * Cria o administrador ou, se o e-mail já existe, gera outra senha
 * provisória para ele (destrava e exige a troca). Assim, uma senha
 * perdida no caminho se recupera rodando o mesmo comando de novo.
 */
export async function criarAdministradorDaPlataforma(
  prisma: PrismaClient,
  dados: { nome: string; email: string },
): Promise<{ senha: string; novo: boolean }> {
  const senhaProvisoria = gerarSenhaProvisoria(16);
  const senhaHash = await gerarHashDeSenha(senhaProvisoria);
  const email = dados.email.trim().toLowerCase();
  const existente = await prisma.administradorDaPlataforma.findUnique({
    where: { email },
    select: { id: true },
  });
  await prisma.administradorDaPlataforma.upsert({
    where: { email },
    create: { nome: dados.nome.trim(), email, senhaHash },
    update: {
      senhaHash,
      trocarSenha: true,
      ativo: true,
      falhasDeLogin: 0,
      bloqueadoAte: null,
    },
  });
  return { senha: senhaProvisoria, novo: !existente };
}
