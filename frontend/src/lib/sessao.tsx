'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  ErroDaApi,
  sair as sairDaApi,
  usuarioLogado,
  type UsuarioLogado,
} from './api';

interface Sessao {
  usuario: UsuarioLogado;
  /** Encerra a sessão. Se a API falhar, rejeita e o usuário continua logado. */
  sair: () => Promise<void>;
  /** Busca de novo os dados de quem está logado (ex.: depois de trocar a senha). */
  atualizar: () => Promise<void>;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'logado'; usuario: UsuarioLogado }
  | { tipo: 'falha'; mensagem: string };

const ContextoDaSessao = createContext<Sessao | null>(null);

/**
 * Guarda das páginas internas: confirma com a API quem está logado.
 * - Sessão inválida (401): manda para a tela de login.
 * - Outra falha (servidor fora do ar, sem internet): mostra o erro e deixa
 *   tentar de novo, sem fingir que a pessoa foi deslogada.
 */
export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const verificar = useCallback(() => {
    let cancelado = false;
    usuarioLogado()
      .then((usuario) => {
        if (!cancelado) setEstado({ tipo: 'logado', usuario });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        if (erro instanceof ErroDaApi && erro.semSessao) {
          // Depois de entrar, volta para onde estava (ex.: link de anexo
          // recebido por e-mail)
          const aqui = window.location.pathname + window.location.search;
          router.replace(
            aqui === '/' || aqui.startsWith('/inicio')
              ? '/entrar'
              : `/entrar?voltar=${encodeURIComponent(aqui)}`,
          );
          return;
        }
        setEstado({
          tipo: 'falha',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Algo deu errado. Tente de novo em instantes.',
        });
      });
    return () => {
      cancelado = true;
    };
  }, [router]);

  useEffect(() => verificar(), [verificar]);

  // Senha provisória: nada do sistema abre antes de a pessoa criar a dela
  const precisaTrocarSenha =
    estado.tipo === 'logado' && estado.usuario.trocarSenha;
  useEffect(() => {
    if (precisaTrocarSenha && caminho !== '/conta') {
      router.replace('/conta');
    }
  }, [precisaTrocarSenha, caminho, router]);

  if (estado.tipo === 'carregando') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-texto-suave">
        Carregando…
      </div>
    );
  }

  if (estado.tipo === 'falha') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p role="alert" className="max-w-sm text-sm text-texto">
          {estado.mensagem}
        </p>
        <button
          type="button"
          onClick={() => {
            setEstado({ tipo: 'carregando' });
            verificar();
          }}
          className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  async function sair() {
    await sairDaApi();
    router.replace('/entrar');
  }

  async function atualizar() {
    setEstado({ tipo: 'logado', usuario: await usuarioLogado() });
  }

  return (
    <ContextoDaSessao.Provider
      value={{ usuario: estado.usuario, sair, atualizar }}
    >
      {children}
    </ContextoDaSessao.Provider>
  );
}

export function useSessao(): Sessao {
  const sessao = useContext(ContextoDaSessao);
  if (!sessao) {
    throw new Error('useSessao precisa estar dentro de <ProvedorDeSessao>');
  }
  return sessao;
}
