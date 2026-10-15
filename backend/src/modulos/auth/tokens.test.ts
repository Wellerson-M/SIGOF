import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  emitirTokenDeAcesso,
  gerarTokenDeSessao,
  hashDoToken,
  verificarTokenDeAcesso,
} from './tokens.js';

const SEGREDO = 'x'.repeat(32);
const USUARIO = { id: 'u1', empresaId: 'e1', perfil: 'ANALISTA' as const };

describe('token de acesso', () => {
  it('ida e volta: o token emitido devolve o mesmo usuário', async () => {
    const token = await emitirTokenDeAcesso(USUARIO, SEGREDO, 15);

    await expect(verificarTokenDeAcesso(token, SEGREDO)).resolves.toEqual(
      USUARIO,
    );
  });

  it('recusa token assinado com outro segredo', async () => {
    const token = await emitirTokenDeAcesso(USUARIO, 'y'.repeat(32), 15);

    await expect(verificarTokenDeAcesso(token, SEGREDO)).resolves.toBeNull();
  });

  it('recusa token vencido', async () => {
    const vencido = await new SignJWT({ emp: 'e1', perfil: 'ANALISTA' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('sigof')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SEGREDO));

    await expect(verificarTokenDeAcesso(vencido, SEGREDO)).resolves.toBeNull();
  });

  it('recusa token com perfil desconhecido', async () => {
    const forjado = await new SignJWT({ emp: 'e1', perfil: 'SUPERUSUARIO' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('sigof')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SEGREDO));

    await expect(verificarTokenDeAcesso(forjado, SEGREDO)).resolves.toBeNull();
  });

  it('recusa lixo', async () => {
    await expect(
      verificarTokenDeAcesso('nao.e.jwt', SEGREDO),
    ).resolves.toBeNull();
  });
});

describe('token de sessão', () => {
  it('é aleatório e longo', () => {
    const a = gerarTokenDeSessao();

    expect(a).not.toBe(gerarTokenDeSessao());
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('o hash é o SHA-256 do token, em hexadecimal', () => {
    // Vetor de teste oficial do SHA-256 (FIPS 180-2) para "abc"
    expect(hashDoToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('tokens diferentes geram hashes diferentes, e o hash não revela o token', () => {
    const a = gerarTokenDeSessao();
    const b = gerarTokenDeSessao();

    expect(hashDoToken(a)).not.toBe(hashDoToken(b));
    expect(hashDoToken(a)).not.toContain(a);
  });
});
