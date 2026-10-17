'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CampoDoQual, temQual } from './CampoDoQual';
import { cadastros, type CausaDeErro } from '@/lib/cadastros';
import type { CausaRegistrada, Classificacao } from '@/lib/solicitacoes';

const CAMPO =
  'h-9 rounded-md border border-borda bg-fundo px-2 text-sm text-texto';

/**
 * De quem foi o erro, no detalhe (só a equipe vê). Quem resolveu sem
 * informar, ou o supervisor que quer corrigir, registra por aqui.
 */
export function CausaDoErro({
  causa,
  podeAlterar,
  aoSalvar,
}: {
  causa: CausaRegistrada | null;
  podeAlterar: boolean;
  aoSalvar: (classificacao: Classificacao) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [causas, setCausas] = useState<CausaDeErro[]>([]);
  const [causaId, setCausaId] = useState(causa?.id ?? '');
  const [detalhe, setDetalhe] = useState(causa?.detalhe ?? '');
  const [comentario, setComentario] = useState(causa?.comentario ?? '');

  useEffect(() => {
    if (!editando) return;
    let cancelado = false;
    cadastros.causas().then(
      (lista) => {
        if (!cancelado) setCausas(lista);
      },
      () => undefined,
    );
    return () => {
      cancelado = true;
    };
  }, [editando]);

  const escolhida = causas.find((c) => c.id === causaId);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!escolhida) return;
    const ok = await aoSalvar({
      causaId: escolhida.id,
      ...(detalhe ? { detalhe } : {}),
      ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
    });
    if (ok) setEditando(false);
  }

  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
        De quem foi o erro
      </h2>
      <p className="mb-3 text-xs text-texto-suave">
        Controle interno: o solicitante não vê.
      </p>

      {editando ? (
        <form onSubmit={salvar} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm text-texto">
            Causa
            <select
              value={causaId}
              onChange={(evento) => {
                setCausaId(evento.target.value);
                setDetalhe('');
              }}
              className={CAMPO}
            >
              <option value="">Escolha</option>
              {causas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          {temQual(escolhida) && (
            <CampoDoQual
              causa={escolhida!}
              valor={detalhe}
              aoMudar={setDetalhe}
              className={CAMPO}
            />
          )}
          <label className="flex flex-col gap-1 text-sm text-texto">
            Comentário
            <input
              value={comentario}
              onChange={(evento) => setComentario(evento.target.value)}
              maxLength={1000}
              className={CAMPO}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!escolhida}
              className="h-8 rounded-md bg-primaria px-3 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="h-8 rounded-md border border-borda px-3 text-sm text-texto"
            >
              Desistir
            </button>
          </div>
        </form>
      ) : (
        <>
          {causa ? (
            <dl className="flex flex-col gap-1 text-sm">
              <dd className="font-medium text-texto">
                {causa.nome}
                {causa.detalhe && ` — ${causa.detalhe}`}
              </dd>
              {causa.comentario && (
                <dd className="text-texto-suave">{causa.comentario}</dd>
              )}
            </dl>
          ) : (
            <p className="text-sm text-texto-suave">Não informado.</p>
          )}
          {podeAlterar && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="mt-3 h-8 rounded-md border border-borda px-3 text-sm text-texto"
            >
              {causa ? 'Corrigir' : 'Informar'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
