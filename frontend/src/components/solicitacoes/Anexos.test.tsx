import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import {
  api,
  problemaNoArquivo,
  tamanhoLegivel,
  type Anexo,
} from '@/lib/solicitacoes';
import { Anexos, enviarAnexos } from './Anexos';

const pdf = (nome = 'nota.pdf', tamanho = 1000) =>
  new File([new Uint8Array(tamanho)], nome, { type: 'application/pdf' });

const ANEXO: Anexo = {
  id: 'a1',
  nomeArquivo: 'canhoto.pdf',
  tipoMime: 'application/pdf',
  tamanhoBytes: 1_572_864,
  etapa: 'ANDAMENTO',
  mensagemId: null,
  enviadoPor: { id: 'u1', nome: 'Sofia' },
  criadoEm: '2026-10-16T10:00:00Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('regras de arquivo no navegador', () => {
  it('recusa extensão, tamanho e vazio antes de enviar', () => {
    expect(problemaNoArquivo(pdf())).toBeNull();
    expect(problemaNoArquivo(pdf('virus.exe'))).toContain('PDF, PNG, JPG');
    expect(problemaNoArquivo(pdf('grande.pdf', 6 * 1024 * 1024))).toContain(
      '5 MB',
    );
    expect(problemaNoArquivo(pdf('vazio.pdf', 0))).toContain('vazio');
  });

  it('tamanho legível', () => {
    expect(tamanhoLegivel(300)).toBe('1 KB');
    expect(tamanhoLegivel(820 * 1024)).toBe('820 KB');
    expect(tamanhoLegivel(1_572_864)).toBe('1,5 MB');
  });

  it('enviarAnexos envia os bons e junta os motivos dos recusados', async () => {
    const anexar = vi
      .spyOn(api, 'anexar')
      .mockResolvedValueOnce(ANEXO)
      .mockRejectedValueOnce(
        new ErroDaApi(422, 'REGRA_DE_NEGOCIO', 'Tipo de arquivo não aceito'),
      );
    const erros = await enviarAnexos('s1', [
      pdf('a.pdf'),
      pdf('b.exe'),
      pdf('c.pdf'),
    ]);
    expect(anexar).toHaveBeenCalledTimes(2);
    expect(erros).toEqual([
      'b.exe: envie PDF, PNG, JPG, WEBP ou XML',
      'c.pdf: Tipo de arquivo não aceito',
    ]);
  });
});

describe('Anexos (detalhe)', () => {
  const criarUrl = vi.fn(() => 'blob:sigof/1');
  beforeEach(() => {
    URL.createObjectURL = criarUrl;
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it('lista os arquivos e abre o PDF numa aba nova', async () => {
    const aba = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    vi.spyOn(api, 'baixarAnexo').mockResolvedValue(new Blob(['%PDF']));
    render(
      <Anexos
        solicitacaoId="s1"
        anexos={[ANEXO]}
        podeAnexar
        aoMudar={vi.fn()}
      />,
    );

    expect(screen.getByText('Anexos (1)')).toBeInTheDocument();
    expect(screen.getByText(/1,5 MB · Sofia/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('canhoto.pdf'));
    expect(api.baixarAnexo).toHaveBeenCalledWith('s1', 'a1');
    expect(aba.location.href).toBe('blob:sigof/1');
  });

  it('XML é baixado, sem abrir aba', async () => {
    const abrir = vi.spyOn(window, 'open');
    const clicar = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    vi.spyOn(api, 'baixarAnexo').mockResolvedValue(new Blob(['<xml/>']));
    render(
      <Anexos
        solicitacaoId="s1"
        anexos={[
          { ...ANEXO, nomeArquivo: 'nfe.xml', tipoMime: 'application/xml' },
        ]}
        podeAnexar
        aoMudar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('nfe.xml'));
    expect(abrir).not.toHaveBeenCalled();
    expect(clicar).toHaveBeenCalled();
  });

  it('falha no download fecha a aba e mostra o motivo', async () => {
    const aba = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    vi.spyOn(api, 'baixarAnexo').mockRejectedValue(
      new ErroDaApi(404, 'NAO_ENCONTRADO', 'Anexo não encontrado'),
    );
    render(
      <Anexos
        solicitacaoId="s1"
        anexos={[ANEXO]}
        podeAnexar
        aoMudar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('canhoto.pdf'));
    expect(await screen.findByText('Anexo não encontrado')).toBeInTheDocument();
    expect(aba.close).toHaveBeenCalled();
  });

  it('anexa os escolhidos, respeitando o limite, e recarrega', async () => {
    const anexar = vi.spyOn(api, 'anexar').mockResolvedValue(ANEXO);
    const aoMudar = vi.fn().mockResolvedValue(undefined);
    const nove = Array.from({ length: 29 }, (_, i) => ({
      ...ANEXO,
      id: `a${i}`,
    }));
    render(
      <Anexos solicitacaoId="s1" anexos={nove} podeAnexar aoMudar={aoMudar} />,
    );

    await userEvent.upload(
      screen.getByLabelText('Escolher arquivos para anexar'),
      [pdf('1.pdf'), pdf('2.pdf')],
    );
    expect(anexar).toHaveBeenCalledTimes(1);
    expect(aoMudar).toHaveBeenCalled();
    expect(
      await screen.findByText('Cabem só mais 1 arquivo(s) nesta solicitação'),
    ).toBeInTheDocument();
  });

  it('encerrada: sem botão de anexar', () => {
    render(
      <Anexos
        solicitacaoId="s1"
        anexos={[]}
        podeAnexar={false}
        aoMudar={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum arquivo.')).toBeInTheDocument();
    expect(screen.queryByText('Anexar arquivo')).toBeNull();
  });

  it('separa os grupos por etapa quando há mais de um', () => {
    render(
      <Anexos
        solicitacaoId="s1"
        anexos={[
          { ...ANEXO, id: 'a', nomeArquivo: 'pedido.pdf', etapa: 'ABERTURA' },
          {
            ...ANEXO,
            id: 'b',
            nomeArquivo: 'cte-final.pdf',
            etapa: 'RESOLUCAO',
          },
        ]}
        podeAnexar={false}
        aoMudar={vi.fn()}
      />,
    );
    expect(screen.getByText('Enviados na abertura')).toBeInTheDocument();
    expect(screen.getByText('Enviados ao resolver')).toBeInTheDocument();
    expect(screen.queryByText('Durante o atendimento')).toBeNull();
  });
});
