'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alerta,
  Aviso,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import {
  COR_DA_SITUACAO,
  GMAIL,
  NOME_DA_SITUACAO,
  email,
  type ConfiguracaoDeEmail,
  type EnvioRegistrado,
} from '@/lib/avisos';
import { dataCurta, mensagemDoErro } from '@/lib/solicitacoes';

interface Formulario {
  ativo: boolean;
  servidor: string;
  porta: string;
  tlsDireto: boolean;
  usuario: string;
  senha: string;
  nomeDoRemetente: string;
  /** Um endereço por linha. */
  caixasCentrais: string;
}

function paraFormulario(c: ConfiguracaoDeEmail): Formulario {
  return {
    ativo: c.ativo,
    servidor: c.servidor ?? '',
    porta: c.porta ? String(c.porta) : '',
    tlsDireto: c.tlsDireto,
    usuario: c.usuario ?? '',
    senha: '',
    nomeDoRemetente: c.nomeDoRemetente ?? '',
    caixasCentrais: c.caixasCentrais.join('\n'),
  };
}

/**
 * E-mail de envio (de onde saem os avisos) e caixa central (que recebe
 * cópia de tudo), configurados pelo administrador.
 */
export function Email() {
  const [config, setConfig] = useState<ConfiguracaoDeEmail | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [envios, setEnvios] = useState<EnvioRegistrado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [destinoDoTeste, setDestinoDoTeste] = useState('');

  const carregarEnvios = useCallback(async () => {
    try {
      setEnvios((await email.envios()).envios);
    } catch {
      setEnvios([]);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    Promise.all([email.obter(), email.envios()]).then(
      ([dados, lista]) => {
        if (cancelado) return;
        setConfig(dados);
        setFormulario(paraFormulario(dados));
        setEnvios(lista.envios);
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  if (!config || !formulario) {
    return erro ? (
      <Alerta>{erro}</Alerta>
    ) : (
      <p className="text-sm text-texto-suave">Carregando…</p>
    );
  }

  const mudar = (parte: Partial<Formulario>) => {
    setAviso(null);
    setFormulario({ ...formulario, ...parte });
  };

  async function executar(acao: () => Promise<string>) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      setAviso(await acao());
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setOcupado(false);
      await carregarEnvios();
    }
  }

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    void executar(async () => {
      const dados = await email.alterar({
        ativo: formulario.ativo,
        servidor: formulario.servidor,
        porta: formulario.porta ? Number(formulario.porta) : null,
        tlsDireto: formulario.tlsDireto,
        usuario: formulario.usuario,
        ...(formulario.senha ? { senha: formulario.senha } : {}),
        nomeDoRemetente: formulario.nomeDoRemetente,
        caixasCentrais: formulario.caixasCentrais
          .split(/[\n,;]/)
          .map((linha) => linha.trim())
          .filter(Boolean),
      });
      setConfig(dados);
      setFormulario(paraFormulario(dados));
      return dados.ativo
        ? 'Configuração salva. Os avisos já saem por e-mail.'
        : 'Configuração salva. O envio está desligado.';
    });
  }

  function testar() {
    void executar(async () => {
      const { enviadoPara } = await email.testar(destinoDoTeste || undefined);
      return `E-mail de teste enviado para ${enviadoPara}. Confira a caixa de entrada (e o spam).`;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={salvar} className="flex max-w-2xl flex-col gap-5">
        <fieldset className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
            Caixa central
          </legend>
          <label className={ROTULO}>
            E-mails que recebem cópia de tudo
            <textarea
              value={formulario.caixasCentrais}
              onChange={(e) => mudar({ caixasCentrais: e.target.value })}
              rows={3}
              placeholder={
                'ocorrencias@suaempresa.com.br\ngerente@suaempresa.com.br'
              }
              className="rounded-md border border-borda bg-superficie px-3 py-2 text-sm text-texto"
            />
            <span className="text-xs font-normal text-texto-suave">
              Um por linha (até 10). Recebem cada abertura e movimentação, como
              registro. Além deles, recebem o e-mail cadastrado de quem abriu a
              solicitação e do responsável; quem fez a movimentação não recebe
              aviso do que ele mesmo fez. Nota interna e registro rápido não
              saem por e-mail.
            </span>
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
            E-mail de envio
          </legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-texto-suave">
              A conta de onde os avisos saem. Cada protocolo vira uma única
              conversa no e-mail, e toda mensagem avisa que é automática.
            </p>
            <button
              type="button"
              onClick={() =>
                mudar({
                  servidor: GMAIL.servidor,
                  porta: String(GMAIL.porta),
                  tlsDireto: GMAIL.tlsDireto,
                })
              }
              className={BOTAO_SECUNDARIO}
            >
              Usar Gmail
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <label className={ROTULO}>
              Servidor (SMTP)
              <input
                value={formulario.servidor}
                onChange={(e) => mudar({ servidor: e.target.value })}
                placeholder="smtp.gmail.com"
                className={CAMPO}
              />
            </label>
            <label className={ROTULO}>
              Porta
              <input
                type="number"
                min={1}
                max={65535}
                value={formulario.porta}
                onChange={(e) => mudar({ porta: e.target.value })}
                placeholder="465"
                className={CAMPO}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              checked={formulario.tlsDireto}
              onChange={(e) => mudar({ tlsDireto: e.target.checked })}
            />
            Conexão segura desde o início (porta 465). Desmarcado, usa STARTTLS
            (porta 587).
          </label>
          <label className={ROTULO}>
            E-mail de envio (login)
            <input
              type="email"
              value={formulario.usuario}
              onChange={(e) => mudar({ usuario: e.target.value })}
              placeholder="sigof.avisos@gmail.com"
              autoComplete="off"
              className={CAMPO}
            />
          </label>
          <label className={ROTULO}>
            Senha de app
            <input
              type="password"
              value={formulario.senha}
              onChange={(e) => mudar({ senha: e.target.value })}
              placeholder={
                config.temSenha
                  ? 'Guardada. Preencha só para trocar.'
                  : 'abcd efgh ijkl mnop'
              }
              autoComplete="new-password"
              className={CAMPO}
            />
            <span className="text-xs font-normal text-texto-suave">
              No Gmail: ative a verificação em duas etapas e crie uma senha de
              app em myaccount.google.com/apppasswords. Ela fica cifrada no
              servidor e não aparece mais na tela.
            </span>
          </label>
          <label className={ROTULO}>
            Nome do remetente
            <input
              value={formulario.nomeDoRemetente}
              onChange={(e) => mudar({ nomeDoRemetente: e.target.value })}
              placeholder="SIGOF — sua empresa"
              maxLength={120}
              className={CAMPO}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-texto">
            <input
              type="checkbox"
              checked={formulario.ativo}
              onChange={(e) => mudar({ ativo: e.target.checked })}
            />
            Enviar os avisos por e-mail
          </label>
        </fieldset>

        {erro && <Alerta>{erro}</Alerta>}
        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" disabled={ocupado} className={BOTAO_PRIMARIO}>
            Salvar
          </button>
          <label className={`${ROTULO} min-w-56 flex-1`}>
            Testar enviando para
            <input
              type="email"
              value={destinoDoTeste}
              onChange={(e) => setDestinoDoTeste(e.target.value)}
              placeholder="o seu e-mail"
              className={CAMPO}
            />
          </label>
          <button
            type="button"
            disabled={ocupado || !config.temSenha}
            onClick={testar}
            className={BOTAO_SECUNDARIO}
            title={config.temSenha ? undefined : 'Salve a configuração antes'}
          >
            Enviar e-mail de teste
          </button>
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Últimos envios
        </h2>
        {envios.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum e-mail enviado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
                <tr>
                  <th className="px-3 py-2 font-semibold">Quando</th>
                  <th className="px-3 py-2 font-semibold">Assunto</th>
                  <th className="px-3 py-2 font-semibold">Para</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {envios.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-borda last:border-0"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-texto-suave">
                      {dataCurta(e.criadoEm)}
                    </td>
                    <td className="px-3 py-2">{e.assunto}</td>
                    <td className="px-3 py-2 text-texto-suave">
                      {e.para.join(', ')}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-medium ${COR_DA_SITUACAO[e.situacao]}`}
                      >
                        {NOME_DA_SITUACAO[e.situacao]}
                      </span>
                      {e.ultimoErro && e.situacao !== 'ENVIADO' && (
                        <p className="text-xs text-texto-suave">
                          {e.ultimoErro}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
