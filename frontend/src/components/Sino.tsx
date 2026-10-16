'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  haQuantoTempo,
  notificacoes,
  type ListaDeNotificacoes,
  type Notificacao,
} from '@/lib/avisos';

/** De quanto em quanto tempo o sino pergunta se há novidade. */
export const INTERVALO_DO_SINO_MS = 30_000;

/** Ouve o aviso de "li as notificações desta solicitação" (vem do detalhe). */
export const EVENTO_NOTIFICACOES_LIDAS = 'sigof:notificacoes-lidas';

/** O sino da barra superior: notificações de cada movimentação. */
export function Sino() {
  const router = useRouter();
  const [lista, setLista] = useState<ListaDeNotificacoes | null>(null);
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  const atualizar = useCallback(async () => {
    try {
      setLista(await notificacoes.listar());
    } catch {
      // Sem conexão agora: o sino tenta de novo na próxima volta
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    const buscar = () => {
      notificacoes.listar().then(
        (dados) => {
          if (!cancelado) setLista(dados);
        },
        () => {},
      );
    };
    buscar();
    const relogio = setInterval(buscar, INTERVALO_DO_SINO_MS);
    window.addEventListener(EVENTO_NOTIFICACOES_LIDAS, buscar);
    return () => {
      cancelado = true;
      clearInterval(relogio);
      window.removeEventListener(EVENTO_NOTIFICACOES_LIDAS, buscar);
    };
  }, []);

  // Clicar fora ou apertar Esc fecha a lista
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(evento: MouseEvent) {
      if (!painel.current?.contains(evento.target as Node)) setAberto(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  async function abrir(item: Notificacao) {
    setAberto(false);
    router.push(`/solicitacoes/${item.solicitacaoId}`);
    if (!item.lida) {
      await notificacoes.marcarLidas({ ids: [item.id] }).catch(() => {});
      await atualizar();
    }
  }

  async function lerTodas() {
    await notificacoes.marcarLidas().catch(() => {});
    await atualizar();
  }

  const naoLidas = lista?.naoLidas ?? 0;

  return (
    <div ref={painel} className="relative">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        aria-label={
          naoLidas > 0 ? `Notificações: ${naoLidas} não lidas` : 'Notificações'
        }
        className="relative flex size-9 items-center justify-center rounded-md text-texto hover:bg-fundo"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critico px-1 text-[10px] font-bold text-white">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        // No celular a lista ocupa a largura da tela; no computador, abre
        // embaixo do sino
        <div className="fixed inset-x-2 top-14 z-40 rounded-lg border border-borda bg-superficie shadow-lg md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 md:w-[22rem]">
          <div className="flex items-center justify-between border-b border-borda px-3 py-2">
            <p className="text-sm font-semibold text-texto">Notificações</p>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => void lerTodas()}
                className="text-xs text-primaria underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          {!lista || lista.itens.length === 0 ? (
            <p className="px-3 py-4 text-sm text-texto-suave">
              Nada por enquanto.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {lista.itens.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(item)}
                    className="flex w-full gap-2 border-b border-borda px-3 py-2 text-left last:border-0 hover:bg-fundo"
                  >
                    <span
                      className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${item.lida ? 'bg-transparent' : 'bg-primaria'}`}
                      aria-hidden="true"
                    />
                    <span className="flex flex-col">
                      <span
                        className={`text-sm ${item.lida ? 'text-texto-suave' : 'font-medium text-texto'}`}
                      >
                        {item.mensagem}
                      </span>
                      <span className="text-xs text-texto-suave">
                        {haQuantoTempo(item.criadoEm)}
                        {item.lida ? '' : ' · não lida'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
