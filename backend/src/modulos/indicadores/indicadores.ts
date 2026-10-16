import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  calcularIndicadores,
  diaLocal,
  montarCsv,
  type Indicadores,
  type SolicitacaoParaIndicadores,
} from '../../dominio/indicadores.js';
import { expedienteDaEmpresa } from '../../dominio/sla.js';
import {
  autenticar,
  exigirPerfil,
  usuarioDa,
} from '../../http/autenticacao.js';
import { validar } from '../../http/validacao.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import {
  NOME_DA_PRIORIDADE,
  NOME_DO_STATUS,
  NOME_DO_TIPO,
} from '../avisos/modelos.js';

const DIA = 24 * 60 * 60_000;

function atendidaNoPrazo(s: SolicitacaoParaIndicadores): string | null {
  if (s.assumidaEm === null) return null;
  const noPrazo = s.slaVenceEm === null || s.assumidaEm <= s.slaVenceEm;
  return noPrazo ? 'sim' : 'não';
}
const ALERTA_DE_DUPLICIDADE = 'Aberta mesmo com o alerta de duplicidade';

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
        NOME_DO_TIPO[s.tipo],
        extra.filial,
        extra.cte,
        extra.nf,
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
    }));
    const extras = registros.map((r) => ({
      protocolo: r.protocolo,
      cte: r.cte,
      nf: r.nf,
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
