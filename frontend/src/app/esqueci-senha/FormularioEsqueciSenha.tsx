'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { CampoDeFormulario as Campo } from '@/components/CampoDeFormulario';
import { ErroDaApi, pedirLinkDeSenha } from '@/lib/api';
import { CHAVE_EMPRESA } from '../entrar/FormularioDeLogin';

function lerEmpresaLembrada(): string {
  try {
    return localStorage.getItem(CHAVE_EMPRESA) ?? '';
  } catch {
    return '';
  }
}

export function FormularioEsqueciSenha() {
  // Mesma empresa lembrada pelo login: a pessoa não digita de novo
  const empresaLembrada = useSyncExternalStore(
    () => () => {},
    lerEmpresaLembrada,
    () => '',
  );
  const [empresaDigitada, setEmpresa] = useState<string | null>(null);
  const empresa = empresaDigitada ?? empresaLembrada;
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // O texto vem da API: é o mesmo para e-mail cadastrado ou não
  const [resposta, setResposta] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    if (!empresa.trim() || !email.trim()) {
      setErro('Preencha a empresa e o e-mail.');
      return;
    }

    setEnviando(true);
    try {
      setResposta(await pedirLinkDeSenha(empresa.trim(), email.trim()));
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? falha.message
          : 'Algo deu errado. Tente de novo em instantes.',
      );
      setEnviando(false);
    }
  }

  if (resposta) {
    return (
      <p
        role="status"
        className="rounded-md border border-borda bg-superficie px-3 py-3 text-sm text-texto"
      >
        {resposta} Confira também a caixa de spam.
      </p>
    );
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
        {enviando ? 'Enviando…' : 'Enviar o link'}
      </button>
    </form>
  );
}
