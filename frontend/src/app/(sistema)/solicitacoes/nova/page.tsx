'use client';

import Link from 'next/link';
import { FormularioDeAbertura } from '@/components/solicitacoes/FormularioDeAbertura';
import { useSessao } from '@/lib/sessao';

export default function PaginaDeNovaSolicitacao() {
  const { usuario } = useSessao();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/solicitacoes" className="text-sm text-primaria underline">
          ← Quadro
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-texto">
          Nova solicitação
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          Peça a correção de um CTe. O prazo de atendimento começa a contar
          assim que você abrir.
        </p>
      </div>
      {usuario.perfil === 'ADMIN' ? (
        <p className="text-sm text-texto">
          O perfil de administrador não abre solicitações.
        </p>
      ) : (
        <FormularioDeAbertura />
      )}
    </div>
  );
}
