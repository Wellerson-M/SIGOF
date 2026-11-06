import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { FormularioEsqueciSenha } from './FormularioEsqueciSenha';

export const metadata: Metadata = { title: 'Esqueci minha senha' };

export default function PaginaEsqueciSenha() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Logo tamanho={36} />
        </div>
        <h2 className="text-xl font-semibold text-texto">
          Esqueci minha senha
        </h2>
        <p className="mb-6 mt-1 text-sm text-texto-suave">
          Informe a empresa e o e-mail do seu acesso. Se estiverem cadastrados,
          enviamos um link para escolher uma senha nova.
        </p>
        <FormularioEsqueciSenha />
        <Link
          href="/entrar"
          className="mt-6 inline-block text-sm text-primaria hover:underline"
        >
          Voltar para o login
        </Link>
      </div>
    </main>
  );
}
