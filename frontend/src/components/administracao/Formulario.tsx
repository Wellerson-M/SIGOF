'use client';

import { useEffect, useState } from 'react';
import {
  Alerta,
  Aviso,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import {
  CAMPOS_COM_PADRAO,
  NOME_DO_CAMPO,
  NOME_DO_MODO,
  configuracao,
  type ConfiguracaoDoTipo,
  type FormularioDaEmpresa,
  type Modo,
  type NomeDoCampo,
} from '@/lib/configuracao';
import { useSessao } from '@/lib/sessao';
import {
  NOME_DA_PRIORIDADE,
  PRIORIDADES,
  mensagemDoErro,
  type Tipo,
} from '@/lib/solicitacoes';

const ORDEM: NomeDoCampo[] = [
  'cte',
  'nf',
  'fatura',
  'filial',
  'motivo',
  'pagadorCorreto',
  'prioridade',
  'descricao',
  'anexos',
];

const MODOS: Modo[] = ['OCULTO', 'OPCIONAL', 'OBRIGATORIO'];

/** O que cada modo quer dizer naquele campo, quando não é o óbvio. */
const DICA: Partial<Record<NomeDoCampo, string>> = {
  filial:
    'Opcional: se ficar em branco, quem abre recebe um aviso antes de confirmar.',
  motivo:
    'Não aparece: o formulário não pede motivo. Opcional ou obrigatório: quem abre escolhe um da lista abaixo.',
  prioridade:
    'Escondida: toda solicitação nasce com a prioridade padrão (a equipe muda depois).',
  anexos: 'Obrigatório: a tela não deixa abrir sem pelo menos um arquivo.',
};

/** Linhas da caixa de texto viram a lista de motivos. */
function motivosDoTexto(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
}

/**
 * Os tipos de ocorrência da empresa e o formulário de abertura de cada um:
 * nome, que campos aparecem, quais são obrigatórios, o que já vem
 * preenchido e os motivos para escolher (ex.: os motivos da reversão). A
 * empresa também cria os seus tipos.
 */
export function Formulario() {
  const { atualizar } = useSessao();
  const [formulario, setFormulario] = useState<FormularioDaEmpresa | null>(
    null,
  );
  const [tipo, setTipo] = useState<Tipo>('REVERSAO');
  const [rascunho, setRascunho] = useState<ConfiguracaoDoTipo | null>(null);
  const [motivos, setMotivos] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nomeDoNovo, setNomeDoNovo] = useState('');

  /** O rascunho recomeça do que está salvo para o tipo. */
  function editarTipo(config: ConfiguracaoDoTipo) {
    setTipo(config.tipo);
    setRascunho(config);
    setMotivos(config.motivos.join('\n'));
  }

  useEffect(() => {
    let cancelado = false;
    configuracao.formulario(true).then(
      (dados) => {
        if (cancelado) return;
        setFormulario(dados);
        const primeiro = dados.tipos[0];
        if (primeiro) {
          setTipo(primeiro.tipo);
          setRascunho(primeiro);
          setMotivos(primeiro.motivos.join('\n'));
        }
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  function mudarCampo(
    nome: NomeDoCampo,
    mudanca: Partial<{ modo: Modo; padrao: string }>,
  ) {
    setSalvo(null);
    setRascunho((atual) =>
      atual
        ? {
            ...atual,
            campos: {
              ...atual.campos,
              [nome]: { ...atual.campos[nome], ...mudanca },
            },
          }
        : atual,
    );
  }

  function guardar(config: ConfiguracaoDoTipo, mensagem: string) {
    setFormulario((atual) =>
      atual
        ? {
            ...atual,
            tipos: atual.tipos.map((t) =>
              t.tipo === config.tipo ? config : t,
            ),
          }
        : atual,
    );
    editarTipo(config);
    setSalvo(mensagem);
    // Os nomes dos tipos aparecem no quadro, na lista e nos filtros
    void atualizar().catch(() => undefined);
  }

  /** Trava a tela enquanto fala com a API e mostra o erro, se houver. */
  async function executar(acao: () => Promise<void>) {
    setSalvando(true);
    setErro(null);
    setSalvo(null);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  function criar() {
    void executar(async () => {
      const criado = await configuracao.criarTipo(nomeDoNovo);
      setFormulario((atual) =>
        atual ? { ...atual, tipos: [...atual.tipos, criado] } : atual,
      );
      setNomeDoNovo('');
      guardar(
        criado,
        'Tipo criado. Ajuste o formulário dele e salve; ele já aparece para quem abre.',
      );
    });
  }

  function excluir() {
    if (!rascunho) return;
    if (
      !window.confirm(
        `Excluir o tipo “${rascunho.nome}”? Só dá para excluir tipo que nunca foi usado.`,
      )
    ) {
      return;
    }
    void executar(async () => {
      await configuracao.excluirTipo(tipo);
      const restantes = formulario?.tipos.filter((t) => t.tipo !== tipo) ?? [];
      setFormulario((atual) =>
        atual ? { ...atual, tipos: restantes } : atual,
      );
      if (restantes[0]) editarTipo(restantes[0]);
      setSalvo('Tipo excluído.');
      void atualizar().catch(() => undefined);
    });
  }

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro(null);
    try {
      const lista = motivosDoTexto(motivos);
      // Motivo padrão que saiu da lista deixa de ser o padrão
      const motivo = lista.includes(rascunho.campos.motivo.padrao ?? '')
        ? rascunho.campos.motivo
        : { modo: rascunho.campos.motivo.modo };
      guardar(
        await configuracao.alterarFormulario(tipo, {
          nome: rascunho.nome,
          ativo: rascunho.ativo,
          exigirDocumento: rascunho.exigirDocumento,
          campos: { ...rascunho.campos, motivo },
          motivos: lista,
        }),
        'Formulário salvo. Vale para as próximas solicitações.',
      );
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    setSalvando(true);
    setErro(null);
    try {
      guardar(
        await configuracao.restaurarFormulario(tipo),
        'Voltou ao padrão do sistema.',
      );
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  if (!formulario || !rascunho) {
    return erro ? (
      <Alerta>{erro}</Alerta>
    ) : (
      <p className="text-sm text-texto-suave">Carregando…</p>
    );
  }

  const editavel = formulario.personalizavel && !salvando;
  const listaDeMotivos = motivosDoTexto(motivos);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-texto-suave">
        Dê nome aos tipos de ocorrência, crie os da sua empresa e monte o
        formulário de abertura de cada um. O que já vem preenchido pode ser
        trocado por quem abre; o que fica escondido não é pedido. Vale para as
        próximas solicitações.
      </p>
      {!formulario.personalizavel && (
        <Aviso>
          O módulo “Formulário personalizado” está desligado: vale o padrão do
          sistema, mostrado abaixo. Ligue-o na aba Módulos para alterar.
        </Aviso>
      )}

      <div
        role="tablist"
        aria-label="Tipos de ocorrência"
        className="flex flex-wrap gap-1"
      >
        {formulario.tipos.map((t) => (
          <button
            key={t.tipo}
            type="button"
            role="tab"
            aria-selected={t.tipo === tipo}
            onClick={() => {
              editarTipo(t);
              setSalvo(null);
              setErro(null);
            }}
            className="h-8 rounded-md border border-borda px-3 text-sm text-texto aria-selected:border-primaria aria-selected:bg-primaria aria-selected:text-sobre-primaria"
          >
            {t.nome}
            {!t.ativo && ' (desligado)'}
          </button>
        ))}
      </div>

      {formulario.personalizavel && (
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            criar();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className={ROTULO}>
            Novo tipo de ocorrência
            <input
              value={nomeDoNovo}
              onChange={(evento) => setNomeDoNovo(evento.target.value)}
              maxLength={60}
              placeholder="Ex.: Cobrança em duplicidade"
              className={`${CAMPO} w-72`}
            />
          </label>
          <button
            type="submit"
            disabled={salvando || nomeDoNovo.trim().length < 2}
            className={BOTAO_SECUNDARIO}
          >
            Criar tipo
          </button>
        </form>
      )}

      <fieldset
        disabled={!editavel}
        className="flex flex-col gap-4 rounded-md border border-borda bg-superficie p-4"
      >
        <label className={ROTULO}>
          Nome do tipo
          <input
            value={rascunho.nome}
            onChange={(evento) => {
              setSalvo(null);
              setRascunho({ ...rascunho, nome: evento.target.value });
            }}
            maxLength={60}
            className={`${CAMPO} w-72`}
          />
        </label>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              checked={rascunho.ativo}
              onChange={(evento) => {
                setSalvo(null);
                setRascunho({ ...rascunho, ativo: evento.target.checked });
              }}
            />
            Tipo em uso (aparece para quem abre)
          </label>
          <label className="flex items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              checked={rascunho.exigirDocumento}
              onChange={(evento) => {
                setSalvo(null);
                setRascunho({
                  ...rascunho,
                  exigirDocumento: evento.target.checked,
                });
              }}
            />
            Exigir pelo menos um documento (CTe, NF ou fatura)
          </label>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-texto-suave">
            <tr>
              <th className="py-1 pr-3 font-semibold">Campo</th>
              <th className="py-1 pr-3 font-semibold">Como aparece</th>
              <th className="py-1 font-semibold">Já vem preenchido com</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {ORDEM.map((nome) => {
              const campo = rascunho.campos[nome];
              return (
                <tr key={nome} className="align-top">
                  <td className="py-2 pr-3 font-medium text-texto">
                    {NOME_DO_CAMPO[nome]}
                    {DICA[nome] && (
                      <p className="max-w-56 text-xs font-normal text-texto-suave">
                        {DICA[nome]}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Como aparece: ${NOME_DO_CAMPO[nome]}`}
                      value={campo.modo}
                      onChange={(evento) =>
                        mudarCampo(nome, { modo: evento.target.value as Modo })
                      }
                      className={CAMPO}
                    >
                      {MODOS.filter(
                        (m) => !(nome === 'descricao' && m === 'OCULTO'),
                      ).map((m) => (
                        <option key={m} value={m}>
                          {NOME_DO_MODO[m]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <CampoDoPadrao
                      nome={nome}
                      valor={campo.padrao ?? ''}
                      motivos={listaDeMotivos}
                      aoMudar={(padrao) => mudarCampo(nome, { padrao })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rascunho.campos.motivo.modo !== 'OCULTO' && (
          <label className={ROTULO}>
            Motivos para escolher (um por linha)
            <textarea
              value={motivos}
              onChange={(evento) => {
                setSalvo(null);
                setMotivos(evento.target.value);
              }}
              rows={5}
              maxLength={5000}
              className="rounded-md border border-borda bg-fundo px-3 py-2 text-sm text-texto"
            />
          </label>
        )}
      </fieldset>

      {erro && <Alerta>{erro}</Alerta>}
      {salvo && <Aviso>{salvo}</Aviso>}

      {formulario.personalizavel && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={salvando}
            onClick={() => void salvar()}
            className={BOTAO_PRIMARIO}
          >
            {salvando ? 'Salvando…' : 'Salvar formulário'}
          </button>
          {rascunho.doSistema ? (
            <button
              type="button"
              disabled={salvando}
              onClick={() => void restaurar()}
              className={BOTAO_SECUNDARIO}
            >
              Voltar ao padrão
            </button>
          ) : (
            <button
              type="button"
              disabled={salvando}
              onClick={excluir}
              className={BOTAO_SECUNDARIO}
            >
              Excluir tipo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CampoDoPadrao({
  nome,
  valor,
  motivos,
  aoMudar,
}: Readonly<{
  nome: NomeDoCampo;
  valor: string;
  motivos: string[];
  aoMudar: (valor: string) => void;
}>) {
  const rotulo = `Já vem preenchido: ${NOME_DO_CAMPO[nome]}`;
  if (!CAMPOS_COM_PADRAO.includes(nome)) {
    return <span className="text-xs text-texto-suave">—</span>;
  }
  if (nome === 'prioridade') {
    return (
      <select
        aria-label={rotulo}
        value={valor || 'MEDIA'}
        onChange={(evento) => aoMudar(evento.target.value)}
        className={CAMPO}
      >
        {PRIORIDADES.map((p) => (
          <option key={p} value={p}>
            {NOME_DA_PRIORIDADE[p]}
          </option>
        ))}
      </select>
    );
  }
  if (nome === 'motivo') {
    return (
      <select
        aria-label={rotulo}
        value={motivos.includes(valor) ? valor : ''}
        onChange={(evento) => aoMudar(evento.target.value)}
        className={CAMPO}
      >
        <option value="">Nenhum</option>
        {motivos.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    );
  }
  if (nome === 'descricao') {
    return (
      <textarea
        aria-label={rotulo}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Ex.: Cliente: / O que mudar:"
        className="w-full rounded-md border border-borda bg-fundo px-3 py-2 text-sm text-texto"
      />
    );
  }
  return (
    <input
      aria-label={rotulo}
      value={valor}
      onChange={(evento) => aoMudar(evento.target.value)}
      maxLength={200}
      className={`${CAMPO} w-full`}
    />
  );
}
