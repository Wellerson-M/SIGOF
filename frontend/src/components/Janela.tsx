'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Janela por cima da tela (formulários curtos, confirmações). Fecha pela
 * tecla Esc, que funciona também para quem usa só o teclado.
 */
export function Janela({
  titulo,
  aoFechar,
  children,
  largura = 'max-w-md',
}: Readonly<{
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  largura?: string;
}>) {
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-6">
      <dialog
        open
        aria-modal="true"
        aria-labelledby="titulo-da-janela"
        className={`static m-0 w-full ${largura} rounded-lg border border-borda bg-superficie p-5 text-texto shadow-lg`}
      >
        <h2
          id="titulo-da-janela"
          className="mb-3 text-base font-semibold text-texto"
        >
          {titulo}
        </h2>
        {children}
      </dialog>
    </div>
  );
}

/** Classes de campo e botão usadas nos formulários. */
export const CAMPO =
  'h-9 rounded-md border border-borda bg-fundo px-3 text-sm text-texto';
export const ROTULO = 'flex flex-col gap-1.5 text-sm font-medium text-texto';
export const BOTAO_PRIMARIO =
  'h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria disabled:opacity-50';
export const BOTAO_SECUNDARIO =
  'h-9 rounded-md border border-borda px-4 text-sm text-texto hover:bg-fundo disabled:opacity-50';

export function Alerta({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p
      role="alert"
      className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
    >
      {children}
    </p>
  );
}

/** Confirmação curta, como "Salvo". */
export function Aviso({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p
      role="status"
      className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok"
    >
      {children}
    </p>
  );
}
