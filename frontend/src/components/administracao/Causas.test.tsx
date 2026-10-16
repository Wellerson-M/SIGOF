import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cadastros, type CausaDeErro } from '@/lib/cadastros';
import { Causas } from './Causas';

const DIGITACAO: CausaDeErro = {
  id: 'dig',
  nome: 'Erro de digitação',
  opcoes: ['Ana'],
  rotuloDasOpcoes: 'Digitador',
  ordem: 1,
  ativa: true,
};

describe('Causas', () => {
  it('lista, cria e edita as opções (uma por linha)', async () => {
    vi.spyOn(cadastros, 'causas').mockResolvedValue([DIGITACAO]);
    const criar = vi
      .spyOn(cadastros, 'criarCausa')
      .mockResolvedValue({
        ...DIGITACAO,
        id: 'novo',
        nome: 'Erro de cadastro',
      });
    const alterar = vi
      .spyOn(cadastros, 'alterarCausa')
      .mockResolvedValue(DIGITACAO);
    render(<Causas />);

    expect(await screen.findByText('Erro de digitação')).toBeInTheDocument();
    expect(screen.getByText('Digitador: Ana')).toBeInTheDocument();

    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Nova causa'), 'Erro de cadastro');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(criar).toHaveBeenCalledWith({ nome: 'Erro de cadastro' });

    await usuario.click(screen.getByRole('button', { name: 'Editar' }));
    const opcoes = screen.getByLabelText('Opções do “qual” (uma por linha)');
    await usuario.type(opcoes, '\n Bruno \n\nCarla');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(alterar).toHaveBeenCalledWith('dig', {
      nome: 'Erro de digitação',
      rotuloDasOpcoes: 'Digitador',
      opcoes: ['Ana', 'Bruno', 'Carla'],
    });
  });

  it('desativa', async () => {
    vi.spyOn(cadastros, 'causas').mockResolvedValue([DIGITACAO]);
    const alterar = vi
      .spyOn(cadastros, 'alterarCausa')
      .mockResolvedValue({ ...DIGITACAO, ativa: false });
    render(<Causas />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Desativar' }),
    );
    expect(alterar).toHaveBeenCalledWith('dig', { ativa: false });
  });
});
