'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { ErroDaApi } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import {
  ACAO_PARA,
  COLUNAS,
  NOME_DO_STATUS,
  NOME_DO_TIPO,
  PEDE_OBSERVACAO,
  api,
  documentos,
  mensagemDoErro,
  type Resumo,
  type Status,
} from '@/lib/solicitacoes';
import { enviarAnexos } from './Anexos';
import {
  DialogoDeObservacao,
  type ExtrasDaResolucao,
} from './DialogoDeObservacao';
import { AlternarVisao } from './Lista';
import { EtiquetaDePrioridade, IndicadorDeSla } from './Etiquetas';

/** O quadro se atualiza sozinho: o que outra pessoa mover aparece aqui. */
export const SEGUNDOS_ENTRE_ATUALIZACOES = 30;

/**
 * Quadro kanban das solicitações: uma coluna por status, cartões
 * ordenados por prioridade e prazo (a ordem vem da API).
 *
 * Arrastar um cartão para outra coluna muda o status. Só as colunas
 * permitidas para aquele cartão e aquele perfil aceitam o cartão; a API
 * confere de novo antes de gravar.
 */
/**
 * Em aberto, a ordem é a da fila (prioridade e prazo, como vem da API).
 * Encerradas não têm prazo: a mais recente fica em cima.
 */
export function itensDaColuna(itens: Resumo[], coluna: Status): Resumo[] {
  const daColuna = itens.filter((i) => i.status === coluna);
  if (coluna !== 'RESOLVIDO' && coluna !== 'CANCELADO') return daColuna;
  return daColuna.sort(
    (a, b) => Date.parse(b.atualizadoEm) - Date.parse(a.atualizadoEm),
  );
}

export function Quadro() {
  const { usuario } = useSessao();
  const [itens, setItens] = useState<Resumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [soMinhas, setSoMinhas] = useState(false);
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [arrastando, setArrastando] = useState<Resumo | null>(null);
  // O estado acima só serve para colorir as colunas. Quem decide se a
  // coluna aceita o cartão é esta referência, que vale na hora: um arraste
  // rápido pode soltar antes de a tela se redesenhar
  const arrastado = useRef<Resumo | null>(null);
  const [pendente, setPendente] = useState<{
    item: Resumo;
    para: Status;
  } | null>(null);
  // Não atualiza o quadro no meio de um arraste ou com a janela aberta
  const ocupado = useRef(false);
  useEffect(() => {
    ocupado.current = arrastando !== null || pendente !== null;
  }, [arrastando, pendente]);

  const carregar = useCallback(async (termo: string) => {
    try {
      setItens(await api.listar(termo));
      setErro(null);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }, []);

  // Busca com um pequeno atraso, para não chamar a API a cada tecla
  useEffect(() => {
    const espera = setTimeout(() => void carregar(busca), 300);
    return () => clearTimeout(espera);
  }, [busca, carregar]);

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (!ocupado.current) void carregar(busca);
    }, SEGUNDOS_ENTRE_ATUALIZACOES * 1000);
    return () => clearInterval(intervalo);
  }, [busca, carregar]);

  async function mover(
    item: Resumo,
    para: Status,
    observacao?: string,
    extras?: ExtrasDaResolucao,
  ) {
    setAviso(null);
    // O documento final vai antes de resolver: depois de resolvida, a
    // solicitação não recebe mais anexos
    if (extras && extras.arquivos.length > 0) {
      const erros = await enviarAnexos(item.id, extras.arquivos, {
        etapa: 'RESOLUCAO',
      });
      if (erros.length > 0) {
        setAviso(`${item.protocolo}: ${erros.join('; ')}`);
        return;
      }
    }
    const antes = itens;
    // Mostra o cartão na coluna nova na hora; se a API recusar, volta
    setItens(
      (atuais) =>
        atuais?.map((i) =>
          i.id === item.id ? { ...i, status: para, acoes: [] } : i,
        ) ?? null,
    );
    try {
      const atualizado = await api.mover(
        item.id,
        para,
        observacao,
        extras?.classificacao,
      );
      setItens(
        (atuais) =>
          atuais?.map((i) => (i.id === item.id ? atualizado : i)) ?? null,
      );
    } catch (falha) {
      setItens(antes);
      setAviso(`${item.protocolo}: ${mensagemDoErro(falha)}`);
      // Conflito: alguém mexeu antes; traz o estado verdadeiro
      if (falha instanceof ErroDaApi && falha.status === 409) {
        void carregar(busca);
      }
    }
  }

  function soltar(para: Status, item: Resumo) {
    if (!item.acoes.includes(para)) return;
    if (PEDE_OBSERVACAO[para]) {
      setPendente({ item, para });
    } else {
      void mover(item, para);
    }
  }

  // Cancelado fica escondido por padrão: assim as outras cinco colunas
  // cabem lado a lado numa tela de notebook
  const colunas = mostrarCanceladas
    ? COLUNAS
    : COLUNAS.filter((c) => c !== 'CANCELADO');
  const visiveis = (itens ?? []).filter(
    (i) => !soMinhas || i.responsavel?.id === usuario.id,
  );
  const interno = usuario.perfil !== 'SOLICITANTE';
  const abre = usuario.perfil !== 'ADMIN';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Solicitações</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {interno
              ? 'Arraste os cartões entre as colunas para mudar o status. Resolvidas ficam aqui por 30 dias.'
              : 'Acompanhe aqui as solicitações que você abriu.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AlternarVisao atual="quadro" />
          {abre && (
            <Link
              href="/solicitacoes/nova"
              className="inline-flex h-9 items-center rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria"
            >
              Nova solicitação
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-texto">
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar protocolo, CTe, NF ou texto"
            className="h-9 w-72 max-w-full rounded-md border border-borda bg-superficie px-3 text-sm"
          />
        </label>
        {interno && (
          <label className="flex items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              checked={soMinhas}
              onChange={(evento) => setSoMinhas(evento.target.checked)}
            />
            Só as que estão comigo
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={mostrarCanceladas}
            onChange={(evento) => setMostrarCanceladas(evento.target.checked)}
          />
          Mostrar canceladas
        </label>
      </div>

      {aviso && (
        <p
          role="alert"
          className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {aviso}
        </p>
      )}
      {erro && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {erro}
          <button
            type="button"
            onClick={() => void carregar(busca)}
            className="font-semibold underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {itens === null && !erro ? (
        <p className="text-sm text-texto-suave">Carregando o quadro…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {colunas.map((coluna) => (
            <Coluna
              key={coluna}
              status={coluna}
              itens={itensDaColuna(visiveis, coluna)}
              arrastando={arrastando}
              obterArrastado={() => arrastado.current}
              aoComecar={(item) => {
                arrastado.current = item;
                setArrastando(item);
              }}
              aoTerminar={() => {
                arrastado.current = null;
                setArrastando(null);
              }}
              aoSoltar={soltar}
            />
          ))}
        </div>
      )}

      {pendente && (
        <DialogoDeObservacao
          titulo={`${ACAO_PARA[pendente.para]} — ${pendente.item.protocolo}`}
          pergunta={PEDE_OBSERVACAO[pendente.para] ?? ''}
          resolucao={pendente.para === 'RESOLVIDO'}
          exigirCausa={usuario.empresa.exigirCausaAoResolver ?? false}
          observacaoObrigatoria={pendente.para !== 'RESOLVIDO'}
          aoFechar={() => setPendente(null)}
          aoConfirmar={(observacao, extras) => {
            const { item, para } = pendente;
            setPendente(null);
            void mover(item, para, observacao, extras);
          }}
        />
      )}
    </div>
  );
}

function Coluna({
  status,
  itens,
  arrastando,
  obterArrastado,
  aoComecar,
  aoTerminar,
  aoSoltar,
}: {
  status: Status;
  itens: Resumo[];
  arrastando: Resumo | null;
  obterArrastado: () => Resumo | null;
  aoComecar: (item: Resumo) => void;
  aoTerminar: () => void;
  aoSoltar: (para: Status, item: Resumo) => void;
}) {
  const aceita = arrastando !== null && arrastando.acoes.includes(status);
  const recusa = arrastando !== null && !aceita && arrastando.status !== status;

  function sobre(evento: DragEvent) {
    // Sem preventDefault o navegador não deixa soltar aqui
    if (obterArrastado()?.acoes.includes(status)) evento.preventDefault();
  }

  return (
    <section
      aria-label={NOME_DO_STATUS[status]}
      onDragOver={sobre}
      onDrop={(evento) => {
        evento.preventDefault();
        const item = obterArrastado();
        if (item) aoSoltar(status, item);
        aoTerminar();
      }}
      className={`flex min-w-52 flex-1 basis-0 flex-col rounded-lg border bg-fundo transition-colors ${
        aceita ? 'border-destaque ring-2 ring-destaque/40' : 'border-borda'
      } ${recusa ? 'opacity-50' : ''}`}
    >
      <h2 className="flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
        {NOME_DO_STATUS[status]}
        <span className="rounded-full bg-superficie px-2 py-0.5 text-texto">
          {itens.length}
        </span>
      </h2>
      <ol className="flex min-h-24 flex-col gap-2 px-2 pb-2">
        {itens.map((item) => (
          <li key={item.id}>
            <Cartao
              item={item}
              aoComecar={() => aoComecar(item)}
              aoTerminar={aoTerminar}
            />
          </li>
        ))}
        {itens.length === 0 && (
          <li className="px-1 py-3 text-center text-xs text-texto-suave">
            {aceita ? 'Solte aqui' : 'Nada por aqui'}
          </li>
        )}
      </ol>
    </section>
  );
}

function Cartao({
  item,
  aoComecar,
  aoTerminar,
}: {
  item: Resumo;
  aoComecar: () => void;
  aoTerminar: () => void;
}) {
  const movel = item.acoes.length > 0;
  const docs = documentos(item);

  return (
    <Link
      href={`/solicitacoes/${item.id}`}
      draggable={movel}
      onDragStart={(evento) => {
        evento.dataTransfer.setData('text/plain', item.id);
        evento.dataTransfer.effectAllowed = 'move';
        aoComecar();
      }}
      onDragEnd={aoTerminar}
      className={`flex flex-col gap-1.5 rounded-md border border-borda bg-superficie p-3 shadow-sm hover:border-primaria/50 ${
        movel ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-texto">
          {item.protocolo}
        </span>
        <EtiquetaDePrioridade prioridade={item.prioridade} />
      </div>
      <p className="text-xs font-medium text-texto-suave">
        {NOME_DO_TIPO[item.tipo]}
        {docs && ` · ${docs}`}
      </p>
      <p className="line-clamp-2 text-sm text-texto">{item.descricao}</p>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5">
        <IndicadorDeSla sla={item.sla} />
        <span className="flex items-center gap-2 truncate text-xs text-texto-suave">
          {item.totais.anexos > 0 && (
            <span title="Anexos">📎 {item.totais.anexos}</span>
          )}
          {item.totais.mensagens > 0 && (
            <span title="Mensagens">💬 {item.totais.mensagens}</span>
          )}
          <span className="truncate">
            {item.responsavel?.nome ?? 'Sem responsável'}
          </span>
        </span>
      </div>
    </Link>
  );
}
