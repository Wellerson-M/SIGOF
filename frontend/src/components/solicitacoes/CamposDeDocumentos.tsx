'use client';

import { separarDocumentos, type DadosDeAbertura } from '@/lib/solicitacoes';

/** "3 CTe": confirma quantos números o campo entendeu. */
export function Contagem({ valor, nome }: { valor: string; nome: string }) {
  const quantos = separarDocumentos(valor).length;
  if (quantos < 2) return null;
  return (
    <span className="text-xs font-normal text-texto-suave">
      {quantos} {nome}
    </span>
  );
}

/** O que os campos de documento viram no pedido à API. */
export function documentosDoFormulario(
  cte: string,
  nf: string,
  fatura: string,
): Pick<DadosDeAbertura, 'ctes' | 'nfs' | 'fatura'> {
  const ctes = separarDocumentos(cte);
  const nfs = separarDocumentos(nf);
  return {
    ...(ctes.length > 0 ? { ctes } : {}),
    ...(nfs.length > 0 ? { nfs } : {}),
    ...(fatura.trim() ? { fatura: fatura.trim() } : {}),
  };
}
