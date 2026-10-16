'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Alerta,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import { cadastros, type CausaDeErro } from '@/lib/cadastros';
import { mensagemDoErro } from '@/lib/solicitacoes';

/** Uma opção por linha na tela; lista no banco. */
const paraTexto = (opcoes: string[]) => opcoes.join('\n');
const paraLista = (texto: string) =>
  texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);

/**
 * Causas de erro da empresa: o que aparece em "De quem foi o erro" ao
 * resolver. Cada causa pode ter um "qual" com opções (ex.: os digitadores
 * em "Erro de digitação"). Serve de controle interno e alimenta os
 * indicadores; o solicitante não vê.
 */
export function Causas() {
  const [causas, setCausas] = useState<CausaDeErro[] | null>(null);
  const [nova, setNova] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    cadastros.causas(true).then(
      (lista) => {
        if (!cancelado) setCausas(lista);
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
      setCausas(await cadastros.causas(true));
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
    if (await executar(() => cadastros.criarCausa({ nome: nova }))) {
      setNova('');
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-texto-suave">
        Aparecem em “De quem foi o erro” ao resolver uma solicitação. Use as
        opções para o “qual” (por exemplo, os digitadores em “Erro de
        digitação”), uma por linha. É controle interno: o solicitante não vê e
        nada disso vai no e-mail. Para tornar obrigatório, use a aba Empresa e
        expediente.
      </p>

      <form onSubmit={criar} className="flex flex-wrap items-end gap-2">
        <label className={`${ROTULO} min-w-56 flex-1`}>
          Nova causa
          <input
            value={nova}
            onChange={(evento) => setNova(evento.target.value)}
            maxLength={80}
            placeholder="Ex.: Erro de cadastro"
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

      {causas === null ? (
        <p className="text-sm text-texto-suave">Carregando…</p>
      ) : (
        <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie">
          {causas.map((causa) => (
            <li key={causa.id} className="px-3 py-2 text-sm">
              {aberta === causa.id ? (
                <EdicaoDaCausa
                  causa={causa}
                  ocupado={ocupado}
                  aoSalvar={async (alteracao) => {
                    if (
                      await executar(() =>
                        cadastros.alterarCausa(causa.id, alteracao),
                      )
                    ) {
                      setAberta(null);
                    }
                  }}
                  aoDesistir={() => setAberta(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        causa.ativa
                          ? 'font-medium text-texto'
                          : 'text-texto-suave line-through'
                      }
                    >
                      {causa.nome}
                    </p>
                    {causa.opcoes.length > 0 && (
                      <p className="truncate text-xs text-texto-suave">
                        {causa.rotuloDasOpcoes ?? 'Opções'}:{' '}
                        {causa.opcoes.join(', ')}
                      </p>
                    )}
                  </div>
                  {!causa.ativa && (
                    <span className="text-xs text-texto-suave">desativada</span>
                  )}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => setAberta(causa.id)}
                    className={BOTAO_SECUNDARIO}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      void executar(() =>
                        cadastros.alterarCausa(causa.id, {
                          ativa: !causa.ativa,
                        }),
                      )
                    }
                    className={BOTAO_SECUNDARIO}
                  >
                    {causa.ativa ? 'Desativar' : 'Reativar'}
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

function EdicaoDaCausa({
  causa,
  ocupado,
  aoSalvar,
  aoDesistir,
}: {
  causa: CausaDeErro;
  ocupado: boolean;
  aoSalvar: (alteracao: {
    nome: string;
    rotuloDasOpcoes: string | null;
    opcoes: string[];
  }) => Promise<void>;
  aoDesistir: () => void;
}) {
  const [nome, setNome] = useState(causa.nome);
  const [rotulo, setRotulo] = useState(causa.rotuloDasOpcoes ?? '');
  const [opcoes, setOpcoes] = useState(paraTexto(causa.opcoes));

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    void aoSalvar({
      nome,
      rotuloDasOpcoes: rotulo.trim() || null,
      opcoes: paraLista(opcoes),
    });
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 py-1 sm:grid-cols-2">
      <label className={ROTULO}>
        Nome
        <input
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          maxLength={80}
          className={CAMPO}
        />
      </label>
      <label className={ROTULO}>
        Nome do “qual”
        <input
          value={rotulo}
          onChange={(evento) => setRotulo(evento.target.value)}
          maxLength={40}
          placeholder="Ex.: Digitador"
          className={CAMPO}
        />
      </label>
      <label className={`${ROTULO} sm:col-span-2`}>
        Opções do “qual” (uma por linha)
        <textarea
          value={opcoes}
          onChange={(evento) => setOpcoes(evento.target.value)}
          rows={4}
          className="rounded-md border border-borda bg-superficie px-3 py-2 text-sm text-texto"
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={ocupado || !nome.trim()}
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
