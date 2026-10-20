import type { PrismaClient } from '@prisma/client';
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

/**
 * Rotas que não exigem a sessão viva: entrar, renovar e sair cuidam da
 * sessão elas mesmas, e a plataforma tem o próprio cookie.
 */
const SEM_CONFERENCIA_DE_SESSAO = [
  '/auth/login',
  '/auth/renovar',
  '/auth/sair',
  '/plataforma',
];

/**
 * Antes de qualquer rota da API: se veio um token de acesso, a sessão que
 * o emitiu precisa continuar valendo (não revogada nem vencida). Assim,
 * desativar a pessoa, trocar o e-mail dela ou ela sair em outro lugar tira
 * o acesso no próximo clique, e não 15 minutos depois. Sem token (ou com
 * token inválido), segue: a rota decide se precisa de login.
 *
 * Montada em `/api`; o caminho visto aqui é relativo a ela.
 */
export function conferirSessaoViva(
  prisma: PrismaClient,
  jwtSecret: string,
  agora: () => Date = () => new Date(),
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (SEM_CONFERENCIA_DE_SESSAO.some((rota) => req.path.startsWith(rota))) {
      return next();
    }
    const token: unknown = req.cookies?.[COOKIE_ACESSO];
    const usuario =
      typeof token === 'string'
        ? await verificarTokenDeAcesso(token, jwtSecret)
        : null;
    if (!usuario) return next();

    // Token sem sessão (emitido antes desta regra): a pessoa renova
    if (!usuario.familia) {
      throw new ErroNaoAutenticado('Sessão expirada');
    }
    const viva = await prisma.sessao.findFirst({
      where: {
        familia: usuario.familia,
        usuarioId: usuario.id,
        revogadaEm: null,
        expiraEm: { gt: agora() },
      },
      select: { id: true },
    });
    if (!viva) {
      throw new ErroNaoAutenticado('Sessão expirada');
    }
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
