'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Alerta,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import {
  NOME_DE_QUEM_MARCA,
  cadastros,
  type DadosDaVerificacao,
  type ItemDeVerificacao,
  type QuemMarca,
  type TipoDeOcorrencia,
} from '@/lib/cadastros';
import { nomeDoTipo, tiposDaEmpresa } from '@/lib/configuracao';
import { useSessao } from '@/lib/sessao';
import { mensagemDoErro } from '@/lib/solicitacoes';

interface Formulario {
  texto: string;
  tipos: TipoDeOcorrencia[];
  quemMarca: QuemMarca;
  obrigatorioParaResolver: boolean;
}

const VAZIO: Formulario = {
  texto: '',
  tipos: [],
  quemMarca: 'QUALQUER',
  obrigatorioParaResolver: false,
};

/**
 * Itens que a empresa pede para marcar nas solicitações (ex.: "Desacordo
 * fiscal do CTe realizado"). Cada empresa decide o texto, em que tipos
 * aparece, quem marca e se é obrigatório para resolver.
 */
export function Verificacoes() {
  const { usuario } = useSessao();
  const [itens, setItens] = useState<ItemDeVerificacao[] | null>(null);
  const [novo, setNovo] = useState<Formulario>(VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    cadastros.verificacoes(true).then(
      (lista) => {
        if (!cancelado) setItens(lista);
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
      setItens(await cadastros.verificacoes(true));
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
    if (!novo.texto.trim()) return;
    if (await executar(() => cadastros.criarVerificacao(novo))) setNovo(VAZIO);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-texto-suave">
        Itens para marcar na solicitação, como “Desacordo fiscal do CTe
        realizado”. Quem abre vê os itens dele já no formulário; a equipe marca
        os dela no detalhe. Os obrigatórios impedem resolver sem marcar. Tudo
        fica no histórico.
      </p>

      <form
        onSubmit={criar}
        className="flex flex-col gap-3 rounded-md border border-borda bg-superficie p-4"
      >
        <CamposDoItem valor={novo} aoMudar={setNovo} />
        <div>
          <button
            type="submit"
            disabled={ocupado || !novo.texto.trim()}
            className={BOTAO_PRIMARIO}
          >
            Adicionar item
          </button>
        </div>
      </form>

      {erro && <Alerta>{erro}</Alerta>}

      {itens === null ? (
        <p className="text-sm text-texto-suave">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum item cadastrado.</p>
      ) : (
        <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie">
          {itens.map((item) => (
            <li key={item.id} className="px-3 py-2 text-sm">
              {editando === item.id ? (
                <EdicaoDoItem
                  item={item}
                  ocupado={ocupado}
                  aoSalvar={async (alteracao) => {
                    if (
                      await executar(() =>
                        cadastros.alterarVerificacao(item.id, alteracao),
                      )
                    ) {
                      setEditando(null);
                    }
                  }}
                  aoDesistir={() => setEditando(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        item.ativo
                          ? 'font-medium text-texto'
                          : 'text-texto-suave line-through'
                      }
                    >
                      {item.texto}
                    </p>
                    <p className="text-xs text-texto-suave">
                      {item.tipos.length === 0
                        ? 'Todos os tipos'
                        : item.tipos
                            .map((t) => nomeDoTipo(usuario, t))
                            .join(', ')}{' '}
                      · marca: {NOME_DE_QUEM_MARCA[item.quemMarca]}
                      {item.obrigatorioParaResolver &&
                        ' · obrigatório para resolver'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => setEditando(item.id)}
                    className={BOTAO_SECUNDARIO}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      void executar(() =>
                        cadastros.alterarVerificacao(item.id, {
                          ativo: !item.ativo,
                        }),
                      )
                    }
                    className={BOTAO_SECUNDARIO}
                  >
                    {item.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CamposDoItem({
  valor,
  aoMudar,
}: {
  valor: Formulario;
  aoMudar: (valor: Formulario) => void;
}) {
  const { usuario } = useSessao();
  return (
    <>
      <label className={ROTULO}>
        O que marcar
        <input
          value={valor.texto}
          onChange={(e) => aoMudar({ ...valor, texto: e.target.value })}
          maxLength={200}
          placeholder="Ex.: Desacordo fiscal do CTe realizado"
          className={CAMPO}
        />
      </label>
      <fieldset className="flex flex-wrap gap-3 text-sm text-texto">
        <legend className="mb-1 text-sm font-medium">
          Em quais tipos (nenhum marcado = em todos)
        </legend>
        {tiposDaEmpresa(usuario).map(({ tipo, nome }) => (
          <label key={tipo} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={valor.tipos.includes(tipo)}
              onChange={(e) =>
                aoMudar({
                  ...valor,
                  tipos: e.target.checked
                    ? [...valor.tipos, tipo]
                    : valor.tipos.filter((t) => t !== tipo),
                })
              }
            />
            {nome}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-4">
        <label className={ROTULO}>
          Quem marca
          <select
            value={valor.quemMarca}
            onChange={(e) =>
              aoMudar({ ...valor, quemMarca: e.target.value as QuemMarca })
            }
            className={CAMPO}
          >
            {(Object.keys(NOME_DE_QUEM_MARCA) as QuemMarca[]).map((q) => (
              <option key={q} value={q}>
                {NOME_DE_QUEM_MARCA[q]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={valor.obrigatorioParaResolver}
            onChange={(e) =>
              aoMudar({ ...valor, obrigatorioParaResolver: e.target.checked })
            }
          />
          Obrigatório para resolver
        </label>
      </div>
    </>
  );
}

function EdicaoDoItem({
  item,
  ocupado,
  aoSalvar,
  aoDesistir,
}: {
  item: ItemDeVerificacao;
  ocupado: boolean;
  aoSalvar: (alteracao: DadosDaVerificacao) => Promise<void>;
  aoDesistir: () => void;
}) {
  const [valor, setValor] = useState<Formulario>({
    texto: item.texto,
    tipos: item.tipos,
    quemMarca: item.quemMarca,
    obrigatorioParaResolver: item.obrigatorioParaResolver,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void aoSalvar(valor);
      }}
      className="flex flex-col gap-3 py-1"
    >
      <CamposDoItem valor={valor} aoMudar={setValor} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={ocupado || !valor.texto.trim()}
          className={BOTAO_PRIMARIO}
        >
          Salvar
        </button>
        <button type="button" onClick={aoDesistir} className={BOTAO_SECUNDARIO}>
          Desistir
        </button>
      </div>
    </form>
  );
}
