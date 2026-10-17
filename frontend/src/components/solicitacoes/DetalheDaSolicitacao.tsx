'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EVENTO_NOTIFICACOES_LIDAS } from '@/components/Sino';
import { ErroDaApi } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import { COR_DA_SITUACAO, NOME_DA_SITUACAO, notificacoes } from '@/lib/avisos';
import {
  ACAO_PARA,
  ANEXO,
  NOME_DA_PRIORIDADE,
  NOME_DO_STATUS,
  NOME_DO_TIPO,
  PEDE_OBSERVACAO,
  PRIORIDADES,
  api,
  dataCurta,
  mensagemDoErro,
  type Detalhe,
  type Evento,
  type Pessoa,
  type Prioridade,
  type Status,
} from '@/lib/solicitacoes';
import { Anexos, abrirAnexo, enviarAnexos } from './Anexos';
import { CausaDoErro } from './CausaDoErro';
import {
  DialogoDeObservacao,
  type ExtrasDaResolucao,
} from './DialogoDeObservacao';
import {
  EtiquetaDePrioridade,
  EtiquetaDeStatus,
  IndicadorDeSla,
} from './Etiquetas';

const SELECAO =
  'h-9 rounded-md border border-borda bg-superficie px-2 text-sm text-texto';

/** Tudo de uma solicitação: dados, ações, conversa e histórico. */
export function DetalheDaSolicitacao({ id }: { id: string }) {
  const { usuario } = useSessao();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [naoExiste, setNaoExiste] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<Status | null>(null);
  const [responsaveis, setResponsaveis] = useState<Pessoa[]>([]);

  const falhaAoCarregar = useCallback((falha: unknown) => {
    if (falha instanceof ErroDaApi && falha.status === 404) {
      setNaoExiste(true);
    } else {
      setErro(mensagemDoErro(falha));
    }
  }, []);

  const carregar = useCallback(async () => {
    try {
      setDetalhe(await api.detalhar(id));
    } catch (falha) {
      falhaAoCarregar(falha);
    }
  }, [id, falhaAoCarregar]);

  // Abriu a solicitação: as notificações dela deixam de ser novidade
  useEffect(() => {
    notificacoes.marcarLidas({ solicitacaoId: id }).then(
      () => window.dispatchEvent(new Event(EVENTO_NOTIFICACOES_LIDAS)),
      () => {},
    );
  }, [id]);

  useEffect(() => {
    let cancelado = false;
    api.detalhar(id).then(
      (dados) => {
        if (!cancelado) setDetalhe(dados);
      },
      (falha: unknown) => {
        if (!cancelado) falhaAoCarregar(falha);
      },
    );
    return () => {
      cancelado = true;
    };
  }, [id, falhaAoCarregar]);

  const podeAtribuir = detalhe?.pode.atribuir ?? false;
  useEffect(() => {
    if (podeAtribuir) {
      api.responsaveis().then(setResponsaveis, () => setResponsaveis([]));
    }
  }, [podeAtribuir]);

  /** Executa a ação e recarrega tudo (histórico inclusive). */
  async function executar(acao: () => Promise<unknown>): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await carregar();
      return true;
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      if (falha instanceof ErroDaApi && falha.status === 409) {
        await carregar();
      }
      return false;
    } finally {
      setOcupado(false);
    }
  }

  /** Anexa o documento final (se houver) e só então move. */
  async function resolverCom(
    para: Status,
    observacao: string,
    extras: ExtrasDaResolucao,
  ) {
    if (extras.arquivos.length > 0) {
      const erros = await enviarAnexos(id, extras.arquivos, {
        etapa: 'RESOLUCAO',
      });
      if (erros.length > 0) {
        throw new ErroDaApi(422, 'ANEXO', erros.join('; '));
      }
    }
    await api.mover(id, para, observacao, extras.classificacao);
  }

  function mover(para: Status) {
    if (PEDE_OBSERVACAO[para]) {
      setPendente(para);
    } else {
      void executar(() => api.mover(id, para));
    }
  }

  if (naoExiste) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <h1 className="text-xl font-semibold text-texto">
          Solicitação não encontrada
        </h1>
        <p className="text-sm text-texto-suave">
          Ela não existe ou você não tem acesso a ela.
        </p>
        <Link href="/solicitacoes" className="text-sm text-primaria underline">
          Voltar ao quadro
        </Link>
      </div>
    );
  }

  if (!detalhe) {
    return erro ? (
      <p role="alert" className="text-sm text-critico">
        {erro}
      </p>
    ) : (
      <p className="text-sm text-texto-suave">Carregando…</p>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/solicitacoes" className="text-sm text-primaria underline">
          ← Quadro
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold text-texto">
            {detalhe.protocolo}
          </h1>
          <EtiquetaDeStatus status={detalhe.status} />
          <EtiquetaDePrioridade prioridade={detalhe.prioridade} />
          <IndicadorDeSla sla={detalhe.sla} />
          {detalhe.registroRapido && (
            <span className="rounded-full border border-borda px-2 py-0.5 text-xs text-texto-suave">
              Registro rápido
            </span>
          )}
        </div>
      </div>

      {erro && (
        <p
          role="alert"
          className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {erro}
        </p>
      )}

      {(detalhe.acoes.length > 0 ||
        detalhe.pode.mudarPrioridade ||
        detalhe.pode.atribuir) && (
        <section className="flex flex-wrap items-end gap-4 rounded-lg border border-borda bg-superficie p-4">
          {detalhe.acoes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
                Mover
              </span>
              <div className="flex flex-wrap gap-2">
                {detalhe.acoes.map((para) => (
                  <button
                    key={para}
                    type="button"
                    disabled={ocupado}
                    onClick={() => mover(para)}
                    className={`h-9 rounded-md px-3 text-sm font-semibold disabled:opacity-50 ${
                      para === 'CANCELADO'
                        ? 'border border-critico/50 text-critico'
                        : 'bg-primaria text-sobre-primaria'
                    }`}
                  >
                    {ACAO_PARA[para]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {detalhe.pode.mudarPrioridade && (
            <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Prioridade
              <select
                value={detalhe.prioridade}
                disabled={ocupado}
                onChange={(evento) => {
                  const prioridade = evento.target.value as Prioridade;
                  void executar(() => api.priorizar(id, prioridade));
                }}
                className={SELECAO}
              >
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {NOME_DA_PRIORIDADE[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {detalhe.pode.atribuir && (
            <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Responsável
              <select
                value={detalhe.responsavel?.id ?? ''}
                disabled={ocupado}
                onChange={(evento) => {
                  const responsavelId = evento.target.value;
                  if (responsavelId) {
                    void executar(() => api.atribuir(id, responsavelId));
                  }
                }}
                className={SELECAO}
              >
                <option value="">Ninguém</option>
                {responsaveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-lg border border-borda bg-superficie p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Ocorrência
            </h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Dado nome="Tipo">{NOME_DO_TIPO[detalhe.tipo]}</Dado>
              {detalhe.filial && (
                <Dado nome="Filial">{detalhe.filial.nome}</Dado>
              )}
              <Dado nome="CTe">{detalhe.cte ?? '—'}</Dado>
              <Dado nome="NF">{detalhe.nf ?? '—'}</Dado>
              {detalhe.pagadorCorreto && (
                <Dado nome="Pagador correto">{detalhe.pagadorCorreto}</Dado>
              )}
            </dl>
            <p className="mt-4 whitespace-pre-wrap text-sm text-texto">
              {detalhe.descricao}
            </p>
          </section>

          <Anexos
            solicitacaoId={detalhe.id}
            anexos={detalhe.anexos}
            podeAnexar={
              detalhe.status !== 'RESOLVIDO' && detalhe.status !== 'CANCELADO'
            }
            aoMudar={carregar}
          />

          <Conversa
            detalhe={detalhe}
            aoEnviar={(conteudo, interna, arquivos) =>
              executar(async () => {
                const mensagem = await api.comentar(
                  id,
                  conteudo,
                  interna,
                  arquivos.length > 0,
                );
                if (arquivos.length > 0) {
                  const erros = await enviarAnexos(id, arquivos, {
                    mensagemId: mensagem.id,
                  });
                  if (erros.length > 0) {
                    throw new ErroDaApi(422, 'ANEXO', erros.join('; '));
                  }
                }
              })
            }
            aoAbrirAnexo={(anexo) => abrirAnexo(id, anexo)}
          />
        </div>

        <aside className="flex flex-col gap-5">
          <section className="rounded-lg border border-borda bg-superficie p-4">
            <dl className="flex flex-col gap-3 text-sm">
              <Dado nome="Solicitante">{detalhe.solicitante.nome}</Dado>
              <Dado nome="Responsável">
                {detalhe.responsavel?.nome ?? 'Ninguém ainda'}
              </Dado>
              <Dado nome="Aberta em">{dataCurta(detalhe.criadoEm)}</Dado>
              {detalhe.slaVenceEm && detalhe.sla.situacao !== 'ENCERRADO' && (
                <Dado nome="Prazo (SLA)">{dataCurta(detalhe.slaVenceEm)}</Dado>
              )}
              {detalhe.resolvidoEm && (
                <Dado nome="Resolvida em">
                  {dataCurta(detalhe.resolvidoEm)}
                </Dado>
              )}
            </dl>
          </section>

          {(detalhe.causa || detalhe.pode.classificar) && (
            <CausaDoErro
              causa={detalhe.causa}
              podeAlterar={detalhe.pode.classificar}
              aoSalvar={(classificacao) =>
                executar(() => api.classificar(id, classificacao))
              }
            />
          )}

          <section className="rounded-lg border border-borda bg-superficie p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Histórico
            </h2>
            <ol className="flex flex-col gap-3">
              {detalhe.historico.map((evento) => (
                <li
                  key={evento.id}
                  className="border-l-2 border-borda pl-3 text-sm"
                >
                  <p className="font-medium text-texto">
                    {tituloDoEvento(evento)}
                  </p>
                  {evento.observacao && (
                    <p className="whitespace-pre-wrap text-texto">
                      {evento.observacao}
                    </p>
                  )}
                  <p className="text-xs text-texto-suave">
                    {evento.autor.nome} · {dataCurta(evento.criadoEm)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {detalhe.emails.length > 0 && (
            <section className="rounded-lg border border-borda bg-superficie p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                E-mails enviados
              </h2>
              <ol className="flex flex-col gap-2">
                {detalhe.emails.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>
                      <span
                        className={`font-medium ${COR_DA_SITUACAO[e.situacao]}`}
                      >
                        {NOME_DA_SITUACAO[e.situacao]}
                      </span>{' '}
                      <span className="text-xs text-texto-suave">
                        · {dataCurta(e.enviadoEm ?? e.criadoEm)}
                      </span>
                    </p>
                    <p className="break-all text-xs text-texto-suave">
                      {e.para.join(', ')}
                    </p>
                    {e.ultimoErro && e.situacao !== 'ENVIADO' && (
                      <p className="text-xs text-critico">{e.ultimoErro}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>

      {pendente && (
        <DialogoDeObservacao
          titulo={`${ACAO_PARA[pendente]} — ${detalhe.protocolo}`}
          pergunta={PEDE_OBSERVACAO[pendente] ?? ''}
          resolucao={pendente === 'RESOLVIDO'}
          exigirCausa={usuario.empresa.exigirCausaAoResolver ?? false}
          observacaoObrigatoria={pendente !== 'RESOLVIDO'}
          aoFechar={() => setPendente(null)}
          aoConfirmar={(observacao, extras) => {
            const para = pendente;
            setPendente(null);
            void executar(() => resolverCom(para, observacao, extras));
          }}
        />
      )}
    </div>
  );
}

/** Abertura, mudança de status ou alteração (prioridade, responsável). */
function tituloDoEvento(evento: Evento): string {
  if (evento.statusAnterior === null) return 'Aberta';
  if (evento.statusAnterior === evento.statusNovo) return 'Alteração';
  return NOME_DO_STATUS[evento.statusNovo];
}

function Dado({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-suave">{nome}</dt>
      <dd className="text-texto">{children}</dd>
    </div>
  );
}

function Conversa({
  detalhe,
  aoEnviar,
  aoAbrirAnexo,
}: {
  detalhe: Detalhe;
  aoEnviar: (
    conteudo: string,
    interna: boolean,
    arquivos: File[],
  ) => Promise<boolean>;
  aoAbrirAnexo: (anexo: {
    id: string;
    nomeArquivo: string;
    tipoMime: string;
  }) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [chaveDoArquivo, setChaveDoArquivo] = useState(0);
  const [erroAoAbrir, setErroAoAbrir] = useState<string | null>(null);
  const podeEnviar = texto.trim() !== '' || arquivos.length > 0;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!podeEnviar) return;
    setEnviando(true);
    const enviada = await aoEnviar(texto, interna, arquivos);
    setEnviando(false);
    // Se falhou, o texto fica para a pessoa tentar de novo
    if (enviada) {
      setTexto('');
      setArquivos([]);
      setChaveDoArquivo((n) => n + 1);
    }
  }

  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
        Conversa
      </h2>
      {detalhe.mensagens.length === 0 ? (
        <p className="mb-3 text-sm text-texto-suave">Nenhuma mensagem ainda.</p>
      ) : (
        <ol className="mb-4 flex flex-col gap-3">
          {detalhe.mensagens.map((m) => (
            <li
              key={m.id}
              className={`rounded-md border p-3 text-sm ${
                m.interna
                  ? 'border-atencao/40 bg-atencao/10'
                  : 'border-borda bg-fundo'
              }`}
            >
              <p className="mb-1 text-xs text-texto-suave">
                <span className="font-semibold text-texto">{m.autor.nome}</span>{' '}
                · {dataCurta(m.criadoEm)}
                {m.interna && ' · interna (só a equipe vê)'}
              </p>
              {m.conteudo && (
                <p className="whitespace-pre-wrap text-texto">{m.conteudo}</p>
              )}
              {m.anexos.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {m.anexos.map((anexo) => (
                    <li key={anexo.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setErroAoAbrir(null);
                          aoAbrirAnexo(anexo).catch((falha: unknown) =>
                            setErroAoAbrir(mensagemDoErro(falha)),
                          );
                        }}
                        className="rounded-md border border-borda bg-superficie px-2 py-1 text-xs font-medium text-primaria underline"
                      >
                        📎 {anexo.nomeArquivo}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <form
        onSubmit={(evento) => void enviar(evento)}
        className="flex flex-col gap-2"
      >
        <label className="sr-only" htmlFor="nova-mensagem">
          Nova mensagem
        </label>
        <textarea
          id="nova-mensagem"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Escreva uma mensagem"
          className="rounded-md border border-borda bg-fundo px-3 py-2 text-sm text-texto"
        />
        <input
          key={chaveDoArquivo}
          type="file"
          multiple
          accept={ANEXO.aceitos}
          aria-label="Anexar arquivos à mensagem"
          onChange={(evento) => setArquivos([...(evento.target.files ?? [])])}
          className="text-sm text-texto file:mr-3 file:h-8 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:text-sm file:text-texto"
        />
        {erroAoAbrir && (
          <p role="alert" className="text-sm text-critico">
            {erroAoAbrir}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {detalhe.pode.comentarInterno ? (
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={interna}
                onChange={(evento) => setInterna(evento.target.checked)}
              />
              Comentário interno (o solicitante não vê)
            </label>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={enviando || !podeEnviar}
            className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </section>
  );
}
