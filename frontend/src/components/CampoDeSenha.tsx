'use client';

import { useState, type InputHTMLAttributes } from 'react';

/**
 * Campo de senha com o botão de olho para conferir o que foi digitado.
 * Começa sempre escondida; o botão não tem texto visível, então o rótulo
 * do campo continua sendo só o da senha.
 */
export function CampoDeSenha({
  className = '',
  ...propriedades
}: Readonly<Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>) {
  const [visivel, setVisivel] = useState(false);

  return (
    <span className="relative flex">
      <input
        {...propriedades}
        type={visivel ? 'text' : 'password'}
        className={`${className} w-full pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisivel((atual) => !atual)}
        aria-label={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
        aria-pressed={visivel}
        title={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-foco"
      >
        <Olho riscado={visivel} />
      </button>
    </span>
  );
}

function Olho({ riscado }: Readonly<{ riscado: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {riscado && <path d="M4 4l16 16" />}
    </svg>
  );
}
