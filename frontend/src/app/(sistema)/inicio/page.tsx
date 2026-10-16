'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NOME_DO_PERFIL } from '@/lib/api';
import { resumoDoDia, type Contagem } from '@/lib/inicio';
import { useSessao } from '@/lib/sessao';
import { api } from '@/lib/solicitacoes';

const AREA: Record<string, string> = {
  FINANCEIRO: 'Financeiro',
  COMERCIAL: 'Comercial',
  OPERACIONAL: 'Operacional',
};

export default function PaginaInicial() {
  const { usuario } = useSessao();
  const [resumo, setResumo] = useState<Contagem[] | null>(null);
  const mostraResumo = usuario.perfil !== 'ADMIN';

  useEffect(() => {
    if (!mostraResumo) return;
    let cancelado = false;
    api.listar().then(
      (itens) => {
        if (!cancelado) setResumo(resumoDoDia(usuario, itens));
      },
      () => {},
    );
    return () => {
      cancelado = true;
    };
  }, [usuario, mostraResumo]);

  const primeiroNome = usuario.nome.split(' ')[0];
  // "Ltda." já termina em ponto: sem isto a frase sairia com dois pontos
  const empresa = usuario.empresa.razaoSocial.replace(/\.$/, '');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">
          Olá, {primeiroNome}
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          Você está no SIGOF da {empresa}.
        </p>
      </div>

      {resumo && (
        <section
          aria-label="Resumo do dia"
          className="grid gap-4 sm:grid-cols-3"
        >
          {resumo.map((c) => (
            <Link
              key={c.rotulo}
              href="/solicitacoes"
              className="rounded-lg border border-borda bg-superficie p-4 hover:border-primaria/50"
            >
              <p className="text-sm text-texto-suave">{c.rotulo}</p>
              <p
                className={`mt-1 text-3xl font-semibold tabular-nums ${c.critico ? 'text-critico' : 'text-texto'}`}
              >
                {c.valor}
              </p>
            </Link>
          ))}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Cartao titulo="Seu perfil">
          <p className="text-lg font-semibold text-texto">
            {NOME_DO_PERFIL[usuario.perfil]}
          </p>
          {usuario.area && (
            <p className="text-sm text-texto-suave">
              Área: {AREA[usuario.area] ?? usuario.area}
            </p>
          )}
        </Cartao>
        <Cartao titulo="Empresa">
          <p className="text-lg font-semibold text-texto">
            {usuario.empresa.razaoSocial}
          </p>
          <p className="font-mono text-xs text-texto-suave">
            {usuario.empresa.slug}
          </p>
        </Cartao>
        <Cartao titulo="Acesso">
          <p className="truncate text-sm text-texto">{usuario.email}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ok">
            <span
              className="inline-block size-2 rounded-full bg-ok"
              aria-hidden="true"
            />
            Sessão protegida
          </p>
        </Cartao>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/solicitacoes"
          className="inline-flex h-10 items-center rounded-md bg-primaria px-5 text-sm font-semibold text-sobre-primaria"
        >
          Abrir o quadro de solicitações
        </Link>
        {usuario.perfil !== 'ADMIN' && (
          <Link
            href="/solicitacoes/nova"
            className="inline-flex h-10 items-center rounded-md border border-borda bg-superficie px-5 text-sm font-semibold text-texto"
          >
            Nova solicitação
          </Link>
        )}
      </div>

      {usuario.perfil === 'ADMIN' && (
        <Cartao titulo="Administração">
          <p className="mb-3 text-sm text-texto-suave">
            Cadastre os funcionários, ajuste o expediente e o prazo de
            atendimento e configure o e-mail de avisos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/administracao"
              className="inline-flex h-9 items-center rounded-md border border-borda px-4 text-sm text-texto"
            >
              Abrir a administração
            </Link>
            <Link
              href="/indicadores"
              className="inline-flex h-9 items-center rounded-md border border-borda px-4 text-sm text-texto"
            >
              Ver os indicadores
            </Link>
          </div>
        </Cartao>
      )}
    </div>
  );
}

function Cartao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">
        {titulo}
      </h2>
      {children}
    </section>
  );
}
