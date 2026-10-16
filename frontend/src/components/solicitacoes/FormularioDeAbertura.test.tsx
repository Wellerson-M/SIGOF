import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { api, type Resumo } from '@/lib/solicitacoes';
import { FormularioDeAbertura } from './FormularioDeAbertura';

const criada = {
  id: 'nova',
  protocolo: 'SOL-2026-10-0042',
} as Resumo;

async function preencher() {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Número do CTe'), '12345');
  await usuario.type(
    screen.getByLabelText('O que precisa ser corrigido'),
    'Mercadoria recusada, emitir reversão.',
  );
  return usuario;
}

describe('FormularioDeAbertura', () => {
  it('abre e mostra o protocolo', async () => {
    const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
    render(<FormularioDeAbertura />);

    const usuario = await preencher();
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(abrir).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'REVERSAO',
        cte: '12345',
        prioridade: 'MEDIA',
        confirmarDuplicidade: false,
      }),
    );
    expect(await screen.findByText('SOL-2026-10-0042')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver a solicitação' }),
    ).toHaveAttribute('href', '/solicitacoes/nova');
  });

  it('duplicidade: mostra a existente e deixa abrir mesmo assim', async () => {
    const abrir = vi
      .spyOn(api, 'abrir')
      .mockRejectedValueOnce(
        new ErroDaApi(409, 'CONFLITO', 'Já existe', {
          duplicidades: [
            {
              id: 'velha',
              protocolo: 'SOL-2026-10-0001',
              status: 'EM_ANDAMENTO',
              criadoEm: '2026-10-14T12:00:00Z',
              documento: 'CTE',
              valor: '12345',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(criada);
    render(<FormularioDeAbertura />);

    const usuario = await preencher();
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(
      await screen.findByRole('link', { name: 'SOL-2026-10-0001' }),
    ).toHaveAttribute('href', '/solicitacoes/velha');

    await usuario.click(
      screen.getByRole('button', { name: 'Abrir mesmo assim' }),
    );

    expect(abrir).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmarDuplicidade: true }),
    );
    expect(await screen.findByText('SOL-2026-10-0042')).toBeInTheDocument();
  });

  it('troca de pagador pede o pagador correto', async () => {
    render(<FormularioDeAbertura />);
    expect(screen.queryByLabelText('Pagador correto')).toBeNull();

    await userEvent
      .setup()
      .selectOptions(
        screen.getByLabelText('Tipo de ocorrência'),
        'TROCA_PAGADOR',
      );

    expect(screen.getByLabelText('Pagador correto')).toBeInTheDocument();
  });

  it('mostra o motivo de cada campo recusado pela API', async () => {
    vi.spyOn(api, 'abrir').mockRejectedValue(
      new ErroDaApi(400, 'VALIDACAO', 'Dados inválidos', [
        {
          campo: 'descricao',
          mensagem: 'Descreva o problema com pelo menos 10 caracteres',
        },
      ]),
    );
    render(<FormularioDeAbertura />);

    const usuario = await preencher();
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(
      await screen.findByText(
        'Descreva o problema com pelo menos 10 caracteres',
      ),
    ).toBeInTheDocument();
  });
});
