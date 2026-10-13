import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Cria o client do Prisma conectado ao PostgreSQL.
 *
 * A partir do Prisma 7 a conexão é feita por um driver adapter (aqui o
 * `pg`, driver oficial do Node para Postgres), em vez do motor binário
 * embutido nas versões anteriores.
 */
export function criarPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}
