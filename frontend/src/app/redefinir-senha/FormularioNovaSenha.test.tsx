import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { FormularioNovaSenha, problemaNaSenha } from './FormularioNovaSenha';

const redefinirSenha = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  redefinirSenha: (...args: unknown[]) => redefinirSenha(...args),
}));

const TOKEN = 'A'.repeat(43);

function abrirComFragmento(fragmento: string) {
  globalThis.history.replaceState(null, '', `/redefinir-senha${fragmento}`);
}

async function preencher(senha: string, confirmacao: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Nova senha'), senha);
  await usuario.type(screen.getByLabelText('Repita a nova senha'), confirmacao);
  await usuario.click(
    screen.getByRole('button', { name: 'Salvar a nova senha' }),
  );
}

describe('FormularioNovaSenha', () => {
  beforeEach(() => {
    redefinirSenha.mockReset();
  });

  it('lê o token do fragmento e o tira da barra de endereço', async () => {
    abrirComFragmento(`#${TOKEN}`);
    render(<FormularioNovaSenha />);

    expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument();
    expect(globalThis.location.hash).toBe('');
  });

  it('sem token (ou token malformado), manda pedir um link novo', async () => {
    abrirComFragmento('#curto');
    render(<FormularioNovaSenha />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'link está incompleto',
    );
    expect(
      screen.getByRole('link', { name: 'Pedir um novo link' }),
    ).toHaveAttribute('href', '/esqueci-senha');
  });

  it('recusa senha fraca sem chamar a API', async () => {
    abrirComFragmento(`#${TOKEN}`);
    render(<FormularioNovaSenha />);
    await screen.findByLabelText('Nova senha');

    await preencher('curta1', 'curta1');

    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 8');
    expect(redefinirSenha).not.toHaveBeenCalled();
  });

  it('recusa quando as duas senhas não batem', async () => {
    abrirComFragmento(`#${TOKEN}`);
    render(<FormularioNovaSenha />);
    await screen.findByLabelText('Nova senha');

    await preencher('Senha@Nova1', 'Senha@Nova2');

    expect(screen.getByRole('alert')).toHaveTextContent('não são iguais');
    expect(redefinirSenha).not.toHaveBeenCalled();
  });

  it('com sucesso, avisa e leva ao login', async () => {
    redefinirSenha.mockResolvedValue(undefined);
    abrirComFragmento(`#${TOKEN}`);
    render(<FormularioNovaSenha />);
    await screen.findByLabelText('Nova senha');

    await preencher('Senha@Nova1', 'Senha@Nova1');

    expect(redefinirSenha).toHaveBeenCalledWith(TOKEN, 'Senha@Nova1');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha trocada',
    );
    expect(
      screen.getByRole('link', { name: 'Ir para o login' }),
    ).toHaveAttribute('href', '/entrar');
  });

  it('com link vencido, mostra a mensagem da API e oferece um link novo', async () => {
    redefinirSenha.mockRejectedValue(
      new ErroDaApi(422, 'REGRA_DE_NEGOCIO', 'Este link não vale mais.'),
    );
    abrirComFragmento(`#${TOKEN}`);
    render(<FormularioNovaSenha />);
    await screen.findByLabelText('Nova senha');

    await preencher('Senha@Nova1', 'Senha@Nova1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este link não vale mais.',
    );
    expect(
      screen.getByRole('link', { name: 'Pedir um novo link' }),
    ).toBeInTheDocument();
  });

  it('com falha inesperada, não oferece link novo', async () => {
    redefinirSenha.mockRejectedValue(new Error('x'));
    abrirComFragmento(`#${TOKEN}`);
    render(<FormularioNovaSenha />);
    await screen.findByLabelText('Nova senha');

    await preencher('Senha@Nova1', 'Senha@Nova1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algo deu errado',
    );
    expect(
      screen.queryByRole('link', { name: 'Pedir um novo link' }),
    ).not.toBeInTheDocument();
  });
});

describe('problemaNaSenha', () => {
  it('aceita 8 caracteres com letra e número', () => {
    expect(problemaNaSenha('abcdefg1')).toBeNull();
  });

  it.each([
    ['curta1', 'pelo menos 8'],
    ['12345678', 'uma letra'],
    ['abcdefgh', 'um número'],
  ])('recusa %s', (senha, trecho) => {
    expect(problemaNaSenha(senha)).toContain(trecho);
  });
});
