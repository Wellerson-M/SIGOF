import { describe, expect, it } from 'vitest';
import {
  adicionarMinutosUteis,
  estaVencido,
  EXPEDIENTE_PADRAO,
  iniciarSla,
  minutosUteisEntre,
  minutosUteisRestantes,
  pausarSla,
  retomarSla,
  SLA_ATENDIMENTO_INICIAL_MINUTOS,
  SlaInvalidoError,
  expedienteDaEmpresa,
  offsetDoFuso,
  type Expediente,
} from './sla.js';

/** Constrói um instante a partir da hora de parede local (UTC-3). */
function local(data: string, hora: string): Date {
  return new Date(`${data}T${hora}:00-03:00`);
}

// 2026-09-18 é sexta-feira; 2026-09-19 e 20 são o fim de semana;
// 2026-09-21 é segunda-feira.

describe('adicionarMinutosUteis', () => {
  it('soma dentro do mesmo dia quando cabe no expediente', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-22', '09:00'), 240);

    expect(resultado).toEqual(local('2026-09-22', '13:00'));
  });

  it('atravessa a noite em vez de somar no relógio corrido', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-22', '16:00'), 240);

    // 2h na terça + 2h na quarta, e não 20h da terça
    expect(resultado).toEqual(local('2026-09-23', '10:00'));
  });

  it('pula o fim de semana: sexta 17h + 4h úteis vence segunda 11h', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-18', '17:00'), 240);

    expect(resultado).toEqual(local('2026-09-21', '11:00'));
  });

  it('adia abertura feita antes do expediente para o início do dia', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-21', '06:00'), 60);

    expect(resultado).toEqual(local('2026-09-21', '09:00'));
  });

  it('adia abertura feita depois do expediente para o dia seguinte', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-21', '20:00'), 60);

    expect(resultado).toEqual(local('2026-09-22', '09:00'));
  });

  it('trata o instante exato de encerramento como fim do dia', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-21', '18:00'), 60);

    expect(resultado).toEqual(local('2026-09-22', '09:00'));
  });

  it('adia abertura feita no fim de semana para a segunda', () => {
    const resultado = adicionarMinutosUteis(local('2026-09-19', '10:00'), 120);

    expect(resultado).toEqual(local('2026-09-21', '10:00'));
  });

  it('acumula ao longo de vários dias', () => {
    // 10h úteis por dia: 25h úteis = 2 dias e meio
    const resultado = adicionarMinutosUteis(local('2026-09-21', '08:00'), 1500);

    expect(resultado).toEqual(local('2026-09-23', '13:00'));
  });

  it('rejeita minutos negativos', () => {
    expect(() =>
      adicionarMinutosUteis(local('2026-09-21', '09:00'), -1),
    ).toThrow(SlaInvalidoError);
  });

  it('rejeita expediente com início depois do fim', () => {
    const invalido: Expediente = {
      ...EXPEDIENTE_PADRAO,
      inicioMinuto: 19 * 60,
    };

    expect(() =>
      adicionarMinutosUteis(local('2026-09-21', '09:00'), 60, invalido),
    ).toThrow(/anterior ao término/);
  });

  it('rejeita expediente sem dias úteis', () => {
    const invalido: Expediente = { ...EXPEDIENTE_PADRAO, diasUteis: [] };

    expect(() =>
      adicionarMinutosUteis(local('2026-09-21', '09:00'), 60, invalido),
    ).toThrow(/ao menos um dia útil/);
  });
});

describe('minutosUteisEntre', () => {
  it('conta minutos dentro do mesmo dia', () => {
    expect(
      minutosUteisEntre(
        local('2026-09-22', '09:00'),
        local('2026-09-22', '11:00'),
      ),
    ).toBe(120);
  });

  it('desconta o período fora do expediente', () => {
    expect(
      minutosUteisEntre(
        local('2026-09-22', '17:00'),
        local('2026-09-23', '09:00'),
      ),
    ).toBe(120);
  });

  it('ignora o fim de semana inteiro', () => {
    expect(
      minutosUteisEntre(
        local('2026-09-19', '08:00'),
        local('2026-09-20', '20:00'),
      ),
    ).toBe(0);
  });

  it('retorna zero quando o fim é anterior ao início', () => {
    expect(
      minutosUteisEntre(
        local('2026-09-22', '11:00'),
        local('2026-09-22', '09:00'),
      ),
    ).toBe(0);
  });
});

describe('ciclo de vida do SLA', () => {
  const abertura = local('2026-09-21', '09:00');

  it('inicia com vencimento de 4 horas úteis', () => {
    const estado = iniciarSla(abertura);

    expect(estado.venceEm).toEqual(local('2026-09-21', '13:00'));
    expect(estado.pausadoEm).toBeNull();
    expect(estado.minutosPausados).toBe(0);
  });

  it('usa a constante da RFC como prazo padrão', () => {
    expect(SLA_ATENDIMENTO_INICIAL_MINUTOS).toBe(240);
  });

  it('não vence enquanto está pausado', () => {
    const pausado = pausarSla(
      iniciarSla(abertura),
      local('2026-09-21', '10:00'),
    );

    // Instante muito além do vencimento original
    expect(estaVencido(pausado, local('2026-09-25', '17:00'))).toBe(false);
  });

  it('vence quando o prazo passa sem pausa', () => {
    const estado = iniciarSla(abertura);

    expect(estaVencido(estado, local('2026-09-21', '12:59'))).toBe(false);
    expect(estaVencido(estado, local('2026-09-21', '13:01'))).toBe(true);
  });

  it('devolve ao prazo o tempo útil parado', () => {
    const estado = iniciarSla(abertura);
    const pausado = pausarSla(estado, local('2026-09-21', '10:00'));
    const retomado = retomarSla(pausado, local('2026-09-21', '12:00'));

    expect(retomado.minutosPausados).toBe(120);
    expect(retomado.venceEm).toEqual(local('2026-09-21', '15:00'));
    expect(retomado.pausadoEm).toBeNull();
  });

  it('conta apenas o tempo útil de uma pausa que atravessa o fim de semana', () => {
    const estado = iniciarSla(local('2026-09-18', '09:00'));
    const pausado = pausarSla(estado, local('2026-09-18', '17:00'));
    const retomado = retomarSla(pausado, local('2026-09-21', '09:00'));

    // 1h na sexta + 1h na segunda, e não as 64h corridas
    expect(retomado.minutosPausados).toBe(120);
  });

  it('acumula pausas sucessivas', () => {
    let estado = iniciarSla(abertura);

    estado = pausarSla(estado, local('2026-09-21', '10:00'));
    estado = retomarSla(estado, local('2026-09-21', '11:00'));
    estado = pausarSla(estado, local('2026-09-21', '12:00'));
    estado = retomarSla(estado, local('2026-09-21', '13:00'));

    expect(estado.minutosPausados).toBe(120);
    expect(estado.venceEm).toEqual(local('2026-09-21', '15:00'));
  });

  it('rejeita pausar duas vezes', () => {
    const pausado = pausarSla(
      iniciarSla(abertura),
      local('2026-09-21', '10:00'),
    );

    expect(() => pausarSla(pausado, local('2026-09-21', '11:00'))).toThrow(
      /já está pausado/,
    );
  });

  it('rejeita retomar um SLA que não está pausado', () => {
    expect(() =>
      retomarSla(iniciarSla(abertura), local('2026-09-21', '10:00')),
    ).toThrow(/não está pausado/);
  });
});

describe('minutosUteisRestantes', () => {
  const abertura = local('2026-09-21', '09:00');

  it('conta o que falta até o vencimento', () => {
    const estado = iniciarSla(abertura);

    expect(minutosUteisRestantes(estado, local('2026-09-21', '11:00'))).toBe(
      120,
    );
  });

  it('congela a contagem enquanto pausado', () => {
    const pausado = pausarSla(
      iniciarSla(abertura),
      local('2026-09-21', '10:00'),
    );

    expect(minutosUteisRestantes(pausado, local('2026-09-21', '16:00'))).toBe(
      180,
    );
  });

  it('retorna zero depois de vencido', () => {
    const estado = iniciarSla(abertura);

    expect(minutosUteisRestantes(estado, local('2026-09-21', '17:00'))).toBe(0);
  });
});

describe('expediente configurado por empresa', () => {
  it('converte os parâmetros gravados na empresa', () => {
    expect(
      expedienteDaEmpresa({
        fusoHorario: 'America/Manaus',
        expedienteInicioMinuto: 450,
        expedienteFimMinuto: 1050,
        diasUteis: [1, 2, 3, 4, 5, 6],
      }),
    ).toEqual({
      inicioMinuto: 450,
      fimMinuto: 1050,
      diasUteis: [1, 2, 3, 4, 5, 6],
      fusoHorario: 'America/Manaus',
    });
  });

  it('respeita expediente com minutos quebrados (07:30 às 17:30)', () => {
    const expediente: Expediente = {
      ...EXPEDIENTE_PADRAO,
      inicioMinuto: 7 * 60 + 30,
      fimMinuto: 17 * 60 + 30,
    };

    // Aberta às 16:30 de segunda: 1h hoje + 3h amanhã a partir das 07:30
    expect(
      adicionarMinutosUteis(local('2026-09-21', '16:30'), 240, expediente),
    ).toEqual(local('2026-09-22', '10:30'));
  });

  it('conta o sábado quando ele é dia útil da empresa', () => {
    const expediente: Expediente = {
      ...EXPEDIENTE_PADRAO,
      diasUteis: [1, 2, 3, 4, 5, 6],
    };

    // Sexta 17:00 → 1h na sexta + 3h no sábado
    expect(
      adicionarMinutosUteis(local('2026-09-25', '17:00'), 240, expediente),
    ).toEqual(local('2026-09-26', '11:00'));
  });

  it('usa o fuso da empresa (Manaus, UTC-4)', () => {
    const expediente: Expediente = {
      ...EXPEDIENTE_PADRAO,
      fusoHorario: 'America/Manaus',
    };

    // 09:00 em Manaus é 10:00 em Brasília; vence às 13:00 de Manaus
    expect(
      adicionarMinutosUteis(
        new Date('2026-09-21T09:00:00-04:00'),
        240,
        expediente,
      ),
    ).toEqual(new Date('2026-09-21T13:00:00-04:00'));
  });

  it('rejeita fuso desconhecido', () => {
    const invalido: Expediente = {
      ...EXPEDIENTE_PADRAO,
      fusoHorario: 'Marte/Olympus',
    };

    expect(() =>
      adicionarMinutosUteis(local('2026-09-21', '09:00'), 60, invalido),
    ).toThrow(/Fuso horário desconhecido/);
  });

  it.each([
    [{ inicioMinuto: -1 }],
    [{ fimMinuto: 24 * 60 + 1 }],
    [{ inicioMinuto: 480.5 }],
  ])('rejeita expediente fora do dia: %o', (parcial) => {
    const invalido: Expediente = { ...EXPEDIENTE_PADRAO, ...parcial };

    expect(() =>
      adicionarMinutosUteis(local('2026-09-21', '09:00'), 60, invalido),
    ).toThrow(/entre 00:00 e 24:00/);
  });

  it('rejeita dia útil fora de 0 a 6', () => {
    const invalido: Expediente = { ...EXPEDIENTE_PADRAO, diasUteis: [1, 7] };

    expect(() =>
      adicionarMinutosUteis(local('2026-09-21', '09:00'), 60, invalido),
    ).toThrow(/0 \(domingo\) a 6 \(sábado\)/);
  });
});

describe('offsetDoFuso', () => {
  it.each([
    ['America/Sao_Paulo', -180],
    ['America/Manaus', -240],
    ['America/Noronha', -120],
    ['UTC', 0],
  ])('%s → %i minutos', (fuso, esperado) => {
    expect(offsetDoFuso(fuso, new Date('2026-09-21T12:00:00Z'))).toBe(esperado);
  });
});
