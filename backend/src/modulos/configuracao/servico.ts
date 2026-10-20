import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CAMPOS,
  PRIORIDADES,
  TIPOS,
  mesclarConfiguracao,
  type Campo,
  type ConfiguracaoDoTipo,
  type NomeDoCampo,
  type TipoOcorrencia,
} from '../../dominio/formulario.js';
import {
  moduloLigado,
  modulosLigados,
  normalizarModulos,
  type ChavesDosModulos,
  type Modulo,
} from '../../dominio/modulos.js';
import { ErroAcessoNegado, ErroDeRegraDeNegocio } from '../../http/erros.js';
import { diferencas, registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';

type Leitor = PrismaClient | Prisma.TransactionClient;

export interface ModulosDaEmpresa {
  /** O que a plataforma deixa a empresa usar. */
  liberados: Modulo[];
  /** O que a empresa ligou (pode conter algo que deixou de ser liberado). */
  ativos: Modulo[];
  /** Os que valem: liberados e ligados. */
  ligados: Modulo[];
}

export interface FormularioDaEmpresa {
  /** A empresa pode personalizar (módulo "Formulário" em uso). */
  personalizavel: boolean;
  tipos: ConfiguracaoDoTipo[];
}

/** O que o administrador manda ao salvar um tipo. */
export interface AlteracaoDoFormulario {
  ativo: boolean;
  exigirDocumento: boolean;
  campos: Record<NomeDoCampo, Campo>;
  motivos: string[];
}

/**
 * O formulário que vale para a empresa, já com os módulos aplicados:
 * sem o módulo de filiais, o campo filial some; sem o módulo "Formulário",
 * vale o padrão do sistema mesmo que algo tenha sido salvo antes.
 */
export async function formularioEfetivo(
  leitor: Leitor,
  empresa: ChavesDosModulos & { id: string },
): Promise<ConfiguracaoDoTipo[]> {
  const personalizavel = moduloLigado(empresa, 'FORMULARIO');
  const salvas = personalizavel
    ? await leitor.configuracaoDoFormulario.findMany({
        where: { empresaId: empresa.id },
      })
    : [];
  return TIPOS.map((tipo) => {
    const config = mesclarConfiguracao(
      tipo,
      salvas.find((s) => s.tipo === tipo) ?? null,
    );
    if (!moduloLigado(empresa, 'FILIAIS')) {
      config.campos.filial = { modo: 'OCULTO' };
    }
    return config;
  });
}

export async function configuracaoDoTipo(
  leitor: Leitor,
  empresa: ChavesDosModulos & { id: string },
  tipo: TipoOcorrencia,
): Promise<ConfiguracaoDoTipo> {
  const todas = await formularioEfetivo(leitor, empresa);
  return todas.find((c) => c.tipo === tipo)!;
}

/** Sem vazios nem repetidos (ignorando maiúsculas), na ordem digitada. */
function limparLista(lista: string[]): string[] {
  const vistas = new Set<string>();
  return lista
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter((item) => {
      const chave = item.toLocaleLowerCase('pt-BR');
      if (!item || vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    });
}

/**
 * Módulos e formulário de abertura de cada empresa. Todo mundo logado lê
 * (as telas se montam a partir disso); só o administrador altera.
 */
export class ServicoDeConfiguracao {
  constructor(private readonly prisma: PrismaClient) {}

  async modulos(usuario: UsuarioAutenticado): Promise<ModulosDaEmpresa> {
    const empresa = await this.chaves(usuario.empresaId);
    return {
      liberados: normalizarModulos(empresa.modulosLiberados),
      ativos: normalizarModulos(empresa.modulosAtivos),
      ligados: modulosLigados(empresa),
    };
  }

  /**
   * Liga e desliga módulos. Só os liberados podem ser ligados; desligar
   * não apaga nada (cadastros e registros voltam ao religar).
   */
  async alterarModulos(
    admin: UsuarioAutenticado,
    ativos: string[],
    ip?: string,
  ): Promise<ModulosDaEmpresa> {
    const empresa = await this.chaves(admin.empresaId);
    const pedidos = normalizarModulos(ativos);
    const naoLiberado = pedidos.find(
      (m) => !empresa.modulosLiberados.includes(m),
    );
    if (naoLiberado) {
      throw new ErroDeRegraDeNegocio(
        'Este módulo não está liberado para a sua empresa',
      );
    }
    // O que a empresa tinha ligado e a plataforma bloqueou continua
    // guardado: se for liberado de novo, volta como estava
    const bloqueados = normalizarModulos(empresa.modulosAtivos).filter(
      (m) => !empresa.modulosLiberados.includes(m),
    );
    const novos = normalizarModulos([...pedidos, ...bloqueados]);
    const mudou = diferencas(
      { modulosAtivos: normalizarModulos(empresa.modulosAtivos) },
      { modulosAtivos: novos },
    );
    if (Object.keys(mudou).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.empresa.update({
          where: { id: admin.empresaId },
          data: { modulosAtivos: novos },
        });
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'MODULOS_ALTERADOS',
          autorId: admin.id,
          detalhes: mudou as Prisma.InputJsonValue,
          ip,
        });
      });
    }
    return this.modulos(admin);
  }

  /**
   * O formulário de cada tipo. Quem abre solicitação recebe só os tipos
   * ativos; o administrador (com `todos`) recebe também os desligados.
   */
  async formulario(
    usuario: UsuarioAutenticado,
    todos = false,
  ): Promise<FormularioDaEmpresa> {
    const empresa = await this.chaves(usuario.empresaId);
    const tipos = await formularioEfetivo(this.prisma, empresa);
    return {
      personalizavel: moduloLigado(empresa, 'FORMULARIO'),
      tipos: todos ? tipos : tipos.filter((t) => t.ativo),
    };
  }

  async alterarFormulario(
    admin: UsuarioAutenticado,
    tipo: TipoOcorrencia,
    alteracao: AlteracaoDoFormulario,
    ip?: string,
  ): Promise<ConfiguracaoDoTipo> {
    const empresa = await this.chaves(admin.empresaId);
    if (!moduloLigado(empresa, 'FORMULARIO')) {
      throw new ErroAcessoNegado(
        'Ligue o módulo "Formulário personalizado" para alterar o formulário',
      );
    }

    const motivos = limparLista(alteracao.motivos);
    const campos = this.conferirCampos(alteracao.campos, motivos);
    if (!alteracao.ativo) {
      const outrosAtivos = (await formularioEfetivo(this.prisma, empresa))
        .filter((c) => c.tipo !== tipo)
        .some((c) => c.ativo);
      if (!outrosAtivos) {
        throw new ErroDeRegraDeNegocio(
          'Deixe pelo menos um tipo de ocorrência ativo',
        );
      }
    }

    const antes = await configuracaoDoTipo(this.prisma, empresa, tipo);
    const dados = {
      ativo: alteracao.ativo,
      exigirDocumento: alteracao.exigirDocumento,
      campos: campos as unknown as Prisma.InputJsonValue,
      motivos,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracaoDoFormulario.upsert({
        where: { empresaId_tipo: { empresaId: admin.empresaId, tipo } },
        create: { empresaId: admin.empresaId, tipo, ...dados },
        update: dados,
      });
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'FORMULARIO_ALTERADO',
        autorId: admin.id,
        detalhes: {
          tipo,
          ...diferencas(
            {
              ativo: antes.ativo,
              exigirDocumento: antes.exigirDocumento,
              campos: antes.campos,
              motivos: antes.motivos,
            },
            { ...dados, campos },
          ),
        } as Prisma.InputJsonValue,
        ip,
      });
    });
    return configuracaoDoTipo(this.prisma, empresa, tipo);
  }

  /** Volta o tipo ao padrão do sistema (apaga o que foi salvo). */
  async restaurarFormulario(
    admin: UsuarioAutenticado,
    tipo: TipoOcorrencia,
    ip?: string,
  ): Promise<ConfiguracaoDoTipo> {
    const empresa = await this.chaves(admin.empresaId);
    if (!moduloLigado(empresa, 'FORMULARIO')) {
      throw new ErroAcessoNegado(
        'Ligue o módulo "Formulário personalizado" para alterar o formulário',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.configuracaoDoFormulario.deleteMany({
        where: { empresaId: admin.empresaId, tipo },
      });
      if (count > 0) {
        await registrar(tx, {
          empresaId: admin.empresaId,
          acao: 'FORMULARIO_ALTERADO',
          autorId: admin.id,
          detalhes: { tipo, restauradoParaOPadrao: true },
          ip,
        });
      }
    });
    return configuracaoDoTipo(this.prisma, empresa, tipo);
  }

  /** Padrões coerentes com o tipo de campo e com a lista de motivos. */
  private conferirCampos(
    recebidos: Record<NomeDoCampo, Campo>,
    motivos: string[],
  ): Record<NomeDoCampo, Campo> {
    const campos = {} as Record<NomeDoCampo, Campo>;
    for (const nome of CAMPOS) {
      const campo = recebidos[nome];
      const padrao = campo.padrao?.trim() || undefined;
      if (nome === 'descricao' && campo.modo === 'OCULTO') {
        throw new ErroDeRegraDeNegocio('A descrição não pode ficar escondida');
      }
      if (
        nome === 'prioridade' &&
        padrao !== undefined &&
        !(PRIORIDADES as readonly string[]).includes(padrao)
      ) {
        throw new ErroDeRegraDeNegocio('Prioridade padrão inválida');
      }
      if (nome === 'motivo') {
        if (campo.modo !== 'OCULTO' && motivos.length === 0) {
          throw new ErroDeRegraDeNegocio(
            'Cadastre pelo menos um motivo ou esconda o campo',
          );
        }
        if (padrao !== undefined && !motivos.includes(padrao)) {
          throw new ErroDeRegraDeNegocio(
            'O motivo padrão precisa estar na lista',
          );
        }
      }
      // Documento e anexo mudam a cada solicitação: não têm padrão
      const semPadrao: NomeDoCampo[] = [
        'cte',
        'nf',
        'fatura',
        'anexos',
        'filial',
      ];
      campos[nome] =
        padrao === undefined || semPadrao.includes(nome)
          ? { modo: campo.modo }
          : { modo: campo.modo, padrao };
    }
    return campos;
  }

  private chaves(empresaId: string) {
    return this.prisma.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { id: true, modulosLiberados: true, modulosAtivos: true },
    });
  }
}
