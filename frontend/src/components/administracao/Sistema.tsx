'use client';

import { useVersaoNoAr } from '@/components/VersaoDoSistema';

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Ambiente e versão no ar, para conferir o que foi entregue. */
export function Sistema() {
  const versao = useVersaoNoAr();
  if (!versao) {
    return <p className="text-sm text-texto-suave">Carregando…</p>;
  }
  const { dados, descrita } = versao;

  return (
    <dl className="grid max-w-lg grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-md border border-borda bg-superficie p-4 text-sm">
      <dt className="text-texto-suave">Ambiente</dt>
      <dd className="text-texto">{descrita.ambiente}</dd>
      <dt className="text-texto-suave">Versão</dt>
      <dd className="text-texto">
        {descrita.link ? (
          <a
            href={descrita.link}
            target="_blank"
            rel="noreferrer"
            className="text-primaria underline-offset-2 hover:underline"
          >
            {descrita.rotulo}
          </a>
        ) : (
          descrita.rotulo
        )}
      </dd>
      {dados.construidoEm && (
        <>
          <dt className="text-texto-suave">Publicada em</dt>
          <dd className="text-texto">{formatarData(dados.construidoEm)}</dd>
        </>
      )}
    </dl>
  );
}
