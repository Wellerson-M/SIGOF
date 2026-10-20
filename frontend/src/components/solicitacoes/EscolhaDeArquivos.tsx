'use client';

import { useRef, type ReactNode } from 'react';
import { ANEXO, tamanhoLegivel } from '@/lib/solicitacoes';

/** O mesmo arquivo escolhido duas vezes conta uma só. */
function chave(arquivo: File): string {
  return `${arquivo.name}:${arquivo.size}:${arquivo.lastModified}`;
}

/**
 * Escolha de arquivos que **soma**: cada vez que a pessoa escolhe, os novos
 * entram na lista junto com os que já estavam (o campo de arquivo comum do
 * navegador troca tudo pelo que foi escolhido por último). Cada um pode
 * ser tirado da lista antes de enviar.
 */
export function EscolhaDeArquivos({
  rotulo,
  arquivos,
  aoMudar,
  rotuloDoCampo,
  dica,
  tamanho = 'normal',
}: Readonly<{
  rotulo: ReactNode;
  arquivos: File[];
  aoMudar: (arquivos: File[]) => void;
  /** Nome do campo para leitor de tela, quando o rótulo visível não serve. */
  rotuloDoCampo?: string;
  dica?: ReactNode;
  tamanho?: 'normal' | 'compacto';
}>) {
  const campo = useRef<HTMLInputElement>(null);
  const altura = tamanho === 'compacto' ? 'h-8' : 'h-9';

  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium text-texto">
      <label className="flex flex-col gap-1.5">
        {rotulo}
        <input
          ref={campo}
          type="file"
          multiple
          tabIndex={-1}
          accept={ANEXO.aceitos}
          aria-label={rotuloDoCampo}
          onChange={(evento) => {
            const novos = [...(evento.target.files ?? [])];
            // Limpa o campo: escolher o mesmo arquivo de novo dispara de novo
            evento.target.value = '';
            const jaTem = new Set(arquivos.map(chave));
            aoMudar([
              ...arquivos,
              ...novos.filter((a) => !jaTem.has(chave(a))),
            ]);
          }}
          className="sr-only"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => campo.current?.click()}
          className={`${altura} rounded-md border border-borda bg-superficie px-3 text-sm font-normal text-texto hover:bg-fundo`}
        >
          {arquivos.length === 0 ? 'Escolher arquivos' : 'Adicionar mais'}
        </button>
        {arquivos.length > 0 && (
          <span className="text-xs font-normal text-texto-suave">
            {arquivos.length} {arquivos.length === 1 ? 'arquivo' : 'arquivos'}
          </span>
        )}
      </div>
      {arquivos.length > 0 && (
        <ul className="flex flex-col divide-y divide-borda rounded-md border border-borda bg-superficie">
          {arquivos.map((arquivo, indice) => (
            <li
              key={chave(arquivo)}
              className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm font-normal"
            >
              <span className="min-w-0 truncate">
                📎 {arquivo.name}{' '}
                <span className="text-xs text-texto-suave">
                  · {tamanhoLegivel(arquivo.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => aoMudar(arquivos.filter((_, i) => i !== indice))}
                aria-label={`Tirar ${arquivo.name}`}
                className="shrink-0 text-xs text-critico underline"
              >
                Tirar
              </button>
            </li>
          ))}
        </ul>
      )}
      {dica && (
        <span className="text-xs font-normal text-texto-suave">{dica}</span>
      )}
    </div>
  );
}
