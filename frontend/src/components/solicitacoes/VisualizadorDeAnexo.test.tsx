import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { api } from '@/lib/solicitacoes';
import { VisualizadorDeAnexo } from './VisualizadorDeAnexo';

describe('VisualizadorDeAnexo', () => {
  it('mostra o PDF na tela, com Baixar e o caminho de volta', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(api, 'baixarAnexo').mockResolvedValue(
      new Blob(['%PDF'], { type: 'application/pdf' }),
    );
    render(<VisualizadorDeAnexo solicitacaoId="s1" anexoId="a1" />);

    expect(await screen.findByTitle('Anexo')).toHaveAttribute(
      'src',
      'blob:pdf',
    );
    expect(screen.getByText('Baixar')).toHaveAttribute('href', 'blob:pdf');
    expect(screen.getByText('← Ver a solicitação')).toHaveAttribute(
      'href',
      '/solicitacoes/s1',
    );
  });

  it('XML: só oferece baixar', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:xml');
    vi.spyOn(api, 'baixarAnexo').mockResolvedValue(
      new Blob(['<x/>'], { type: 'application/xml' }),
    );
    render(<VisualizadorDeAnexo solicitacaoId="s1" anexoId="a1" />);
    expect(
      await screen.findByText(/não é mostrado na tela/),
    ).toBeInTheDocument();
  });

  it('sem acesso: mostra o motivo', async () => {
    vi.spyOn(api, 'baixarAnexo').mockRejectedValue(
      new ErroDaApi(404, 'NAO_ENCONTRADO', 'Anexo não encontrado'),
    );
    render(<VisualizadorDeAnexo solicitacaoId="s1" anexoId="a1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Anexo não encontrado',
    );
  });
});
