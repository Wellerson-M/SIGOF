'use client';

import { CampoDeSenha } from '@/components/CampoDeSenha';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Alerta, BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/Janela';
import { mensagemDoErro } from '@/lib/solicitacoes';
import { plataforma } from '@/lib/plataforma';

/** Entrada da administração da plataforma (outra porta, outra sessão). */
export default function EntradaDaPlataforma() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await plataforma.entrar(email.trim(), senha);
      router.replace('/plataforma');
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setSenha('');
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <div className="w-full max-w-sm rounded-lg border border-borda bg-superficie p-6">
        <Logo tamanho={32} />
        <h1 className="mt-6 text-xl font-semibold text-texto">
          Administração da plataforma
        </h1>
        <p className="mb-5 mt-1 text-sm text-texto-suave">
          Acesso de quem opera o SIGOF. Para usar o sistema de uma
          transportadora, entre pela tela normal.
        </p>
        <form onSubmit={(e) => void entrar(e)} className="flex flex-col gap-3">
          <label className={ROTULO}>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              className={CAMPO}
            />
          </label>
          <label className={ROTULO}>
            Senha
            <CampoDeSenha
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
              className={CAMPO}
            />
          </label>
          {erro && <Alerta>{erro}</Alerta>}
          <button type="submit" disabled={enviando} className={BOTAO_PRIMARIO}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
