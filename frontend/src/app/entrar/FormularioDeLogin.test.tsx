import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { CHAVE_EMPRESA, FormularioDeLogin } from './FormularioDeLogin';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const entrar = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  entrar: (...args: unknown[]) => entrar(...args),
}));

async function preencher(empresa: string, email: string, senha: string) {
  const usuario = userEvent.setup();
  if (empresa) await usuario.type(screen.getByLabelText('Empresa'), empresa);
  if (email) await usuario.type(screen.getByLabelText('E-mail'), email);
  if (senha) await usuario.type(screen.getByLabelText('Senha'), senha);
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('FormularioDeLogin', () => {
  beforeEach(() => {
    replace.mockReset();
    entrar.mockReset();
    localStorage.clear();
  });

  it('pede para preencher tudo antes de enviar', async () => {
    render(<FormularioDeLogin />);

    await preencher('', 'a@b.test', '');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Preencha empresa, e-mail e senha.',
    );
    expect(entrar).not.toHaveBeenCalled();
  });

  it('com login aceito, lembra a empresa e vai para o painel', async () => {
    entrar.mockResolvedValue(undefined);
    render(<FormularioDeLogin />);

    await preencher('Transportadora-Demo', 'a@b.test', 'Demo@2026');

    expect(entrar).toHaveBeenCalledWith(
      'Transportadora-Demo',
      'a@b.test',
      'Demo@2026',
    );
    expect(localStorage.getItem(CHAVE_EMPRESA)).toBe('transportadora-demo');
    expect(replace).toHaveBeenCalledWith('/inicio');
  });

  it('com login recusado, mostra a mensagem da API e limpa a senha', async () => {
    entrar.mockRejectedValue(
      new ErroDaApi(
        401,
        'NAO_AUTENTICADO',
        'Empresa, e-mail ou senha inválidos',
      ),
    );
    render(<FormularioDeLogin />);

    await preencher('demo', 'a@b.test', 'errada');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Empresa, e-mail ou senha inválidos',
    );
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(replace).not.toHaveBeenCalled();
  });

  it('já vem com a empresa usada da última vez', () => {
    localStorage.setItem(CHAVE_EMPRESA, 'transportadora-demo');

    render(<FormularioDeLogin />);

    expect(screen.getByLabelText('Empresa')).toHaveValue('transportadora-demo');
  });
});
