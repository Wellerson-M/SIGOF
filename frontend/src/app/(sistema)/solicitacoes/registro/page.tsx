'use client';

import Link from 'next/link';
import { FormularioDeRegistro } from '@/components/solicitacoes/FormularioDeRegistro';
import { useSessao } from '@/lib/sessao';

export default function PaginaDeRegistroRapido() {
  const { usuario } = useSessao();
  const podeRegistrar =
    usuario.perfil === 'ANALISTA' || usuario.perfil === 'SUPERVISOR';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/solicitacoes" className="text-sm text-primaria underline">
          ← Quadro
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-texto">
          Registro rápido
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          Já resolveu por fora? Registre aqui o que era e o que foi feito. Entra
          direto como resolvida, sem prazo e sem avisar ninguém.
        </p>
      </div>
      {podeRegistrar ? (
        <FormularioDeRegistro />
      ) : (
        <p className="text-sm text-texto">
          O registro rápido é para analistas e supervisores.
        </p>
      )}
    </div>
  );
}
