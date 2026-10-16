'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { ErroDaApi, entrar } from '@/lib/api';

/** A empresa é lembrada neste navegador: o usuário digita uma vez só. */
export const CHAVE_EMPRESA = 'sigof.empresa';

function lerEmpresaLembrada(): string {
  try {
    return localStorage.getItem(CHAVE_EMPRESA) ?? '';
  } catch {
    return '';
  }
}

export function FormularioDeLogin() {
  const router = useRouter();
  // A empresa lembrada só existe no navegador; no HTML gerado pelo servidor
  // o campo começa vazio. useSyncExternalStore faz essa troca sem conflito.
  const empresaLembrada = useSyncExternalStore(
    () => () => {},
    lerEmpresaLembrada,
    () => '',
  );
  const [empresaDigitada, setEmpresa] = useState<string | null>(null);
  const empresa = empresaDigitada ?? empresaLembrada;
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    if (!empresa.trim() || !email.trim() || !senha) {
      setErro('Preencha empresa, e-mail e senha.');
      return;
    }

    setEnviando(true);
    try {
      await entrar(empresa.trim(), email.trim(), senha);
      try {
        localStorage.setItem(CHAVE_EMPRESA, empresa.trim().toLowerCase());
      } catch {
        // Sem armazenamento local (modo privado): só não lembra a empresa
      }
      router.replace('/inicio');
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? falha.message
          : 'Algo deu errado. Tente de novo em instantes.',
      );
      setSenha('');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
      <Campo
        id="empresa"
        rotulo="Empresa"
        dica="O identificador da sua transportadora, por exemplo transportadora-demo"
        valor={empresa}
        aoMudar={setEmpresa}
        autoComplete="organization"
      />
      <Campo
        id="email"
        rotulo="E-mail"
        tipo="email"
        valor={email}
        aoMudar={setEmail}
        autoComplete="username"
      />
      <Campo
        id="senha"
        rotulo="Senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="current-password"
      />

      {erro && (
        <p
          role="alert"
          className="rounded-md border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico"
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 h-10 rounded-md bg-primaria px-4 text-sm font-semibold text-sobre-primaria transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

interface PropriedadesDoCampo {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  tipo?: 'text' | 'email' | 'password';
  dica?: string;
  autoComplete?: string;
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  dica,
  autoComplete,
}: PropriedadesDoCampo) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
      </label>
      <input
        id={id}
        name={id}
        type={tipo}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        autoComplete={autoComplete}
        aria-describedby={dica ? `${id}-dica` : undefined}
        className="h-10 rounded-md border border-borda bg-superficie px-3 text-sm text-texto outline-none focus:border-foco"
      />
      {dica && (
        <span id={`${id}-dica`} className="text-xs text-texto-suave">
          {dica}
        </span>
      )}
    </div>
  );
}
