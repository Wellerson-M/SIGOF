import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cadastros, type ItemDeVerificacao } from '@/lib/cadastros';
import { Verificacoes } from './Verificacoes';

const DESACORDO: ItemDeVerificacao = {
  id: 'd',
  texto: 'Desacordo fiscal do CTe realizado',
  tipos: ['REVERSAO'],
  quemMarca: 'SOLICITANTE',
  obrigatorioParaResolver: false,
  ordem: 1,
  ativo: true,
};

describe('Verificações (administração)', () => {
  it('lista, cria com tipo, quem marca e obrigatoriedade, e desativa', async () => {
    vi.spyOn(cadastros, 'verificacoes').mockResolvedValue([DESACORDO]);
    const criar = vi
      .spyOn(cadastros, 'criarVerificacao')
      .mockResolvedValue({ ...DESACORDO, id: 'n' });
    const alterar = vi
      .spyOn(cadastros, 'alterarVerificacao')
      .mockResolvedValue({ ...DESACORDO, ativo: false });
    render(<Verificacoes />);

    expect(
      await screen.findByText('Desacordo fiscal do CTe realizado'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reversão · marca: Quem abriu/),
    ).toBeInTheDocument();

    const usuario = userEvent.setup();
    await usuario.type(
      screen.getByLabelText('O que marcar'),
      'Conferido com o financeiro',
    );
    await usuario.selectOptions(screen.getByLabelText('Quem marca'), 'EQUIPE');
    await usuario.click(screen.getByLabelText('Obrigatório para resolver'));
    await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }));
    expect(criar).toHaveBeenCalledWith({
      texto: 'Conferido com o financeiro',
      tipos: [],
      quemMarca: 'EQUIPE',
      obrigatorioParaResolver: true,
    });

    await usuario.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(alterar).toHaveBeenCalledWith('d', { ativo: false });
  });
});
