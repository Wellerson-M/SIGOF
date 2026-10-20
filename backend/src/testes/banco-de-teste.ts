/**
 * Apoio aos testes de integração: banco real, dados isolados por arquivo.
 *
 * Cada arquivo de teste cria a própria empresa com um slug aleatório e apaga
 * tudo dela no final. Assim os arquivos rodam em paralelo sem um enxergar os
 * dados do outro — o mesmo isolamento que o sistema garante entre clientes.
 */
import { randomUUID } from 'node:crypto';
import type { Perfil, PrismaClient } from '@prisma/client';
import { carregarEnv, type Env } from '../config/env.js';
import { criarPrismaClient } from '../banco/cliente.js';
import { gerarHashDeSenha } from '../seguranca/senha.js';

/** Sem DATABASE_URL (ex.: máquina sem Docker), os testes de integração são pulados. */
export const temBanco = Boolean(process.env.DATABASE_URL);

export function envDeTeste(): Env {
  return carregarEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
  });
}

export function conectar(): PrismaClient {
  return criarPrismaClient(envDeTeste().DATABASE_URL);
}

export const SENHA = 'Senha@Teste123';

export interface EmpresaDeTeste {
  id: string;
  slug: string;
  usuarios: Record<Perfil, { id: string; email: string }>;
}

export async function criarEmpresaDeTeste(
  prisma: PrismaClient,
): Promise<EmpresaDeTeste> {
  const slug = `teste-${randomUUID().slice(0, 8)}`;
  const senhaHash = await gerarHashDeSenha(SENHA);

  const empresa = await prisma.empresa.create({
    data: {
      razaoSocial: `Empresa ${slug}`,
      cnpj: randomUUID().replace(/\D/g, '').slice(0, 14).padEnd(14, '0'),
      slug,
    },
  });

  const perfis: Perfil[] = ['SOLICITANTE', 'ANALISTA', 'SUPERVISOR', 'ADMIN'];
  const usuarios = {} as EmpresaDeTeste['usuarios'];
  for (const perfil of perfis) {
    const email = `${perfil.toLowerCase()}@${slug}.test`;
    const usuario = await prisma.usuario.create({
      data: { empresaId: empresa.id, nome: perfil, email, perfil, senhaHash },
    });
    usuarios[perfil] = { id: usuario.id, email };
  }

  return { id: empresa.id, slug, usuarios };
}

export async function apagarEmpresaDeTeste(
  prisma: PrismaClient,
  empresaId: string,
): Promise<void> {
  const onde = { where: { empresaId } };
  await prisma.eventoAuditoria.deleteMany(onde);
  await prisma.sessao.deleteMany(onde);
  await prisma.notificacao.deleteMany(onde);
  await prisma.emailSaida.deleteMany(onde);
  await prisma.statusHistorico.deleteMany(onde);
  await prisma.anexo.deleteMany(onde);
  await prisma.mensagem.deleteMany(onde);
  await prisma.marcacaoDeVerificacao.deleteMany(onde);
  await prisma.solicitacao.deleteMany(onde);
  await prisma.itemDeVerificacao.deleteMany(onde);
  await prisma.filial.deleteMany(onde);
  await prisma.producaoDoDigitador.deleteMany(onde);
  await prisma.causaDeErro.deleteMany(onde);
  await prisma.configuracaoDoFormulario.deleteMany(onde);
  await prisma.sequenciaProtocolo.deleteMany(onde);
  await prisma.usuario.deleteMany(onde);
  await prisma.empresa.delete({ where: { id: empresaId } });
}

/** Extrai `nome=valor` de cada Set-Cookie da resposta. */
export function cookiesDa(resposta: {
  headers: Record<string, unknown>;
}): Record<string, string> {
  const brutos = resposta.headers['set-cookie'];
  const lista = Array.isArray(brutos) ? (brutos as string[]) : [];
  const cookies: Record<string, string> = {};

  for (const linha of lista) {
    const [par] = linha.split(';');
    const [nome, ...valor] = (par ?? '').split('=');
    if (nome) cookies[nome.trim()] = valor.join('=');
  }
  return cookies;
}
