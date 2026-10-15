import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ErroAcessoNegado } from './erros.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção contra CSRF pela origem da requisição (OWASP: "Verifying Origin
 * With Standard Headers").
 *
 * O navegador sempre envia o cabeçalho `Origin` em requisições que alteram
 * dados, e um site malicioso não consegue falsificá-lo. Toda requisição que
 * não seja de leitura precisa vir de uma origem autorizada (o frontend);
 * sem `Origin`, vale o `Referer`; sem nenhum dos dois, é recusada.
 *
 * Soma-se ao cookie `SameSite=Lax`, que já impede o navegador de enviar o
 * cookie nesses casos — duas barreiras independentes.
 */
export function protecaoCsrf(
  origensPermitidas: readonly string[],
): RequestHandler {
  const permitidas = new Set(
    origensPermitidas.map((url) => new URL(url).origin),
  );

  return (req: Request, _res: Response, next: NextFunction) => {
    if (METODOS_SEGUROS.has(req.method)) {
      next();
      return;
    }

    if (!permitidas.has(origemDa(req) ?? '')) {
      throw new ErroAcessoNegado('Origem da requisição não autorizada');
    }
    next();
  };
}

function origemDa(req: Request): string | null {
  const origin = req.get('origin');
  if (origin) {
    return origin;
  }

  const referer = req.get('referer');
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
