'use client';

import { useEffect, useState } from 'react';
import {
  cadastros,
  marcaNaAbertura,
  type ItemDeVerificacao,
  type TipoDeOcorrencia,
} from '@/lib/cadastros';
import type { Perfil } from '@/lib/api';
import {
  dataCurta,
  mensagemDoErro,
  type VerificacaoDaSolicitacao,
} from '@/lib/solicitacoes';

/** Os itens que este perfil marca ao abrir uma solicitação deste tipo. */
export function useItensDaAbertura(
  tipo: TipoDeOcorrencia,
  perfil: Perfil,
): ItemDeVerificacao[] {
  const [itens, setItens] = useState<ItemDeVerificacao[]>([]);
  useEffect(() => {
    let cancelado = false;
    cadastros.verificacoes().then(
      (lista) => {
        if (!cancelado) setItens(lista);
      },
      () => undefined,
    );
    return () => {
      cancelado = true;
    };
  }, []);
  return itens.filter((item) => marcaNaAbertura(item, tipo, perfil));
}

/** Caixas para marcar já no formulário de abertura. */
export function MarcacoesDaAbertura({
  itens,
  marcados,
  aoMudar,
}: {
  itens: ItemDeVerificacao[];
  marcados: string[];
  aoMudar: (marcados: string[]) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-borda p-3">
      <legend className="px-1 text-sm font-medium text-texto">
        Já foi feito?
      </legend>
      {itens.map((item) => (
        <label
          key={item.id}
          className="flex items-center gap-2 text-sm text-texto"
        >
          <input
            type="checkbox"
            checked={marcados.includes(item.id)}
            onChange={(e) =>
              aoMudar(
                e.target.checked
                  ? [...marcados, item.id]
                  : marcados.filter((id) => id !== item.id),
              )
            }
          />
          {item.texto}
        </label>
      ))}
    </fieldset>
  );
}

/** As verificações no detalhe: marcar, desmarcar e quem marcou. */
export function VerificacoesDaSolicitacao({
  verificacoes,
  aoMarcar,
}: {
  verificacoes: VerificacaoDaSolicitacao[];
  aoMarcar: (
    itemId: string,
    marcada: boolean,
  ) => Promise<VerificacaoDaSolicitacao[]>;
}) {
  const [itens, setItens] = useState(verificacoes);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (itens.length === 0) return null;

  async function alternar(item: VerificacaoDaSolicitacao) {
    setErro(null);
    setOcupado(item.itemId);
    const antes = itens;
    // Muda na hora; se o servidor recusar, volta
    setItens(
      itens.map((i) =>
        i.itemId === item.itemId ? { ...i, marcada: !i.marcada } : i,
      ),
    );
    try {
      setItens(await aoMarcar(item.itemId, !item.marcada));
    } catch (falha) {
      setItens(antes);
      setErro(mensagemDoErro(falha));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
        Verificações
      </h2>
      <ul className="flex flex-col gap-2">
        {itens.map((item) => (
          <li key={item.itemId} className="text-sm">
            <label className="flex items-start gap-2 text-texto">
              <input
                type="checkbox"
                checked={item.marcada}
                disabled={!item.podeMarcar || ocupado !== null}
                onChange={() => void alternar(item)}
                className="mt-0.5"
              />
              <span>
                {item.texto}
                {item.obrigatorioParaResolver && !item.marcada && (
                  <span className="ml-1 text-xs text-atencao">
                    (necessário para resolver)
                  </span>
                )}
                {item.marcada && item.marcadaPor && item.marcadaEm && (
                  <span className="block text-xs text-texto-suave">
                    {item.marcadaPor.nome} · {dataCurta(item.marcadaEm)}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-critico">
          {erro}
        </p>
      )}
    </section>
  );
}
