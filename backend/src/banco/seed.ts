/**
 * Dados de demonstração (seed) — apenas desenvolvimento e staging.
 *
 *   npm run db:seed              apaga tudo e recria do zero
 *   npm run db:seed -- --se-vazio  só semeia se o banco não tiver empresas
 *                                  (usado ao subir o staging)
 * Cria duas empresas: a "Transportadora Demo", com um usuário de
 * cada perfil e solicitações de exemplo, e a "Outra Transportadora", que
 * existe só para provar que uma empresa nunca enxerga os dados da outra.
 */
import { config } from 'dotenv';
import type {
  Prisma,
  StatusSolicitacao,
  TipoOcorrencia,
  Prioridade,
} from '@prisma/client';
import { competenciaDe, formatarProtocolo } from '../dominio/protocolo.js';
import { expedienteDaEmpresa, iniciarSla } from '../dominio/sla.js';
import { gerarHashDeSenha } from '../seguranca/senha.js';
import { criarPrismaClient } from './cliente.js';

config({ path: ['.env', '../.env'] });

/**
 * Senha de todos os usuários de demonstração. Nunca usar em produção.
 * No staging, que é público, vem de SEED_SENHA (aleatória, gerada na VM).
 */
export const SENHA_DEMO = 'Demo@2026';

const MINUTO = 60_000;

/** Número arbitrário que identifica a trava do seed no Postgres. */
const TRAVA_DO_SEED = 7_430_281;

interface SolicitacaoExemplo {
  tipo: TipoOcorrencia;
  cte: string | null;
  nf: string | null;
  descricao: string;
  status: StatusSolicitacao;
  prioridade: Prioridade;
  /** Há quantos minutos foi aberta. */
  idadeMinutos: number;
  comResponsavel: boolean;
}

const EXEMPLOS: SolicitacaoExemplo[] = [
  {
    tipo: 'TROCA_PAGADOR',
    cte: '12345',
    nf: '998877',
    descricao:
      'CTe emitido com o remetente como pagador; o correto é o destinatário (frete FOB).',
    status: 'NOVO',
    prioridade: 'ALTA',
    idadeMinutos: 30,
    comResponsavel: false,
  },
  {
    tipo: 'REVERSAO',
    cte: '12390',
    nf: '554433',
    descricao:
      'Mercadoria recusada pelo cliente; solicitar CTe de reversão para retorno à origem.',
    status: 'EM_ANDAMENTO',
    prioridade: 'MEDIA',
    idadeMinutos: 180,
    comResponsavel: true,
  },
  {
    tipo: 'AJUSTE_FISCAL',
    cte: '12401',
    nf: null,
    descricao: 'Alíquota de ICMS divergente da tabela do estado de destino.',
    status: 'AGUARDANDO_DOC',
    prioridade: 'URGENTE',
    idadeMinutos: 600,
    comResponsavel: true,
  },
  {
    tipo: 'OUTRO',
    cte: '12288',
    nf: '112233',
    descricao: 'Peso informado no CTe diferente do peso da balança.',
    status: 'RESOLVIDO',
    prioridade: 'BAIXA',
    idadeMinutos: 2_880,
    comResponsavel: true,
  },
];

async function limpar(prisma: Prisma.TransactionClient): Promise<void> {
  // Ordem inversa das dependências (filhas antes das mães)
  await prisma.sessao.deleteMany();
  await prisma.notificacao.deleteMany();
  await prisma.statusHistorico.deleteMany();
  await prisma.anexo.deleteMany();
  await prisma.mensagem.deleteMany();
  await prisma.solicitacao.deleteMany();
  await prisma.sequenciaProtocolo.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.empresa.deleteMany();
}

async function semear(
  prisma: Prisma.TransactionClient,
  senhaHash: string,
): Promise<void> {
  const demo = await prisma.empresa.create({
    data: {
      razaoSocial: 'Transportadora Demo Ltda.',
      cnpj: '11222333000181',
      slug: 'transportadora-demo',
      emailCaixaCentral: 'ocorrencias@demo.sigof.local',
    },
  });

  const outra = await prisma.empresa.create({
    data: {
      razaoSocial: 'Outra Transportadora S.A.',
      cnpj: '99888777000166',
      slug: 'outra-transportadora',
    },
  });

  const usuario = (
    empresaId: string,
    nome: string,
    email: string,
    perfil: 'SOLICITANTE' | 'ANALISTA' | 'SUPERVISOR' | 'ADMIN',
    area: 'FINANCEIRO' | 'COMERCIAL' | 'OPERACIONAL' | null = null,
  ) =>
    prisma.usuario.create({
      data: { empresaId, nome, email, perfil, area, senhaHash },
    });

  const solicitante = await usuario(
    demo.id,
    'Sofia Solicitante',
    'solicitante@demo.sigof.local',
    'SOLICITANTE',
    'COMERCIAL',
  );
  const analista = await usuario(
    demo.id,
    'André Analista',
    'analista@demo.sigof.local',
    'ANALISTA',
    'FINANCEIRO',
  );
  await usuario(
    demo.id,
    'Sérgio Supervisor',
    'supervisor@demo.sigof.local',
    'SUPERVISOR',
    'FINANCEIRO',
  );
  await usuario(demo.id, 'Ana Admin', 'admin@demo.sigof.local', 'ADMIN');

  // Mesmo e-mail em outra empresa: permitido, porque o e-mail é único
  // por empresa e não globalmente.
  await usuario(
    outra.id,
    'Sofia (Outra)',
    'solicitante@demo.sigof.local',
    'SOLICITANTE',
  );

  const expediente = expedienteDaEmpresa(demo);
  const agora = Date.now();
  // Último sequencial usado em cada competência (ano-mês)
  const sequencias = new Map<
    string,
    { ano: number; mes: number; ultimo: number }
  >();

  // Da mais antiga para a mais nova, para o protocolo seguir a ordem de abertura
  const porAbertura = [...EXEMPLOS].sort(
    (a, b) => b.idadeMinutos - a.idadeMinutos,
  );

  for (const exemplo of porAbertura) {
    const criadoEm = new Date(agora - exemplo.idadeMinutos * MINUTO);
    const { ano, mes } = competenciaDe(criadoEm, demo.fusoHorario);
    const chave = `${ano}-${mes}`;
    const sequencial = (sequencias.get(chave)?.ultimo ?? 0) + 1;
    sequencias.set(chave, { ano, mes, ultimo: sequencial });
    const sla = iniciarSla(criadoEm, demo.slaAtendimentoMinutos, expediente);
    const resolvida = exemplo.status === 'RESOLVIDO';

    const solicitacao = await prisma.solicitacao.create({
      data: {
        empresaId: demo.id,
        protocolo: formatarProtocolo({ ano, mes, sequencial }),
        solicitanteId: solicitante.id,
        responsavelId: exemplo.comResponsavel ? analista.id : null,
        tipo: exemplo.tipo,
        cte: exemplo.cte,
        nf: exemplo.nf,
        descricao: exemplo.descricao,
        status: exemplo.status,
        prioridade: exemplo.prioridade,
        slaVenceEm: sla.venceEm,
        slaPausadoEm:
          exemplo.status === 'AGUARDANDO_DOC'
            ? new Date(agora - 60 * MINUTO)
            : null,
        criadoEm,
        resolvidoEm: resolvida ? new Date(agora - 60 * MINUTO) : null,
      },
    });

    await prisma.statusHistorico.create({
      data: {
        empresaId: demo.id,
        solicitacaoId: solicitacao.id,
        autorId: solicitante.id,
        statusAnterior: null,
        statusNovo: 'NOVO',
        criadoEm,
      },
    });

    if (exemplo.status !== 'NOVO') {
      await prisma.statusHistorico.create({
        data: {
          empresaId: demo.id,
          solicitacaoId: solicitacao.id,
          autorId: analista.id,
          statusAnterior: 'NOVO',
          statusNovo: exemplo.status,
          observacao: resolvida ? 'CTe substituto emitido.' : null,
        },
      });
    }
  }

  // As sequências precisam refletir o último protocolo usado em cada mês,
  // senão a próxima solicitação real repetiria um número
  await prisma.sequenciaProtocolo.createMany({
    data: [...sequencias.values()].map((s) => ({ empresaId: demo.id, ...s })),
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed apaga todos os dados e não roda em produção.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não definida. Confira o arquivo .env.');
  }

  const prisma = criarPrismaClient(databaseUrl);
  try {
    const soSeVazio = process.argv.includes('--se-vazio');
    const senha = process.env.SEED_SENHA || SENHA_DEMO;
    const senhaHash = await gerarHashDeSenha(senha);

    // Tudo numa transação: se o seed for interrompido no meio, nada fica
    // gravado e a próxima subida tenta de novo do zero
    const semeou = await prisma.$transaction(
      async (tx) => {
        // Trava do próprio Postgres: dois seeds ao mesmo tempo (ex.: dois
        // "iniciar") esperam um pelo outro, em vez de um apagar o que o
        // outro acabou de gravar. É liberada no fim da transação.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRAVA_DO_SEED})`;

        if (soSeVazio && (await tx.empresa.count()) > 0) {
          return false;
        }
        await limpar(tx);
        await semear(tx, senhaHash);
        return true;
      },
      { timeout: 60_000 },
    );

    if (!semeou) {
      // eslint-disable-next-line no-console -- saída de script de linha de comando
      console.log('Seed ignorado: o banco já tem dados.');
      return;
    }

    // eslint-disable-next-line no-console -- saída de script de linha de comando
    console.log(
      process.env.SEED_SENHA
        ? 'Seed concluído. Empresa "transportadora-demo", senha definida em SEED_SENHA.'
        : `Seed concluído. Empresa "transportadora-demo", senha de todos: ${SENHA_DEMO}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
