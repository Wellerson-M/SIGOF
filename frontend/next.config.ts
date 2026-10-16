import type { NextConfig } from 'next';

/**
 * Telas e API no mesmo endereço, com a API em /api: assim o cookie de
 * sessão funciona sem precisar liberar acesso entre sites.
 *
 * - No notebook, o próprio Next repassa /api para o backend (localhost:3333).
 * - No servidor, o Caddy manda /api direto para o contêiner da API, e este
 *   repasse nem chega a ser usado.
 */
const API_INTERNA = process.env.API_INTERNA ?? 'http://localhost:3333';

const nextConfig: NextConfig = {
  // Gera um servidor enxuto (.next/standalone) para a imagem Docker
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/api/:caminho*', destination: `${API_INTERNA}/api/:caminho*` },
    ];
  },
};

export default nextConfig;
