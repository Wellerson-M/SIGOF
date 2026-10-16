'use client';

import { useEffect, useState } from 'react';
import { Alerta, BOTAO_SECUNDARIO } from '@/components/Janela';
import {
  EVENTOS_POR_PAGINA,
  NOME_DA_ACAO,
  admin,
  resumoDosDetalhes,
  type PaginaDaTrilha,
} from '@/lib/administracao';
import { dataCurta, mensagemDoErro } from '@/lib/solicitacoes';

/** Quem entrou, quem saiu e o que foi mudado na administração. */
export function Auditoria() {
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<PaginaDaTrilha | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    admin.auditoria(pagina).then(
      (resposta) => {
        if (!cancelado) setDados(resposta);
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, [pagina]);

  if (erro) return <Alerta>{erro}</Alerta>;
  if (!dados) return <p className="text-sm text-texto-suave">Carregando…</p>;

  const paginas = Math.max(1, Math.ceil(dados.total / EVENTOS_POR_PAGINA));

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-texto-suave">
        Registro permanente: nenhum evento pode ser alterado ou apagado, nem
        pelo administrador.
      </p>
      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
            <tr>
              <th className="px-3 py-2 font-semibold">Quando</th>
              <th className="px-3 py-2 font-semibold">O quê</th>
              <th className="px-3 py-2 font-semibold">Quem</th>
              <th className="px-3 py-2 font-semibold">Sobre</th>
              <th className="px-3 py-2 font-semibold">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {dados.eventos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-texto-suave">
                  Nenhum evento ainda.
                </td>
              </tr>
            )}
            {dados.eventos.map((e) => (
              <tr key={e.id} className="border-b border-borda last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-texto-suave">
                  {dataCurta(e.criadoEm)}
                </td>
                <td
                  className={`px-3 py-2 font-medium ${e.acao === 'LOGIN_RECUSADO' ? 'text-critico' : 'text-texto'}`}
                >
                  {NOME_DA_ACAO[e.acao] ?? e.acao}
                </td>
                <td className="px-3 py-2">{e.autor?.nome ?? '—'}</td>
                <td className="px-3 py-2">
                  {e.alvo && e.alvo.id !== e.autor?.id ? e.alvo.nome : '—'}
                </td>
                <td className="px-3 py-2 text-texto-suave">
                  {resumoDosDetalhes(e.detalhes)}
                  {e.ip && (
                    <span className="ml-1 font-mono text-xs">({e.ip})</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina(pagina - 1)}
            className={BOTAO_SECUNDARIO}
          >
            Mais novos
          </button>
          <span className="text-texto-suave">
            Página {pagina} de {paginas}
          </span>
          <button
            type="button"
            disabled={pagina >= paginas}
            onClick={() => setPagina(pagina + 1)}
            className={BOTAO_SECUNDARIO}
          >
            Mais antigos
          </button>
        </div>
      )}
    </section>
  );
}
