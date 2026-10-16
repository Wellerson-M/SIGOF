import {
  COR_DA_PRIORIDADE,
  COR_DO_SLA,
  NOME_DA_PRIORIDADE,
  NOME_DO_STATUS,
  textoDoSla,
  type Prioridade,
  type Resumo,
  type Status,
} from '@/lib/solicitacoes';

export function EtiquetaDePrioridade({
  prioridade,
}: {
  prioridade: Prioridade;
}) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide ${COR_DA_PRIORIDADE[prioridade]}`}
    >
      {NOME_DA_PRIORIDADE[prioridade]}
    </span>
  );
}

export function EtiquetaDeStatus({ status }: { status: Status }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-borda bg-fundo px-2 text-xs font-medium text-texto">
      {NOME_DO_STATUS[status]}
    </span>
  );
}

export function IndicadorDeSla({ sla }: { sla: Resumo['sla'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${COR_DO_SLA[sla.situacao]}`}
    >
      <span
        className="inline-block size-2 rounded-full bg-current"
        aria-hidden="true"
      />
      {textoDoSla(sla)}
    </span>
  );
}
