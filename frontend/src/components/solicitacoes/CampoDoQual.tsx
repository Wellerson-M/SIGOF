'use client';

import { useId } from 'react';
import type { CausaDeErro } from '@/lib/cadastros';

/** A causa pede um "qual" (ex.: o digitador)? */
export function temQual(causa: CausaDeErro | undefined): boolean {
  return Boolean(causa && (causa.rotuloDasOpcoes || causa.opcoes.length > 0));
}

/**
 * O "qual" da causa (ex.: o digitador): um campo de busca que sugere os
 * já cadastrados e aceita um nome novo. O nome novo entra na lista da
 * empresa quando a solicitação é salva, sem precisar passar pela
 * Administração antes.
 */
export function CampoDoQual({
  causa,
  valor,
  aoMudar,
  className,
  classeDoRotulo = 'flex flex-col gap-1 text-sm text-texto',
}: {
  causa: CausaDeErro;
  valor: string;
  aoMudar: (valor: string) => void;
  className: string;
  classeDoRotulo?: string;
}) {
  const lista = useId();
  const digitado = valor.trim().toLocaleLowerCase('pt-BR');
  const novo =
    digitado !== '' &&
    !causa.opcoes.some((o) => o.toLocaleLowerCase('pt-BR') === digitado);

  return (
    <label className={classeDoRotulo}>
      {causa.rotuloDasOpcoes ?? 'Qual'}
      <input
        list={lista}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        maxLength={80}
        autoComplete="off"
        placeholder="Procure ou digite um nome novo"
        className={className}
      />
      <datalist id={lista}>
        {causa.opcoes.map((opcao) => (
          <option key={opcao} value={opcao} />
        ))}
      </datalist>
      {novo && (
        <span className="text-xs font-normal text-texto-suave">
          Novo: “{valor.trim()}” será cadastrado ao salvar.
        </span>
      )}
    </label>
  );
}
