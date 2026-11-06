'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { CampoDeFormulario as Campo } from '@/components/CampoDeFormulario';
import { ErroDaApi, redefinirSenha } from '@/lib/api';

/** O mesmo formato que a API aceita: 32 bytes em base64url. */
const FORMATO_DO_TOKEN = /^[\w-]{43}$/;

/** Mesma regra da API (letra e número, 8 ou mais): a API é quem decide. */
export function problemaNaSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/\p{L}/u.test(senha)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/\d/.test(senha)) return 'A senha precisa ter pelo menos um número.';
  return null;
}

type Situacao =
  | { tipo: 'lendo' }
  | { tipo: 'sem-link' }
  | { tipo: 'pronto'; token: string }
  | { tipo: 'trocada' };

export function FormularioNovaSenha() {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'lendo' });
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [linkVencido, setLinkVencido] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // O token vem no fragmento (#): o navegador não o envia ao servidor. Lê
  // uma vez e tira da barra de endereço, para não ficar no histórico nem
  // aparecer numa captura de tela.
  useEffect(() => {
    const token = globalThis.location.hash.slice(1);
    globalThis.history.replaceState(null, '', globalThis.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o fragmento só existe no navegador
    setSituacao(
      FORMATO_DO_TOKEN.test(token)
        ? { tipo: 'pronto', token }
        : { tipo: 'sem-link' },
    );
  }, []);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (situacao.tipo !== 'pronto') return;
    setErro(null);

    const problema = problemaNaSenha(senha);
    if (problema) {
      setErro(problema);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setEnviando(true);
    try {
      await redefinirSenha(situacao.token, senha);
      setSituacao({ tipo: 'trocada' });
    } catch (falha) {
      // 422 = link vencido, usado ou de usuário desativado: pedir outro
      setLinkVencido(falha instanceof ErroDaApi && falha.status === 422);
      setErro(
        falha instanceof ErroDaApi
          ? falha.message
          : 'Algo deu errado. Tente de novo em instantes.',
      );
      setEnviando(false);
    }
  }

  if (situacao.tipo === 'lendo') {
    return null;
  }

  if (situacao.tipo === 'sem-link') {
    return (
      <div className="flex flex-col gap-3">
        <p
          role="alert"
          className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          Este link está incompleto. Abra o link do e-mail inteiro ou peça um
          novo.
        </p>
        <Link
          href="/esqueci-senha"
          className="text-sm text-primaria hover:underline"
        >
          Pedir um novo link
        </Link>
      </div>
    );
  }

  if (situacao.tipo === 'trocada') {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-md border border-borda bg-superficie px-3 py-3 text-sm text-texto"
        >
          Senha trocada. Por segurança, você foi desconectado de todos os
          lugares. Entre com a senha nova.
        </p>
        <Link
          href="/entrar"
          className="flex h-10 items-center justify-center rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria hover:opacity-90"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
      <Campo
        id="nova-senha"
        rotulo="Nova senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="new-password"
      />
      <Campo
        id="confirmacao"
        rotulo="Repita a nova senha"
        tipo="password"
        valor={confirmacao}
        aoMudar={setConfirmacao}
        autoComplete="new-password"
      />

      {erro && (
        <p
          role="alert"
          className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {erro}
        </p>
      )}
      {linkVencido && (
        <Link
          href="/esqueci-senha"
          className="text-sm text-primaria hover:underline"
        >
          Pedir um novo link
        </Link>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 h-10 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {enviando ? 'Salvando…' : 'Salvar a nova senha'}
      </button>
    </form>
  );
}
