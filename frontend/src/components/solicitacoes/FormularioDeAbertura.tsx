'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ErroDaApi } from '@/lib/api';
import { cadastros, hashDoArquivo, type Filial } from '@/lib/cadastros';
import { Contagem, documentosDoFormulario } from './CamposDeDocumentos';
import { MarcacoesDaAbertura, useItensDaAbertura } from './Verificacoes';
import { useSessao } from '@/lib/sessao';
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
 * Abertura de solicitação (RFC seção 3.2). Se o mesmo CTe ou NF (da mesma
 * filial) ou um dos mesmos arquivos já tiver pedido recente, a API responde
 * 409 com a lista: a pessoa vê qual é e decide entre ir até a existente ou
 * abrir mesmo assim.
 */

function descreverMotivo(d: Duplicidade): string {
  if (d.documento === 'ANEXO') return `mesmo arquivo (${d.valor})`;
  if (d.documento === 'FATURA') return `fatura ${d.valor}`;
  return `${d.documento === 'CTE' ? 'CTe' : 'NF'} ${d.valor}`;
}
export function FormularioDeAbertura() {
  const [tipo, setTipo] = useState<Tipo>('REVERSAO');
  const [cte, setCte] = useState('');
  const [nf, setNf] = useState('');
  const [fatura, setFatura] = useState('');
  const [marcados, setMarcados] = useState<string[]>([]);
  const { usuario } = useSessao();
  const itensDaAbertura = useItensDaAbertura(tipo, usuario.perfil);
  const [pagadorCorreto, setPagadorCorreto] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('MEDIA');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicidades, setDuplicidades] = useState<Duplicidade[] | null>(null);
  const [criada, setCriada] = useState<Resumo | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [errosDosAnexos, setErrosDosAnexos] = useState<string[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [filialId, setFilialId] = useState('');

  // Sem filiais cadastradas, o campo nem aparece; se a lista falhar, a API
  // ainda confere e responde com a mensagem certa
  useEffect(() => {
    let cancelado = false;
    cadastros.filiais().then(
      (lista) => {
        if (cancelado) return;
        setFiliais(lista);
        if (lista.length === 1) setFilialId(lista[0]!.id);
      },
      () => undefined,
    );
    return () => {
      cancelado = true;
    };
  }, []);

  async function enviar(confirmarDuplicidade = false) {
    setEnviando(true);
    setErro(null);
    const anexaveis = arquivos.slice(0, ANEXO.porSolicitacao);
    const hashes = (await Promise.all(anexaveis.map(hashDoArquivo))).filter(
      (h): h is string => h !== null,
    );
    const dados: DadosDeAbertura = {
      tipo,
      ...documentosDoFormulario(cte, nf, fatura),
      ...(marcadosValidos(marcados, itensDaAbertura).length > 0
        ? { verificacoes: marcadosValidos(marcados, itensDaAbertura) }
        : {}),
      pagadorCorreto:
        tipo === 'TROCA_PAGADOR'
          ? pagadorCorreto.trim() || undefined
          : undefined,
      descricao,
      prioridade,
      filialId: filialId || undefined,
      hashesDosAnexos: hashes.length > 0 ? hashes : undefined,
      confirmarDuplicidade,
    };
    try {
      const nova = await api.abrir(dados);
      // Os arquivos vão depois que a solicitação existe; se algum for
      // recusado, a solicitação continua aberta e o motivo aparece
      setErrosDosAnexos(
        anexaveis.length > 0
          ? await enviarAnexos(nova.id, anexaveis, { etapa: 'ABERTURA' })
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
    setFatura('');
    setMarcados([]);
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
        {filiais.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-texto sm:col-span-2">
            Filial que emitiu o documento
            <select
              value={filialId}
              onChange={(evento) => setFilialId(evento.target.value)}
              className={CAMPO}
            >
              <option value="">Escolha a filial</option>
              {filiais.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Número do CTe
          <textarea
            value={cte}
            onChange={(evento) => setCte(evento.target.value)}
            rows={1}
            maxLength={20000}
            placeholder="Número ou chave; vários, um por linha"
            className={`${CAMPO} min-h-10 resize-y py-2`}
          />
          <Contagem valor={cte} nome="CTe" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Número da NF
          <textarea
            value={nf}
            onChange={(evento) => setNf(evento.target.value)}
            rows={1}
            maxLength={20000}
            placeholder="Número ou chave; vários, um por linha"
            className={`${CAMPO} min-h-10 resize-y py-2`}
          />
          <Contagem valor={nf} nome="NF" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-texto">
          Fatura
          <input
            value={fatura}
            onChange={(evento) => setFatura(evento.target.value)}
            maxLength={40}
            placeholder="Quando é a fatura inteira"
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
        Informe o CTe, a NF ou a fatura (só “Outro” pode ficar sem documento).
        Fatura inteira? Cole os CTe, um por linha.
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

      <div className="contents">
        <MarcacoesDaAbertura
          itens={itensDaAbertura}
          marcados={marcados}
          aoMudar={setMarcados}
        />
      </div>
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
            Já existe solicitação recente parecida:
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
                — {descreverMotivo(d)}, {NOME_DO_STATUS[d.status].toLowerCase()}
                , aberta em {dataCurta(d.criadoEm)}
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

/** Só os marcados que ainda valem (mudar o tipo pode tirar um item). */
function marcadosValidos(
  marcados: string[],
  itens: { id: string }[],
): string[] {
  return marcados.filter((id) => itens.some((item) => item.id === id));
}
