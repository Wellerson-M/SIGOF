'use client';

import { useParams } from 'next/navigation';
import { VisualizadorDeAnexo } from '@/components/solicitacoes/VisualizadorDeAnexo';

/** Link do e-mail: abre o anexo depois do login, sem passar pela solicitação. */
export default function PaginaDoAnexo() {
  const { solicitacaoId, anexoId } = useParams<{
    solicitacaoId: string;
    anexoId: string;
  }>();
  return (
    <VisualizadorDeAnexo
      key={anexoId}
      solicitacaoId={solicitacaoId}
      anexoId={anexoId}
    />
  );
}
