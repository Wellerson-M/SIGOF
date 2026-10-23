import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  TIPO_REVERSAO,
  balancoDoMes,
  calcularIndicadores,
  contarReversoesPorCte,
  indiceDeReversao,
  type LinhaDoBalanco,
  type ReversoesPorCte,
  diaLocal,
  montarCsv,
  type Indicadores,
  type SolicitacaoParaIndicadores,
} from '../../dominio/indicadores.js';
import { nomeDoTipo } from '../../dominio/formulario.js';
import { moduloLigado } from '../../dominio/modulos.js';
import { expedienteDaEmpresa } from '../../dominio/sla.js';
import {
  autenticar,
  exigirPerfil,
  usuarioDa,
} from '../../http/autenticacao.js';
import { ErroDeRegraDeNegocio } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import { registrar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import { nomesDosTipos } from '../configuracao/servico.js';
import { inicioDoDia } from '../solicitacoes/servico.js';
import { NOME_DA_PRIORIDADE, NOME_DO_STATUS } from '../avisos/modelos.js';

const DIA = 24 * 60 * 60_000;

function atendidaNoPrazo(s: SolicitacaoParaIndicadores): string | null {
  if (s.assumidaEm === null) return null;
  const noPrazo = s.slaVenceEm === null || s.assumidaEm <= s.slaVenceEm;
  return noPrazo ? 'sim' : 'não';
}
const ALERTA_DE_DUPLICIDADE = 'Aberta mesmo com o alerta de duplicidade';

/** Reversões do mês contra a produção importada (índice por 100 CTe). */
export interface ReversoesDoMes extends ReversoesPorCte {
  /** Null: a produção do mês ainda não foi importada. */
  ctesEmitidos: number | null;
  /** Reversões (CTe) a cada 100 CTe emitidos; null sem produção. */
  indice: number | null;
}

/** Todos os CTe da solicitação (a lista, ou o único CTe das antigas). */
function ctesDa(r: { ctes: string[]; cte: string | null }): string[] {
  if (r.ctes.length > 0) return r.ctes;
  return r.cte ? [r.cte] : [];
}

/** Painel do supervisor e exportação em CSV (RF10). */
export class ServicoDeIndicadores {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async calcular(
    usuario: UsuarioAutenticado,
    dias: number,
  ): Promise<Indicadores> {
    const { empresa, solicitacoes, agora } = await this.carregar(usuario, dias);
    return calcularIndicadores(
      solicitacoes,
      agora,
      dias,
      expedienteDaEmpresa(empresa),
    );
  }

  /** As solicitações abertas no período, uma por linha. */
  async csv(usuario: UsuarioAutenticado, dias: number): Promise<string> {
    const { empresa, solicitacoes, agora, extras } = await this.carregar(
      usuario,
      dias,
    );
    const nomes = await nomesDosTipos(this.prisma, usuario.empresaId);
    const de = agora.getTime() - dias * DIA;
    const fuso = empresa.fusoHorario;
    const dataHora = (data: Date | null) =>
      data === null
        ? null
        : new Intl.DateTimeFormat('pt-BR', {
            timeZone: fuso,
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(data);

    const linhas = solicitacoes
      .map((s, i) => ({ s, extra: extras[i]! }))
      .filter(({ s }) => s.criadoEm.getTime() >= de)
      .map(({ s, extra }) => [
        extra.protocolo,
        dataHora(s.criadoEm),
        nomeDoTipo(s.tipo, nomes),
        extra.filial,
        extra.cte,
        extra.nf,
        extra.fatura,
        NOME_DO_STATUS[s.status],
        NOME_DA_PRIORIDADE[s.prioridade],
        extra.solicitante,
        s.responsavel?.nome ?? null,
        dataHora(s.slaVenceEm),
        dataHora(s.assumidaEm),
        dataHora(s.resolvidoEm),
        atendidaNoPrazo(s),
        s.causa?.nome ?? null,
        s.causa?.detalhe ?? null,
        extra.causaComentario,
      ]);

    return montarCsv(
      [
        'Protocolo',
        'Aberta em',
        'Tipo',
        'Filial',
        'CTe',
        'NF',
        'Fatura',
        'Status',
        'Prioridade',
        'Solicitante',
        'Responsável',
        'Prazo (SLA)',
        'Assumida em',
        'Resolvida em',
        'Atendida no prazo',
        'Causa do erro',
        'Qual',
        'Comentário da causa',
      ],
      linhas,
    );
  }

  /**
   * Balanço do mês por digitador: CTe emitidos (importados) e erros
   * registrados nas solicitações resolvidas no mês (o "qual" das causas).
   */
  async balanco(
    usuario: UsuarioAutenticado,
    mes: string,
  ): Promise<{
    mes: string;
    linhas: LinhaDoBalanco[];
    importadoEm: Date | null;
    reversoes: ReversoesDoMes;
  }> {
    const empresa = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: usuario.empresaId },
      select: { fusoHorario: true },
    });
    const [ano, numero] = mes.split('-').map(Number) as [number, number];
    const proximo =
      numero === 12
        ? `${ano + 1}-01-01`
        : `${ano}-${String(numero + 1).padStart(2, '0')}-01`;
    const de = inicioDoDia(`${mes}-01`, empresa.fusoHorario);
    const ate = inicioDoDia(proximo, empresa.fusoHorario);

    const [producao, comErro, reversoes] = await Promise.all([
      this.prisma.producaoDoDigitador.findMany({
        where: { empresaId: usuario.empresaId, mes },
      }),
      this.prisma.solicitacao.findMany({
        where: {
          empresaId: usuario.empresaId,
          excluidaEm: null,
          status: 'RESOLVIDO',
          resolvidoEm: { gte: de, lt: ate },
          causaDetalhe: { not: null },
        },
        select: { causaDetalhe: true },
      }),
      this.prisma.solicitacao.findMany({
        where: {
          empresaId: usuario.empresaId,
          excluidaEm: null,
          tipo: TIPO_REVERSAO,
          criadoEm: { gte: de, lt: ate },
        },
        select: {
          tipo: true,
          status: true,
          cte: true,
          ctes: true,
          filial: { select: { nome: true } },
        },
      }),
    ]);
    const ctesEmitidos =
      producao.length > 0
        ? producao.reduce((soma, p) => soma + p.ctesEmitidos, 0)
        : null;
    const porCte = contarReversoesPorCte(
      reversoes.map((r) => ({
        tipo: r.tipo,
        status: r.status,
        filial: r.filial?.nome ?? null,
        ctes: ctesDa(r),
      })),
    );
    return {
      mes,
      reversoes: {
        ...porCte,
        ctesEmitidos,
        indice: indiceDeReversao(porCte.ctes, ctesEmitidos),
      },
      linhas: balancoDoMes(
        producao,
        comErro.map((s) => ({ digitador: s.causaDetalhe! })),
      ),
      importadoEm:
        producao.length > 0
          ? new Date(Math.max(...producao.map((p) => p.importadoEm.getTime())))
          : null,
    };
  }

  /** Substitui a produção do mês pela planilha importada. */
  async importarProducao(
    usuario: UsuarioAutenticado,
    mes: string,
    linhas: { digitador: string; ctesEmitidos: number }[],
  ): Promise<number> {
    const empresa = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: usuario.empresaId },
      select: { modulosLiberados: true, modulosAtivos: true },
    });
    if (!moduloLigado(empresa, 'BALANCO')) {
      throw new ErroDeRegraDeNegocio(
        'O balanço por digitador está desligado na sua empresa',
      );
    }
    // A mesma pessoa em duas linhas: soma
    const somadas = new Map<
      string,
      { digitador: string; ctesEmitidos: number }
    >();
    for (const l of linhas) {
      const nome = l.digitador.trim().replace(/\s+/g, ' ');
      const chave = nome.toLocaleLowerCase('pt-BR');
      const atual = somadas.get(chave);
      somadas.set(chave, {
        digitador: atual?.digitador ?? nome,
        ctesEmitidos: (atual?.ctesEmitidos ?? 0) + l.ctesEmitidos,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.producaoDoDigitador.deleteMany({
        where: { empresaId: usuario.empresaId, mes },
      });
      await tx.producaoDoDigitador.createMany({
        data: [...somadas.values()].map((l) => ({
          empresaId: usuario.empresaId,
          mes,
          digitador: l.digitador,
          ctesEmitidos: l.ctesEmitidos,
          importadoPorId: usuario.id,
        })),
      });
      await registrar(tx, {
        empresaId: usuario.empresaId,
        acao: 'CADASTRO_ALTERADO',
        autorId: usuario.id,
        detalhes: {
          cadastro: 'produção dos digitadores',
          mes,
          digitadores: somadas.size,
        },
      });
    });
    return somadas.size;
  }

  /** Nome do arquivo: sigof-solicitacoes-2026-10-16-30dias.csv */
  async nomeDoCsv(usuario: UsuarioAutenticado, dias: number): Promise<string> {
    const empresa = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: usuario.empresaId },
      select: { fusoHorario: true },
    });
    return `sigof-solicitacoes-${diaLocal(this.agora(), empresa.fusoHorario)}-${dias}dias.csv`;
  }

  /**
   * Tudo que está em aberto (para o "agora") e tudo que foi aberto ou
   * resolvido no período. Só da empresa de quem pede.
   */
  private async carregar(usuario: UsuarioAutenticado, dias: number) {
    const agora = this.agora();
    const de = new Date(agora.getTime() - dias * DIA);
    const [empresa, registros] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({
        where: { id: usuario.empresaId },
      }),
      this.prisma.solicitacao.findMany({
        where: {
          empresaId: usuario.empresaId,
          excluidaEm: null,
          OR: [
            { status: { notIn: ['RESOLVIDO', 'CANCELADO'] } },
            { criadoEm: { gte: de } },
            { resolvidoEm: { gte: de } },
          ],
        },
        include: {
          responsavel: { select: { id: true, nome: true } },
          solicitante: { select: { nome: true } },
          filial: { select: { nome: true } },
          causa: { select: { nome: true } },
          historicos: {
            where: {
              OR: [
                {
                  statusNovo: 'EM_ANDAMENTO',
                  statusAnterior: { not: 'EM_ANDAMENTO' },
                },
                { statusAnterior: null },
              ],
            },
            orderBy: { criadoEm: 'asc' },
            select: {
              statusNovo: true,
              statusAnterior: true,
              observacao: true,
              criadoEm: true,
            },
          },
        },
        orderBy: { criadoEm: 'asc' },
      }),
    ]);

    const solicitacoes: SolicitacaoParaIndicadores[] = registros.map((r) => ({
      status: r.status,
      tipo: r.tipo,
      prioridade: r.prioridade,
      criadoEm: r.criadoEm,
      resolvidoEm: r.resolvidoEm,
      assumidaEm:
        r.historicos.find((h) => h.statusNovo === 'EM_ANDAMENTO')?.criadoEm ??
        null,
      slaVenceEm: r.slaVenceEm,
      slaPausadoEm: r.slaPausadoEm,
      slaMinutosPausados: r.slaMinutosPausados,
      responsavel: r.responsavel,
      abertaComAlertaDeDuplicidade: r.historicos.some(
        (h) =>
          h.statusAnterior === null && h.observacao === ALERTA_DE_DUPLICIDADE,
      ),
      causa: r.causa ? { nome: r.causa.nome, detalhe: r.causaDetalhe } : null,
      registroRapido: r.registroRapido,
      filial: r.filial?.nome ?? null,
      solicitante: r.solicitante.nome,
      ctes: ctesDa(r),
    }));
    const extras = registros.map((r) => ({
      protocolo: r.protocolo,
      cte: r.ctes.length > 0 ? r.ctes.join(', ') : r.cte,
      nf: r.nfs.length > 0 ? r.nfs.join(', ') : r.nf,
      fatura: r.fatura,
      solicitante: r.solicitante.nome,
      filial: r.filial?.nome ?? null,
      causaComentario: r.causaComentario,
    }));

    return { empresa, solicitacoes, extras, agora };
  }
}

const esquemaPeriodo = z.object({
  dias: z.coerce
    .number()
    .int()
    .refine((d) => [7, 30, 90].includes(d), 'Escolha 7, 30 ou 90 dias')
    .default(30),
});

const mes = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o mês no formato AAAA-MM');
const esquemaMes = z.object({ mes });
const esquemaProducao = z.object({
  mes,
  linhas: z
    .array(
      z.object({
        digitador: z.string().trim().min(1).max(80),
        ctesEmitidos: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1, 'A planilha está vazia')
    .max(500),
});

/** /api/indicadores — supervisor e administrador. */
export function rotasDeIndicadores(opcoes: {
  servico: ServicoDeIndicadores;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();
  rotas.use(autenticar(opcoes.jwtSecret), exigirPerfil('SUPERVISOR', 'ADMIN'));

  rotas.get('/', async (req, res) => {
    const { dias } = validar(esquemaPeriodo, req.query);
    res.json(await servico.calcular(usuarioDa(req), dias));
  });

  rotas.get('/digitadores', async (req, res) => {
    const { mes } = validar(esquemaMes, req.query);
    res.json(await servico.balanco(usuarioDa(req), mes));
  });

  rotas.put('/producao', async (req, res) => {
    const { mes, linhas } = validar(esquemaProducao, req.body);
    const digitadores = await servico.importarProducao(
      usuarioDa(req),
      mes,
      linhas,
    );
    res.json({ mes, digitadores });
  });

  rotas.get('/solicitacoes.csv', async (req, res) => {
    const { dias } = validar(esquemaPeriodo, req.query);
    const usuario = usuarioDa(req);
    const [csv, nome] = await Promise.all([
      servico.csv(usuario, dias),
      servico.nomeDoCsv(usuario, dias),
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  });

  return rotas;
}
