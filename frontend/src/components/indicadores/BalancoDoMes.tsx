'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Alerta, BOTAO_SECUNDARIO, CAMPO } from '@/components/Janela';
import {
  indicadores,
  lerPlanilhaDeProducao,
  type Balanco,
} from '@/lib/indicadores';
import { mensagemDoErro } from '@/lib/solicitacoes';

/** "2026-10" do mês corrente, no relógio de quem está usando. */
function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Balanço do mês por digitador: CTe emitidos (vindos de planilha) contra os
 * erros registrados ao resolver ("De quem foi o erro" → o digitador). A
 * taxa é por 100 CTe, para comparar quem emite muito com quem emite pouco.
 */
export function BalancoDoMes() {
  const [mes, setMes] = useState(mesAtual);
  const [dados, setDados] = useState<Balanco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    indicadores.balanco(mes).then(
      (resposta) => {
        if (!cancelado) {
          setDados(resposta);
          setErro(null);
        }
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, [mes, versao]);

  async function importar(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0];
    evento.target.value = '';
    if (!escolhido) return;
    setErro(null);
    setAviso(null);
    try {
      const linhas = lerPlanilhaDeProducao(await escolhido.text());
      if (linhas.length === 0) {
        setErro(
          'Não achei linhas no formato "digitador;quantidade" nesta planilha.',
        );
        return;
      }
      const resposta = await indicadores.importarProducao(mes, linhas);
      setAviso(
        `Produção de ${resposta.digitadores} digitador(es) importada para ${mes}.`,
      );
      setVersao((v) => v + 1);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  const maiorTaxa = Math.max(
    1,
    ...(dados?.linhas ?? []).map((l) => l.taxaDeErro ?? 0),
  );

  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
            Balanço do mês por digitador
          </h2>
          <p className="mt-1 max-w-xl text-xs text-texto-suave">
            Erros registrados ao resolver contra os CTe emitidos. A produção vem
            de uma planilha com duas colunas, digitador e quantidade (pode ser a
            exportada do sistema de emissão).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
            Mês
            <input
              type="month"
              value={mes}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className={CAMPO}
            />
          </label>
          <button
            type="button"
            onClick={() => arquivo.current?.click()}
            className={BOTAO_SECUNDARIO}
          >
            Importar produção (CSV)
          </button>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => void importar(e)}
            className="hidden"
            aria-label="Planilha de produção do mês"
          />
        </div>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {aviso && (
        <p role="status" className="mb-2 text-sm text-ok">
          {aviso}
        </p>
      )}

      {dados && dados.linhas.length === 0 && (
        <p className="text-sm text-texto-suave">
          Nenhum erro com digitador registrado e nenhuma produção importada em{' '}
          {mes}.
        </p>
      )}
      {dados && dados.linhas.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-texto-suave">
            <tr>
              <th className="py-1.5 font-semibold">Digitador</th>
              <th className="py-1.5 text-right font-semibold">CTe emitidos</th>
              <th className="py-1.5 text-right font-semibold">Erros</th>
              <th className="py-1.5 pl-4 font-semibold">Erros a cada 100</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {dados.linhas.map((l) => (
              <tr key={l.digitador} className="border-t border-borda">
                <td className="py-1.5">{l.digitador}</td>
                <td className="py-1.5 text-right">
                  {l.ctesEmitidos ?? (
                    <span
                      className="text-texto-suave"
                      title="Sem produção importada"
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">{l.erros}</td>
                <td className="py-1.5 pl-4">
                  {l.taxaDeErro === null ? (
                    <span className="text-texto-suave">—</span>
                  ) : (
                    <span
                      className="flex items-center gap-2"
                      title={`${l.digitador}: ${l.taxaDeErro} erros a cada 100 CTe`}
                    >
                      <span
                        className="h-3 rounded-r bg-serie-2"
                        style={{
                          width: `${Math.max(1, (l.taxaDeErro / maiorTaxa) * 70)}%`,
                        }}
                        aria-hidden="true"
                      />
                      {l.taxaDeErro.toLocaleString('pt-BR')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
