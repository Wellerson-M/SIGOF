import { Prisma, type PrismaClient } from '@prisma/client';
import {
  encontrarDuplicidades,
  normalizarDocumento,
} from '../../dominio/duplicidade.js';
import {
  compararNaFila,
  indicadorDeSla,
  type IndicadorDeSla,
  type Prioridade,
} from '../../dominio/fila.js';
import { competenciaDe, formatarProtocolo } from '../../dominio/protocolo.js';
import {
  expedienteDaEmpresa,
  iniciarSla,
  pausarSla,
  retomarSla,
  type EstadoSla,
  type Expediente,
} from '../../dominio/sla.js';
import {
  TRANSICOES,
  ehTerminal,
  transicoesPermitidas,
  validarTransicao,
  type Perfil,
  type Status,
} from '../../dominio/status.js';
import {
  ErroAcessoNegado,
  ErroDeConflito,
  ErroDeRegraDeNegocio,
  ErroNaoEncontrado,
} from '../../http/erros.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import type { ServicoDeAvisos } from '../avisos/avisos.js';
import type { Ocorrido } from '../avisos/modelos.js';

export type TipoOcorrencia =
  'REVERSAO' | 'TROCA_PAGADOR' | 'AJUSTE_FISCAL' | 'OUTRO';

export interface DadosDeAbertura {
  tipo: TipoOcorrencia;
  cte?: string | undefined;
  nf?: string | undefined;
  pagadorCorreto?: string | undefined;
  descricao: string;
  prioridade?: Prioridade | undefined;
  /** Filial que emitiu o documento (obrigatória se a empresa tem filiais). */
  filialId?: string | undefined;
  /**
   * SHA-256 dos arquivos que vão ser anexados logo depois de abrir. Só
   * serve para o alerta de duplicidade: o hash gravado no anexo é sempre o
   * calculado pelo servidor ao receber o arquivo.
   */
  hashesDosAnexos?: string[] | undefined;
  /** O usuário viu o alerta de duplicidade e decidiu abrir mesmo assim. */
  confirmarDuplicidade?: boolean | undefined;
}

export interface Pessoa {
  id: string;
  nome: string;
}

/** Como a solicitação aparece no quadro e na fila. */
export interface Resumo {
  id: string;
  protocolo: string;
  tipo: TipoOcorrencia;
  cte: string | null;
  nf: string | null;
  descricao: string;
  status: Status;
  prioridade: Prioridade;
  solicitante: Pessoa;
  responsavel: Pessoa | null;
  filial: Pessoa | null;
  criadoEm: Date;
  atualizadoEm: Date;
  slaVenceEm: Date | null;
  sla: IndicadorDeSla;
  /** Status para onde *este usuário* pode mover a solicitação agora. */
  acoes: Status[];
  /** Quantos anexos e mensagens tem (o quadro mostra no cartão). */
  totais: { anexos: number; mensagens: number };
}

export interface AnexoDaSolicitacao {
  id: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  enviadoPor: Pessoa;
  criadoEm: Date;
}

export interface EventoDoHistorico {
  id: string;
  statusAnterior: Status | null;
  statusNovo: Status;
  observacao: string | null;
  autor: Pessoa;
  criadoEm: Date;
}

export interface MensagemDaConversa {
  id: string;
  conteudo: string;
  interna: boolean;
  autor: Pessoa;
  criadoEm: Date;
}

/** Registro de cada e-mail enviado sobre a solicitação (só a equipe vê). */
export interface EmailDaSolicitacao {
  id: string;
  para: string[];
  situacao: 'PENDENTE' | 'ENVIADO' | 'FALHOU';
  tentativas: number;
  ultimoErro: string | null;
  enviadoEm: Date | null;
  criadoEm: Date;
}

export interface Detalhe extends Resumo {
  pagadorCorreto: string | null;
  resolvidoEm: Date | null;
  historico: EventoDoHistorico[];
  mensagens: MensagemDaConversa[];
  emails: EmailDaSolicitacao[];
  anexos: AnexoDaSolicitacao[];
  pode: {
    mudarPrioridade: boolean;
    atribuir: boolean;
    comentarInterno: boolean;
  };
}

/** Status que exigem uma observação: quem lê o histórico precisa do motivo. */
export const STATUS_COM_OBSERVACAO: readonly Status[] = [
  'AGUARDANDO_DOC',
  'ESCALADO',
  'RESOLVIDO',
  'CANCELADO',
];

export interface FiltrosDaLista {
  pagina: number;
  status?: Status[] | undefined;
  prioridade?: Prioridade[] | undefined;
  tipo?: TipoOcorrencia[] | undefined;
  responsavelId?: string | undefined;
  /** Só as que o usuário abriu ou que estão com ele. */
  minhas?: boolean | undefined;
  busca?: string | undefined;
  /** Abertas a partir de / até (inclusive), "AAAA-MM-DD" no fuso da empresa. */
  de?: string | undefined;
  ate?: string | undefined;
}

export const ITENS_POR_PAGINA = 25;

/**
 * O instante em que começa o dia "AAAA-MM-DD" no fuso indicado: mede a
 * diferença entre o relógio do fuso e o UTC naquele dia e a desconta.
 */
export function inicioDoDia(dia: string, fusoHorario: string): Date {
  const meiaNoiteUtc = new Date(`${dia}T00:00:00Z`);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fusoHorario,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(meiaNoiteUtc)
      .map((p) => [p.type, p.value]),
  );
  const relogioLocal = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
  );
  return new Date(2 * meiaNoiteUtc.getTime() - relogioLocal);
}

/** Encerradas há mais que isso saem do quadro (continuam no detalhe). */
export const DIAS_NO_QUADRO_DEPOIS_DE_ENCERRAR = 30;

const PERFIS_QUE_ABREM: readonly Perfil[] = [
  'SOLICITANTE',
  'ANALISTA',
  'SUPERVISOR',
];
const PERFIS_QUE_PRIORIZAM: readonly Perfil[] = ['ANALISTA', 'SUPERVISOR'];
const PERFIS_QUE_ATRIBUEM: readonly Perfil[] = ['SUPERVISOR'];
const PERFIS_RESPONSAVEIS: readonly Perfil[] = ['ANALISTA', 'SUPERVISOR'];
const MAXIMO_NO_QUADRO = 500;
const DIA = 24 * 60 * 60 * 1000;

const NOME_DA_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

const pessoa = { select: { id: true, nome: true } } as const;

const incluirNoResumo = {
  solicitante: pessoa,
  responsavel: pessoa,
  filial: pessoa,
  // Só as mensagens visíveis a todos: contar as notas internas revelaria ao
  // solicitante que elas existem
  _count: {
    select: { anexos: true, mensagens: { where: { interna: false } } },
  },
} satisfies Prisma.SolicitacaoInclude;

type SolicitacaoComPessoas = Prisma.SolicitacaoGetPayload<{
  include: typeof incluirNoResumo;
}>;

type Transacao = Prisma.TransactionClient;

function ehInterno(perfil: Perfil): boolean {
  return perfil !== 'SOLICITANTE';
}

/** Solicitante só enxerga o que ele mesmo abriu; os internos, a empresa toda. */
export function visiveisPara(
  usuario: UsuarioAutenticado,
): Prisma.SolicitacaoWhereInput {
  return usuario.perfil === 'SOLICITANTE'
    ? { empresaId: usuario.empresaId, solicitanteId: usuario.id }
    : { empresaId: usuario.empresaId };
}

function estadoDoSla(s: {
  slaVenceEm: Date | null;
  slaPausadoEm: Date | null;
  slaMinutosPausados: number;
}): EstadoSla | null {
  return s.slaVenceEm === null
    ? null
    : {
        venceEm: s.slaVenceEm,
        pausadoEm: s.slaPausadoEm,
        minutosPausados: s.slaMinutosPausados,
      };
}

export class ServicoDeSolicitacoes {
  constructor(
    private readonly prisma: PrismaClient,
    /** Notificações e e-mails de cada movimentação; ausente, nada é avisado. */
    private readonly avisos?: ServicoDeAvisos,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Avisa dentro da mesma transação da movimentação. */
  private async avisar(
    tx: Transacao,
    usuario: UsuarioAutenticado,
    solicitacaoId: string,
    ocorrido: Ocorrido,
  ): Promise<void> {
    await this.avisos?.registrar(tx, usuario, solicitacaoId, ocorrido);
  }

  async abrir(
    usuario: UsuarioAutenticado,
    dados: DadosDeAbertura,
  ): Promise<Resumo> {
    if (!PERFIS_QUE_ABREM.includes(usuario.perfil)) {
      throw new ErroAcessoNegado('Seu perfil não abre solicitações');
    }

    const cte = normalizarDocumento(dados.cte ?? null);
    const nf = normalizarDocumento(dados.nf ?? null);
    const pagadorCorreto = dados.pagadorCorreto?.trim() || null;

    if (dados.tipo !== 'OUTRO' && cte === null && nf === null) {
      throw new ErroDeRegraDeNegocio('Informe o número do CTe ou da NF');
    }
    if (dados.tipo === 'TROCA_PAGADOR' && pagadorCorreto === null) {
      throw new ErroDeRegraDeNegocio(
        'Na troca de pagador, informe quem é o pagador correto',
      );
    }

    const criada = await this.emTransacaoComRepeticao(async (tx) => {
      const agora = this.agora();
      const empresa = await tx.empresa.findUniqueOrThrow({
        where: { id: usuario.empresaId },
      });
      const filialId = await this.conferirFilial(
        tx,
        usuario.empresaId,
        dados.filialId,
        cte !== null || nf !== null,
      );

      if (!dados.confirmarDuplicidade) {
        await this.barrarDuplicidade(tx, usuario.empresaId, {
          cte,
          nf,
          filialId,
          hashes: dados.hashesDosAnexos ?? [],
          agora,
          janelaDias: empresa.janelaDuplicidadeDias,
        });
      }

      // Incremento atômico do contador do mês: duas aberturas simultâneas
      // nunca recebem o mesmo número (RFC seção 2.5)
      const { ano, mes } = competenciaDe(agora, empresa.fusoHorario);
      const { ultimo } = await tx.sequenciaProtocolo.upsert({
        where: {
          empresaId_ano_mes: { empresaId: usuario.empresaId, ano, mes },
        },
        create: { empresaId: usuario.empresaId, ano, mes, ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });

      const sla = iniciarSla(
        agora,
        empresa.slaAtendimentoMinutos,
        expedienteDaEmpresa(empresa),
      );

      const solicitacao = await tx.solicitacao.create({
        data: {
          empresaId: usuario.empresaId,
          protocolo: formatarProtocolo({ ano, mes, sequencial: ultimo }),
          solicitanteId: usuario.id,
          filialId,
          tipo: dados.tipo,
          cte,
          nf,
          pagadorCorreto,
          descricao: dados.descricao.trim(),
          prioridade: dados.prioridade ?? 'MEDIA',
          slaVenceEm: sla.venceEm,
          criadoEm: agora,
        },
        include: incluirNoResumo,
      });

      await tx.statusHistorico.create({
        data: {
          empresaId: usuario.empresaId,
          solicitacaoId: solicitacao.id,
          autorId: usuario.id,
          statusAnterior: null,
          statusNovo: 'NOVO',
          observacao: dados.confirmarDuplicidade
            ? 'Aberta mesmo com o alerta de duplicidade'
            : null,
          criadoEm: agora,
        },
      });

      await this.avisar(tx, usuario, solicitacao.id, { tipo: 'ABERTA' });

      return { solicitacao, expediente: expedienteDaEmpresa(empresa) };
    });

    return this.resumir(criada.solicitacao, usuario, criada.expediente);
  }

  /** O quadro: tudo em aberto e o que foi encerrado nos últimos 30 dias. */
  async listar(
    usuario: UsuarioAutenticado,
    filtros: { busca?: string | undefined } = {},
  ): Promise<Resumo[]> {
    const agora = this.agora();
    const busca = filtros.busca?.trim();
    const digitos = busca ? normalizarDocumento(busca) : null;

    const [empresa, solicitacoes] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({
        where: { id: usuario.empresaId },
      }),
      this.prisma.solicitacao.findMany({
        where: {
          AND: [
            visiveisPara(usuario),
            {
              OR: [
                { status: { notIn: ['RESOLVIDO', 'CANCELADO'] } },
                {
                  atualizadoEm: {
                    gte: new Date(
                      agora.getTime() - DIAS_NO_QUADRO_DEPOIS_DE_ENCERRAR * DIA,
                    ),
                  },
                },
              ],
            },
            busca
              ? {
                  OR: [
                    { protocolo: { contains: busca, mode: 'insensitive' } },
                    { descricao: { contains: busca, mode: 'insensitive' } },
                    ...(digitos
                      ? [
                          { cte: { contains: digitos } },
                          { nf: { contains: digitos } },
                        ]
                      : []),
                  ],
                }
              : {},
          ],
        },
        include: incluirNoResumo,
        orderBy: { criadoEm: 'desc' },
        take: MAXIMO_NO_QUADRO,
      }),
    ]);

    const expediente = expedienteDaEmpresa(empresa);
    return solicitacoes
      .sort(compararNaFila)
      .map((s) => this.resumir(s, usuario, expediente, agora));
  }

  /**
   * A lista (RF04): todas as solicitações, inclusive as encerradas há muito
   * tempo, com filtros e paginação. Ordem fixa (mais nova primeiro, com o id
   * como desempate), para a mesma página sempre trazer os mesmos itens.
   */
  async pesquisar(
    usuario: UsuarioAutenticado,
    filtros: FiltrosDaLista,
  ): Promise<{
    itens: Resumo[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const busca = filtros.busca?.trim();
    const digitos = busca ? normalizarDocumento(busca) : null;
    const empresa = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: usuario.empresaId },
    });
    const fuso = empresa.fusoHorario;
    const onde: Prisma.SolicitacaoWhereInput = {
      AND: [
        visiveisPara(usuario),
        filtros.status ? { status: { in: filtros.status } } : {},
        filtros.prioridade ? { prioridade: { in: filtros.prioridade } } : {},
        filtros.tipo ? { tipo: { in: filtros.tipo } } : {},
        filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {},
        filtros.minhas
          ? {
              OR: [
                { solicitanteId: usuario.id },
                { responsavelId: usuario.id },
              ],
            }
          : {},
        filtros.de || filtros.ate
          ? {
              criadoEm: {
                ...(filtros.de ? { gte: inicioDoDia(filtros.de, fuso) } : {}),
                // "Até" inclui o dia inteiro: vai até o começo do dia seguinte
                ...(filtros.ate
                  ? {
                      lt: new Date(
                        inicioDoDia(filtros.ate, fuso).getTime() + DIA,
                      ),
                    }
                  : {}),
              },
            }
          : {},
        busca
          ? {
              OR: [
                { protocolo: { contains: busca, mode: 'insensitive' } },
                { descricao: { contains: busca, mode: 'insensitive' } },
                ...(digitos
                  ? [
                      { cte: { contains: digitos } },
                      { nf: { contains: digitos } },
                    ]
                  : []),
              ],
            }
          : {},
      ],
    };

    const [total, solicitacoes] = await Promise.all([
      this.prisma.solicitacao.count({ where: onde }),
      this.prisma.solicitacao.findMany({
        where: onde,
        include: incluirNoResumo,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (filtros.pagina - 1) * ITENS_POR_PAGINA,
        take: ITENS_POR_PAGINA,
      }),
    ]);

    const expediente = expedienteDaEmpresa(empresa);
    const agora = this.agora();
    return {
      itens: solicitacoes.map((s) =>
        this.resumir(s, usuario, expediente, agora),
      ),
      total,
      pagina: filtros.pagina,
      porPagina: ITENS_POR_PAGINA,
    };
  }

  async detalhar(usuario: UsuarioAutenticado, id: string): Promise<Detalhe> {
    const solicitacao = await this.prisma.solicitacao.findFirst({
      where: { id, ...visiveisPara(usuario) },
      include: {
        ...incluirNoResumo,
        empresa: true,
        historicos: {
          include: { autor: pessoa },
          orderBy: { criadoEm: 'asc' },
        },
        mensagens: {
          // Comentário interno é só entre a equipe (RFC seção 2.4)
          where: ehInterno(usuario.perfil) ? {} : { interna: false },
          include: { autor: pessoa },
          orderBy: { criadoEm: 'asc' },
        },
        anexos: {
          include: { enviadoPor: pessoa },
          orderBy: { criadoEm: 'asc' },
        },
        // Quem recebeu e-mail é informação da equipe, não do solicitante
        emails: {
          take: ehInterno(usuario.perfil) ? 200 : 0,
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            para: true,
            situacao: true,
            tentativas: true,
            ultimoErro: true,
            enviadoEm: true,
            criadoEm: true,
          },
        },
      },
    });

    if (!solicitacao) {
      throw new ErroNaoEncontrado('Solicitação não encontrada');
    }

    const encerrada = ehTerminal(solicitacao.status);
    return {
      ...this.resumir(
        solicitacao,
        usuario,
        expedienteDaEmpresa(solicitacao.empresa),
      ),
      pagadorCorreto: solicitacao.pagadorCorreto,
      resolvidoEm: solicitacao.resolvidoEm,
      historico: solicitacao.historicos.map((h) => ({
        id: h.id,
        statusAnterior: h.statusAnterior,
        statusNovo: h.statusNovo,
        observacao: h.observacao,
        autor: h.autor,
        criadoEm: h.criadoEm,
      })),
      mensagens: solicitacao.mensagens.map((m) => ({
        id: m.id,
        conteudo: m.conteudo,
        interna: m.interna,
        autor: m.autor,
        criadoEm: m.criadoEm,
      })),
      emails: solicitacao.emails,
      anexos: solicitacao.anexos.map((a) => ({
        id: a.id,
        nomeArquivo: a.nomeArquivo,
        tipoMime: a.tipoMime,
        tamanhoBytes: a.tamanhoBytes,
        enviadoPor: a.enviadoPor,
        criadoEm: a.criadoEm,
      })),
      pode: {
        mudarPrioridade:
          !encerrada && PERFIS_QUE_PRIORIZAM.includes(usuario.perfil),
        atribuir: !encerrada && PERFIS_QUE_ATRIBUEM.includes(usuario.perfil),
        comentarInterno: ehInterno(usuario.perfil),
      },
    };
  }

  /**
   * Move a solicitação (é o que acontece ao arrastar o cartão no quadro).
   * Quem pode cada movimento vem da máquina de estados em `status.ts`.
   */
  async mudarStatus(
    usuario: UsuarioAutenticado,
    id: string,
    para: Status,
    observacao?: string,
  ): Promise<Resumo> {
    const texto = observacao?.trim() || null;
    if (STATUS_COM_OBSERVACAO.includes(para) && texto === null) {
      throw new ErroDeRegraDeNegocio(
        para === 'RESOLVIDO'
          ? 'Descreva a ação tomada para resolver'
          : 'Informe o motivo da mudança',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const atual = await this.carregar(tx, usuario, id);
      const de = atual.status;

      this.conferirTransicao(de, para, usuario.perfil);

      const agora = this.agora();
      const expediente = expedienteDaEmpresa(atual.empresa);
      const sla = this.slaDepoisDaMudanca(atual, de, para, agora, expediente);

      // Só grava se ninguém mexeu nela desde a leitura: duas pessoas
      // arrastando o mesmo cartão ao mesmo tempo não se atropelam
      const { count } = await tx.solicitacao.updateMany({
        where: { id: atual.id, empresaId: usuario.empresaId, status: de },
        data: {
          status: para,
          ...sla,
          // Quem assume a solicitação da fila vira o responsável por ela
          ...(de === 'NOVO' && para === 'EM_ANDAMENTO' && !atual.responsavelId
            ? { responsavelId: usuario.id }
            : {}),
          resolvidoEm: para === 'RESOLVIDO' ? agora : null,
        },
      });
      if (count === 0) {
        throw new ErroDeConflito(
          'Outra pessoa alterou esta solicitação agora há pouco. Atualize a tela.',
        );
      }

      await tx.statusHistorico.create({
        data: {
          empresaId: usuario.empresaId,
          solicitacaoId: atual.id,
          autorId: usuario.id,
          statusAnterior: de,
          statusNovo: para,
          observacao: texto,
          criadoEm: agora,
        },
      });

      await this.avisar(tx, usuario, atual.id, {
        tipo: 'STATUS',
        de,
        para,
        observacao: texto,
      });

      return this.resumirPorId(tx, usuario, atual.id, expediente, agora);
    });
  }

  async mudarPrioridade(
    usuario: UsuarioAutenticado,
    id: string,
    prioridade: Prioridade,
  ): Promise<Resumo> {
    if (!PERFIS_QUE_PRIORIZAM.includes(usuario.perfil)) {
      throw new ErroAcessoNegado('Só analista e supervisor mudam a prioridade');
    }

    return this.prisma.$transaction(async (tx) => {
      const atual = await this.carregar(tx, usuario, id);
      this.barrarSeEncerrada(atual.status);

      if (atual.prioridade !== prioridade) {
        await tx.solicitacao.update({
          where: { id: atual.id },
          data: { prioridade },
        });
        await this.registrarMovimentacao(
          tx,
          usuario,
          atual,
          `Prioridade: ${NOME_DA_PRIORIDADE[atual.prioridade]} → ${NOME_DA_PRIORIDADE[prioridade]}`,
        );
        await this.avisar(tx, usuario, atual.id, {
          tipo: 'PRIORIDADE',
          de: atual.prioridade,
          para: prioridade,
        });
      }

      return this.resumirPorId(
        tx,
        usuario,
        atual.id,
        expedienteDaEmpresa(atual.empresa),
      );
    });
  }

  async atribuir(
    usuario: UsuarioAutenticado,
    id: string,
    responsavelId: string,
  ): Promise<Resumo> {
    if (!PERFIS_QUE_ATRIBUEM.includes(usuario.perfil)) {
      throw new ErroAcessoNegado('Só o supervisor reatribui solicitações');
    }

    return this.prisma.$transaction(async (tx) => {
      const atual = await this.carregar(tx, usuario, id);
      this.barrarSeEncerrada(atual.status);

      // O responsável precisa ser da mesma empresa: um id de outra empresa
      // é tratado como inexistente
      const responsavel = await tx.usuario.findFirst({
        where: {
          id: responsavelId,
          empresaId: usuario.empresaId,
          ativo: true,
          perfil: { in: [...PERFIS_RESPONSAVEIS] },
        },
        select: { id: true, nome: true },
      });
      if (!responsavel) {
        throw new ErroDeRegraDeNegocio(
          'Escolha um analista ou supervisor ativo da empresa',
        );
      }

      if (atual.responsavelId !== responsavel.id) {
        await tx.solicitacao.update({
          where: { id: atual.id },
          data: { responsavelId: responsavel.id },
        });
        await this.registrarMovimentacao(
          tx,
          usuario,
          atual,
          `Responsável: ${responsavel.nome}`,
        );
        await this.avisar(tx, usuario, atual.id, {
          tipo: 'RESPONSAVEL',
          nome: responsavel.nome,
        });
      }

      return this.resumirPorId(
        tx,
        usuario,
        atual.id,
        expedienteDaEmpresa(atual.empresa),
      );
    });
  }

  async comentar(
    usuario: UsuarioAutenticado,
    id: string,
    conteudo: string,
    interna: boolean,
  ): Promise<MensagemDaConversa> {
    if (interna && !ehInterno(usuario.perfil)) {
      throw new ErroAcessoNegado('Comentário interno é só para a equipe');
    }

    const solicitacao = await this.prisma.solicitacao.findFirst({
      where: { id, ...visiveisPara(usuario) },
      select: { id: true },
    });
    if (!solicitacao) {
      throw new ErroNaoEncontrado('Solicitação não encontrada');
    }

    const mensagem = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.mensagem.create({
        data: {
          empresaId: usuario.empresaId,
          solicitacaoId: solicitacao.id,
          autorId: usuario.id,
          conteudo: conteudo.trim(),
          interna,
          criadoEm: this.agora(),
        },
        include: { autor: pessoa },
      });
      await this.avisar(tx, usuario, solicitacao.id, {
        tipo: 'MENSAGEM',
        conteudo: criada.conteudo,
        interna,
      });
      return criada;
    });

    return {
      id: mensagem.id,
      conteudo: mensagem.conteudo,
      interna: mensagem.interna,
      autor: mensagem.autor,
      criadoEm: mensagem.criadoEm,
    };
  }

  /** Para quem o supervisor pode passar uma solicitação. */
  async responsaveis(usuario: UsuarioAutenticado): Promise<Pessoa[]> {
    if (!ehInterno(usuario.perfil)) {
      throw new ErroAcessoNegado();
    }
    return this.prisma.usuario.findMany({
      where: {
        empresaId: usuario.empresaId,
        ativo: true,
        perfil: { in: [...PERFIS_RESPONSAVEIS] },
      },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  // ------------------------------------------------------------ Internos

  /**
   * Com filiais cadastradas, quem informa CTe ou NF precisa dizer de qual
   * filial é: sem isso, a duplicidade não sabe se o número é o mesmo
   * documento. A filial tem de ser ativa e da mesma empresa.
   */
  private async conferirFilial(
    tx: Transacao,
    empresaId: string,
    filialId: string | undefined,
    temDocumento: boolean,
  ): Promise<string | null> {
    if (filialId) {
      const filial = await tx.filial.findFirst({
        where: { id: filialId, empresaId, ativa: true },
        select: { id: true },
      });
      if (!filial) {
        throw new ErroDeRegraDeNegocio('Escolha uma filial ativa da empresa');
      }
      return filial.id;
    }
    if (
      temDocumento &&
      (await tx.filial.count({ where: { empresaId, ativa: true } })) > 0
    ) {
      throw new ErroDeRegraDeNegocio('Escolha a filial que emitiu o documento');
    }
    return null;
  }

  private async barrarDuplicidade(
    tx: Transacao,
    empresaId: string,
    candidata: {
      cte: string | null;
      nf: string | null;
      filialId: string | null;
      hashes: string[];
      agora: Date;
      janelaDias: number;
    },
  ): Promise<void> {
    const { cte, nf, filialId, agora, janelaDias } = candidata;
    const hashes = [...new Set(candidata.hashes.map((h) => h.toLowerCase()))];
    if (cte === null && nf === null && hashes.length === 0) {
      return;
    }

    const existentes = await tx.solicitacao.findMany({
      where: {
        empresaId,
        status: { not: 'CANCELADO' },
        criadoEm: { gte: new Date(agora.getTime() - janelaDias * DIA) },
        OR: [
          ...(cte ? [{ cte }] : []),
          ...(nf ? [{ nf }] : []),
          ...(hashes.length > 0
            ? [{ anexos: { some: { sha256: { in: hashes } } } }]
            : []),
        ],
      },
      select: {
        id: true,
        empresaId: true,
        protocolo: true,
        cte: true,
        nf: true,
        filialId: true,
        status: true,
        criadoEm: true,
        anexos: {
          where: { sha256: { in: hashes } },
          select: { nomeArquivo: true, sha256: true },
        },
      },
    });

    // O banco já filtrou; a regra de domínio confere de novo e diz o motivo
    const motivos = encontrarDuplicidades(
      {
        empresaId,
        cte,
        nf,
        filialId,
        hashesDosAnexos: hashes,
        criadoEm: agora,
      },
      existentes,
      janelaDias,
    );

    if (motivos.length > 0) {
      throw new ErroDeConflito(
        'Já existe solicitação recente para este documento',
        {
          duplicidades: motivos.map((m) => ({
            id: m.solicitacao.id,
            protocolo: m.solicitacao.protocolo,
            status: m.solicitacao.status,
            criadoEm: m.solicitacao.criadoEm,
            documento: m.documento,
            valor: m.valor,
          })),
        },
      );
    }
  }

  /**
   * Repete a abertura se duas pessoas criarem ao mesmo tempo a primeira
   * solicitação do mês: as duas tentam criar o contador e uma perde.
   */
  private async emTransacaoComRepeticao<T>(
    trabalho: (tx: Transacao) => Promise<T>,
  ): Promise<T> {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await this.prisma.$transaction(trabalho);
      } catch (erro) {
        const corrida =
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          (erro.code === 'P2002' || erro.code === 'P2034');
        if (!corrida || tentativa >= 3) {
          throw erro;
        }
      }
    }
  }

  private async carregar(
    tx: Transacao,
    usuario: UsuarioAutenticado,
    id: string,
  ) {
    const solicitacao = await tx.solicitacao.findFirst({
      where: { id, ...visiveisPara(usuario) },
      include: { empresa: true },
    });
    if (!solicitacao) {
      throw new ErroNaoEncontrado('Solicitação não encontrada');
    }
    return solicitacao;
  }

  /** 403 quando o perfil não pode; 422 quando o movimento não existe. */
  private conferirTransicao(de: Status, para: Status, perfil: Perfil): void {
    const existe = TRANSICOES.some((t) => t.de === de && t.para === para);
    try {
      validarTransicao(de, para, perfil);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (existe) {
        throw new ErroAcessoNegado(mensagem);
      }
      throw new ErroDeRegraDeNegocio(mensagem);
    }
  }

  private barrarSeEncerrada(status: Status): void {
    if (ehTerminal(status)) {
      throw new ErroDeRegraDeNegocio(
        'Solicitação encerrada não pode ser alterada',
      );
    }
  }

  /** Pausa o SLA ao entrar em AGUARDANDO_DOC e retoma ao sair (RFC 3.2). */
  private slaDepoisDaMudanca(
    atual: {
      slaVenceEm: Date | null;
      slaPausadoEm: Date | null;
      slaMinutosPausados: number;
    },
    de: Status,
    para: Status,
    agora: Date,
    expediente: Expediente,
  ): Partial<{
    slaVenceEm: Date;
    slaPausadoEm: Date | null;
    slaMinutosPausados: number;
  }> {
    const estado = estadoDoSla(atual);
    if (estado === null) {
      return {};
    }

    let novo: EstadoSla = estado;
    if (de === 'AGUARDANDO_DOC' && estado.pausadoEm !== null) {
      novo = retomarSla(estado, agora, expediente);
    }
    if (para === 'AGUARDANDO_DOC' && novo.pausadoEm === null) {
      novo = pausarSla(novo, agora);
    }

    return {
      slaVenceEm: novo.venceEm,
      slaPausadoEm: novo.pausadoEm,
      slaMinutosPausados: novo.minutosPausados,
    };
  }

  /** Mudança que não é de status (prioridade, responsável) também fica no histórico. */
  private async registrarMovimentacao(
    tx: Transacao,
    usuario: UsuarioAutenticado,
    atual: { id: string; status: Status },
    observacao: string,
  ): Promise<void> {
    await tx.statusHistorico.create({
      data: {
        empresaId: usuario.empresaId,
        solicitacaoId: atual.id,
        autorId: usuario.id,
        statusAnterior: atual.status,
        statusNovo: atual.status,
        observacao,
        criadoEm: this.agora(),
      },
    });
  }

  private async resumirPorId(
    tx: Transacao,
    usuario: UsuarioAutenticado,
    id: string,
    expediente: Expediente,
    agora: Date = this.agora(),
  ): Promise<Resumo> {
    const solicitacao = await tx.solicitacao.findUniqueOrThrow({
      where: { id },
      include: incluirNoResumo,
    });
    return this.resumir(solicitacao, usuario, expediente, agora);
  }

  private resumir(
    s: SolicitacaoComPessoas,
    usuario: UsuarioAutenticado,
    expediente: Expediente,
    agora: Date = this.agora(),
  ): Resumo {
    return {
      id: s.id,
      protocolo: s.protocolo,
      tipo: s.tipo,
      cte: s.cte,
      nf: s.nf,
      descricao: s.descricao,
      status: s.status,
      prioridade: s.prioridade,
      solicitante: s.solicitante,
      responsavel: s.responsavel,
      filial: s.filial,
      criadoEm: s.criadoEm,
      atualizadoEm: s.atualizadoEm,
      slaVenceEm: s.slaVenceEm,
      sla: indicadorDeSla(s.status, estadoDoSla(s), agora, expediente),
      acoes: transicoesPermitidas(s.status, usuario.perfil).map((t) => t.para),
      totais: { anexos: s._count.anexos, mensagens: s._count.mensagens },
    };
  }
}
