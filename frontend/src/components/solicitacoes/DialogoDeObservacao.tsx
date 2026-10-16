'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

/**
 * Janela que pede o motivo antes de um movimento que exige observação
 * (resolver, escalar, aguardar documento, cancelar).
 */
export function DialogoDeObservacao({
  titulo,
  pergunta,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  pergunta: string;
  aoConfirmar: (observacao: string) => void;
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    campo.current?.focus();
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (texto.trim()) aoConfirmar(texto.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={aoFechar}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-do-dialogo"
        onSubmit={enviar}
        onClick={(evento) => evento.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-borda bg-superficie p-5 shadow-lg"
      >
        <h2
          id="titulo-do-dialogo"
          className="text-base font-semibold text-texto"
        >
          {titulo}
        </h2>
        <label className="flex flex-col gap-1.5 text-sm text-texto">
          {pergunta}
          <textarea
            ref={campo}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={4}
            maxLength={2000}
            required
            className="rounded-md border border-borda bg-fundo px-3 py-2 text-sm text-texto"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="h-9 rounded-md border border-borda px-4 text-sm text-texto hover:bg-fundo"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={!texto.trim()}
            className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </form>
    </div>
  );
}
