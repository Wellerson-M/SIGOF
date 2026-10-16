'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cadastros, type CausaDeErro } from '@/lib/cadastros';
import { ANEXO, type Classificacao } from '@/lib/solicitacoes';

/** O que vai junto com a resolução, além da ação tomada. */
export interface ExtrasDaResolucao {
  classificacao?: Classificacao;
  /** Arquivos para anexar antes de resolver (ex.: o CTe corrigido). */
  arquivos: File[];
}

const CAMPO =
  'h-9 rounded-md border border-borda bg-fundo px-2 text-sm text-texto';

/**
 * Janela que pede o motivo antes de um movimento que exige observação
 * (resolver, escalar, aguardar documento, cancelar).
 *
 * Ao resolver, também pede de quem foi o erro (lista que cada empresa
 * monta na Administração) e deixa anexar o documento final. A causa é
 * controle interno: não vai para a conversa nem para o e-mail.
 */
export function DialogoDeObservacao({
  titulo,
  pergunta,
  resolucao = false,
  exigirCausa = false,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  pergunta: string;
  /** Mostra a causa do erro e os anexos (movimento para Resolvido). */
  resolucao?: boolean;
  exigirCausa?: boolean;
  aoConfirmar: (observacao: string, extras: ExtrasDaResolucao) => void;
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [causas, setCausas] = useState<CausaDeErro[]>([]);
  const [causaId, setCausaId] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [comentario, setComentario] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    campo.current?.focus();
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  useEffect(() => {
    if (!resolucao) return;
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
  }, [resolucao]);

  const causa = causas.find((c) => c.id === causaId);
  const faltaCausa = resolucao && exigirCausa && causas.length > 0 && !causa;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!texto.trim() || faltaCausa) return;
    aoConfirmar(texto.trim(), {
      arquivos: arquivos.slice(0, ANEXO.porSolicitacao),
      ...(causa
        ? {
            classificacao: {
              causaId: causa.id,
              ...(detalhe ? { detalhe } : {}),
              ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
            },
          }
        : {}),
    });
  }

  return (
    // Fecha pelo botão Voltar ou pela tecla Esc (que funciona também
    // para quem usa só o teclado)
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <dialog
        open
        aria-modal="true"
        aria-labelledby="titulo-do-dialogo"
        className="static m-0 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-borda bg-superficie p-5 text-texto shadow-lg"
      >
        <form onSubmit={enviar} className="flex flex-col gap-3">
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

          {resolucao && causas.length > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-md border border-borda p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                Controle interno
              </legend>
              <label className="flex flex-col gap-1 text-sm text-texto">
                De quem foi o erro
                <select
                  value={causaId}
                  onChange={(evento) => {
                    setCausaId(evento.target.value);
                    setDetalhe('');
                  }}
                  required={exigirCausa}
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
              {causa && causa.opcoes.length > 0 && (
                <label className="flex flex-col gap-1 text-sm text-texto">
                  {causa.rotuloDasOpcoes ?? 'Qual'}
                  <select
                    value={detalhe}
                    onChange={(evento) => setDetalhe(evento.target.value)}
                    className={CAMPO}
                  >
                    <option value="">Escolha</option>
                    {causa.opcoes.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {causa && (
                <label className="flex flex-col gap-1 text-sm text-texto">
                  Comentário
                  <input
                    value={comentario}
                    onChange={(evento) => setComentario(evento.target.value)}
                    maxLength={1000}
                    className={CAMPO}
                  />
                </label>
              )}
              <p className="text-xs text-texto-suave">
                Não aparece para o solicitante nem vai no e-mail.
              </p>
            </fieldset>
          )}

          {resolucao && (
            <label className="flex flex-col gap-1.5 text-sm text-texto">
              Anexar documento
              <input
                type="file"
                multiple
                accept={ANEXO.aceitos}
                onChange={(evento) =>
                  setArquivos([...(evento.target.files ?? [])])
                }
                className="text-sm text-texto file:mr-3 file:h-8 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:text-sm file:text-texto"
              />
            </label>
          )}

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
              disabled={!texto.trim() || faltaCausa}
              className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
