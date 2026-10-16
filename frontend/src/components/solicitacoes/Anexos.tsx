'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import {
  ANEXO,
  api,
  dataCurta,
  mensagemDoErro,
  problemaNoArquivo,
  tamanhoLegivel,
  type Anexo,
} from '@/lib/solicitacoes';

/** Tipos que o navegador mostra numa aba nova; o resto é baixado. */
const EXIBIVEIS = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Envia cada arquivo e devolve as mensagens de erro (uma por arquivo
 * recusado). Os aceitos seguem mesmo que algum falhe.
 */
export async function enviarAnexos(
  solicitacaoId: string,
  arquivos: File[],
): Promise<string[]> {
  const erros: string[] = [];
  for (const arquivo of arquivos) {
    const problema = problemaNoArquivo(arquivo);
    if (problema) {
      erros.push(problema);
      continue;
    }
    try {
      await api.anexar(solicitacaoId, arquivo);
    } catch (falha) {
      erros.push(`${arquivo.name}: ${mensagemDoErro(falha)}`);
    }
  }
  return erros;
}

/** Anexos da solicitação: lista, abrir/baixar e anexar mais. */
export function Anexos({
  solicitacaoId,
  anexos,
  podeAnexar,
  aoMudar,
}: Readonly<{
  solicitacaoId: string;
  anexos: Anexo[];
  podeAnexar: boolean;
  aoMudar: () => Promise<void>;
}>) {
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const cabem = ANEXO.porSolicitacao - anexos.length;

  async function aoEscolher(evento: ChangeEvent<HTMLInputElement>) {
    const escolhidos = [...(evento.target.files ?? [])];
    evento.target.value = '';
    if (escolhidos.length === 0) return;

    const recusadosPeloLimite =
      escolhidos.length > cabem
        ? [`Cabem só mais ${cabem} arquivo(s) nesta solicitação`]
        : [];
    setEnviando(true);
    setErros([]);
    const falhas = await enviarAnexos(
      solicitacaoId,
      escolhidos.slice(0, cabem),
    );
    setErros([...recusadosPeloLimite, ...falhas]);
    await aoMudar();
    setEnviando(false);
  }

  async function abrir(anexo: Anexo) {
    setErros([]);
    // A aba abre já no clique (senão o navegador a bloqueia como pop-up)
    // e recebe o arquivo quando ele chegar
    const exibir = EXIBIVEIS.has(anexo.tipoMime);
    const aba = exibir ? window.open('', '_blank') : null;
    try {
      const conteudo = await api.baixarAnexo(solicitacaoId, anexo.id);
      const endereco = URL.createObjectURL(conteudo);
      if (aba) {
        aba.location.href = endereco;
      } else {
        const link = document.createElement('a');
        link.href = endereco;
        link.download = anexo.nomeArquivo;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(endereco), 60_000);
    } catch (falha) {
      aba?.close();
      setErros([mensagemDoErro(falha)]);
    }
  }

  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Anexos {anexos.length > 0 && `(${anexos.length})`}
        </h2>
        {podeAnexar && cabem > 0 && (
          <>
            <button
              type="button"
              disabled={enviando}
              onClick={() => campo.current?.click()}
              className="h-8 rounded-md border border-borda px-3 text-sm text-texto hover:bg-fundo disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Anexar arquivo'}
            </button>
            <input
              ref={campo}
              type="file"
              multiple
              accept={ANEXO.aceitos}
              onChange={(e) => void aoEscolher(e)}
              className="hidden"
              aria-label="Escolher arquivos para anexar"
            />
          </>
        )}
      </div>

      {anexos.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Nenhum arquivo.{' '}
          {podeAnexar && 'PDF, imagem ou XML da nota, até 5 MB cada.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-borda">
          {anexos.map((anexo) => (
            <li
              key={anexo.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <button
                type="button"
                onClick={() => void abrir(anexo)}
                className="min-w-0 truncate text-left font-medium text-primaria underline"
                title={
                  EXIBIVEIS.has(anexo.tipoMime)
                    ? 'Abrir em outra aba'
                    : 'Baixar'
                }
              >
                {anexo.nomeArquivo}
              </button>
              <span className="text-xs text-texto-suave">
                {tamanhoLegivel(anexo.tamanhoBytes)} · {anexo.enviadoPor.nome} ·{' '}
                {dataCurta(anexo.criadoEm)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {erros.length > 0 && (
        <ul
          role="alert"
          className="mt-3 flex flex-col gap-1 rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
