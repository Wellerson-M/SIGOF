'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alerta,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import { cadastros, type Filial } from '@/lib/cadastros';
import { mensagemDoErro } from '@/lib/solicitacoes';

/**
 * Filiais da empresa. Com pelo menos uma ativa, quem abre solicitação com
 * CTe ou NF escolhe a filial, e a duplicidade passa a comparar documento +
 * filial (duas filiais podem ter CTe com o mesmo número).
 */
export function Filiais() {
  const [filiais, setFiliais] = useState<Filial[] | null>(null);
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(
    () =>
      cadastros.filiais(true).then(setFiliais, (falha: unknown) => {
        setErro(mensagemDoErro(falha));
      }),
    [],
  );

  useEffect(() => {
    let cancelado = false;
    cadastros.filiais(true).then(
      (lista) => {
        if (!cancelado) setFiliais(lista);
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  async function executar(trabalho: () => Promise<unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      await trabalho();
      await carregar();
      return true;
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    if (!nova.trim()) return;
    if (await executar(() => cadastros.criarFilial(nova))) setNova('');
  }

  async function salvarNome(evento: FormEvent) {
    evento.preventDefault();
    if (!editando) return;
    const { id, nome } = editando;
    if (await executar(() => cadastros.alterarFilial(id, { nome }))) {
      setEditando(null);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-texto-suave">
        Cadastre as filiais que emitem CTe. Com filiais cadastradas, o
        formulário de abertura pede a filial (obrigatória ou opcional, como
        estiver na aba Formulário), e o alerta de duplicidade só compara
        documentos da mesma filial. Sem filiais, nada muda.
      </p>

      <form onSubmit={criar} className="flex flex-wrap items-end gap-2">
        <label className={`${ROTULO} min-w-56 flex-1`}>
          Nova filial
          <input
            value={nova}
            onChange={(evento) => setNova(evento.target.value)}
            maxLength={80}
            placeholder="Ex.: Curitiba"
            className={CAMPO}
          />
        </label>
        <button
          type="submit"
          disabled={ocupado || !nova.trim()}
          className={BOTAO_PRIMARIO}
        >
          Adicionar
        </button>
      </form>

      {erro && <Alerta>{erro}</Alerta>}

      {filiais === null ? (
        <p className="text-sm text-texto-suave">Carregando…</p>
      ) : filiais.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma filial cadastrada.</p>
      ) : (
        <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie">
          {filiais.map((filial) => (
            <li
              key={filial.id}
              className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
            >
              {editando?.id === filial.id ? (
                <form
                  onSubmit={salvarNome}
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  <input
                    value={editando.nome}
                    onChange={(evento) =>
                      setEditando({ id: filial.id, nome: evento.target.value })
                    }
                    maxLength={80}
                    aria-label="Nome da filial"
                    className={`${CAMPO} flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={ocupado}
                    className={BOTAO_PRIMARIO}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className={BOTAO_SECUNDARIO}
                  >
                    Desistir
                  </button>
                </form>
              ) : (
                <>
                  <span
                    className={`flex-1 ${filial.ativa ? 'text-texto' : 'text-texto-suave line-through'}`}
                  >
                    {filial.nome}
                  </span>
                  {!filial.ativa && (
                    <span className="text-xs text-texto-suave">desativada</span>
                  )}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      setEditando({ id: filial.id, nome: filial.nome })
                    }
                    className={BOTAO_SECUNDARIO}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      void executar(() =>
                        cadastros.alterarFilial(filial.id, {
                          ativa: !filial.ativa,
                        }),
                      )
                    }
                    className={BOTAO_SECUNDARIO}
                  >
                    {filial.ativa ? 'Desativar' : 'Reativar'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
