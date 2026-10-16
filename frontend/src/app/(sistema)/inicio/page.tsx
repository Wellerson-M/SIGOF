'use client';

import Link from 'next/link';
import { NOME_DO_PERFIL } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

const AREA: Record<string, string> = {
  FINANCEIRO: 'Financeiro',
  COMERCIAL: 'Comercial',
  OPERACIONAL: 'Operacional',
};

const PROXIMAS_ENTREGAS = [
  'Anexos (PDF e imagens) em cada solicitação',
  'Avisos no sistema e por e-mail a cada movimentação',
  'Indicadores para o supervisor',
  'Administração de usuários e dos parâmetros da empresa',
];

export default function PaginaInicial() {
  const { usuario } = useSessao();
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

      <Cartao titulo="Em desenvolvimento">
        <p className="mb-3 text-sm text-texto-suave">
          As próximas funcionalidades aparecem aqui e no menu conforme ficarem
          prontas:
        </p>
        <ul className="flex flex-col gap-2">
          {PROXIMAS_ENTREGAS.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-texto">
              <span
                className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-destaque"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
      </Cartao>
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
