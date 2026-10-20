'use client';

import { useEffect, useState } from 'react';
import { Alerta, Aviso, BOTAO_PRIMARIO } from '@/components/Janela';
import {
  MODULOS,
  configuracao,
  type Modulo,
  type ModulosDaEmpresa,
} from '@/lib/configuracao';
import { useSessao } from '@/lib/sessao';
import { mensagemDoErro } from '@/lib/solicitacoes';

/**
 * Módulos da empresa: o administrador liga os que quer usar, dentre os
 * que a plataforma liberou. Desligar não apaga nada: os cadastros e os
 * registros antigos continuam lá e voltam ao religar.
 */
export function Modulos() {
  const { atualizar } = useSessao();
  const [modulos, setModulos] = useState<ModulosDaEmpresa | null>(null);
  const [ligados, setLigados] = useState<Modulo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    configuracao.modulos().then(
      (dados) => {
        if (cancelado) return;
        setModulos(dados);
        setLigados(dados.ligados);
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const dados = await configuracao.alterarModulos(ligados);
      setModulos(dados);
      setLigados(dados.ligados);
      setSalvo(true);
      // O menu e as telas mudam conforme os módulos em uso
      await atualizar().catch(() => undefined);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  if (!modulos) {
    return erro ? (
      <Alerta>{erro}</Alerta>
    ) : (
      <p className="text-sm text-texto-suave">Carregando…</p>
    );
  }

  // Mesmos módulos, em qualquer ordem: nada a salvar
  const mudou =
    ligados.length !== modulos.ligados.length ||
    ligados.some((m) => !modulos.ligados.includes(m));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-texto-suave">
        Ligue só o que a sua equipe usa: o que estiver desligado some das telas
        e deixa de ser cobrado nas solicitações. Desligar não apaga nada; ao
        religar, os cadastros voltam como estavam.
      </p>

      <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie">
        {MODULOS.map((modulo) => {
          const liberado = modulos.liberados.includes(modulo.id);
          const ligado = ligados.includes(modulo.id);
          return (
            <li key={modulo.id} className="flex items-start gap-3 px-4 py-3">
              <input
                id={`modulo-${modulo.id}`}
                type="checkbox"
                role="switch"
                checked={liberado && ligado}
                disabled={!liberado || salvando}
                onChange={(evento) => {
                  setSalvo(false);
                  setLigados((atuais) =>
                    evento.target.checked
                      ? [...atuais, modulo.id]
                      : atuais.filter((m) => m !== modulo.id),
                  );
                }}
                className="mt-1 h-4 w-4"
              />
              <label
                htmlFor={`modulo-${modulo.id}`}
                className={`flex flex-col gap-0.5 text-sm ${
                  liberado ? 'text-texto' : 'text-texto-suave'
                }`}
              >
                <span className="font-medium">{modulo.nome}</span>
                <span className="text-texto-suave">{modulo.descricao}</span>
                {!liberado && (
                  <span className="text-xs text-atencao">
                    Não liberado para a sua empresa. Fale com o suporte do
                    SIGOF.
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {erro && <Alerta>{erro}</Alerta>}
      {salvo && <Aviso>Módulos salvos.</Aviso>}

      <div>
        <button
          type="button"
          disabled={!mudou || salvando}
          onClick={() => void salvar()}
          className={BOTAO_PRIMARIO}
        >
          {salvando ? 'Salvando…' : 'Salvar módulos'}
        </button>
      </div>
    </div>
  );
}
