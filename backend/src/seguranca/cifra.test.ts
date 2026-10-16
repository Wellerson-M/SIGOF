import { describe, expect, it } from 'vitest';
import { Cifra } from './cifra.js';

describe('Cifra (AES-256-GCM)', () => {
  const cifra = new Cifra('segredo-de-teste');

  it('decifra o que cifrou', () => {
    const valor = cifra.cifrar('abcd efgh ijkl mnop');
    expect(valor.startsWith('v1.')).toBe(true);
    expect(valor).not.toContain('abcd');
    expect(cifra.decifrar(valor)).toBe('abcd efgh ijkl mnop');
  });

  it('o mesmo texto gera resultados diferentes (IV aleatório)', () => {
    expect(cifra.cifrar('igual')).not.toBe(cifra.cifrar('igual'));
  });

  it('recusa valor adulterado', () => {
    const [versao, iv, tag, cifrado] = cifra.cifrar('senha').split('.');
    const trocado = Buffer.from(cifrado ?? '', 'base64url');
    trocado[0] = (trocado[0] ?? 0) ^ 1;
    expect(() =>
      cifra.decifrar(
        [versao, iv, tag, trocado.toString('base64url')].join('.'),
      ),
    ).toThrow();
  });

  it('recusa valor cifrado com outra chave', () => {
    const valor = new Cifra('outra-chave').cifrar('senha');
    expect(() => cifra.decifrar(valor)).toThrow();
  });

  it('recusa formato desconhecido', () => {
    expect(() => cifra.decifrar('texto-puro')).toThrow(/formato/);
    expect(() => cifra.decifrar('v2.a.b.c')).toThrow(/formato/);
  });
});
