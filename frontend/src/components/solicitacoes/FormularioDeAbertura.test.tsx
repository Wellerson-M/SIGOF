import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { cadastros } from '@/lib/cadastros';
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

  it('anexa os arquivos depois de abrir e avisa os recusados', async () => {
    vi.spyOn(api, 'abrir').mockResolvedValue(criada);
    const anexar = vi.spyOn(api, 'anexar').mockResolvedValue({
      id: 'a1',
      nomeArquivo: 'nota.pdf',
      tipoMime: 'application/pdf',
      tamanhoBytes: 10,
      enviadoPor: { id: 'u', nome: 'U' },
      criadoEm: '2026-10-16T10:00:00Z',
    });
    render(<FormularioDeAbertura />);
    const usuario = await preencher();
    // Sem filtrar pelo "accept": o navegador deixa escolher "todos os arquivos"
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText(/^Anexos/), [
        new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' }),
        new File(['MZ'], 'programa.exe'),
      ]);
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(await screen.findByText(/SOL-2026-10-0042/)).toBeInTheDocument();
    expect(anexar).toHaveBeenCalledWith('nova', expect.any(File));
    expect(anexar).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('programa.exe: envie PDF, PNG, JPG, WEBP ou XML'),
    ).toBeInTheDocument();
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

  it('com filiais cadastradas, pede a filial e manda junto', async () => {
    vi.spyOn(cadastros, 'filiais').mockResolvedValue([
      { id: 'cwb', nome: 'Curitiba', ativa: true },
      { id: 'jve', nome: 'Joinville', ativa: true },
    ]);
    const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
    render(<FormularioDeAbertura />);

    const filial = await screen.findByLabelText(
      'Filial que emitiu o documento',
    );
    const usuario = await preencher();
    await usuario.selectOptions(filial, 'jve');
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(abrir).toHaveBeenCalledWith(
      expect.objectContaining({ filialId: 'jve' }),
    );
  });

  it('manda o hash dos arquivos e explica o alerta de arquivo repetido', async () => {
    const abrir = vi.spyOn(api, 'abrir').mockRejectedValueOnce(
      new ErroDaApi(409, 'CONFLITO', 'Já existe', {
        duplicidades: [
          {
            id: 'velha',
            protocolo: 'SOL-2026-10-0007',
            status: 'NOVO',
            criadoEm: '2026-10-14T12:00:00Z',
            documento: 'ANEXO',
            valor: 'cte-antigo.pdf',
          },
        ],
      }),
    );
    render(<FormularioDeAbertura />);
    const usuario = await preencher();
    await usuario.upload(screen.getByLabelText(/^Anexos/), [
      new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' }),
    ]);
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(
      await screen.findByText(/mesmo arquivo \(cte-antigo\.pdf\)/),
    ).toBeInTheDocument();
    expect(abrir).toHaveBeenCalledWith(
      expect.objectContaining({
        hashesDosAnexos: [expect.stringMatching(/^[0-9a-f]{64}$/)],
      }),
    );
  });
});
