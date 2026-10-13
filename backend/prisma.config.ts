import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Mesmo critério de src/config/env.ts: o .env pode estar em backend/ ou na raiz.
config({ path: ['.env', '../.env'] });

// A partir do Prisma 7 a connection string sai do schema.prisma e passa a
// ser declarada aqui, mantendo o schema livre de configuração de ambiente.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // `prisma generate` (rodado no postinstall e no CI) não conecta no banco,
  // então a URL pode faltar; migrate e seed falham com mensagem clara se faltar.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
