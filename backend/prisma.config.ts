import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// A partir do Prisma 7 a connection string sai do schema.prisma e passa a
// ser declarada aqui, mantendo o schema livre de configuração de ambiente.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
