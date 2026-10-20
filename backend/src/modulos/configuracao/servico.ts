import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CAMPOS,
  PRIORIDADES,
  TIPOS_DO_SISTEMA,
  codigoParaTipo,
  ehDoSistema,
  mesclarConfiguracao,
  nomeDoTipo,
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
import {
  ErroAcessoNegado,
  ErroDeRegraDeNegocio,
  ErroNaoEncontrado,
} from '../../http/erros.js';
import { diferencas, registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';

type Leitor = PrismaClient | Prisma.TransactionClient;

/** Quantos tipos a empresa pode criar além dos quatro do sistema. */
const LIMITE_DE_TIPOS = 30;

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
  /** Novo nome do tipo (sem ele, fica o atual). */
  nome?: string | undefined;
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
        orderBy: { criadoEm: 'asc' },
      })
    : [];
  // Os do sistema primeiro, depois os da empresa na ordem em que nasceram
  const tipos = [
    ...TIPOS_DO_SISTEMA,
    ...salvas.filter((s) => s.daEmpresa).map((s) => s.tipo),
  ];
  return tipos.map((tipo) => {
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
): Promise<ConfiguracaoDoTipo | undefined> {
  const todas = await formularioEfetivo(leitor, empresa);
  return todas.find((c) => c.tipo === tipo);
}

/**
 * Os nomes que a empresa deu aos tipos (para telas, e-mails e planilhas).
 * Vale mesmo com o módulo do formulário desligado: solicitação antiga de um
 * tipo criado pela empresa continua com o nome certo.
 */
export async function nomesDosTipos(
  leitor: Leitor,
  empresaId: string,
): Promise<Map<string, string>> {
  const salvas = await leitor.configuracaoDoFormulario.findMany({
    where: { empresaId, nome: { not: null } },
    select: { tipo: true, nome: true },
  });
  return new Map(salvas.map((s) => [s.tipo, s.nome!]));
}

/** Todos os tipos que a empresa já teve, com o nome de agora. */
export async function tiposConhecidos(
  leitor: Leitor,
  empresaId: string,
): Promise<{ tipo: string; nome: string }[]> {
  const salvas = await leitor.configuracaoDoFormulario.findMany({
    where: { empresaId },
    select: { tipo: true, nome: true, daEmpresa: true },
    orderBy: { criadoEm: 'asc' },
  });
  const nomes = new Map(
    salvas.flatMap((s) => (s.nome ? [[s.tipo, s.nome] as const] : [])),
  );
  return [
    ...TIPOS_DO_SISTEMA,
    ...salvas.filter((s) => s.daEmpresa).map((s) => s.tipo),
  ].map((tipo) => ({ tipo, nome: nomeDoTipo(tipo, nomes) }));
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
    const empresa = await this.chavesParaPersonalizar(admin.empresaId);
    const antes = await this.tipoExistente(empresa, tipo);
    const nome = await this.nomeLivre(
      empresa,
      alteracao.nome ?? antes.nome,
      tipo,
    );

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

    const dados = {
      // O nome do sistema não precisa ser gravado
      nome: antes.doSistema && nome === nomeDoTipo(tipo) ? null : nome,
      ativo: alteracao.ativo,
      exigirDocumento: alteracao.exigirDocumento,
      campos: campos as unknown as Prisma.InputJsonValue,
      motivos,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracaoDoFormulario.upsert({
        where: { empresaId_tipo: { empresaId: admin.empresaId, tipo } },
        create: {
          empresaId: admin.empresaId,
          tipo,
          daEmpresa: !antes.doSistema,
          ...dados,
        },
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
              nome: antes.nome,
              ativo: antes.ativo,
              exigirDocumento: antes.exigirDocumento,
              campos: antes.campos,
              motivos: antes.motivos,
            },
            { ...dados, nome, campos },
          ),
        } as Prisma.InputJsonValue,
        ip,
      });
    });
    return this.tipoExistente(empresa, tipo);
  }

  /**
   * Cria um tipo de ocorrência da empresa. Nasce ativo, com o formulário
   * comum (documento, descrição, anexos); o administrador ajusta depois.
   */
  async criarTipo(
    admin: UsuarioAutenticado,
    nomeDigitado: string,
    ip?: string,
  ): Promise<ConfiguracaoDoTipo> {
    const empresa = await this.chavesParaPersonalizar(admin.empresaId);
    const nome = await this.nomeLivre(empresa, nomeDigitado);
    const existentes = await this.prisma.configuracaoDoFormulario.findMany({
      where: { empresaId: admin.empresaId },
      select: { tipo: true, daEmpresa: true },
    });
    if (existentes.filter((e) => e.daEmpresa).length >= LIMITE_DE_TIPOS) {
      throw new ErroDeRegraDeNegocio(
        `No máximo ${LIMITE_DE_TIPOS} tipos criados pela empresa`,
      );
    }
    const tipo = codigoParaTipo(
      nome,
      existentes.map((e) => e.tipo),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracaoDoFormulario.create({
        data: { empresaId: admin.empresaId, tipo, nome, daEmpresa: true },
      });
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'FORMULARIO_ALTERADO',
        autorId: admin.id,
        detalhes: { tipo, criado: nome },
        ip,
      });
    });
    return this.tipoExistente(empresa, tipo);
  }

  /**
   * Exclui um tipo criado pela empresa que nunca foi usado. Com
   * solicitação, ele só pode ser desligado (o histórico aponta para ele).
   */
  async excluirTipo(
    admin: UsuarioAutenticado,
    tipo: TipoOcorrencia,
    ip?: string,
  ): Promise<void> {
    const empresa = await this.chavesParaPersonalizar(admin.empresaId);
    const config = await this.tipoExistente(empresa, tipo);
    if (config.doSistema) {
      throw new ErroDeRegraDeNegocio(
        'Os tipos do sistema não são excluídos: desligue o que não usar',
      );
    }
    const usadas = await this.prisma.solicitacao.count({
      where: { empresaId: admin.empresaId, tipo },
    });
    if (usadas > 0) {
      throw new ErroDeRegraDeNegocio(
        'Já há solicitações deste tipo: desligue-o em vez de excluir',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracaoDoFormulario.delete({
        where: { empresaId_tipo: { empresaId: admin.empresaId, tipo } },
      });
      // Item de verificação que valia só para ele não pode passar a valer
      // para todos (lista vazia = todos os tipos): esse é desligado
      const itens = await tx.itemDeVerificacao.findMany({
        where: { empresaId: admin.empresaId, tipos: { has: tipo } },
        select: { id: true, tipos: true },
      });
      for (const item of itens) {
        const restantes = item.tipos.filter((t) => t !== tipo);
        await tx.itemDeVerificacao.update({
          where: { id: item.id },
          data:
            restantes.length > 0
              ? { tipos: restantes }
              : { tipos: restantes, ativo: false },
        });
      }
      await registrar(tx, {
        empresaId: admin.empresaId,
        acao: 'FORMULARIO_ALTERADO',
        autorId: admin.id,
        detalhes: { tipo, excluido: config.nome },
        ip,
      });
    });
  }

  /** Volta um tipo do sistema ao padrão (apaga o que foi salvo, nome inclusive). */
  async restaurarFormulario(
    admin: UsuarioAutenticado,
    tipo: TipoOcorrencia,
    ip?: string,
  ): Promise<ConfiguracaoDoTipo> {
    const empresa = await this.chavesParaPersonalizar(admin.empresaId);
    if (!ehDoSistema(tipo)) {
      throw new ErroDeRegraDeNegocio(
        'Só os tipos do sistema têm um padrão para voltar',
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
    return this.tipoExistente(empresa, tipo);
  }

  private async tipoExistente(
    empresa: ChavesDosModulos & { id: string },
    tipo: TipoOcorrencia,
  ): Promise<ConfiguracaoDoTipo> {
    const config = await configuracaoDoTipo(this.prisma, empresa, tipo);
    if (!config) {
      throw new ErroNaoEncontrado('Tipo de ocorrência não encontrado');
    }
    return config;
  }

  /** Nome aparado, sem repetir o de outro tipo da empresa. */
  private async nomeLivre(
    empresa: ChavesDosModulos & { id: string },
    digitado: string,
    proprio?: TipoOcorrencia,
  ): Promise<string> {
    const nome = digitado.trim().replace(/\s+/g, ' ');
    if (nome.length < 2) {
      throw new ErroDeRegraDeNegocio('Dê um nome ao tipo de ocorrência');
    }
    const chave = nome.toLocaleLowerCase('pt-BR');
    const repetido = (await tiposConhecidos(this.prisma, empresa.id)).some(
      (t) => t.tipo !== proprio && t.nome.toLocaleLowerCase('pt-BR') === chave,
    );
    if (repetido) {
      throw new ErroDeRegraDeNegocio('Já existe um tipo com esse nome');
    }
    return nome;
  }

  private async chavesParaPersonalizar(empresaId: string) {
    const empresa = await this.chaves(empresaId);
    if (!moduloLigado(empresa, 'FORMULARIO')) {
      throw new ErroAcessoNegado(
        'Ligue o módulo "Formulário personalizado" para alterar o formulário',
      );
    }
    return empresa;
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
