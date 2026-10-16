import type { UsuarioLogado } from './api';
import type { Resumo } from './solicitacoes';

export interface Contagem {
  rotulo: string;
  valor: number;
  critico?: boolean;
}

/** Os números que importam para cada perfil, tirados do quadro. */
export function resumoDoDia(
  usuario: Pick<UsuarioLogado, 'id' | 'perfil'>,
  itens: Resumo[],
): Contagem[] {
  const abertas = itens.filter(
    (s) => s.status !== 'RESOLVIDO' && s.status !== 'CANCELADO',
  );
  const vencidas = abertas.filter((s) => s.sla.situacao === 'VENCIDO').length;
  if (usuario.perfil === 'SOLICITANTE') {
    return [
      { rotulo: 'Minhas em aberto', valor: abertas.length },
      {
        rotulo: 'Esperando documento',
        valor: abertas.filter((s) => s.status === 'AGUARDANDO_DOC').length,
      },
      {
        rotulo: 'Resolvidas (30 dias)',
        valor: itens.filter((s) => s.status === 'RESOLVIDO').length,
      },
    ];
  }
  return [
    {
      rotulo: 'Na fila, sem ninguém',
      valor: abertas.filter((s) => s.status === 'NOVO' && !s.responsavel)
        .length,
    },
    {
      rotulo: 'Comigo',
      valor: abertas.filter((s) => s.responsavel?.id === usuario.id).length,
    },
    { rotulo: 'Com SLA vencido', valor: vencidas, critico: vencidas > 0 },
  ];
}
