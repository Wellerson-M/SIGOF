'use client';

import { CampoDeSenha } from '@/components/CampoDeSenha';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ModulosLiberados } from './ModulosLiberados';
import { MODULOS } from '@/lib/configuracao';
import { Logo } from '@/components/Logo';
import {
  Alerta,
  Aviso,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import { ErroDaApi } from '@/lib/api';
import {
  NOME_DO_EVENTO,
  plataforma,
  sugerirCodigo,
  type AdministradorDaPlataforma,
  type EmpresaNaPlataforma,
  type EventoDaPlataforma,
} from '@/lib/plataforma';
import { dataCurta, mensagemDoErro } from '@/lib/solicitacoes';

function cnpjFormatado(cnpj: string): string {
  return cnpj.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}

/**
 * Administração da plataforma: as transportadoras que usam o SIGOF, com os
 * números de uso. Cadastra uma nova (já com o primeiro administrador),
 * ativa/desativa e cria mais um administrador quando a empresa fica sem.
 * Não mostra o conteúdo das solicitações de ninguém.
 */
export function PainelDaPlataforma() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdministradorDaPlataforma | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaNaPlataforma[] | null>(null);
  const [eventos, setEventos] = useState<EventoDaPlataforma[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modulosDe, setModulosDe] = useState<EmpresaNaPlataforma | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [eu, lista, trilha] = await Promise.all([
        plataforma.eu(),
        plataforma.empresas(),
        plataforma.eventos(),
      ]);
      setAdmin(eu);
      setEmpresas(lista);
      setEventos(trilha.eventos);
    } catch (falha) {
      if (falha instanceof ErroDaApi && falha.status === 401) {
        router.replace('/plataforma/entrar');
        return;
      }
      setErro(mensagemDoErro(falha));
    }
  }, [router]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([plataforma.eu(), plataforma.empresas(), plataforma.eventos()])
      .then(([eu, lista, trilha]) => {
        if (cancelado) return;
        setAdmin(eu);
        setEmpresas(lista);
        setEventos(trilha.eventos);
      })
      .catch((falha: unknown) => {
        if (cancelado) return;
        if (falha instanceof ErroDaApi && falha.status === 401) {
          router.replace('/plataforma/entrar');
          return;
        }
        setErro(mensagemDoErro(falha));
      });
    return () => {
      cancelado = true;
    };
  }, [router]);

  async function executar(trabalho: () => Promise<string | void>) {
    setErro(null);
    setAviso(null);
    try {
      const mensagem = await trabalho();
      if (mensagem) setAviso(mensagem);
      await carregar();
      return true;
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      return false;
    }
  }

  async function sair() {
    await plataforma.sair().catch(() => undefined);
    router.replace('/plataforma/entrar');
  }

  if (!admin) {
    return erro ? (
      <main className="p-6">
        <Alerta>{erro}</Alerta>
      </main>
    ) : (
      <p className="p-6 text-sm text-texto-suave">Carregando…</p>
    );
  }

  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-borda bg-marca px-4 text-sobre-marca md:px-6">
        <div className="flex items-center gap-3">
          <Logo tamanho={26} invertido />
          <span className="text-sm opacity-80">Plataforma</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>{admin.nome}</span>
          <button
            type="button"
            onClick={() => void sair()}
            className="h-8 rounded-md border border-white/40 px-3"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
        {admin.trocarSenha ? (
          <TrocaDeSenha
            aoTrocar={(atual, nova) =>
              executar(async () => {
                await plataforma.trocarSenha(atual, nova);
                return 'Senha trocada.';
              })
            }
          />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-texto">
                Transportadoras
              </h1>
              <p className="mt-1 text-sm text-texto-suave">
                Cadastro e números de uso. O conteúdo das solicitações fica só
                com cada empresa.
              </p>
            </div>

            {erro && <Alerta>{erro}</Alerta>}
            {aviso && <Aviso>{aviso}</Aviso>}

            <NovaTransportadora
              aoCriar={(dados) =>
                executar(async () => {
                  const r = await plataforma.criarEmpresa(dados);
                  return `${r.empresa.razaoSocial} criada. Entregue ao administrador: código ${r.empresa.slug}, e-mail ${dados.administrador.email}, senha provisória ${r.senhaProvisoria} (só aparece agora).`;
                })
              }
            />

            <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Transportadora</th>
                    <th className="px-3 py-2 font-semibold">Código</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Usuários
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Em aberto
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Abertas no mês
                    </th>
                    <th className="px-3 py-2 font-semibold">Último acesso</th>
                    <th className="px-3 py-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {(empresas ?? []).map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-borda last:border-0"
                    >
                      <td className="px-3 py-2">
                        <p
                          className={
                            e.ativa
                              ? 'font-medium'
                              : 'text-texto-suave line-through'
                          }
                        >
                          {e.razaoSocial}
                        </p>
                        <p className="text-xs text-texto-suave">
                          {cnpjFormatado(e.cnpj)}
                          {!e.ativa && ' · desativada'}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{e.slug}</td>
                      <td className="px-3 py-2 text-right">
                        {e.usuariosAtivos}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.solicitacoesEmAberto}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.solicitacoesNoMes}
                      </td>
                      <td className="px-3 py-2 text-texto-suave">
                        {e.ultimoAcessoEm ? dataCurta(e.ultimoAcessoEm) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={BOTAO_SECUNDARIO}
                            onClick={() => {
                              if (
                                e.ativa &&
                                !window.confirm(
                                  `Desativar ${e.razaoSocial}? Todos os usuários saem na hora e não conseguem entrar; os dados ficam guardados.`,
                                )
                              )
                                return;
                              void executar(async () => {
                                await plataforma.alterarEmpresa(e.id, {
                                  ativa: !e.ativa,
                                });
                              });
                            }}
                          >
                            {e.ativa ? 'Desativar' : 'Reativar'}
                          </button>
                          <button
                            type="button"
                            className={BOTAO_SECUNDARIO}
                            onClick={() => {
                              const nome = window.prompt(
                                'Nome do novo administrador',
                              );
                              if (!nome) return;
                              const email = window.prompt('E-mail dele');
                              if (!email) return;
                              void executar(async () => {
                                const r = await plataforma.criarAdministrador(
                                  e.id,
                                  nome,
                                  email,
                                );
                                return `Administrador ${r.email} criado em ${e.razaoSocial}. Senha provisória: ${r.senhaProvisoria} (só aparece agora).`;
                              });
                            }}
                          >
                            Novo administrador
                          </button>
                          <button
                            type="button"
                            className={BOTAO_SECUNDARIO}
                            onClick={() => setModulosDe(e)}
                          >
                            Módulos
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {modulosDe && (
              <ModulosLiberados
                empresa={modulosDe.razaoSocial}
                liberados={
                  modulosDe.modulosLiberados ?? MODULOS.map((m) => m.id)
                }
                aoFechar={() => setModulosDe(null)}
                aoSalvar={(modulos) =>
                  executar(async () => {
                    await plataforma.alterarEmpresa(modulosDe.id, {
                      modulosLiberados: modulos,
                    });
                    return `Módulos de ${modulosDe.razaoSocial} salvos.`;
                  })
                }
              />
            )}

            <details className="rounded-lg border border-borda bg-superficie p-4 text-sm">
              <summary className="cursor-pointer font-semibold text-texto">
                Trilha da plataforma
              </summary>
              <ul className="mt-3 flex flex-col gap-1">
                {(eventos ?? []).map((ev) => (
                  <li key={ev.id} className="text-texto-suave">
                    {dataCurta(ev.criadoEm)} ·{' '}
                    <span className="text-texto">
                      {NOME_DO_EVENTO[ev.acao] ?? ev.acao}
                    </span>
                    {ev.administrador && ` · ${ev.administrador.nome}`}
                    {ev.ip && ` · ${ev.ip}`}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

function NovaTransportadora({
  aoCriar,
}: {
  aoCriar: (dados: {
    razaoSocial: string;
    cnpj: string;
    slug: string;
    administrador: { nome: string; email: string };
  }) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const codigo = slug ?? sugerirCodigo(razaoSocial);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    if (
      await aoCriar({
        razaoSocial,
        cnpj,
        slug: codigo,
        administrador: { nome, email },
      })
    ) {
      setAberto(false);
      setRazaoSocial('');
      setCnpj('');
      setSlug(null);
      setNome('');
      setEmail('');
    }
  }

  if (!aberto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={BOTAO_PRIMARIO}
        >
          Nova transportadora
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void criar(e)}
      className="grid gap-3 rounded-lg border border-borda bg-superficie p-4 sm:grid-cols-2"
    >
      <label className={ROTULO}>
        Razão social
        <input
          value={razaoSocial}
          onChange={(e) => setRazaoSocial(e.target.value)}
          required
          className={CAMPO}
        />
      </label>
      <label className={ROTULO}>
        CNPJ
        <input
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          required
          inputMode="numeric"
          className={CAMPO}
        />
      </label>
      <label className={ROTULO}>
        Código (usado no login)
        <input
          value={codigo}
          onChange={(e) => setSlug(e.target.value)}
          required
          className={`${CAMPO} font-mono`}
        />
      </label>
      <span />
      <label className={ROTULO}>
        Administrador da empresa (nome)
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          className={CAMPO}
        />
      </label>
      <label className={ROTULO}>
        E-mail do administrador
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={CAMPO}
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className={BOTAO_PRIMARIO}>
          Criar transportadora
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className={BOTAO_SECUNDARIO}
        >
          Desistir
        </button>
      </div>
    </form>
  );
}

function TrocaDeSenha({
  aoTrocar,
}: {
  aoTrocar: (atual: string, nova: string) => Promise<boolean>;
}) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void aoTrocar(atual, nova);
      }}
      className="flex max-w-sm flex-col gap-3 rounded-lg border border-borda bg-superficie p-4"
    >
      <h1 className="text-lg font-semibold text-texto">Crie a sua senha</h1>
      <p className="text-sm text-texto-suave">
        A senha provisória só vale para este primeiro acesso.
      </p>
      <label className={ROTULO}>
        Senha provisória
        <CampoDeSenha
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          autoComplete="current-password"
          required
          className={CAMPO}
        />
      </label>
      <label className={ROTULO}>
        Nova senha (8 ou mais, com letra e número)
        <CampoDeSenha
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          required
          className={CAMPO}
        />
      </label>
      <button type="submit" className={BOTAO_PRIMARIO}>
        Salvar senha
      </button>
    </form>
  );
}
