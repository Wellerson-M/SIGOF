import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { cadastros } from '@/lib/cadastros';
import { Filiais } from './Filiais';

describe('Filiais', () => {
  it('lista com as desativadas, cria e desativa', async () => {
    const listar = vi.spyOn(cadastros, 'filiais').mockResolvedValue([
      { id: 'cwb', nome: 'Curitiba', ativa: true },
      { id: 'old', nome: 'Antiga', ativa: false },
    ]);
    const criar = vi
      .spyOn(cadastros, 'criarFilial')
      .mockResolvedValue({ id: 'jve', nome: 'Joinville', ativa: true });
    const alterar = vi
      .spyOn(cadastros, 'alterarFilial')
      .mockResolvedValue({ id: 'cwb', nome: 'Curitiba', ativa: false });
    render(<Filiais />);

    expect(await screen.findByText('Curitiba')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith(true);
    expect(screen.getByText('desativada')).toBeInTheDocument();

    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Nova filial'), 'Joinville');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(criar).toHaveBeenCalledWith('Joinville');

    await usuario.click(
      screen.getAllByRole('button', { name: 'Desativar' })[0]!,
    );
    expect(alterar).toHaveBeenCalledWith('cwb', { ativa: false });
  });

  it('renomeia e mostra o erro da API', async () => {
    vi.spyOn(cadastros, 'filiais').mockResolvedValue([
      { id: 'cwb', nome: 'Curitiba', ativa: true },
    ]);
    vi.spyOn(cadastros, 'alterarFilial').mockRejectedValue(
      new ErroDaApi(409, 'CONFLITO', 'Já existe um item com este nome'),
    );
    render(<Filiais />);

    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole('button', { name: 'Renomear' }),
    );
    const campo = screen.getByLabelText('Nome da filial');
    await usuario.clear(campo);
    await usuario.type(campo, 'Joinville');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Já existe um item com este nome'),
    ).toBeInTheDocument();
  });
});
