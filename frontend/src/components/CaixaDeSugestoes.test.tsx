import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import * as sistema from '@/lib/sistema';
import { sugestoes } from '@/lib/sugestoes';
import { CaixaDeSugestoes } from './CaixaDeSugestoes';

vi.mock('next/navigation', () => ({ usePathname: () => '/indicadores' }));

function versao(sugestoesLigadas?: boolean) {
  vi.spyOn(sistema, 'versaoNoAr').mockResolvedValue({
    versao: 'a1b2c3d',
    ambiente: 'staging',
    construidoEm: null,
    ...(sugestoesLigadas === undefined ? {} : { sugestoes: sugestoesLigadas }),
  });
}

async function preencher() {
  await userEvent.click(screen.getByRole('button', { name: 'Sugestões' }));
  await userEvent.selectOptions(screen.getByLabelText('O que é?'), 'PROBLEMA');
  await userEvent.type(screen.getByLabelText('Título'), 'Filtro sumiu');
  await userEvent.type(
    screen.getByLabelText('Conte com detalhes'),
    'Não acho o filtro de filial.',
  );
}

describe('CaixaDeSugestoes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('não aparece quando o ambiente não ligou a caixa', async () => {
    const consulta = vi.spyOn(sistema, 'versaoNoAr');
    versao(false);
    render(<CaixaDeSugestoes />);
    await waitFor(() => expect(consulta).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Sugestões' })).toBeNull();
  });

  it('também some se a API antiga não informa o campo', async () => {
    versao();
    render(<CaixaDeSugestoes />);
    await waitFor(() => expect(sistema.versaoNoAr).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Sugestões' })).toBeNull();
  });

  it('envia a mensagem com a tela de origem e confirma', async () => {
    versao(true);
    const enviar = vi
      .spyOn(sugestoes, 'enviar')
      .mockResolvedValue({ enviada: true });
    render(<CaixaDeSugestoes />);
    await screen.findByRole('button', { name: 'Sugestões' });

    await preencher();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(enviar).toHaveBeenCalledWith({
      categoria: 'PROBLEMA',
      titulo: 'Filtro sumiu',
      texto: 'Não acho o filtro de filial.',
      pagina: '/indicadores',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Recebido, obrigado!',
    );

    // Dá para mandar outra, com o formulário limpo
    await userEvent.click(screen.getByRole('button', { name: 'Enviar outra' }));
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });

  it('mostra o motivo quando o envio falha e mantém o que foi escrito', async () => {
    versao(true);
    vi.spyOn(sugestoes, 'enviar').mockRejectedValue(
      new ErroDaApi(
        422,
        'REGRA_DE_NEGOCIO',
        'O envio de e-mail não está configurado',
      ),
    );
    render(<CaixaDeSugestoes />);
    await screen.findByRole('button', { name: 'Sugestões' });

    await preencher();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O envio de e-mail não está configurado',
    );
    expect(screen.getByLabelText('Título')).toHaveValue('Filtro sumiu');
  });

  it('cancelar fecha a janela', async () => {
    versao(true);
    render(<CaixaDeSugestoes />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sugestões' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Título')).toBeNull();
  });
});
