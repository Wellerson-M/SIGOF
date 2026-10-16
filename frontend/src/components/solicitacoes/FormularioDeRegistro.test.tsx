import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { cadastros } from '@/lib/cadastros';
import { api, type Resumo } from '@/lib/solicitacoes';
import { FormularioDeRegistro } from './FormularioDeRegistro';

function registrada(n: number): Resumo {
  return {
    id: `r${n}`,
    protocolo: `SOL-2026-10-00${n}0`,
    tipo: 'REVERSAO',
    cte: `5000${n}`,
  } as Resumo;
}

describe('FormularioDeRegistro', () => {
  it('registra já resolvida, com a causa, e fica pronto para o próximo', async () => {
    vi.spyOn(cadastros, 'filiais').mockResolvedValue([
      { id: 'cwb', nome: 'Curitiba', ativa: true },
    ]);
    vi.spyOn(cadastros, 'causas').mockResolvedValue([
      {
        id: 'dig',
        nome: 'Erro de digitação',
        opcoes: ['Ana', 'Bruno'],
        rotuloDasOpcoes: 'Digitador',
        ordem: 1,
        ativa: true,
      },
    ]);
    const abrir = vi
      .spyOn(api, 'abrir')
      .mockResolvedValueOnce(registrada(1))
      .mockResolvedValueOnce(registrada(2));
    render(<FormularioDeRegistro />);
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('CTe'), '50001');
    await usuario.type(screen.getByLabelText('O que era'), 'Reversão no zap');
    await usuario.type(screen.getByLabelText('O que foi feito'), 'Emitida');
    await usuario.selectOptions(
      await screen.findByLabelText('De quem foi o erro'),
      'dig',
    );
    await usuario.selectOptions(screen.getByLabelText('Digitador'), 'Ana');
    await usuario.click(
      screen.getByRole('button', { name: 'Registrar como concluída' }),
    );

    expect(abrir).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'REVERSAO',
        cte: '50001',
        filialId: 'cwb',
        descricao: 'Reversão no zap',
        registro: {
          acaoTomada: 'Emitida',
          classificacao: { causaId: 'dig', detalhe: 'Ana' },
        },
      }),
    );
    expect(await screen.findByText('SOL-2026-10-0010')).toBeInTheDocument();
    // Limpa o que muda a cada registro; a filial fica
    expect(screen.getByLabelText('CTe')).toHaveValue('');
    expect(screen.getByLabelText('O que era')).toHaveValue('');
    expect(screen.getByLabelText('Filial')).toHaveValue('cwb');
    expect(screen.getByLabelText('CTe')).toHaveFocus();

    await usuario.type(screen.getByLabelText('CTe'), '50002');
    await usuario.type(screen.getByLabelText('O que era'), 'Outra');
    await usuario.type(screen.getByLabelText('O que foi feito'), 'Feito');
    await usuario.keyboard('{Enter}');
    expect(await screen.findByText('SOL-2026-10-0020')).toBeInTheDocument();
    expect(screen.getByText('SOL-2026-10-0010')).toBeInTheDocument();
  });

  it('duplicidade: mostra e deixa registrar mesmo assim', async () => {
    vi.spyOn(cadastros, 'filiais').mockResolvedValue([]);
    vi.spyOn(cadastros, 'causas').mockResolvedValue([]);
    const abrir = vi
      .spyOn(api, 'abrir')
      .mockRejectedValueOnce(
        new ErroDaApi(409, 'CONFLITO', 'Já existe', {
          duplicidades: [
            {
              id: 'velha',
              protocolo: 'SOL-2026-10-0001',
              status: 'RESOLVIDO',
              criadoEm: '2026-10-15T12:00:00Z',
              documento: 'CTE',
              valor: '50001',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(registrada(3));
    render(<FormularioDeRegistro />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('CTe'), '50001');
    await usuario.type(screen.getByLabelText('O que era'), 'Reversão');
    await usuario.type(screen.getByLabelText('O que foi feito'), 'Emitida');
    await usuario.click(
      screen.getByRole('button', { name: 'Registrar como concluída' }),
    );
    expect(
      await screen.findByRole('link', { name: 'SOL-2026-10-0001' }),
    ).toBeInTheDocument();

    await usuario.click(
      screen.getByRole('button', { name: 'Registrar mesmo assim' }),
    );
    expect(abrir).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmarDuplicidade: true }),
    );
    expect(await screen.findByText('SOL-2026-10-0030')).toBeInTheDocument();
  });
});
