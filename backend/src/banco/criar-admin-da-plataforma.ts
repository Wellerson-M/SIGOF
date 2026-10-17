/**
 * Cria um administrador da plataforma. Roda no servidor, por quem tem
 * acesso a ele: não existe tela nem rota para criar o primeiro, de
 * propósito (ninguém de fora consegue se cadastrar como dono do sistema).
 *
 *   npm run plataforma:criar-admin -- --nome "Fulano" --email fulano@x.com
 *
 * Mostra a senha provisória uma única vez; no primeiro acesso, em
 * /plataforma/entrar, ela é trocada.
 */
import { config } from 'dotenv';
import { criarAdministradorDaPlataforma } from '../modulos/plataforma/servico.js';
import { criarPrismaClient } from './cliente.js';

/* eslint-disable no-console -- saída de script de linha de comando */

config({ path: ['.env', '../.env'] });

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const nome = argumento('nome');
  const email = argumento('email');
  if (!nome || !email || !email.includes('@')) {
    console.error(
      'Uso: npm run plataforma:criar-admin -- --nome "Seu nome" --email voce@exemplo.com',
    );
    process.exitCode = 1;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não definida. Confira o arquivo .env.');
  }
  const prisma = criarPrismaClient(databaseUrl);
  try {
    const senha = await criarAdministradorDaPlataforma(prisma, { nome, email });
    console.log(`Administrador da plataforma criado: ${email}`);
    console.log(
      `Senha provisória (anote agora, não aparece de novo): ${senha}`,
    );
    console.log('Entre em /plataforma/entrar e troque a senha.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
