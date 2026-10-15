import type { ReactNode } from 'react';
import { Moldura } from '@/components/Moldura';
import { ProvedorDeSessao } from '@/lib/sessao';

/** Todas as páginas internas exigem login e usam a mesma moldura. */
export default function LayoutDoSistema({ children }: { children: ReactNode }) {
  return (
    <ProvedorDeSessao>
      <Moldura>{children}</Moldura>
    </ProvedorDeSessao>
  );
}
