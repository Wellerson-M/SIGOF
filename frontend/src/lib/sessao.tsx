'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { sair as sairDaApi, usuarioLogado, type UsuarioLogado } from './api';

interface Sessao {
  usuario: UsuarioLogado;
  sair: () => Promise<void>;
}

const ContextoDaSessao = createContext<Sessao | null>(null);

/**
 * Guarda das páginas internas: confirma com a API quem está logado. Sem
 * sessão válida (nem renovável), manda para a tela de login.
 */
export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);

  useEffect(() => {
    let cancelado = false;
    usuarioLogado()
      .then((dados) => {
        if (!cancelado) setUsuario(dados);
      })
      .catch(() => {
        if (!cancelado) router.replace('/entrar');
      });
    return () => {
      cancelado = true;
    };
  }, [router]);

  if (!usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-texto-suave">
        Carregando…
      </div>
    );
  }

  async function sair() {
    try {
      await sairDaApi();
    } finally {
      router.replace('/entrar');
    }
  }

  return <ContextoDaSessao.Provider value={{ usuario, sair }}>{children}</ContextoDaSessao.Provider>;
}

export function useSessao(): Sessao {
  const sessao = useContext(ContextoDaSessao);
  if (!sessao) {
    throw new Error('useSessao precisa estar dentro de <ProvedorDeSessao>');
  }
  return sessao;
}
