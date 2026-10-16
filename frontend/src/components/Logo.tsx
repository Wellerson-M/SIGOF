/**
 * Símbolo do SIGOF ("S de estrada"): um S desenhado como pista, com a faixa
 * tracejada no meio e um ponto de destino.
 */
const CAMINHO_S = 'M31.8 10.5A9 9 0 1 0 24 24A9 9 0 1 1 16.2 37.5';

interface PropriedadesDoLogo {
  tamanho?: number;
  /** Mostra o nome "SIGOF" ao lado do símbolo. */
  comNome?: boolean;
  /** Sobre a cor da marca (painel de login, menu lateral). */
  invertido?: boolean;
}

export function Logo({
  tamanho = 32,
  comNome = true,
  invertido = false,
}: PropriedadesDoLogo) {
  const corPista = invertido ? 'var(--sobre-marca)' : 'var(--primaria)';
  const corFaixa = invertido ? 'var(--marca)' : 'var(--superficie)';

  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={tamanho}
        height={tamanho}
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <path
          d={CAMINHO_S}
          fill="none"
          stroke={corPista}
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={CAMINHO_S}
          fill="none"
          stroke={corFaixa}
          strokeWidth="1.6"
          strokeDasharray="2.6 2.6"
        />
        <circle cx="34.5" cy="8" r="4.6" fill="var(--destaque)" />
      </svg>
      {comNome && (
        <span
          className={`text-lg font-semibold tracking-tight ${invertido ? 'text-sobre-marca' : 'text-primaria'}`}
        >
          SIGOF
        </span>
      )}
    </span>
  );
}
