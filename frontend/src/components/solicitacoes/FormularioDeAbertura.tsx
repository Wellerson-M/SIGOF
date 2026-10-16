'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ErroDaApi } from '@/lib/api';
import { enviarAnexos } from './Anexos';
import {
  NOME_DA_PRIORIDADE,
  NOME_DO_STATUS,
  NOME_DO_TIPO,
  PRIORIDADES,
  ANEXO,
  TIPOS,
  api,
  dataCurta,
  mensagemDoErro,
  type DadosDeAbertura,
  type Duplicidade,
  type Prioridade,
  type Resumo,
  type Tipo,
} from '@/lib/solicitacoes';

const CAMPO =
  'h-10 rounded-md border border-borda bg-superficie px-3 text-sm text-texto';

/**
 * Abertura de solicitação (RFC seção 3.2). Se o mesmo CTe ou NF já tiver
 * pedido recente, a API responde 409 com a lista: a pessoa vê qual é e
 * decide entre ir até a existente ou abrir mesmo assim.
 */
export function FormularioDeAbertura() {
  const [tipo, setTipo] = useState<Tipo>('REVERSAO');
  const [cte, setCte] = useState('');
  const [nf, setNf] = useState('');
  const [pagadorCorreto, setPagadorCorreto] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('MEDIA');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicidades, setDuplicidades] = useState<Duplicidade[] | null>(null);
  const [criada, setCriada] = useState<Resumo | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [errosDosAnexos, setErrosDosAnexos] = useState<string[]>([]);

  async function enviar(confirmarDuplicidade = false) {
    setEnviando(true);
    setErro(null);
    const dados: DadosDeAbertura = {
      tipo,
      cte: cte.trim() || undefined,
      nf: nf.trim() || undefined,
      pagadorCorreto:
        tipo === 'TROCA_PAGADOR'
          ? pagadorCorreto.trim() || undefined
          : undefined,
      descricao,
      prioridade,
      confirmarDuplicidade,
    };
    try {
      const nova = await api.abrir(dados);
      // Os arquivos vão depois que a solicitação existe; se algum for
      // recusado, a solicitação continua aberta e o motivo aparece
      setErrosDosAnexos(
        arquivos.length > 0
          ? await enviarAnexos(nova.id, arquivos.slice(0, ANEXO.porSolicitacao))
          : [],
      );
      setCriada(nova);
      setDuplicidades(null);
    } catch (falha) {
      if (falha instanceof ErroDaApi && falha.status === 409) {
        const detalhes = falha.detalhes as { duplicidades?: Duplicidade[] };
        setDuplicidades(detalhes?.duplicidades ?? []);
      } else {
        setErro(mensagemDoErro(falha));
      }
    } finally {
      setEnviando(false);
    }
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    void enviar();
  }

  function recomecar() {
    setCte('');
    setNf('');
    setPagadorCorreto('');
    setDescricao('');
    setPrioridade('MEDIA');
    setArquivos([]);
    setErrosDosAnexos([]);
    setCriada(null);
  }

  if (criada) {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-lg border border-ok/40 bg-ok/10 p-5"
      >
        <p className="text-base font-semibold text-texto">
          Solicitação aberta:{' '}
          <span className="font-mono">{criada.protocolo}</span>
        </p>
        <p className="text-sm text-texto-suave">
          Ela já está na coluna “Novo” do quadro, aguardando um analista.
        </p>
        {errosDosAnexos.length > 0 && (
          <div className="rounded-md border border-atencao/40 bg-atencao/10 px-3 py-2 text-sm text-texto">
            <p className="font-medium">Alguns arquivos não foram anexados:</p>
            <ul className="list-disc pl-5">
              {errosDosAnexos.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p>Você pode anexá-los de novo no detalhe da solicitação.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/solicitacoes/${criada.id}`}
            className="inline-flex h-9 items-center rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria"
          >
            Ver a solicitação
          </Link>
          <Link
            href="/solicitacoes"
            className="inline-flex h-9 items-center rounded-md border border-borda px-4 text-sm text-texto"
          >
            Ir para o quadro
          </Link>
          <button
            type="button"
            onClick={recomecar}
            className="h-9 rounded-md border border-borda px-4 text-sm text-texto"
          >
            Abrir outra
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Tipo de ocorrência
          <select
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value as Tipo)}
            className={CAMPO}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOME_DO_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Prioridade
          <select
            value={prioridade}
            onChange={(evento) =>
              setPrioridade(evento.target.value as Prioridade)
            }
            className={CAMPO}
          >
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {NOME_DA_PRIORIDADE[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Número do CTe
          <input
            value={cte}
            onChange={(evento) => setCte(evento.target.value)}
            inputMode="numeric"
            maxLength={60}
            placeholder="Número ou chave de acesso"
            className={CAMPO}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Número da NF
          <input
            value={nf}
            onChange={(evento) => setNf(evento.target.value)}
            inputMode="numeric"
            maxLength={60}
            placeholder="Número ou chave de acesso"
            className={CAMPO}
          />
        </label>
        {tipo === 'TROCA_PAGADOR' && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-texto sm:col-span-2">
            Pagador correto
            <input
              value={pagadorCorreto}
              onChange={(evento) => setPagadorCorreto(evento.target.value)}
              maxLength={200}
              placeholder="Nome ou CNPJ de quem deve pagar o frete"
              className={CAMPO}
            />
          </label>
        )}
      </div>
      <p className="-mt-2 text-xs text-texto-suave">
        Informe o CTe, a NF ou os dois (só “Outro” pode ficar sem documento).
      </p>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
        O que precisa ser corrigido
        <textarea
          value={descricao}
          onChange={(evento) => setDescricao(evento.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="Descreva o problema e o que espera que seja feito"
          className="rounded-md border border-borda bg-superficie px-3 py-2 text-sm text-texto"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
        Anexos (opcional)
        <input
          type="file"
          multiple
          accept={ANEXO.aceitos}
          onChange={(evento) => setArquivos([...(evento.target.files ?? [])])}
          className="text-sm text-texto file:mr-3 file:h-9 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:text-sm file:text-texto"
        />
        <span className="text-xs font-normal text-texto-suave">
          PDF, imagem ou XML da nota, até 5 MB cada e no máximo{' '}
          {ANEXO.porSolicitacao} arquivos.
        </span>
      </label>

      {erro && (
        <p
          role="alert"
          className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {erro}
        </p>
      )}

      {duplicidades ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-atencao/50 bg-atencao/10 p-4"
        >
          <p className="text-sm font-semibold text-texto">
            Este documento já tem solicitação recente:
          </p>
          <ul className="flex flex-col gap-1 text-sm text-texto">
            {duplicidades.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/solicitacoes/${d.id}`}
                  className="font-mono font-semibold text-primaria underline"
                >
                  {d.protocolo}
                </Link>{' '}
                — {d.documento === 'CTE' ? 'CTe' : 'NF'} {d.valor},{' '}
                {NOME_DO_STATUS[d.status].toLowerCase()}, aberta em{' '}
                {dataCurta(d.criadoEm)}
              </li>
            ))}
          </ul>
          <p className="text-sm text-texto-suave">
            Se for o mesmo problema, acompanhe pela solicitação que já existe.
            Se for outro, pode abrir mesmo assim.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => void enviar(true)}
              className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
            >
              Abrir mesmo assim
            </button>
            <button
              type="button"
              onClick={() => setDuplicidades(null)}
              className="h-9 rounded-md border border-borda px-4 text-sm text-texto"
            >
              Corrigir os dados
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="submit"
            disabled={enviando}
            className="h-10 rounded-md bg-primaria px-5 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
          >
            {enviando ? 'Abrindo…' : 'Abrir solicitação'}
          </button>
        </div>
      )}
    </form>
  );
}
