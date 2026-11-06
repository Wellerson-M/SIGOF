import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { CHAVE_EMPRESA } from '../entrar/FormularioDeLogin';
import { FormularioEsqueciSenha } from './FormularioEsqueciSenha';

const pedirLinkDeSenha = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  pedirLinkDeSenha: (...args: unknown[]) => pedirLinkDeSenha(...args),
}));

const TEXTO_DA_API = 'Se o e-mail estiver cadastrado, enviamos um link.';

describe('FormularioEsqueciSenha', () => {
  beforeEach(() => {
    pedirLinkDeSenha.mockReset();
    localStorage.clear();
  });

  it('pede para preencher empresa e e-mail antes de enviar', async () => {
    render(<FormularioEsqueciSenha />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Enviar o link' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Preencha a empresa e o e-mail.',
    );
    expect(pedirLinkDeSenha).not.toHaveBeenCalled();
  });

  it('envia o pedido e mostra o texto que a API devolveu', async () => {
    pedirLinkDeSenha.mockResolvedValue(TEXTO_DA_API);
    render(<FormularioEsqueciSenha />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Empresa'), ' demo ');
    await usuario.type(screen.getByLabelText('E-mail'), 'ana@demo.test');
    await usuario.click(screen.getByRole('button', { name: 'Enviar o link' }));

    expect(pedirLinkDeSenha).toHaveBeenCalledWith('demo', 'ana@demo.test');
    expect(await screen.findByRole('status')).toHaveTextContent(TEXTO_DA_API);
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('já vem com a empresa lembrada pelo login', async () => {
    localStorage.setItem(CHAVE_EMPRESA, 'transportadora-demo');
    render(<FormularioEsqueciSenha />);

    expect(await screen.findByLabelText('Empresa')).toHaveValue(
      'transportadora-demo',
    );
  });

  it('mostra o erro da API e deixa tentar de novo', async () => {
    pedirLinkDeSenha.mockRejectedValue(
      new ErroDaApi(429, 'MUITAS_TENTATIVAS', 'Muitas tentativas.'),
    );
    render(<FormularioEsqueciSenha />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Empresa'), 'demo');
    await usuario.type(screen.getByLabelText('E-mail'), 'ana@demo.test');
    await usuario.click(screen.getByRole('button', { name: 'Enviar o link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas.',
    );
    expect(screen.getByRole('button', { name: 'Enviar o link' })).toBeEnabled();
  });

  it('com falha inesperada, mostra um aviso genérico', async () => {
    pedirLinkDeSenha.mockRejectedValue(new Error('x'));
    render(<FormularioEsqueciSenha />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Empresa'), 'demo');
    await usuario.type(screen.getByLabelText('E-mail'), 'ana@demo.test');
    await usuario.click(screen.getByRole('button', { name: 'Enviar o link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algo deu errado',
    );
  });
});
