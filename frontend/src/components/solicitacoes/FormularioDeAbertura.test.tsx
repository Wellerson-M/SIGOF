import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { cadastros } from '@/lib/cadastros';
import {
  configuracao,
  configuracaoLivre,
  type ConfiguracaoDoTipo,
} from '@/lib/configuracao';
import { api, type Resumo } from '@/lib/solicitacoes';
import { FormularioDeAbertura } from './FormularioDeAbertura';

vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'u1',
      nome: 'Quem usa',
      email: 'u1@demo.test',
      perfil: 'SOLICITANTE',
      area: null,
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'demo' },
    },
  }),
}));

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
        ctes: ['12345'],
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
      etapa: 'ANDAMENTO',
      mensagemId: null,
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
    expect(anexar).toHaveBeenCalledWith('nova', expect.any(File), {
      etapa: 'ABERTURA',
    });
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

  it('fatura inteira: vários CTe colados, um por linha, e o número da fatura', async () => {
    const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
    render(<FormularioDeAbertura />);
    const usuario = userEvent.setup();

    await usuario.type(
      screen.getByLabelText(/^Número do CTe/),
      '100{Enter}101{Enter}102',
    );
    expect(screen.getByText('3 CTe')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Fatura'), 'F-9');
    await usuario.type(
      screen.getByLabelText('O que precisa ser corrigido'),
      'Fatura inteira recusada pelo cliente.',
    );
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(abrir).toHaveBeenCalledWith(
      expect.objectContaining({ ctes: ['100', '101', '102'], fatura: 'F-9' }),
    );
  });

  it('marca já na abertura os itens do tipo que são de quem abre', async () => {
    vi.spyOn(cadastros, 'verificacoes').mockResolvedValue([
      {
        id: 'desacordo',
        texto: 'Desacordo fiscal do CTe realizado',
        tipos: ['REVERSAO'],
        quemMarca: 'SOLICITANTE',
        obrigatorioParaResolver: false,
        ordem: 1,
        ativo: true,
      },
      {
        id: 'equipe',
        texto: 'Conferido pela equipe',
        tipos: [],
        quemMarca: 'EQUIPE',
        obrigatorioParaResolver: true,
        ordem: 2,
        ativo: true,
      },
    ]);
    const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
    render(<FormularioDeAbertura />);
    const usuario = await preencher();

    // O item da equipe não aparece para quem abre
    expect(screen.queryByText('Conferido pela equipe')).toBeNull();
    await usuario.click(
      await screen.findByLabelText('Desacordo fiscal do CTe realizado'),
    );
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir solicitação' }),
    );

    expect(abrir).toHaveBeenCalledWith(
      expect.objectContaining({ verificacoes: ['desacordo'] }),
    );
  });

  describe('formulário configurado pela empresa', () => {
    function configurar(mudanca: Partial<ConfiguracaoDoTipo>) {
      vi.spyOn(configuracao, 'formulario').mockResolvedValue({
        personalizavel: true,
        tipos: [
          { ...configuracaoLivre('REVERSAO'), ...mudanca },
          configuracaoLivre('OUTRO'),
        ],
      });
    }

    it('só mostra os tipos e campos em uso, com motivo e padrões', async () => {
      configurar({
        campos: {
          ...configuracaoLivre('REVERSAO').campos,
          nf: { modo: 'OCULTO' },
          prioridade: { modo: 'OCULTO', padrao: 'ALTA' },
          motivo: { modo: 'OBRIGATORIO', padrao: 'Mercadoria devolvida' },
          descricao: { modo: 'OBRIGATORIO', padrao: 'Cliente: ' },
        },
        motivos: ['Erro de emissão', 'Mercadoria devolvida'],
      });
      const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
      render(<FormularioDeAbertura />);

      const motivo = await screen.findByLabelText('Motivo');
      expect(motivo).toHaveValue('Mercadoria devolvida');
      expect(screen.getByLabelText('O que precisa ser corrigido')).toHaveValue(
        'Cliente: ',
      );
      expect(screen.queryByLabelText('Número da NF')).toBeNull();
      expect(screen.queryByLabelText('Prioridade')).toBeNull();
      expect(
        screen.getAllByRole('option').map((o) => o.textContent),
      ).not.toContain('Troca de pagador');

      const usuario = userEvent.setup();
      await usuario.type(screen.getByLabelText('Número do CTe'), '777');
      await usuario.type(
        screen.getByLabelText('O que precisa ser corrigido'),
        'Joaquim, emitir reversão',
      );
      await usuario.selectOptions(motivo, 'Erro de emissão');
      await usuario.click(
        screen.getByRole('button', { name: 'Abrir solicitação' }),
      );
      expect(abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          motivo: 'Erro de emissão',
          descricao: 'Cliente: Joaquim, emitir reversão',
          prioridade: 'ALTA',
        }),
      );
    });

    it('filial opcional em branco: avisa antes e deixa abrir sem', async () => {
      configurar({});
      vi.spyOn(cadastros, 'filiais').mockResolvedValue([
        { id: 'cwb', nome: 'Curitiba', ativa: true },
        { id: 'jve', nome: 'Joinville', ativa: true },
      ]);
      const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
      render(<FormularioDeAbertura />);
      await screen.findByLabelText('Filial que emitiu o documento');
      const usuario = await preencher();
      await usuario.click(
        screen.getByRole('button', { name: 'Abrir solicitação' }),
      );

      expect(
        await screen.findByText('Você não escolheu a filial.'),
      ).toBeInTheDocument();
      expect(abrir).not.toHaveBeenCalled();

      await usuario.click(
        screen.getByRole('button', { name: 'Abrir sem filial' }),
      );
      expect(abrir).toHaveBeenCalledWith(
        expect.objectContaining({ filialId: undefined }),
      );
    });

    it('anexo obrigatório: não abre sem arquivo', async () => {
      configurar({
        campos: {
          ...configuracaoLivre('REVERSAO').campos,
          anexos: { modo: 'OBRIGATORIO' },
        },
      });
      const abrir = vi.spyOn(api, 'abrir').mockResolvedValue(criada);
      render(<FormularioDeAbertura />);
      await screen.findByText('Anexos');
      const usuario = await preencher();
      await usuario.click(
        screen.getByRole('button', { name: 'Abrir solicitação' }),
      );
      expect(
        await screen.findByText('Anexe pelo menos um arquivo'),
      ).toBeInTheDocument();
      expect(abrir).not.toHaveBeenCalled();
    });
  });
});
