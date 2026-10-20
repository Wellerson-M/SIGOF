'use client';

import type { ConfiguracaoDoTipo } from '@/lib/configuracao';

/**
 * Aviso antes de abrir sem a filial (quando a empresa deixou a filial
 * opcional): sem ela, o alerta de duplicidade não separa CTe de mesmo
 * número de filiais diferentes. A pessoa escolhe a filial ou segue.
 */
export function AvisoSemFilial({
  acao,
  enviando,
  aoConfirmar,
  aoVoltar,
}: Readonly<{
  acao: string;
  enviando: boolean;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}>) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-atencao/50 bg-atencao/10 p-4"
    >
      <p className="text-sm font-semibold text-texto">
        Você não escolheu a filial.
      </p>
      <p className="text-sm text-texto-suave">
        Sem ela, o alerta de duplicidade compara o documento com o de todas as
        filiais. Se souber de qual filial é, escolha antes de continuar.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={aoVoltar}
          className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria"
        >
          Escolher a filial
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={aoConfirmar}
          className="h-9 rounded-md border border-borda px-4 text-sm text-texto disabled:opacity-50"
        >
          {acao}
        </button>
      </div>
    </div>
  );
}

/** A dica abaixo dos campos de documento, conforme o que o tipo pede. */
export function textoDosDocumentos(config: ConfiguracaoDoTipo): string {
  const nomes = (
    [
      ['cte', 'o CTe'],
      ['nf', 'a NF'],
      ['fatura', 'a fatura'],
    ] as const
  )
    .filter(([campo]) => config.campos[campo].modo !== 'OCULTO')
    .map(([, nome]) => nome);
  if (nomes.length === 0) return '';
  const lista =
    nomes.length > 1
      ? `${nomes.slice(0, -1).join(', ')} ou ${nomes.at(-1)}`
      : nomes[0];
  const comoFatura =
    config.campos.cte.modo !== 'OCULTO'
      ? ' Fatura inteira? Cole os CTe, um por linha.'
      : '';
  return config.exigirDocumento
    ? `Informe ${lista}.${comoFatura}`
    : `Se tiver, informe ${lista}.${comoFatura}`;
}
