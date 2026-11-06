import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { FormularioNovaSenha } from './FormularioNovaSenha';

// Página de uso único, aberta por um link pessoal: fora dos buscadores
export const metadata: Metadata = {
  title: 'Nova senha',
  robots: { index: false, follow: false },
};

export default function PaginaNovaSenha() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Logo tamanho={36} />
        </div>
        <h2 className="text-xl font-semibold text-texto">
          Escolha uma nova senha
        </h2>
        <p className="mb-6 mt-1 text-sm text-texto-suave">
          Use pelo menos 8 caracteres, com letra e número.
        </p>
        <FormularioNovaSenha />
      </div>
    </main>
  );
}
