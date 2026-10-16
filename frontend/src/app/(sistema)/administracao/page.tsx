'use client';

import { useState } from 'react';
import { Auditoria } from '@/components/administracao/Auditoria';
import { Email } from '@/components/administracao/Email';
import { Filiais } from '@/components/administracao/Filiais';
import { ParametrosDaEmpresa } from '@/components/administracao/ParametrosDaEmpresa';
import { Sistema } from '@/components/administracao/Sistema';
import { Usuarios } from '@/components/administracao/Usuarios';
import { useSessao } from '@/lib/sessao';

const ABAS = [
  { id: 'usuarios', rotulo: 'Usuários' },
  { id: 'empresa', rotulo: 'Empresa e expediente' },
  { id: 'filiais', rotulo: 'Filiais' },
  { id: 'email', rotulo: 'E-mail' },
  { id: 'auditoria', rotulo: 'Auditoria' },
  { id: 'sistema', rotulo: 'Sistema' },
] as const;

type Aba = (typeof ABAS)[number]['id'];

export default function PaginaDeAdministracao() {
  const { usuario } = useSessao();
  const [aba, setAba] = useState<Aba>('usuarios');

  if (usuario.perfil !== 'ADMIN') {
    return (
      <p className="text-sm text-texto">
        Só o administrador da empresa acessa esta página.
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Administração</h1>
        <p className="mt-1 text-sm text-texto-suave">
          Funcionários e parâmetros da{' '}
          {usuario.empresa.razaoSocial.replace(/\.$/, '')}.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Seções da administração"
        className="flex gap-1 overflow-x-auto border-b border-borda"
      >
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aba === item.id}
            onClick={() => setAba(item.id)}
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-texto-suave aria-selected:border-primaria aria-selected:font-semibold aria-selected:text-texto"
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {aba === 'usuarios' && <Usuarios />}
        {aba === 'empresa' && <ParametrosDaEmpresa />}
        {aba === 'filiais' && <Filiais />}
        {aba === 'email' && <Email />}
        {aba === 'auditoria' && <Auditoria />}
        {aba === 'sistema' && <Sistema />}
      </div>
    </div>
  );
}
