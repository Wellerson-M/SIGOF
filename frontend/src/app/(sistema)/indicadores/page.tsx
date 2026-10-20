'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { BalancoDoMes } from '@/components/indicadores/BalancoDoMes';
import { Barras, GraficoPorDia } from '@/components/indicadores/Graficos';
import { Alerta, BOTAO_SECUNDARIO } from '@/components/Janela';
import {
  duracao,
  indicadores,
  type Indicadores,
  type Periodo,
} from '@/lib/indicadores';
import { usaModulo, nomeDoTipo } from '@/lib/configuracao';
import { useSessao } from '@/lib/sessao';
import { COLUNAS, NOME_DO_STATUS, mensagemDoErro } from '@/lib/solicitacoes';

const PERIODOS: Periodo[] = [7, 30, 90];

export default function PaginaDeIndicadores() {
  const { usuario } = useSessao();
  const [dias, setDias] = useState<Periodo>(30);
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const pode = usuario.perfil === 'SUPERVISOR' || usuario.perfil === 'ADMIN';

  useEffect(() => {
    if (!pode) return;
    let cancelado = false;
    indicadores.calcular(dias).then(
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
  }, [dias, pode]);

  if (!pode) {
    return (
      <p className="text-sm text-texto">
        Os indicadores são do supervisor e do administrador.
      </p>
    );
  }

  async function baixarCsv() {
    setBaixando(true);
    try {
      const arquivo = await indicadores.csv(dias);
      const endereco = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = endereco;
      link.download = `sigof-solicitacoes-${dias}dias.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(endereco), 60_000);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setBaixando(false);
    }
  }

  const n = dados?.noPeriodo;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Indicadores</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Como está o atendimento agora e nos últimos {dias} dias.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Período"
            className="flex rounded-md border border-borda bg-superficie p-0.5"
          >
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={dias === p}
                onClick={() => setDias(p)}
                className="h-8 rounded px-3 text-sm text-texto aria-pressed:bg-primaria aria-pressed:font-semibold aria-pressed:text-sobre-primaria"
              >
                {p} dias
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void baixarCsv()}
            disabled={baixando}
            className={BOTAO_SECUNDARIO}
          >
            {baixando ? 'Gerando…' : 'Baixar planilha (CSV)'}
          </button>
        </div>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {!dados && !erro && (
        <p className="text-sm text-texto-suave">Carregando…</p>
      )}

      {dados && n && (
        <>
          <section
            aria-label="Agora"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Numero rotulo="Em aberto agora" valor={dados.agora.abertas} />
            <Numero
              rotulo="Com SLA vencido"
              valor={dados.agora.slaVencido}
              destaque={dados.agora.slaVencido > 0 ? 'critico' : undefined}
              detalhe="não assumidas dentro do prazo"
            />
            <Numero
              rotulo="Sem responsável"
              valor={dados.agora.semResponsavel}
              detalhe="na fila, esperando alguém assumir"
            />
            <Numero
              rotulo="Atendidas no prazo"
              valor={
                n.percentualNoPrazo === null ? '—' : `${n.percentualNoPrazo}%`
              }
              detalhe={`${n.atendidasNoPrazo} de ${n.atendidas} assumidas no período`}
            />
          </section>

          <section
            aria-label="No período"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Numero rotulo="Abertas no período" valor={n.abertas} pequeno />
            <Numero
              rotulo="Resolvidas no período"
              valor={n.resolvidas}
              pequeno
            />
            <Numero
              rotulo="Tempo médio até assumir"
              valor={duracao(n.minutosMedioAteAssumir)}
              pequeno
            />
            <Numero
              rotulo="Tempo médio até resolver"
              valor={duracao(n.minutosMedioAteResolver)}
              pequeno
            />
          </section>

          <Cartao>
            <GraficoPorDia porDia={dados.porDia} />
          </Cartao>

          <div className="grid gap-5 lg:grid-cols-2">
            <Cartao>
              <Barras
                titulo="Em aberto, por status"
                itens={COLUNAS.filter(
                  (s) => s !== 'RESOLVIDO' && s !== 'CANCELADO',
                ).map((s) => ({
                  nome: NOME_DO_STATUS[s],
                  valor: dados.agora.porStatus[s],
                }))}
              />
            </Cartao>
            <Cartao>
              <Barras
                titulo="Abertas no período, por tipo"
                itens={dados.porTipo.map((t) => ({
                  nome: nomeDoTipo(usuario, t.tipo),
                  valor: t.total,
                }))}
              />
            </Cartao>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Cartao>
              <Barras
                titulo="Abertas no período, por filial"
                itens={(dados.porFilial ?? []).map((f) => ({
                  nome: f.filial,
                  valor: f.total,
                }))}
              />
            </Cartao>
            <Cartao>
              <Barras
                titulo="Quem mais abriu no período"
                itens={(dados.porSolicitante ?? []).map((s) => ({
                  nome: s.nome,
                  valor: s.total,
                }))}
              />
            </Cartao>
          </div>

          <Cartao>
            <Barras
              titulo="Tempo médio até resolver, por tipo"
              itens={(dados.tempoAteResolverPorTipo ?? []).map((t) => ({
                nome: nomeDoTipo(usuario, t.tipo),
                valor: t.minutos,
              }))}
              formatar={duracao}
              vazio="Nenhuma resolvida no período."
            />
          </Cartao>

          {usaModulo(usuario, 'BALANCO') && <BalancoDoMes />}

          <Cartao>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Por responsável
            </h2>
            {dados.porResponsavel.length === 0 ? (
              <p className="text-sm text-texto-suave">
                Ninguém assumiu solicitações ainda.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-texto-suave">
                  <tr>
                    <th className="py-1.5 font-semibold">Nome</th>
                    <th className="py-1.5 text-right font-semibold">
                      Em aberto
                    </th>
                    <th className="py-1.5 text-right font-semibold">
                      Resolvidas no período
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {dados.porResponsavel.map((r) => (
                    <tr key={r.id} className="border-t border-borda">
                      <td className="py-1.5">{r.nome}</td>
                      <td className="py-1.5 text-right">{r.emAberto}</td>
                      <td className="py-1.5 text-right">
                        {r.resolvidasNoPeriodo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cartao>

          <Cartao>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              De quem foi o erro (resolvidas no período)
            </h2>
            {(dados.porCausa ?? []).length === 0 ? (
              <p className="text-sm text-texto-suave">
                Nenhuma solicitação resolvida com a causa informada no período.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-texto-suave">
                  <tr>
                    <th className="py-1.5 font-semibold">Causa</th>
                    <th className="py-1.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {(dados.porCausa ?? []).map((c) => (
                    <Fragment key={c.causa}>
                      <tr className="border-t border-borda">
                        <td className="py-1.5 font-medium">{c.causa}</td>
                        <td className="py-1.5 text-right font-medium">
                          {c.total}
                        </td>
                      </tr>
                      {c.detalhes.map((d) => (
                        <tr key={d.detalhe}>
                          <td className="py-1 pl-4 text-texto-suave">
                            {d.detalhe}
                          </td>
                          <td className="py-1 text-right text-texto-suave">
                            {d.total}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
            {(dados.resolvidasSemCausa ?? 0) > 0 && (
              <p className="mt-2 text-xs text-texto-suave">
                {dados.resolvidasSemCausa} resolvida(s) sem a causa informada.
              </p>
            )}
          </Cartao>

          {(n.registrosRapidos ?? 0) > 0 && (
            <p className="text-sm text-texto-suave">
              {n.registrosRapidos} registro(s) rápido(s) no período: contam como
              resolvidas, mas ficam fora do tempo médio até resolver.
            </p>
          )}
          {n.abertasComAlertaDeDuplicidade > 0 && (
            <p className="text-sm text-texto-suave">
              {n.abertasComAlertaDeDuplicidade} solicitação(ões) foram abertas
              mesmo com o alerta de duplicidade no período.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
  pequeno = false,
}: Readonly<{
  rotulo: string;
  valor: number | string;
  detalhe?: string | undefined;
  destaque?: 'critico' | undefined;
  pequeno?: boolean;
}>) {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <p className="text-sm text-texto-suave">{rotulo}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${pequeno ? 'text-xl' : 'text-3xl'} ${
          destaque === 'critico' ? 'text-critico' : 'text-texto'
        }`}
      >
        {destaque === 'critico' && (
          <span className="mr-1.5 text-base" aria-label="Atenção">
            ⚠
          </span>
        )}
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-xs text-texto-suave">{detalhe}</p>}
    </div>
  );
}

function Cartao({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      {children}
    </section>
  );
}
