import { afterEach, describe, expect, it, vi } from 'vitest';
import { carregarEnv } from './env.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const envValido = {
  DATABASE_URL: 'postgresql://sigof:sigof@localhost:5432/sigof',
  JWT_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv;

describe('carregarEnv', () => {
  it('aplica os valores padrão quando as variáveis opcionais não são informadas', () => {
    const env = carregarEnv(envValido);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3333);
  });

  it('converte variáveis numéricas de texto para número', () => {
    const env = carregarEnv({ ...envValido, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('rejeita JWT_SECRET curto demais', () => {
    expect(() => carregarEnv({ ...envValido, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejeita DATABASE_URL ausente', () => {
    const { DATABASE_URL: _omitido, ...semBanco } = envValido;

    expect(() => carregarEnv(semBanco)).toThrow(/DATABASE_URL/);
  });

  it('rejeita NODE_ENV fora dos ambientes previstos', () => {
    expect(() =>
      carregarEnv({ ...envValido, NODE_ENV: 'homologacao' }),
    ).toThrow(/NODE_ENV/);
  });

  it('em desenvolvimento, FRONTEND_URL tem padrão localhost', () => {
    expect(carregarEnv(envValido).FRONTEND_URL).toBe('http://localhost:3000');
  });

  it('em staging e produção, exige FRONTEND_URL explícita', () => {
    for (const NODE_ENV of ['staging', 'production']) {
      expect(() => carregarEnv({ ...envValido, NODE_ENV })).toThrow(
        /FRONTEND_URL: obrigatória/,
      );
      expect(
        carregarEnv({
          ...envValido,
          NODE_ENV,
          FRONTEND_URL: 'https://app.sigof.test',
          CHAVE_CIFRA: 'x'.repeat(32),
        }).FRONTEND_URL,
      ).toBe('https://app.sigof.test');
    }
  });

  it('em staging e produção, exige CHAVE_CIFRA; em desenvolvimento tem padrão', () => {
    expect(() =>
      carregarEnv({
        ...envValido,
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.sigof.test',
      }),
    ).toThrow(/CHAVE_CIFRA: obrigatória/);
    expect(() => carregarEnv({ ...envValido, CHAVE_CIFRA: 'curta' })).toThrow(
      /CHAVE_CIFRA/,
    );
    expect(carregarEnv(envValido).CHAVE_CIFRA).toMatch(/desenvolvimento/);
  });

  it('usa process.env quando nenhuma fonte é informada', () => {
    vi.stubEnv('DATABASE_URL', envValido.DATABASE_URL);
    vi.stubEnv('JWT_SECRET', envValido.JWT_SECRET);
    vi.stubEnv('PORT', '4444');

    expect(carregarEnv().PORT).toBe(4444);
  });
});
