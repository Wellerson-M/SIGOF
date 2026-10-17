import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Testes de integração que sobem dezenas de anexos passam de 5 s
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/http/server.ts',
        // Scripts e conexão com o banco são exercitados pelos testes de
        // integração, não pelos unitários
        'src/banco/**',
        'src/testes/**',
      ],
      // Quality gate da RFC seção 5.6: mínimo de 75% no backend.
      // O pipeline reprova o merge se a cobertura cair abaixo disso.
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
});
