'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alerta,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  Janela,
  ROTULO,
} from '@/components/Janela';
import { NOME_DO_PERFIL, type Perfil } from '@/lib/api';
import {
  AREAS,
  NOME_DA_AREA,
  O_QUE_O_PERFIL_FAZ,
  PERFIS,
  admin,
  type Area,
  type ComSenhaProvisoria,
  type DadosDeUsuario,
  type UsuarioDaEmpresa,
} from '@/lib/administracao';
import { dataCurta, mensagemDoErro } from '@/lib/solicitacoes';
import { useSessao } from '@/lib/sessao';

type Edicao = { tipo: 'novo' } | { tipo: 'editar'; usuario: UsuarioDaEmpresa };

const BOTAO_DA_LINHA =
  'h-8 rounded-md border border-borda px-2.5 text-xs text-texto hover:bg-fundo';

/** Funcionários da empresa: cadastrar, alterar, desativar e redefinir senha. */
export function Usuarios() {
  const { usuario: eu } = useSessao();
  const [usuarios, setUsuarios] = useState<UsuarioDaEmpresa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [senha, setSenha] = useState<ComSenhaProvisoria | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await admin.usuarios());
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    admin.usuarios().then(
      (lista) => {
        if (!cancelado) setUsuarios(lista);
      },
      (falha: unknown) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  async function executar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  const inativos = usuarios?.filter((u) => !u.ativo).length ?? 0;
  const visiveis = usuarios?.filter((u) => mostrarInativos || u.ativo) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-texto-suave">
          Cada funcionário entra com a empresa, o e-mail e uma senha provisória
          que você entrega a ele. No primeiro acesso, ele escolhe a própria.
        </p>
        <button
          type="button"
          onClick={() => setEdicao({ tipo: 'novo' })}
          className={BOTAO_PRIMARIO}
        >
          Novo usuário
        </button>
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      {usuarios === null && !erro && (
        <p className="text-sm text-texto-suave">Carregando…</p>
      )}

      {usuarios !== null && (
        <>
          <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Perfil</th>
                  <th className="px-3 py-2 font-semibold">Área</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                  <th className="px-3 py-2 font-semibold">Último acesso</th>
                  <th className="px-3 py-2 font-semibold">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((u) => (
                  <tr
                    key={u.id}
                    className={`border-b border-borda last:border-0 ${u.ativo ? '' : 'opacity-60'}`}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-texto">{u.nome}</p>
                      <p className="text-xs text-texto-suave">{u.email}</p>
                    </td>
                    <td className="px-3 py-2">{NOME_DO_PERFIL[u.perfil]}</td>
                    <td className="px-3 py-2">
                      {u.area ? NOME_DA_AREA[u.area] : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Situacao usuario={u} />
                    </td>
                    <td className="px-3 py-2 text-texto-suave">
                      {u.ultimoAcessoEm ? dataCurta(u.ultimoAcessoEm) : 'nunca'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setEdicao({ tipo: 'editar', usuario: u })
                          }
                          className={BOTAO_DA_LINHA}
                          aria-label={`Editar ${u.nome}`}
                        >
                          Editar
                        </button>
                        {u.ativo && (
                          <button
                            type="button"
                            onClick={() =>
                              void executar(async () =>
                                setSenha(await admin.redefinirSenha(u.id)),
                              )
                            }
                            className={BOTAO_DA_LINHA}
                            aria-label={`Gerar nova senha para ${u.nome}`}
                          >
                            Nova senha
                          </button>
                        )}
                        {u.id !== eu.id && (
                          <button
                            type="button"
                            onClick={() =>
                              void executar(() =>
                                admin.alterarUsuario(u.id, { ativo: !u.ativo }),
                              )
                            }
                            className={
                              u.ativo
                                ? 'h-8 rounded-md border border-critico/50 px-2.5 text-xs text-critico'
                                : BOTAO_DA_LINHA
                            }
                            aria-label={`${u.ativo ? 'Desativar' : 'Reativar'} ${u.nome}`}
                          >
                            {u.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inativos > 0 && (
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={mostrarInativos}
                onChange={(evento) => setMostrarInativos(evento.target.checked)}
              />
              Mostrar desativados ({inativos})
            </label>
          )}
        </>
      )}

      {edicao && (
        <FormularioDeUsuario
          edicao={edicao}
          ehVoceMesmo={edicao.tipo === 'editar' && edicao.usuario.id === eu.id}
          aoFechar={() => setEdicao(null)}
          aoSalvar={async (resultado) => {
            setEdicao(null);
            if (resultado) setSenha(resultado);
            await carregar();
          }}
        />
      )}

      {senha && (
        <SenhaProvisoria resultado={senha} aoFechar={() => setSenha(null)} />
      )}
    </section>
  );
}

function Situacao({ usuario }: Readonly<{ usuario: UsuarioDaEmpresa }>) {
  if (!usuario.ativo) {
    return <span className="text-texto-suave">Desativado</span>;
  }
  if (usuario.bloqueado) {
    return (
      <span className="text-critico" title="Errou a senha muitas vezes">
        Bloqueado
      </span>
    );
  }
  if (usuario.trocarSenha) {
    return (
      <span className="text-atencao" title="Ainda não fez o primeiro acesso">
        Aguardando 1º acesso
      </span>
    );
  }
  return <span className="text-ok">Ativo</span>;
}

function FormularioDeUsuario({
  edicao,
  ehVoceMesmo,
  aoFechar,
  aoSalvar,
}: Readonly<{
  edicao: Edicao;
  ehVoceMesmo: boolean;
  aoFechar: () => void;
  aoSalvar: (resultado: ComSenhaProvisoria | null) => Promise<void>;
}>) {
  const inicial = edicao.tipo === 'editar' ? edicao.usuario : null;
  const [dados, setDados] = useState<DadosDeUsuario>({
    nome: inicial?.nome ?? '',
    email: inicial?.email ?? '',
    perfil: inicial?.perfil ?? 'SOLICITANTE',
    area: inicial?.area ?? null,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      if (edicao.tipo === 'novo') {
        await aoSalvar(await admin.criarUsuario(dados));
      } else {
        await admin.alterarUsuario(edicao.usuario.id, dados);
        await aoSalvar(null);
      }
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setSalvando(false);
    }
  }

  let rotuloDoBotao = 'Salvar';
  if (salvando) rotuloDoBotao = 'Salvando…';
  else if (edicao.tipo === 'novo') rotuloDoBotao = 'Cadastrar';

  return (
    <Janela
      titulo={inicial ? `Editar ${inicial.nome}` : 'Novo usuário'}
      aoFechar={aoFechar}
    >
      <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-3">
        <label className={ROTULO}>
          Nome
          <input
            value={dados.nome}
            onChange={(e) => setDados({ ...dados, nome: e.target.value })}
            required
            minLength={2}
            maxLength={120}
            className={CAMPO}
          />
        </label>
        <label className={ROTULO}>
          E-mail
          <input
            type="email"
            value={dados.email}
            onChange={(e) => setDados({ ...dados, email: e.target.value })}
            required
            maxLength={254}
            className={CAMPO}
          />
        </label>
        <label className={ROTULO}>
          Perfil
          <select
            value={dados.perfil}
            disabled={ehVoceMesmo}
            onChange={(e) =>
              setDados({ ...dados, perfil: e.target.value as Perfil })
            }
            className={CAMPO}
          >
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {NOME_DO_PERFIL[p]}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-texto-suave">
            {ehVoceMesmo
              ? 'Você não pode tirar o seu próprio perfil de administrador.'
              : O_QUE_O_PERFIL_FAZ[dados.perfil]}
          </span>
        </label>
        <label className={ROTULO}>
          Área
          <select
            value={dados.area ?? ''}
            onChange={(e) =>
              setDados({
                ...dados,
                area: (e.target.value || null) as Area | null,
              })
            }
            className={CAMPO}
          >
            <option value="">Nenhuma</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {NOME_DA_AREA[a]}
              </option>
            ))}
          </select>
        </label>

        {erro && <Alerta>{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Voltar
          </button>
          <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
            {rotuloDoBotao}
          </button>
        </div>
      </form>
    </Janela>
  );
}

/** Mostrada uma única vez: o sistema não guarda a senha, só o hash dela. */
function SenhaProvisoria({
  resultado,
  aoFechar,
}: Readonly<{
  resultado: ComSenhaProvisoria;
  aoFechar: () => void;
}>) {
  const [copiada, setCopiada] = useState(false);
  const { usuario, senhaProvisoria } = resultado;
  const empresa = useSessao().usuario.empresa.slug;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senhaProvisoria);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }

  return (
    <Janela titulo="Senha provisória" aoFechar={aoFechar}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Entregue a <strong>{usuario.nome}</strong> ({usuario.email}) esta
          senha. Ela só aparece agora: anote ou copie antes de fechar.
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="senha-provisoria"
            className="flex-1 rounded-md border border-borda bg-fundo px-3 py-2 font-mono text-base tracking-wider"
          >
            {senhaProvisoria}
          </code>
          <button
            type="button"
            onClick={() => void copiar()}
            className={BOTAO_SECUNDARIO}
          >
            {copiada ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        <p className="text-texto-suave">
          Para entrar, a pessoa informa a empresa{' '}
          <strong className="font-mono">{empresa}</strong>, o e-mail e esta
          senha. No primeiro acesso o sistema pede para ela criar a própria
          senha.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={aoFechar} className={BOTAO_PRIMARIO}>
            Pronto
          </button>
        </div>
      </div>
    </Janela>
  );
}
