import type { NextFunction, Request, Response } from 'express';
import { ErroDeAplicacao } from './erros.js';

/**
 * Erros que o próprio Express (body-parser) lança com status HTTP, como JSON
 * malformado (400) ou corpo grande demais (413).
 */
interface ErroComStatusHttp {
  status: number;
  type?: string;
}

function temStatusDeCliente(erro: unknown): erro is ErroComStatusHttp {
  if (typeof erro !== 'object' || erro === null || !('status' in erro)) {
    return false;
  }

  const { status } = erro as { status: unknown };
  return typeof status === 'number' && status >= 400 && status < 500;
}

const MENSAGENS_DO_EXPRESS: Record<string, string> = {
  'entity.parse.failed': 'JSON malformado',
  'entity.too.large': 'Corpo da requisição grande demais',
};

/**
 * Último middleware da cadeia: transforma qualquer erro em resposta JSON.
 *
 * - `ErroDeAplicacao` → status e mensagem do próprio erro (4xx).
 * - Erro 4xx do Express → status original, mensagem fixa.
 * - Qualquer outra coisa → 500 genérico. O `id` devolvido é o correlation id
 *   da requisição: o suporte encontra o erro completo no log a partir dele.
 */
export function tratadorDeErros(
  erro: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (erro instanceof ErroDeAplicacao) {
    req.log?.warn({ err: erro }, 'Erro de aplicação');

    res.status(erro.status).json({
      erro: erro.message,
      codigo: erro.codigo,
      ...(erro.detalhes === undefined ? {} : { detalhes: erro.detalhes }),
    });
    return;
  }

  if (temStatusDeCliente(erro)) {
    req.log?.warn({ err: erro }, 'Requisição rejeitada pelo Express');

    res.status(erro.status).json({
      erro: MENSAGENS_DO_EXPRESS[erro.type ?? ''] ?? 'Requisição inválida',
      codigo: 'REQUISICAO_INVALIDA',
    });
    return;
  }

  req.log?.error({ err: erro }, 'Erro não tratado');

  // Detalhes internos nunca vazam para o cliente
  res.status(500).json({
    erro: 'Erro interno do servidor',
    codigo: 'ERRO_INTERNO',
    id: req.id,
  });
}
