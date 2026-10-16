import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Simula o navegador (DOM) para testar os componentes
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        // Amarração do Next sem lógica própria (fontes, redirecionamento e
        // composição de layout); o comportamento é coberto pelos testes de
        // ProvedorDeSessao e Moldura
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/(sistema)/layout.tsx',
      ],
      // Mínimo exigido pelo Playbook para o frontend
      thresholds: { lines: 25, functions: 25, branches: 25, statements: 25 },
    },
  },
});
