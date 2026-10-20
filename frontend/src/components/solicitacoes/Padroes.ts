import { useEffect, useRef } from 'react';
import type { ConfiguracaoDoTipo } from '@/lib/configuracao';

type CampoComPadrao = 'pagadorCorreto' | 'motivo' | 'prioridade' | 'descricao';

/**
 * Preenche os campos com os valores padrão do tipo escolhido. Ao trocar de
 * tipo, só troca o que a pessoa não mexeu (o campo ainda está vazio ou
 * com o padrão do tipo anterior): nada que ela digitou se perde.
 */
export function usePadroesDoTipo(
  config: ConfiguracaoDoTipo,
  campos: Partial<
    Record<CampoComPadrao, { valor: string; mudar: (valor: string) => void }>
  >,
): void {
  const anteriores = useRef<Partial<Record<CampoComPadrao, string>>>({});
  const chave = JSON.stringify(
    Object.keys(campos).map((nome) => [
      nome,
      config.campos[nome as CampoComPadrao].padrao ?? '',
    ]),
  );

  useEffect(() => {
    for (const [nome, campo] of Object.entries(campos) as [
      CampoComPadrao,
      { valor: string; mudar: (valor: string) => void },
    ][]) {
      // A prioridade nunca fica vazia: "não mexida" é a Média
      const vazio = nome === 'prioridade' ? 'MEDIA' : '';
      const novo = config.campos[nome].padrao ?? vazio;
      const anterior = anteriores.current[nome] ?? vazio;
      const intocado = campo.valor === vazio || campo.valor === anterior;
      if (intocado && novo !== campo.valor) campo.mudar(novo);
      anteriores.current[nome] = novo;
    }
    // Só quando o padrão muda (troca de tipo ou configuração carregada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
}
