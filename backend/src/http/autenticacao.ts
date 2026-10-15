import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Perfil } from '../dominio/status.js';
import {
  verificarTokenDeAcesso,
  type UsuarioAutenticado,
} from '../modulos/auth/tokens.js';
import { ErroAcessoNegado, ErroNaoAutenticado } from './erros.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- extensão de tipo do Express
  namespace Express {
    interface Request {
      /** Preenchido por `autenticar`; daqui sai a empresa de toda consulta. */
      usuario?: UsuarioAutenticado;
    }
  }
}

export const COOKIE_ACESSO = 'sigof_acesso';
export const COOKIE_SESSAO = 'sigof_sessao';

/** Exige um token de acesso válido no cookie e preenche `req.usuario`. */
export function autenticar(jwtSecret: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[COOKIE_ACESSO];
    const usuario =
      typeof token === 'string'
        ? await verificarTokenDeAcesso(token, jwtSecret)
        : null;

    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    req.usuario = usuario;
    next();
  };
}

/** Deve vir depois de `autenticar`. Recusa com 403 quem não tem um dos perfis. */
export function exigirPerfil(...perfis: Perfil[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) {
      throw new ErroNaoAutenticado();
    }
    if (!perfis.includes(req.usuario.perfil)) {
      throw new ErroAcessoNegado();
    }
    next();
  };
}

/** Atalho para rotas atrás de `autenticar`. */
export function usuarioDa(req: Request): UsuarioAutenticado {
  if (!req.usuario) {
    throw new ErroNaoAutenticado();
  }
  return req.usuario;
}
