import { pipeline } from 'node:stream/promises';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import multer from 'multer';
import { z } from 'zod';
import { autenticar, usuarioDa } from '../../http/autenticacao.js';
import {
  ErroDeAplicacao,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import { TAMANHO_MAXIMO_BYTES, type ServicoDeAnexos } from './servico.js';

/** Campos que vão junto do arquivo no formulário. */
const esquemaDoEnvio = z.object({
  etapa: z.enum(['ABERTURA', 'ANDAMENTO', 'RESOLUCAO']).optional(),
  mensagemId: z.string().uuid('Mensagem inválida').optional(),
});

/** 413 — o arquivo passou do limite. */
class ErroArquivoGrandeDemais extends ErroDeAplicacao {
  constructor() {
    super(
      413,
      'ARQUIVO_GRANDE_DEMAIS',
      `O arquivo passa de ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB`,
    );
  }
}

// Na memória: o arquivo é pequeno (até 5 MB) e precisa ser lido inteiro
// para conferir o tipo antes de ir para o armazenamento
const receber = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_BYTES, files: 1, fields: 2 },
}).single('arquivo');

function receberArquivo(req: Request, res: Response, next: NextFunction) {
  receber(req, res, (erro: unknown) => {
    if (erro instanceof multer.MulterError) {
      next(
        erro.code === 'LIMIT_FILE_SIZE'
          ? new ErroArquivoGrandeDemais()
          : new ErroDeValidacao('Envie um único arquivo no campo "arquivo"'),
      );
      return;
    }
    next(erro);
  });
}

function uuidDo(req: Request, parametro: string, mensagem: string): string {
  const resultado = z.string().uuid().safeParse(req.params[parametro]);
  if (!resultado.success) {
    throw new ErroNaoEncontrado(mensagem);
  }
  return resultado.data;
}

/**
 * Nome no cabeçalho de download: versão ASCII para navegadores antigos e a
 * versão UTF-8 (RFC 5987) para os acentos.
 */
function disposicao(tipo: 'inline' | 'attachment', nome: string): string {
  const ascii = nome.normalize('NFD').replaceAll(/[^\x20-\x7e]/g, '');
  return `${tipo}; filename="${ascii.replaceAll('"', '')}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

/** /api/solicitacoes/:id/anexos */
export function rotasDeAnexos(opcoes: {
  servico: ServicoDeAnexos;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router({ mergeParams: true });
  rotas.use(autenticar(opcoes.jwtSecret));

  rotas.post('/', receberArquivo, async (req, res) => {
    const id = uuidDo(req, 'id', 'Solicitação não encontrada');
    if (!req.file) {
      throw new ErroDeValidacao('Envie o arquivo no campo "arquivo"');
    }
    // O navegador manda o nome em UTF-8, mas o leitor de formulário o lê
    // como latin1: sem isto, "Canhoto São Paulo.pdf" viraria "SÃ£o"
    const nome = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const opcoes = validar(esquemaDoEnvio, req.body ?? {});
    res
      .status(201)
      .json(
        await servico.anexar(
          usuarioDa(req),
          id,
          { nome, conteudo: req.file.buffer },
          opcoes,
        ),
      );
  });

  rotas.delete('/:anexoId', async (req, res) => {
    await servico.excluir(
      usuarioDa(req),
      uuidDo(req, 'id', 'Anexo não encontrado'),
      uuidDo(req, 'anexoId', 'Anexo não encontrado'),
    );
    res.status(204).end();
  });

  rotas.get('/:anexoId', async (req, res) => {
    const arquivo = await servico.baixar(
      usuarioDa(req),
      uuidDo(req, 'id', 'Anexo não encontrado'),
      uuidDo(req, 'anexoId', 'Anexo não encontrado'),
    );
    res.setHeader('Content-Type', arquivo.tipoMime);
    res.setHeader('Content-Length', String(arquivo.tamanhoBytes));
    res.setHeader(
      'Content-Disposition',
      disposicao(
        arquivo.exibivel ? 'inline' : 'attachment',
        arquivo.nomeArquivo,
      ),
    );
    // Documento de cliente: não fica em cache de navegador nem de proxy
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(arquivo.conteudo, res);
  });

  return rotas;
}
