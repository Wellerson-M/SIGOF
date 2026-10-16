import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { FormularioDeLogin } from './FormularioDeLogin';

export const metadata: Metadata = { title: 'Entrar' };

export default function PaginaDeLogin() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* Painel da marca (some em telas pequenas) */}
      <section className="hidden flex-col justify-between bg-marca p-12 text-sobre-marca lg:flex">
        <Logo tamanho={40} invertido />
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Ocorrências de frete organizadas, do pedido à correção do CTe.
          </h1>
          <p className="mt-4 text-sm opacity-80">
            Protocolo, prazo de atendimento, alerta de duplicidade e histórico
            completo, num só lugar.
          </p>
        </div>
        <p className="text-xs opacity-60">
          SIGOF · Sistema Inteligente de Gestão de Ocorrências de Frete
        </p>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tamanho={36} />
          </div>
          <h2 className="text-xl font-semibold text-texto">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-texto-suave">
            Use o acesso que a sua transportadora cadastrou.
          </p>
          <FormularioDeLogin />
        </div>
      </section>
    </main>
  );
}
