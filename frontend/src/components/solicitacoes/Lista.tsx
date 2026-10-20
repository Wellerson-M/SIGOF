'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alerta, BOTAO_SECUNDARIO } from '@/components/Janela';
import { useSessao } from '@/lib/sessao';
import { nomeDoTipo, tiposDaEmpresa } from '@/lib/configuracao';
import {
  COLUNAS,
  NOME_DA_PRIORIDADE,
  NOME_DO_STATUS,
  PRIORIDADES,
  api,
  dataCurta,
  documentos,
  mensagemDoErro,
  type FiltrosDaLista,
  type PaginaDaLista,
} from '@/lib/solicitacoes';
import {
  EtiquetaDePrioridade,
  EtiquetaDeStatus,
  IndicadorDeSla,
} from './Etiquetas';

const CAMPO =
  'h-9 rounded-md border border-borda bg-superficie px-2 text-sm text-texto';

/** Quadro ou lista: as duas formas de ver as solicitações. */
export function AlternarVisao({
  atual,
}: Readonly<{ atual: 'quadro' | 'lista' }>) {
  const item = (visao: 'quadro' | 'lista', rotulo: string, href: string) => (
    <Link
      href={href}
      aria-current={atual === visao ? 'page' : undefined}
      className="flex h-8 items-center rounded px-3 text-sm text-texto aria-[current=page]:bg-primaria aria-[current=page]:font-semibold aria-[current=page]:text-sobre-primaria"
    >
      {rotulo}
    </Link>
  );
  return (
    <nav
      aria-label="Forma de ver"
      className="flex rounded-md border border-borda bg-superficie p-0.5"
    >
      {item('quadro', 'Quadro', '/solicitacoes')}
      {item('lista', 'Lista', '/solicitacoes/lista')}
    </nav>
  );
}

/**
 * Todas as solicitações, inclusive as encerradas há muito tempo, com
 * filtros e páginas de 25. É onde se procura um protocolo antigo.
 */
export function Lista() {
  const { usuario } = useSessao();
  const interno = usuario.perfil !== 'SOLICITANTE';
  const [filtros, setFiltros] = useState<FiltrosDaLista>({ pagina: 1 });
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState<PaginaDaLista | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A busca espera a pessoa parar de digitar
  useEffect(() => {
    const espera = setTimeout(() => {
      setFiltros((atual) =>
        (atual.busca ?? '') === busca.trim()
          ? atual
          : { ...atual, busca: busca.trim() || undefined, pagina: 1 },
      );
    }, 350);
    return () => clearTimeout(espera);
  }, [busca]);

  useEffect(() => {
    let cancelado = false;
    api.pesquisar(filtros).then(
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
  }, [filtros]);

  function filtrar(parte: Partial<FiltrosDaLista>) {
    setFiltros({ ...filtros, ...parte, pagina: 1 });
  }

  const paginas = dados
    ? Math.max(1, Math.ceil(dados.total / dados.porPagina))
    : 1;
  const temFiltro =
    Boolean(filtros.status ?? filtros.prioridade ?? filtros.tipo) ||
    Boolean(filtros.minhas || filtros.busca || filtros.de || filtros.ate);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Solicitações</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Todas, inclusive as encerradas há mais de 30 dias.
          </p>
        </div>
        <AlternarVisao atual="lista" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-medium text-texto-suave">
          Buscar
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Protocolo, CTe, NF ou texto"
            className={CAMPO}
          />
        </label>
        <Seletor
          rotulo="Status"
          valor={filtros.status?.[0]}
          opcoes={COLUNAS.map((s) => [s, NOME_DO_STATUS[s]])}
          aoMudar={(v) => filtrar({ status: v ? [v] : undefined })}
        />
        <Seletor
          rotulo="Prioridade"
          valor={filtros.prioridade?.[0]}
          opcoes={PRIORIDADES.map((p) => [p, NOME_DA_PRIORIDADE[p]])}
          aoMudar={(v) => filtrar({ prioridade: v ? [v] : undefined })}
        />
        <Seletor
          rotulo="Tipo"
          valor={filtros.tipo?.[0]}
          opcoes={tiposDaEmpresa(usuario).map((t) => [t.tipo, t.nome])}
          aoMudar={(v) => filtrar({ tipo: v ? [v] : undefined })}
        />
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
          De
          <input
            type="date"
            value={filtros.de ?? ''}
            onChange={(e) => filtrar({ de: e.target.value || undefined })}
            className={CAMPO}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
          Até
          <input
            type="date"
            value={filtros.ate ?? ''}
            onChange={(e) => filtrar({ ate: e.target.value || undefined })}
            className={CAMPO}
          />
        </label>
        {interno && (
          <label className="flex h-9 items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              checked={filtros.minhas ?? false}
              onChange={(e) =>
                filtrar({ minhas: e.target.checked || undefined })
              }
            />
            Só as minhas
          </label>
        )}
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setBusca('');
              setFiltros({ pagina: 1 });
            }}
            className="h-9 px-2 text-sm text-primaria underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      {dados && (
        <>
          <p className="text-sm text-texto-suave" aria-live="polite">
            {dados.total === 1
              ? '1 solicitação'
              : `${dados.total} solicitações`}
          </p>
          <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
                <tr>
                  <th className="px-3 py-2 font-semibold">Protocolo</th>
                  <th className="px-3 py-2 font-semibold">Aberta em</th>
                  <th className="px-3 py-2 font-semibold">Ocorrência</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Prioridade</th>
                  <th className="px-3 py-2 font-semibold">Responsável</th>
                  <th className="px-3 py-2 font-semibold">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-texto-suave"
                    >
                      Nenhuma solicitação encontrada.
                    </td>
                  </tr>
                )}
                {dados.itens.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-borda last:border-0 hover:bg-fundo"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/solicitacoes/${s.id}`}
                        className="font-mono text-xs font-semibold text-primaria underline"
                      >
                        {s.protocolo}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-texto-suave">
                      {dataCurta(s.criadoEm)}
                    </td>
                    <td className="max-w-80 px-3 py-2">
                      <p className="text-xs text-texto-suave">
                        {nomeDoTipo(usuario, s.tipo)}
                        {documentos(s) && ` · ${documentos(s)}`}
                      </p>
                      <p className="truncate text-texto">{s.descricao}</p>
                    </td>
                    <td className="px-3 py-2">
                      <EtiquetaDeStatus status={s.status} />
                    </td>
                    <td className="px-3 py-2">
                      <EtiquetaDePrioridade prioridade={s.prioridade} />
                    </td>
                    <td className="px-3 py-2">{s.responsavel?.nome ?? '—'}</td>
                    <td className="px-3 py-2">
                      <IndicadorDeSla sla={s.sla} />
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
                disabled={filtros.pagina <= 1}
                onClick={() =>
                  setFiltros({ ...filtros, pagina: filtros.pagina - 1 })
                }
                className={BOTAO_SECUNDARIO}
              >
                Anterior
              </button>
              <span className="text-texto-suave">
                Página {filtros.pagina} de {paginas}
              </span>
              <button
                type="button"
                disabled={filtros.pagina >= paginas}
                onClick={() =>
                  setFiltros({ ...filtros, pagina: filtros.pagina + 1 })
                }
                className={BOTAO_SECUNDARIO}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Seletor<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: Readonly<{
  rotulo: string;
  valor: T | undefined;
  opcoes: [T, string][];
  aoMudar: (valor: T | undefined) => void;
}>) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
      {rotulo}
      <select
        value={valor ?? ''}
        onChange={(e) =>
          aoMudar((e.target.value || undefined) as T | undefined)
        }
        className={CAMPO}
      >
        <option value="">Todos</option>
        {opcoes.map(([v, nome]) => (
          <option key={v} value={v}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  );
}
