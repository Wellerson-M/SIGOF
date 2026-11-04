import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { indicadores, lerPlanilhaDeProducao } from '@/lib/indicadores';
import { BalancoDoMes } from './BalancoDoMes';

describe('planilha de produção', () => {
  it('lê ";" do Excel, ignora o cabeçalho e linhas sem número', () => {
    const texto =
      '﻿Digitador;Quantidade\r\nAna;1.240\r\n"Bruno";300\r\n\r\nCarla;abc\r\nDavi,15\n';
    expect(lerPlanilhaDeProducao(texto)).toEqual([
      { digitador: 'Ana', ctesEmitidos: 1240 },
      { digitador: 'Bruno', ctesEmitidos: 300 },
      { digitador: 'Davi', ctesEmitidos: 15 },
    ]);
  });
});

describe('BalancoDoMes', () => {
  it('mostra o índice de reversão a cada 100 CTe emitidos', async () => {
    vi.spyOn(indicadores, 'balanco').mockResolvedValue({
      mes: '2026-10',
      linhas: [],
      importadoEm: null,
      reversoes: {
        tickets: 3,
        ctes: 6,
        porFilial: [],
        ctesEmitidos: 1200,
        indice: 0.5,
      },
    });
    render(<BalancoDoMes />);

    expect(await screen.findByText('0,5 a cada 100 CTe')).toBeInTheDocument();
    expect(
      screen.getByText(/6 CTe com reversão pedida \(3 solicitações\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/de 1\.200 CTe emitidos/)).toBeInTheDocument();
  });

  it('sem produção importada, pede a importação em vez do índice', async () => {
    vi.spyOn(indicadores, 'balanco').mockResolvedValue({
      mes: '2026-10',
      linhas: [],
      importadoEm: null,
      reversoes: {
        tickets: 1,
        ctes: 2,
        porFilial: [],
        ctesEmitidos: null,
        indice: null,
      },
    });
    render(<BalancoDoMes />);

    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Importe a produção do mês/)).toBeInTheDocument();
  });

  it('mostra a taxa por digitador e importa a produção do mês', async () => {
    const balanco = vi
      .spyOn(indicadores, 'balanco')
      .mockResolvedValueOnce({
        mes: '2026-10',
        linhas: [
          { digitador: 'Zé', ctesEmitidos: null, erros: 2, taxaDeErro: null },
        ],
        importadoEm: null,
      })
      .mockResolvedValue({
        mes: '2026-10',
        linhas: [
          { digitador: 'Zé', ctesEmitidos: 100, erros: 2, taxaDeErro: 2 },
        ],
        importadoEm: '2026-10-17T12:00:00Z',
      });
    const importar = vi
      .spyOn(indicadores, 'importarProducao')
      .mockResolvedValue({ mes: '2026-10', digitadores: 1 });
    render(<BalancoDoMes />);

    expect(await screen.findByText('Zé')).toBeInTheDocument();
    expect(screen.getByTitle('Sem produção importada')).toBeInTheDocument();

    await userEvent.upload(
      screen.getByLabelText('Planilha de produção do mês'),
      new File(['Zé;100'], 'producao.csv', { type: 'text/csv' }),
    );

    expect(importar).toHaveBeenCalledWith(expect.any(String), [
      { digitador: 'Zé', ctesEmitidos: 100 },
    ]);
    expect(
      await screen.findByTitle('Zé: 2 erros a cada 100 CTe'),
    ).toBeInTheDocument();
    expect(balanco).toHaveBeenCalledTimes(2);
  });
});
