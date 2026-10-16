import { describe, expect, it } from 'vitest';
import { gerarSenhaProvisoria } from './senha-provisoria.js';

describe('gerarSenhaProvisoria', () => {
  it('tem 12 caracteres, com letra e número', () => {
    for (let i = 0; i < 200; i++) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toHaveLength(12);
      expect(senha).toMatch(/[a-zA-Z]/);
      expect(senha).toMatch(/\d/);
    }
  });

  it('não usa caracteres que se confundem ao ditar', () => {
    const juntas = Array.from({ length: 200 }, () =>
      gerarSenhaProvisoria(),
    ).join('');
    expect(juntas).not.toMatch(/[0O1lI]/);
  });

  it('não repete', () => {
    const senhas = new Set(
      Array.from({ length: 500 }, () => gerarSenhaProvisoria()),
    );
    expect(senhas.size).toBe(500);
  });
});
