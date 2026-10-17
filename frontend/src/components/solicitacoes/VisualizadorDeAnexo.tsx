'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, mensagemDoErro } from '@/lib/solicitacoes';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; endereco: string; mime: string }
  | { tipo: 'falha'; mensagem: string };

/**
 * Mostra um anexo dentro do SIGOF (é para onde aponta o link do e-mail).
 * O arquivo passa pela API, que confere se quem está logado pode vê-lo:
 * o link sozinho não dá acesso a nada.
 */
export function VisualizadorDeAnexo({
  solicitacaoId,
  anexoId,
}: {
  solicitacaoId: string;
  anexoId: string;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    let endereco: string | null = null;
    let cancelado = false;
    api.baixarAnexo(solicitacaoId, anexoId).then(
      (arquivo) => {
        if (cancelado) return;
        endereco = URL.createObjectURL(arquivo);
        setEstado({ tipo: 'pronto', endereco, mime: arquivo.type });
      },
      (falha: unknown) => {
        if (!cancelado) {
          setEstado({ tipo: 'falha', mensagem: mensagemDoErro(falha) });
        }
      },
    );
    return () => {
      cancelado = true;
      if (endereco) URL.revokeObjectURL(endereco);
    };
  }, [solicitacaoId, anexoId]);

  const voltar = (
    <Link
      href={`/solicitacoes/${solicitacaoId}`}
      className="text-sm text-primaria underline"
    >
      ← Ver a solicitação
    </Link>
  );

  if (estado.tipo === 'carregando') {
    return <p className="text-sm text-texto-suave">Carregando o arquivo…</p>;
  }
  if (estado.tipo === 'falha') {
    return (
      <div className="flex flex-col gap-3">
        {voltar}
        <p role="alert" className="text-sm text-critico">
          {estado.mensagem}
        </p>
      </div>
    );
  }

  const imagem = estado.mime.startsWith('image/');
  const pdf = estado.mime === 'application/pdf';
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {voltar}
        <a
          href={estado.endereco}
          download
          className="h-9 rounded-md border border-borda px-4 py-2 text-sm text-texto"
        >
          Baixar
        </a>
      </div>
      {imagem && (
        // eslint-disable-next-line @next/next/no-img-element -- arquivo local (blob)
        <img
          src={estado.endereco}
          alt="Anexo"
          className="max-h-full self-start rounded-md border border-borda"
        />
      )}
      {pdf && (
        <iframe
          src={estado.endereco}
          title="Anexo"
          className="w-full flex-1 rounded-md border border-borda"
        />
      )}
      {!imagem && !pdf && (
        <p className="text-sm text-texto-suave">
          Este tipo de arquivo não é mostrado na tela. Use “Baixar”.
        </p>
      )}
    </div>
  );
}
