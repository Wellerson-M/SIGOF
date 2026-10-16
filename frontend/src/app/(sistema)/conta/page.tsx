'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Alerta,
  Aviso,
  BOTAO_PRIMARIO,
  CAMPO,
  ROTULO,
} from '@/components/Janela';
import { NOME_DO_PERFIL } from '@/lib/api';
import { trocarMinhaSenha } from '@/lib/administracao';
import { useSessao } from '@/lib/sessao';
import { mensagemDoErro } from '@/lib/solicitacoes';

/** Dados da pessoa e troca de senha (obrigatória no primeiro acesso). */
export default function PaginaDaConta() {
  const { usuario, atualizar } = useSessao();
  const router = useRouter();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [trocada, setTrocada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const obrigatorio = usuario.trocarSenha;

  async function trocar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (nova !== confirmacao) {
      setErro('A confirmação não é igual à nova senha');
      return;
    }
    setSalvando(true);
    try {
      await trocarMinhaSenha(atual, nova);
      setAtual('');
      setNova('');
      setConfirmacao('');
      setTrocada(true);
      await atualizar();
      if (obrigatorio) router.replace('/inicio');
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Minha conta</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {usuario.nome} · {usuario.email} · {NOME_DO_PERFIL[usuario.perfil]}
        </p>
      </div>

      {obrigatorio && (
        <p className="rounded-md border border-atencao/40 bg-atencao/10 px-3 py-2 text-sm text-texto">
          Bem-vindo ao SIGOF! Antes de começar, troque a senha provisória que
          você recebeu por uma só sua.
        </p>
      )}

      <form
        onSubmit={(e) => void trocar(e)}
        className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
          Trocar senha
        </h2>
        <label className={ROTULO}>
          {obrigatorio ? 'Senha provisória' : 'Senha atual'}
          <input
            type="password"
            autoComplete="current-password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            required
            className={CAMPO}
          />
        </label>
        <label className={ROTULO}>
          Nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            required
            minLength={8}
            className={CAMPO}
          />
          <span className="text-xs font-normal text-texto-suave">
            Pelo menos 8 caracteres, com letras e números. Uma frase curta é
            mais segura e mais fácil de lembrar.
          </span>
        </label>
        <label className={ROTULO}>
          Repita a nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            required
            className={CAMPO}
          />
        </label>

        {erro && <Alerta>{erro}</Alerta>}
        {trocada && (
          <Aviso>
            Senha trocada. Se você estava conectado em outro aparelho, lá será
            preciso entrar de novo.
          </Aviso>
        )}

        <div>
          <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
            {salvando ? 'Salvando…' : 'Trocar senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
