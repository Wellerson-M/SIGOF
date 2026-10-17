'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErroDaApi } from '@/lib/api';
import {
  cadastros,
  hashDoArquivo,
  type CausaDeErro,
  type Filial,
} from '@/lib/cadastros';
import {
  ANEXO,
  NOME_DO_STATUS,
  NOME_DO_TIPO,
  TIPOS,
  api,
  dataCurta,
  mensagemDoErro,
  type Duplicidade,
  type Resumo,
  type Tipo,
} from '@/lib/solicitacoes';
import { enviarAnexos } from './Anexos';
import { CampoDoQual, temQual } from './CampoDoQual';

const CAMPO =
  'h-10 rounded-md border border-borda bg-superficie px-3 text-sm text-texto';
const ROTULO = 'flex flex-col gap-1.5 text-sm font-medium text-texto';

function descreverMotivo(d: Duplicidade): string {
  if (d.documento === 'ANEXO') return `mesmo arquivo (${d.valor})`;
  return `${d.documento === 'CTE' ? 'CTe' : 'NF'} ${d.valor}`;
}

/**
 * Registro rápido (analista e supervisor): algo que já foi resolvido por
 * fora (uma reversão feita na hora e mandada pelo WhatsApp, por exemplo)
 * entra no sistema só para ter o registro. Só o essencial: o que era e o
 * que foi feito. Nasce resolvida, sem prazo e sem avisar ninguém.
 *
 * Feito para uso em sequência: depois de registrar, o tipo e a filial
 * ficam, o resto limpa e o cursor volta para o CTe.
 */
export function FormularioDeRegistro() {
  const [tipo, setTipo] = useState<Tipo>('REVERSAO');
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [filialId, setFilialId] = useState('');
  const [cte, setCte] = useState('');
  const [nf, setNf] = useState('');
  const [pagadorCorreto, setPagadorCorreto] = useState('');
  const [oQueEra, setOQueEra] = useState('');
  const [oQueFoiFeito, setOQueFoiFeito] = useState('');
  const [causas, setCausas] = useState<CausaDeErro[]>([]);
  const [causaId, setCausaId] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [chaveDoArquivo, setChaveDoArquivo] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicidades, setDuplicidades] = useState<Duplicidade[] | null>(null);
  const [registradas, setRegistradas] = useState<Resumo[]>([]);
  const campoCte = useRef<HTMLInputElement>(null);

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
    cadastros.causas().then(
      (lista) => {
        if (!cancelado) setCausas(lista);
      },
      () => undefined,
    );
    return () => {
      cancelado = true;
    };
  }, []);

  const causa = causas.find((c) => c.id === causaId);

  async function registrar(confirmarDuplicidade = false) {
    setEnviando(true);
    setErro(null);
    const anexaveis = arquivos.slice(0, ANEXO.porSolicitacao);
    const hashes = (await Promise.all(anexaveis.map(hashDoArquivo))).filter(
      (h): h is string => h !== null,
    );
    try {
      const nova = await api.abrir({
        tipo,
        cte: cte.trim() || undefined,
        nf: nf.trim() || undefined,
        pagadorCorreto:
          tipo === 'TROCA_PAGADOR'
            ? pagadorCorreto.trim() || undefined
            : undefined,
        descricao: oQueEra,
        prioridade: 'MEDIA',
        filialId: filialId || undefined,
        hashesDosAnexos: hashes.length > 0 ? hashes : undefined,
        confirmarDuplicidade,
        registro: {
          ...(oQueFoiFeito.trim() ? { acaoTomada: oQueFoiFeito } : {}),
          ...(causa
            ? {
                classificacao: {
                  causaId: causa.id,
                  ...(detalhe ? { detalhe } : {}),
                },
              }
            : {}),
        },
      });
      const errosDosAnexos =
        anexaveis.length > 0
          ? await enviarAnexos(nova.id, anexaveis, { etapa: 'RESOLUCAO' })
          : [];
      setRegistradas((antes) => [nova, ...antes].slice(0, 10));
      setDuplicidades(null);
      // Pronto para o próximo: tipo e filial ficam
      setCte('');
      setNf('');
      setPagadorCorreto('');
      setOQueEra('');
      setOQueFoiFeito('');
      setCausaId('');
      setDetalhe('');
      setArquivos([]);
      setChaveDoArquivo((n) => n + 1);
      if (errosDosAnexos.length > 0) {
        setErro(
          `${nova.protocolo} registrada, mas alguns arquivos não foram: ${errosDosAnexos.join('; ')}`,
        );
      }
      campoCte.current?.focus();
    } catch (falha) {
      if (falha instanceof ErroDaApi && falha.status === 409) {
        const dados = falha.detalhes as { duplicidades?: Duplicidade[] };
        setDuplicidades(dados?.duplicidades ?? []);
      } else {
        setErro(mensagemDoErro(falha));
      }
    } finally {
      setEnviando(false);
    }
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    void registrar();
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={ROTULO}>
            Tipo
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
          {filiais.length > 0 && (
            <label className={ROTULO}>
              Filial
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
          <label className={ROTULO}>
            CTe
            <input
              ref={campoCte}
              value={cte}
              onChange={(evento) => setCte(evento.target.value)}
              inputMode="numeric"
              maxLength={60}
              className={CAMPO}
            />
          </label>
          <label className={ROTULO}>
            NF
            <input
              value={nf}
              onChange={(evento) => setNf(evento.target.value)}
              inputMode="numeric"
              maxLength={60}
              className={CAMPO}
            />
          </label>
          {tipo === 'TROCA_PAGADOR' && (
            <label className={`${ROTULO} sm:col-span-2`}>
              Pagador correto
              <input
                value={pagadorCorreto}
                onChange={(evento) => setPagadorCorreto(evento.target.value)}
                maxLength={200}
                className={CAMPO}
              />
            </label>
          )}
          <label className={`${ROTULO} sm:col-span-2`}>
            O que era
            <input
              value={oQueEra}
              onChange={(evento) => setOQueEra(evento.target.value)}
              maxLength={5000}
              placeholder="Ex.: reversão pedida pelo cliente no WhatsApp"
              className={CAMPO}
            />
          </label>
          <label className={`${ROTULO} sm:col-span-2`}>
            O que foi feito
            <input
              value={oQueFoiFeito}
              onChange={(evento) => setOQueFoiFeito(evento.target.value)}
              maxLength={2000}
              placeholder="Ex.: CTe de reversão emitido e enviado"
              className={CAMPO}
            />
          </label>
          {causas.length > 0 && (
            <label className={ROTULO}>
              De quem foi o erro
              <select
                value={causaId}
                onChange={(evento) => {
                  setCausaId(evento.target.value);
                  setDetalhe('');
                }}
                className={CAMPO}
              >
                <option value="">Escolha</option>
                {causas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {temQual(causa) && (
            <CampoDoQual
              causa={causa!}
              valor={detalhe}
              aoMudar={setDetalhe}
              className={CAMPO}
              classeDoRotulo={ROTULO}
            />
          )}
          <label className={`${ROTULO} sm:col-span-2`}>
            Anexos
            <input
              key={chaveDoArquivo}
              type="file"
              multiple
              accept={ANEXO.aceitos}
              onChange={(evento) =>
                setArquivos([...(evento.target.files ?? [])])
              }
              className="text-sm text-texto file:mr-3 file:h-9 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:text-sm file:text-texto"
            />
          </label>
        </div>

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
                  — {descreverMotivo(d)},{' '}
                  {NOME_DO_STATUS[d.status].toLowerCase()}, aberta em{' '}
                  {dataCurta(d.criadoEm)}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void registrar(true)}
                className="h-9 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
              >
                Registrar mesmo assim
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
              disabled={enviando || !oQueEra.trim()}
              className="h-10 rounded-md bg-primaria px-5 text-sm font-semibold text-sobre-primaria disabled:opacity-50"
            >
              {enviando ? 'Registrando…' : 'Registrar como concluída'}
            </button>
          </div>
        )}
      </form>

      {registradas.length > 0 && (
        <section
          role="status"
          className="rounded-lg border border-ok/40 bg-ok/10 p-4"
        >
          <h2 className="mb-2 text-sm font-semibold text-texto">
            Registradas agora
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-texto">
            {registradas.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/solicitacoes/${r.id}`}
                  className="font-mono font-semibold text-primaria underline"
                >
                  {r.protocolo}
                </Link>{' '}
                — {NOME_DO_TIPO[r.tipo]}
                {r.cte ? `, CTe ${r.cte}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
