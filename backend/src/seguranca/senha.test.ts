import { describe, expect, it } from 'vitest';
import { gerarHashDeSenha, verificarSenha } from './senha.js';

describe('senha', () => {
  it('gera hash Argon2id com os parâmetros da OWASP', async () => {
    const hash = await gerarHashDeSenha('Senha@Forte123');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain('Senha@Forte123');
  });

  it('gera hashes diferentes para a mesma senha (sal aleatório)', async () => {
    const [a, b] = await Promise.all([
      gerarHashDeSenha('mesma-senha'),
      gerarHashDeSenha('mesma-senha'),
    ]);

    expect(a).not.toBe(b);
  });

  it('aceita a senha correta e recusa a errada', async () => {
    const hash = await gerarHashDeSenha('correta');

    await expect(verificarSenha(hash, 'correta')).resolves.toBe(true);
    await expect(verificarSenha(hash, 'errada')).resolves.toBe(false);
  });

  it('trata hash malformado como senha errada, sem lançar erro', async () => {
    await expect(verificarSenha('nao-e-um-hash', 'qualquer')).resolves.toBe(
      false,
    );
  });
});
