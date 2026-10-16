import { describe, expect, it } from 'vitest';
import { compararNaFila, indicadorDeSla, type ItemDaFila } from './fila.js';
import { EXPEDIENTE_PADRAO } from './sla.js';

// Quarta-feira, 14/10/2026, 10h em São Paulo (13h UTC)
const AGORA = new Date('2026-10-14T13:00:00Z');
const HORA = 60 * 60 * 1000;

function estado(venceEmHoras: number, pausado = false) {
  return {
    venceEm: new Date(AGORA.getTime() + venceEmHoras * HORA),
    pausadoEm: pausado ? new Date(AGORA.getTime() - HORA) : null,
    minutosPausados: 0,
  };
}

describe('indicadorDeSla', () => {
  it('com folga, está no prazo e informa os minutos úteis restantes', () => {
    expect(indicadorDeSla('NOVO', estado(3), AGORA, EXPEDIENTE_PADRAO)).toEqual(
      { situacao: 'NO_PRAZO', minutosRestantes: 180 },
    );
  });

  it('com até 1 hora útil restante, pede atenção', () => {
    expect(
      indicadorDeSla('EM_ANDAMENTO', estado(1), AGORA, EXPEDIENTE_PADRAO),
    ).toEqual({ situacao: 'ATENCAO', minutosRestantes: 60 });
  });

  it('depois do prazo, está vencido', () => {
    expect(
      indicadorDeSla('EM_ANDAMENTO', estado(-1), AGORA, EXPEDIENTE_PADRAO),
    ).toEqual({ situacao: 'VENCIDO', minutosRestantes: 0 });
  });

  it('aguardando documento, o relógio está pausado', () => {
    expect(
      indicadorDeSla(
        'AGUARDANDO_DOC',
        estado(2, true),
        AGORA,
        EXPEDIENTE_PADRAO,
      ).situacao,
    ).toBe('PAUSADO');
  });

  it('resolvida, cancelada ou sem prazo, não tem indicador', () => {
    for (const [status, sla] of [
      ['RESOLVIDO', estado(-5)],
      ['CANCELADO', estado(2)],
      ['NOVO', null],
    ] as const) {
      expect(indicadorDeSla(status, sla, AGORA, EXPEDIENTE_PADRAO)).toEqual({
        situacao: 'ENCERRADO',
        minutosRestantes: null,
      });
    }
  });
});

describe('compararNaFila', () => {
  const item = (
    prioridade: ItemDaFila['prioridade'],
    venceEmHoras: number | null,
    criadaHaHoras = 0,
  ): ItemDaFila => ({
    prioridade,
    slaVenceEm:
      venceEmHoras === null
        ? null
        : new Date(AGORA.getTime() + venceEmHoras * HORA),
    criadoEm: new Date(AGORA.getTime() - criadaHaHoras * HORA),
  });

  it('prioridade maior vem primeiro, mesmo vencendo depois', () => {
    const fila = [item('BAIXA', 1), item('URGENTE', 5), item('MEDIA', 2)];
    expect(fila.sort(compararNaFila).map((i) => i.prioridade)).toEqual([
      'URGENTE',
      'MEDIA',
      'BAIXA',
    ]);
  });

  it('na mesma prioridade, quem vence antes vem primeiro; sem prazo, no fim', () => {
    const semPrazo = item('ALTA', null);
    const venceDepois = item('ALTA', 3);
    const venceAntes = item('ALTA', 1);
    expect([semPrazo, venceDepois, venceAntes].sort(compararNaFila)).toEqual([
      venceAntes,
      venceDepois,
      semPrazo,
    ]);
  });

  it('empate total: a mais antiga primeiro', () => {
    const nova = item('ALTA', 2, 1);
    const antiga = item('ALTA', 2, 5);
    expect([nova, antiga].sort(compararNaFila)).toEqual([antiga, nova]);
  });
});
