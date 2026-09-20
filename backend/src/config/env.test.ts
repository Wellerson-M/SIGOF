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
    expect(env.SLA_ATENDIMENTO_INICIAL_MINUTOS).toBe(240);
    expect(env.JANELA_DUPLICIDADE_DIAS).toBe(7);
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
    expect(() => carregarEnv({ ...envValido, NODE_ENV: 'homologacao' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('usa process.env quando nenhuma fonte é informada', () => {
    vi.stubEnv('DATABASE_URL', envValido.DATABASE_URL);
    vi.stubEnv('JWT_SECRET', envValido.JWT_SECRET);
    vi.stubEnv('PORT', '4444');

    expect(carregarEnv().PORT).toBe(4444);
  });
});
