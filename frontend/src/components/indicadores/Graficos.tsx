'use client';

import { useEffect, useRef, useState } from 'react';
import { diaCurto, topoDoEixo, type Indicadores } from '@/lib/indicadores';

const ALTURA = 180;
const MARGEM_ESQUERDA = 28;
const MARGEM_CIMA = 8;
const MARGEM_BAIXO = 22;

/**
 * Largura real do gráfico na tela. Desenhar na largura de verdade (em vez
 * de esticar um desenho fixo) mantém o texto dos eixos no mesmo tamanho do
 * resto da página.
 */
function useLargura(inicial: number) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.max(280, entrada.contentRect.width));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return { caixa, largura };
}

/**
 * Abertas × resolvidas por dia: colunas lado a lado, uma cor por série
 * (azul e laranja, validadas para daltonismo), legenda sempre visível e o
 * valor de cada dia ao passar o mouse ou focar com o teclado.
 */
export function GraficoPorDia({
  porDia,
}: Readonly<{ porDia: Indicadores['porDia'] }>) {
  const [foco, setFoco] = useState<number | null>(null);
  const { caixa, largura } = useLargura(720);
  const topo = topoDoEixo(
    Math.max(...porDia.map((d) => Math.max(d.abertas, d.resolvidas))),
  );
  const area = largura - MARGEM_ESQUERDA;
  const faixa = area / porDia.length;
  // Coluna fina, no máximo 12 px: o resto da faixa é respiro
  const coluna = Math.max(1.5, Math.min(12, (faixa - 4) / 2));
  const y = (valor: number) => MARGEM_CIMA + ALTURA - (valor / topo) * ALTURA;
  // Contagem não tem meio: a marca do meio só aparece se for número inteiro
  const marcas = Number.isInteger(topo / 2) ? [0, topo / 2, topo] : [0, topo];
  // Poucas datas no eixo: a primeira, a do meio e a última
  const datas = new Set([
    0,
    Math.floor((porDia.length - 1) / 2),
    porDia.length - 1,
  ]);
  const dia = foco === null ? null : porDia[foco];

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Abertas e resolvidas por dia
        </span>
        <span className="flex gap-4 text-xs text-texto">
          <Legenda cor="bg-serie-1" nome="Abertas" />
          <Legenda cor="bg-serie-2" nome="Resolvidas" />
        </span>
      </figcaption>

      <div ref={caixa} className="relative">
        <svg
          width={largura}
          height={MARGEM_CIMA + ALTURA + MARGEM_BAIXO}
          className="block max-w-full"
          role="img"
          aria-label="Gráfico de colunas: solicitações abertas e resolvidas por dia"
          onMouseLeave={() => setFoco(null)}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={MARGEM_ESQUERDA}
                x2={largura}
                y1={y(m)}
                y2={y(m)}
                className="stroke-grade"
                strokeWidth={1}
              />
              <text
                x={MARGEM_ESQUERDA - 6}
                y={y(m) + 4}
                textAnchor="end"
                className="fill-texto-suave text-[11px]"
              >
                {m}
              </text>
            </g>
          ))}
          {porDia.map((d, i) => {
            const centro = MARGEM_ESQUERDA + faixa * i + faixa / 2;
            return (
              <g key={d.dia}>
                <Coluna
                  x={centro - coluna - 1}
                  largura={coluna}
                  valor={d.abertas}
                  y={y}
                  classe="fill-serie-1"
                />
                <Coluna
                  x={centro + 1}
                  largura={coluna}
                  valor={d.resolvidas}
                  y={y}
                  classe="fill-serie-2"
                />
                {datas.has(i) && (
                  <text
                    x={centro}
                    y={MARGEM_CIMA + ALTURA + 16}
                    textAnchor={ancora(i, porDia.length)}
                    className="fill-texto-suave text-[11px]"
                  >
                    {diaCurto(d.dia)}
                  </text>
                )}
                {/* Alvo do mouse e do teclado: a faixa inteira do dia */}
                <rect
                  x={MARGEM_ESQUERDA + faixa * i}
                  y={MARGEM_CIMA}
                  width={faixa}
                  height={ALTURA}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${diaCurto(d.dia)}: ${d.abertas} abertas, ${d.resolvidas} resolvidas`}
                  onMouseEnter={() => setFoco(i)}
                  onFocus={() => setFoco(i)}
                  onBlur={() => setFoco(null)}
                  className={foco === i ? 'fill-texto/5' : ''}
                />
              </g>
            );
          })}
        </svg>
        {dia && foco !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border border-borda bg-superficie px-2.5 py-1.5 text-xs text-texto shadow"
            style={{
              left: `${((MARGEM_ESQUERDA + faixa * (foco + 0.5)) / largura) * 100}%`,
              transform:
                foco > porDia.length / 2
                  ? 'translateX(-105%)'
                  : 'translateX(5%)',
            }}
          >
            <p className="font-semibold">{diaCurto(dia.dia)}</p>
            <p className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-sm bg-serie-1"
                aria-hidden="true"
              />
              {dia.abertas} abertas
            </p>
            <p className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-sm bg-serie-2"
                aria-hidden="true"
              />
              {dia.resolvidas} resolvidas
            </p>
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-primaria">
          Ver como tabela
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-texto-suave">
              <tr>
                <th className="py-1 font-semibold">Dia</th>
                <th className="py-1 text-right font-semibold">Abertas</th>
                <th className="py-1 text-right font-semibold">Resolvidas</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {porDia.map((d) => (
                <tr key={d.dia} className="border-t border-borda">
                  <td className="py-1">{diaCurto(d.dia)}</td>
                  <td className="py-1 text-right">{d.abertas}</td>
                  <td className="py-1 text-right">{d.resolvidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** A primeira data alinha à esquerda e a última à direita: nenhuma é cortada. */
function ancora(i: number, total: number): 'start' | 'middle' | 'end' {
  if (i === 0) return 'start';
  if (i === total - 1) return 'end';
  return 'middle';
}

function Coluna({
  x,
  largura,
  valor,
  y,
  classe,
}: Readonly<{
  x: number;
  largura: number;
  valor: number;
  y: (v: number) => number;
  classe: string;
}>) {
  if (valor === 0) return null;
  const topo = y(valor);
  const base = MARGEM_CIMA + ALTURA;
  const altura = base - topo;
  const raio = Math.min(4, largura / 2, altura);
  // Ponta arredondada em cima, reta na base
  const d = `M${x},${base} V${topo + raio} Q${x},${topo} ${x + raio},${topo} H${x + largura - raio} Q${x + largura},${topo} ${x + largura},${topo + raio} V${base} Z`;
  return <path d={d} className={classe} />;
}

function Legenda({ cor, nome }: Readonly<{ cor: string; nome: string }>) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block size-2.5 rounded-sm ${cor}`}
        aria-hidden="true"
      />
      {nome}
    </span>
  );
}

/** Barras horizontais de uma série só: rótulo, barra e valor na ponta. */
export function Barras({
  titulo,
  itens,
  formatar = String,
  vazio = 'Nada no período.',
}: Readonly<{
  titulo: string;
  itens: { nome: string; valor: number }[];
  /** Como escrever o valor na ponta (ex.: "2h 15min"). */
  formatar?: (valor: number) => string;
  vazio?: string;
}>) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
        {titulo}
      </figcaption>
      {itens.length === 0 ? (
        <p className="text-sm text-texto-suave">{vazio}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((item) => (
            <li
              key={item.nome}
              className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm"
              title={`${item.nome}: ${formatar(item.valor)}`}
            >
              <span className="truncate text-texto">{item.nome}</span>
              <span className="flex items-center gap-2">
                <span
                  className="h-3 rounded-r bg-serie-1"
                  style={{
                    width: `${Math.max(1, (item.valor / maior) * 85)}%`,
                  }}
                  aria-hidden="true"
                />
                <span className="tabular-nums text-texto">
                  {formatar(item.valor)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
