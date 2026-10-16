'use client';

import { useParams } from 'next/navigation';
import { DetalheDaSolicitacao } from '@/components/solicitacoes/DetalheDaSolicitacao';

export default function PaginaDaSolicitacao() {
  const { id } = useParams<{ id: string }>();
  // A chave recria a tela ao trocar de solicitação, sem herdar o estado
  return <DetalheDaSolicitacao key={id} id={id} />;
}
