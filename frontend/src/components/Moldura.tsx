'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Sino } from '@/components/Sino';
import { VersaoDoSistema } from '@/components/VersaoDoSistema';
import { NOME_DO_PERFIL, type Perfil } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

interface ItemDoMenu {
  rotulo: string;
  href: string;
  /** Ainda não implementado: aparece no menu, mas desabilitado. */
  emBreve?: boolean;
  perfis?: Perfil[];
}

const MENU: ItemDoMenu[] = [
  { rotulo: 'Início', href: '/inicio' },
  { rotulo: 'Solicitações', href: '/solicitacoes' },
  {
    rotulo: 'Nova solicitação',
    href: '/solicitacoes/nova',
    perfis: ['SOLICITANTE', 'ANALISTA', 'SUPERVISOR'],
  },
  {
    rotulo: 'Indicadores',
    href: '/indicadores',
    perfis: ['SUPERVISOR', 'ADMIN'],
  },
  {
    rotulo: 'Administração',
    href: '/administracao',
    perfis: ['ADMIN'],
  },
];

/** Estrutura das páginas internas: menu lateral, barra superior e conteúdo. */
export function Moldura({ children }: { children: ReactNode }) {
  const { usuario, sair } = useSessao();
  const [erroAoSair, setErroAoSair] = useState<string | null>(null);

  async function aoSair() {
    setErroAoSair(null);
    try {
      await sair();
    } catch {
      // A sessão continua ativa no servidor: avisar em vez de fingir que saiu
      setErroAoSair('Não foi possível sair. Tente de novo.');
    }
  }
  const caminho = usePathname();
  // O detalhe de uma solicitação acende "Solicitações" no menu
  const atual = (href: string) =>
    caminho === href ||
    (href === '/solicitacoes' &&
      caminho.startsWith('/solicitacoes/') &&
      caminho !== '/solicitacoes/nova');
  const itens = MENU.filter(
    (item) => !item.perfis || item.perfis.includes(usuario.perfil),
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-marca text-sobre-marca md:flex">
        <div className="px-5 py-5">
          <Logo tamanho={30} invertido />
        </div>
        <nav aria-label="Menu principal" className="flex flex-col gap-0.5 px-3">
          {itens.map((item) =>
            item.emBreve ? (
              <span
                key={item.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm opacity-50"
                title="Em desenvolvimento"
              >
                {item.rotulo}
                <span className="text-[10px] uppercase tracking-wide">
                  em breve
                </span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={atual(item.href) ? 'page' : undefined}
                className="rounded-md px-3 py-2 text-sm hover:bg-white/10 aria-[current=page]:bg-white/15 aria-[current=page]:font-semibold"
              >
                {item.rotulo}
              </Link>
            ),
          )}
        </nav>
        <div className="mt-auto">
          <VersaoDoSistema />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-borda bg-superficie px-4 md:px-6">
          <div className="md:hidden">
            <Logo tamanho={26} />
          </div>
          <p className="hidden truncate text-sm text-texto-suave md:block">
            {usuario.empresa.razaoSocial}
          </p>
          <div className="flex items-center gap-2 md:gap-3">
            <Sino />
            <Link
              href="/conta"
              title="Minha conta"
              className="rounded-md px-2 py-1 text-right leading-tight hover:bg-fundo"
            >
              <p className="text-sm font-medium text-texto">{usuario.nome}</p>
              <p className="text-xs text-texto-suave">
                {NOME_DO_PERFIL[usuario.perfil]}
              </p>
            </Link>
            <button
              type="button"
              onClick={() => void aoSair()}
              className="h-8 rounded-md border border-borda px-3 text-sm text-texto hover:bg-fundo"
            >
              Sair
            </button>
          </div>
        </header>
        {erroAoSair && (
          <p
            role="alert"
            className="border-b border-critico/40 bg-critico/10 px-4 py-2 text-sm text-critico md:px-6"
          >
            {erroAoSair}
          </p>
        )}
        {/* No celular o menu lateral some; os atalhos ficam numa faixa rolável */}
        <nav
          aria-label="Menu principal (celular)"
          className="flex gap-1 overflow-x-auto border-b border-borda bg-superficie px-2 py-1.5 md:hidden"
        >
          {itens.map((item) =>
            item.emBreve ? (
              <span
                key={item.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm text-texto-suave opacity-60"
                title="Em desenvolvimento"
              >
                {item.rotulo}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={atual(item.href) ? 'page' : undefined}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm text-texto aria-[current=page]:bg-fundo aria-[current=page]:font-semibold"
              >
                {item.rotulo}
              </Link>
            ),
          )}
        </nav>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
