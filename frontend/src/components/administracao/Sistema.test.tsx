import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as sistema from '@/lib/sistema';
import { VersaoDoSistema } from '../VersaoDoSistema';
import { Sistema } from './Sistema';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('versão no ar', () => {
  it('a aba Sistema mostra ambiente, commit com link e data', async () => {
    vi.spyOn(sistema, 'versaoNoAr').mockResolvedValue({
      versao: SHA,
      ambiente: 'staging',
      construidoEm: '2026-10-16T15:30:00Z',
    });
    render(<Sistema />);

    expect(
      await screen.findByText('Homologação (staging)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Commit a1b2c3d' }),
    ).toHaveAttribute(
      'href',
      `https://github.com/Wellerson-M/SIGOF/commit/${SHA}`,
    );
    expect(screen.getByText('Publicada em')).toBeInTheDocument();
  });

  it('local: sem link e sem data', async () => {
    vi.spyOn(sistema, 'versaoNoAr').mockResolvedValue({
      versao: 'local',
      ambiente: 'development',
      construidoEm: null,
    });
    render(<Sistema />);

    expect(await screen.findByText('Local')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Publicada em')).toBeNull();
  });

  it('o rodapé do menu mostra o ambiente e a versão; se falhar, some', async () => {
    const versao = vi.spyOn(sistema, 'versaoNoAr').mockResolvedValue({
      versao: '1.0.0',
      ambiente: 'production',
      construidoEm: null,
    });
    const { unmount } = render(<VersaoDoSistema />);
    // Ambiente e versão no mesmo parágrafo, um em cada linha
    expect(await screen.findByText(/Release v1\.0\.0/)).toHaveTextContent(
      'ProduçãoRelease v1.0.0',
    );
    unmount();

    versao.mockRejectedValue(new Error('fora do ar'));
    const { container } = render(<VersaoDoSistema />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
