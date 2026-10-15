import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Perfil } from '../../dominio/status.js';

/**
 * Os dois tokens da sessão (RNF03):
 *
 * - **Token de acesso**: JWT assinado (HS256), vida curta (15 min). Prova
 *   quem é o usuário sem consultar o banco a cada requisição.
 * - **Token de sessão** (refresh): valor aleatório de 256 bits, vida longa.
 *   Só serve para pedir um novo token de acesso. No banco fica apenas o hash.
 */

export interface UsuarioAutenticado {
  id: string;
  empresaId: string;
  perfil: Perfil;
}

const EMISSOR = 'sigof';
const PERFIS: readonly string[] = [
  'SOLICITANTE',
  'ANALISTA',
  'SUPERVISOR',
  'ADMIN',
];

function chave(segredo: string): Uint8Array {
  return new TextEncoder().encode(segredo);
}

export function emitirTokenDeAcesso(
  usuario: UsuarioAutenticado,
  segredo: string,
  minutos: number,
): Promise<string> {
  return new SignJWT({ emp: usuario.empresaId, perfil: usuario.perfil })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario.id)
    .setIssuer(EMISSOR)
    .setIssuedAt()
    .setExpirationTime(`${minutos}m`)
    .sign(chave(segredo));
}

/** Devolve o usuário do token, ou `null` se for inválido, adulterado ou vencido. */
export async function verificarTokenDeAcesso(
  token: string,
  segredo: string,
): Promise<UsuarioAutenticado | null> {
  try {
    const { payload } = await jwtVerify(token, chave(segredo), {
      issuer: EMISSOR,
      algorithms: ['HS256'],
    });

    const { sub, emp, perfil } = payload;
    if (
      typeof sub !== 'string' ||
      typeof emp !== 'string' ||
      typeof perfil !== 'string' ||
      !PERFIS.includes(perfil)
    ) {
      return null;
    }

    return { id: sub, empresaId: emp, perfil: perfil as Perfil };
  } catch {
    return null;
  }
}

export function gerarTokenDeSessao(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 basta aqui (e não Argon2): o token já é aleatório com 256 bits,
 * então não há como adivinhá-lo por tentativa, ao contrário de uma senha.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
