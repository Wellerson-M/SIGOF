'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Alerta,
  Aviso,
  BOTAO_PRIMARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import {
  DIAS_DA_SEMANA,
  FUSOS,
  admin,
  horaParaMinutos,
  minutosParaHora,
  type ParametrosDaEmpresa as Parametros,
} from '@/lib/administracao';
import { mensagemDoErro } from '@/lib/solicitacoes';

interface Formulario {
  razaoSocial: string;
  fusoHorario: string;
  inicio: string;
  fim: string;
  diasUteis: number[];
  /** Em horas, que é como as pessoas falam do prazo ("4 horas úteis"). */
  slaHoras: string;
  janelaDuplicidadeDias: string;
  exigirCausaAoResolver: boolean;
  diasNoQuadro: string;
  minutosParaExcluirAnexo: string;
  analistaAtribui: boolean;
}

function paraFormulario(p: Parametros): Formulario {
  return {
    razaoSocial: p.razaoSocial,
    fusoHorario: p.fusoHorario,
    inicio: minutosParaHora(p.expedienteInicioMinuto),
    fim: minutosParaHora(p.expedienteFimMinuto),
    diasUteis: p.diasUteis,
    slaHoras: String(p.slaAtendimentoMinutos / 60),
    janelaDuplicidadeDias: String(p.janelaDuplicidadeDias),
    exigirCausaAoResolver: p.exigirCausaAoResolver,
    diasNoQuadro: String(p.diasNoQuadroDepoisDeEncerrar ?? 30),
    minutosParaExcluirAnexo: String(p.minutosParaExcluirAnexo ?? 15),
    analistaAtribui: p.analistaAtribui ?? true,
  };
}

/** Expediente, prazo de atendimento e regra de duplicidade da empresa. */
export function ParametrosDaEmpresa() {
  const [parametros, setParametros] = useState<Parametros | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    admin.empresa().then(
      (dados) => {
        if (cancelado) return;
        setParametros(dados);
        setFormulario(paraFormulario(dados));
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  if (!parametros || !formulario) {
    return erro ? (
      <Alerta>{erro}</Alerta>
    ) : (
      <p className="text-sm text-texto-suave">Carregando…</p>
    );
  }

  const mudar = (parte: Partial<Formulario>) => {
    setSalvo(false);
    setFormulario({ ...formulario, ...parte });
  };

  function alternarDia(dia: number) {
    if (!formulario) return;
    const dias = formulario.diasUteis.includes(dia)
      ? formulario.diasUteis.filter((d) => d !== dia)
      : [...formulario.diasUteis, dia];
    mudar({ diasUteis: dias.sort((a, b) => a - b) });
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    setErro(null);
    setSalvando(true);
    try {
      const dados = await admin.alterarEmpresa({
        razaoSocial: formulario.razaoSocial,
        fusoHorario: formulario.fusoHorario,
        expedienteInicioMinuto: horaParaMinutos(formulario.inicio),
        expedienteFimMinuto: horaParaMinutos(formulario.fim),
        diasUteis: formulario.diasUteis,
        slaAtendimentoMinutos: Math.round(
          Number(formulario.slaHoras.replace(',', '.')) * 60,
        ),
        janelaDuplicidadeDias: Number(formulario.janelaDuplicidadeDias),
        exigirCausaAoResolver: formulario.exigirCausaAoResolver,
        diasNoQuadroDepoisDeEncerrar: Number(formulario.diasNoQuadro),
        minutosParaExcluirAnexo: Number(formulario.minutosParaExcluirAnexo),
        analistaAtribui: formulario.analistaAtribui,
      });
      setParametros(dados);
      setFormulario(paraFormulario(dados));
      setSalvo(true);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  const fusoConhecido = FUSOS.some((f) => f.valor === formulario.fusoHorario);

  return (
    <form
      onSubmit={(e) => void salvar(e)}
      className="flex max-w-2xl flex-col gap-5"
    >
      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Empresa
        </legend>
        <label className={ROTULO}>
          Razão social
          <input
            value={formulario.razaoSocial}
            onChange={(e) => mudar({ razaoSocial: e.target.value })}
            required
            minLength={2}
            maxLength={200}
            className={CAMPO}
          />
        </label>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="block text-xs text-texto-suave">CNPJ</span>
            <span className="font-mono">{parametros.cnpj}</span>
          </p>
          <p>
            <span className="block text-xs text-texto-suave">
              Código da empresa (usado no login)
            </span>
            <span className="font-mono">{parametros.slug}</span>
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Expediente
        </legend>
        <p className="text-sm text-texto-suave">
          O prazo de atendimento só corre dentro do expediente: uma solicitação
          aberta às 17h de sexta continua contando na segunda.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ROTULO}>
            Começa às
            <input
              type="time"
              value={formulario.inicio}
              onChange={(e) => mudar({ inicio: e.target.value })}
              required
              className={CAMPO}
            />
          </label>
          <label className={ROTULO}>
            Termina às
            <input
              type="time"
              value={formulario.fim}
              onChange={(e) => mudar({ fim: e.target.value })}
              required
              className={CAMPO}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-texto">Dias úteis</span>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_DA_SEMANA.map((nome, dia) => (
              <label
                key={nome}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-borda px-2.5 text-sm has-[:checked]:border-primaria has-[:checked]:bg-primaria/10"
              >
                <input
                  type="checkbox"
                  checked={formulario.diasUteis.includes(dia)}
                  onChange={() => alternarDia(dia)}
                />
                {nome}
              </label>
            ))}
          </div>
        </div>
        <label className={ROTULO}>
          Fuso horário
          <select
            value={formulario.fusoHorario}
            onChange={(e) => mudar({ fusoHorario: e.target.value })}
            className={CAMPO}
          >
            {!fusoConhecido && (
              <option value={formulario.fusoHorario}>
                {formulario.fusoHorario}
              </option>
            )}
            {FUSOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Atendimento
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ROTULO}>
            Prazo de atendimento (horas úteis)
            <input
              type="number"
              min={0.25}
              max={168}
              step={0.25}
              value={formulario.slaHoras}
              onChange={(e) => mudar({ slaHoras: e.target.value })}
              required
              className={CAMPO}
            />
          </label>
          <label className={ROTULO}>
            Alerta de duplicidade (dias)
            <input
              type="number"
              min={0}
              max={90}
              step={1}
              value={formulario.janelaDuplicidadeDias}
              onChange={(e) => mudar({ janelaDuplicidadeDias: e.target.value })}
              required
              className={CAMPO}
            />
          </label>
        </div>
        <p className="text-sm text-texto-suave">
          O novo prazo vale para as solicitações abertas daqui para frente. O
          alerta avisa quando o mesmo CTe ou NF já teve solicitação nesse
          período (0 desliga).
        </p>
        <label className="flex items-start gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={formulario.exigirCausaAoResolver}
            onChange={(e) => mudar({ exigirCausaAoResolver: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Exigir “De quem foi o erro” ao resolver
            <span className="block text-xs text-texto-suave">
              A lista de causas fica na aba Causas de erro. Desligado, o campo
              aparece mas pode ficar em branco.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Quadro e anexos
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ROTULO}>
            Encerradas ficam no quadro por (dias)
            <input
              type="number"
              min={0}
              max={90}
              step={1}
              value={formulario.diasNoQuadro}
              onChange={(e) => mudar({ diasNoQuadro: e.target.value })}
              required
              className={CAMPO}
            />
          </label>
          <label className={ROTULO}>
            Prazo para excluir um anexo enviado (minutos)
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              value={formulario.minutosParaExcluirAnexo}
              onChange={(e) =>
                mudar({ minutosParaExcluirAnexo: e.target.value })
              }
              required
              className={CAMPO}
            />
          </label>
        </div>
        <p className="text-sm text-texto-suave">
          Depois do prazo do quadro, a encerrada continua na Lista. Só quem
          enviou exclui o anexo, e só dentro do prazo (módulo “Excluir anexo
          enviado”).
        </p>
        <label className="flex items-start gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={formulario.analistaAtribui}
            onChange={(e) => mudar({ analistaAtribui: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            O analista também passa a solicitação para alguém
            <span className="block text-xs text-texto-suave">
              O supervisor sempre pode. Desligado, o analista só assume a dele.
            </span>
          </span>
        </label>
      </fieldset>

      {erro && <Alerta>{erro}</Alerta>}
      {salvo && <Aviso>Parâmetros salvos.</Aviso>}

      <div>
        <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
          {salvando ? 'Salvando…' : 'Salvar parâmetros'}
        </button>
      </div>
    </form>
  );
}
