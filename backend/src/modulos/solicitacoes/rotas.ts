import { Router, type Request } from 'express';
import { z } from 'zod';
import { autenticar, usuarioDa } from '../../http/autenticacao.js';
import { ErroNaoEncontrado } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import type { ServicoDeSolicitacoes } from './servico.js';

const STATUS = [
  'NOVO',
  'EM_ANDAMENTO',
  'AGUARDANDO_DOC',
  'ESCALADO',
  'RESOLVIDO',
  'CANCELADO',
] as const;
const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const;
const TIPOS = ['REVERSAO', 'TROCA_PAGADOR', 'AJUSTE_FISCAL', 'OUTRO'] as const;

/** Campo de texto opcional: vazio conta como não informado. */
const opcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .optional()
    .transform((valor) => valor || undefined);

const esquemaAbertura = z
  .object({
    tipo: z.enum(TIPOS, { message: 'Escolha o tipo de ocorrência' }),
    cte: opcional(60),
    nf: opcional(60),
    pagadorCorreto: opcional(200),
    descricao: z.string().trim().min(3, 'Diga o que era').max(5000),
    prioridade: z.enum(PRIORIDADES).optional(),
    filialId: z.string().uuid('Filial inválida').optional(),
    hashesDosAnexos: z
      .array(z.string().regex(/^[0-9a-f]{64}$/i, 'Hash de anexo inválido'))
      .max(10)
      .optional(),
    confirmarDuplicidade: z.boolean().optional(),
    registro: z
      .object({
        acaoTomada: z.string().trim().min(3, 'Diga o que foi feito').max(2000),
        classificacao: z
          .object({
            causaId: z.string().uuid('Causa inválida'),
            detalhe: opcional(80),
            comentario: opcional(1000),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((dados, contexto) => {
    // Quem abre para a equipe precisa explicar; no registro rápido, que já
    // foi resolvido, basta dizer o que era
    if (!dados.registro && dados.descricao.length < 10) {
      contexto.addIssue({
        code: 'custom',
        path: ['descricao'],
        message: 'Descreva o problema com pelo menos 10 caracteres',
      });
    }
  });

const esquemaClassificacao = z.object({
  causaId: z.string().uuid('Causa inválida'),
  detalhe: opcional(80),
  comentario: opcional(1000),
});

const esquemaStatus = z.object({
  status: z.enum(STATUS, { message: 'Status inválido' }),
  observacao: z.string().max(2000).optional(),
  classificacao: esquemaClassificacao.optional(),
});

const esquemaPrioridade = z.object({
  prioridade: z.enum(PRIORIDADES, { message: 'Prioridade inválida' }),
});

const esquemaAtribuicao = z.object({
  responsavelId: z.string().uuid('Responsável inválido'),
});

const esquemaMensagem = z.object({
  conteudo: z.string().trim().min(1, 'Escreva a mensagem').max(5000),
  interna: z.boolean().optional(),
});

const esquemaBusca = z.object({ busca: z.string().max(100).optional() });

/** "NOVO,EM_ANDAMENTO" → ['NOVO', 'EM_ANDAMENTO']; vazio → sem filtro. */
const lista = <T extends [string, ...string[]]>(valores: T) =>
  z
    .string()
    .optional()
    .transform((texto) =>
      texto ? texto.split(',').filter(Boolean) : undefined,
    )
    .pipe(z.array(z.enum(valores)).optional());

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD')
  .optional();

const esquemaLista = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  status: lista([...STATUS]),
  prioridade: lista([...PRIORIDADES]),
  tipo: lista([...TIPOS]),
  responsavelId: z.string().uuid().optional(),
  minhas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  busca: z.string().max(100).optional(),
  de: data,
  ate: data,
});

/** Id que nem é UUID não existe: responde 404 sem ir ao banco. */
function idDa(req: Request): string {
  const resultado = z.string().uuid().safeParse(req.params.id);
  if (!resultado.success) {
    throw new ErroNaoEncontrado('Solicitação não encontrada');
  }
  return resultado.data;
}

export function rotasDeSolicitacoes(opcoes: {
  servico: ServicoDeSolicitacoes;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();

  rotas.use(autenticar(opcoes.jwtSecret));

  rotas.get('/', async (req, res) => {
    const { busca } = validar(esquemaBusca, req.query);
    res.json(await servico.listar(usuarioDa(req), { busca }));
  });

  rotas.post('/', async (req, res) => {
    const dados = validar(esquemaAbertura, req.body);
    res.status(201).json(await servico.abrir(usuarioDa(req), dados));
  });

  rotas.get('/lista', async (req, res) => {
    const filtros = validar(esquemaLista, req.query);
    res.json(await servico.pesquisar(usuarioDa(req), filtros));
  });

  // Antes de /:id, senão "responsaveis" seria lido como um id
  rotas.get('/responsaveis', async (req, res) => {
    res.json(await servico.responsaveis(usuarioDa(req)));
  });

  rotas.get('/:id', async (req, res) => {
    res.json(await servico.detalhar(usuarioDa(req), idDa(req)));
  });

  rotas.post('/:id/status', async (req, res) => {
    const { status, observacao, classificacao } = validar(
      esquemaStatus,
      req.body,
    );
    res.json(
      await servico.mudarStatus(
        usuarioDa(req),
        idDa(req),
        status,
        observacao,
        classificacao,
      ),
    );
  });

  rotas.put('/:id/causa', async (req, res) => {
    const classificacao = validar(esquemaClassificacao, req.body);
    res.json(
      await servico.classificar(usuarioDa(req), idDa(req), classificacao),
    );
  });

  rotas.patch('/:id/prioridade', async (req, res) => {
    const { prioridade } = validar(esquemaPrioridade, req.body);
    res.json(
      await servico.mudarPrioridade(usuarioDa(req), idDa(req), prioridade),
    );
  });

  rotas.post('/:id/atribuir', async (req, res) => {
    const { responsavelId } = validar(esquemaAtribuicao, req.body);
    res.json(await servico.atribuir(usuarioDa(req), idDa(req), responsavelId));
  });

  rotas.post('/:id/mensagens', async (req, res) => {
    const { conteudo, interna } = validar(esquemaMensagem, req.body);
    res
      .status(201)
      .json(
        await servico.comentar(
          usuarioDa(req),
          idDa(req),
          conteudo,
          interna ?? false,
        ),
      );
  });

  return rotas;
}
