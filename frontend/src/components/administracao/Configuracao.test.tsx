import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import {
  configuracao,
  configuracaoLivre,
  type ConfiguracaoDoTipo,
} from '@/lib/configuracao';
import { Formulario } from './Formulario';
import { Modulos } from './Modulos';

const atualizar = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({ atualizar }),
}));

function tipo(
  t: ConfiguracaoDoTipo['tipo'],
  extra: Partial<ConfiguracaoDoTipo> = {},
): ConfiguracaoDoTipo {
  return { ...configuracaoLivre(t), exigirDocumento: true, ...extra };
}

describe('Módulos', () => {
  it('liga e desliga os liberados; o não liberado fica travado', async () => {
    vi.spyOn(configuracao, 'modulos').mockResolvedValue({
      liberados: ['FILIAIS', 'EMAIL', 'FORMULARIO'],
      ativos: ['FILIAIS', 'EMAIL', 'FORMULARIO', 'BALANCO'],
      ligados: ['FILIAIS', 'EMAIL', 'FORMULARIO'],
    });
    const salvar = vi.spyOn(configuracao, 'alterarModulos').mockResolvedValue({
      liberados: ['FILIAIS', 'EMAIL', 'FORMULARIO'],
      ativos: ['FILIAIS', 'FORMULARIO', 'BALANCO'],
      ligados: ['FILIAIS', 'FORMULARIO'],
    });
    render(<Modulos />);

    const balanco = await screen.findByRole('switch', {
      name: /Balanço por digitador/,
    });
    expect(balanco).toBeDisabled();
    expect(balanco).not.toBeChecked();
    expect(screen.getAllByText(/Não liberado/)).toHaveLength(6);

    const botao = screen.getByRole('button', { name: 'Salvar módulos' });
    expect(botao).toBeDisabled();

    const usuario = userEvent.setup();
    await usuario.click(
      screen.getByRole('switch', { name: /Avisos por e-mail/ }),
    );
    await usuario.click(botao);

    expect(salvar).toHaveBeenCalledWith(['FILIAIS', 'FORMULARIO']);
    expect(await screen.findByText('Módulos salvos.')).toBeInTheDocument();
    // O menu da pessoa se atualiza com os módulos novos
    expect(atualizar).toHaveBeenCalled();
  });

  it('mostra o erro da API', async () => {
    vi.spyOn(configuracao, 'modulos').mockRejectedValue(
      new ErroDaApi(500, 'ERRO', 'Fora do ar'),
    );
    render(<Modulos />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Fora do ar');
  });
});

describe('Formulário', () => {
  it('muda o que aparece, o padrão e os motivos, e salva', async () => {
    vi.spyOn(configuracao, 'formulario').mockResolvedValue({
      personalizavel: true,
      tipos: [tipo('REVERSAO'), tipo('OUTRO', { exigirDocumento: false })],
    });
    const salvar = vi
      .spyOn(configuracao, 'alterarFormulario')
      .mockImplementation(async (t, dados) => ({
        tipo: t,
        doSistema: true,
        ...dados,
      }));
    render(<Formulario />);

    const usuario = userEvent.setup();
    await usuario.selectOptions(
      await screen.findByLabelText('Como aparece: Motivo'),
      'OBRIGATORIO',
    );
    await usuario.type(
      screen.getByLabelText('Motivos para escolher (um por linha)'),
      'Erro de emissão{enter}{enter}Mercadoria devolvida',
    );
    await usuario.selectOptions(
      screen.getByLabelText('Já vem preenchido: Motivo'),
      'Mercadoria devolvida',
    );
    await usuario.selectOptions(
      screen.getByLabelText('Como aparece: NF'),
      'OCULTO',
    );
    await usuario.selectOptions(
      screen.getByLabelText('Já vem preenchido: Prioridade'),
      'ALTA',
    );
    // A descrição não pode sumir
    expect(
      within(screen.getByLabelText('Como aparece: Descrição')).queryByRole(
        'option',
        { name: 'Não aparece' },
      ),
    ).toBeNull();
    await usuario.click(
      screen.getByRole('button', { name: 'Salvar formulário' }),
    );

    expect(salvar).toHaveBeenCalledWith(
      'REVERSAO',
      expect.objectContaining({
        ativo: true,
        motivos: ['Erro de emissão', 'Mercadoria devolvida'],
        campos: expect.objectContaining({
          motivo: { modo: 'OBRIGATORIO', padrao: 'Mercadoria devolvida' },
          nf: { modo: 'OCULTO' },
          prioridade: { modo: 'OPCIONAL', padrao: 'ALTA' },
        }),
      }),
    );
    expect(await screen.findByText(/Formulário salvo/)).toBeInTheDocument();
  });

  it('troca de tipo, desliga o tipo e volta ao padrão', async () => {
    vi.spyOn(configuracao, 'formulario').mockResolvedValue({
      personalizavel: true,
      tipos: [tipo('REVERSAO'), tipo('OUTRO', { exigirDocumento: false })],
    });
    const salvar = vi
      .spyOn(configuracao, 'alterarFormulario')
      .mockImplementation(async (t, dados) => ({
        tipo: t,
        doSistema: true,
        ...dados,
      }));
    const restaurar = vi
      .spyOn(configuracao, 'restaurarFormulario')
      .mockResolvedValue(tipo('OUTRO', { exigirDocumento: false }));
    render(<Formulario />);

    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('tab', { name: 'Outro' }));
    expect(
      screen.getByLabelText(/Exigir pelo menos um documento/),
    ).not.toBeChecked();
    await usuario.click(screen.getByLabelText(/Tipo em uso/));
    await usuario.click(
      screen.getByRole('button', { name: 'Salvar formulário' }),
    );
    expect(salvar).toHaveBeenCalledWith(
      'OUTRO',
      expect.objectContaining({ ativo: false }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Outro (desligado)' }),
    ).toBeInTheDocument();

    await usuario.click(
      screen.getByRole('button', { name: 'Voltar ao padrão' }),
    );
    expect(restaurar).toHaveBeenCalledWith('OUTRO');
    expect(await screen.findByText(/Voltou ao padrão/)).toBeInTheDocument();
  });

  it('sem o módulo, mostra o padrão sem deixar alterar', async () => {
    vi.spyOn(configuracao, 'formulario').mockResolvedValue({
      personalizavel: false,
      tipos: [tipo('REVERSAO')],
    });
    render(<Formulario />);
    expect(
      await screen.findByText(/está desligado: vale o padrão/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Como aparece: CTe')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Salvar formulário' }),
    ).toBeNull();
  });

  it('mostra o erro de quando a API recusa', async () => {
    vi.spyOn(configuracao, 'formulario').mockResolvedValue({
      personalizavel: true,
      tipos: [tipo('REVERSAO')],
    });
    vi.spyOn(configuracao, 'alterarFormulario').mockRejectedValue(
      new ErroDaApi(422, 'REGRA', 'Cadastre pelo menos um motivo'),
    );
    render(<Formulario />);
    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole('button', { name: 'Salvar formulário' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cadastre pelo menos um motivo',
    );
  });

  it('cria, renomeia e exclui um tipo da empresa', async () => {
    vi.spyOn(configuracao, 'formulario').mockResolvedValue({
      personalizavel: true,
      tipos: [tipo('REVERSAO')],
    });
    const avaria = tipo('AVARIA', { nome: 'Avaria', doSistema: false });
    const criar = vi.spyOn(configuracao, 'criarTipo').mockResolvedValue(avaria);
    const salvar = vi
      .spyOn(configuracao, 'alterarFormulario')
      .mockImplementation(async (t, dados) => ({
        tipo: t,
        doSistema: false,
        ...dados,
      }));
    const excluir = vi.spyOn(configuracao, 'excluirTipo').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Formulario />);

    const usuario = userEvent.setup();
    await usuario.type(
      await screen.findByLabelText('Novo tipo de ocorrência'),
      'Avaria',
    );
    await usuario.click(screen.getByRole('button', { name: 'Criar tipo' }));
    expect(criar).toHaveBeenCalledWith('Avaria');
    expect(
      await screen.findByRole('tab', { name: 'Avaria', selected: true }),
    ).toBeInTheDocument();
    // Tipo criado pela empresa não tem padrão para voltar: é excluído
    expect(
      screen.queryByRole('button', { name: 'Voltar ao padrão' }),
    ).toBeNull();

    const nome = screen.getByLabelText('Nome do tipo');
    await usuario.clear(nome);
    await usuario.type(nome, 'Avaria na entrega');
    await usuario.click(
      screen.getByRole('button', { name: 'Salvar formulário' }),
    );
    expect(salvar).toHaveBeenCalledWith(
      'AVARIA',
      expect.objectContaining({ nome: 'Avaria na entrega' }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Avaria na entrega' }),
    ).toBeInTheDocument();
    // Os nomes novos chegam às outras telas pela sessão
    expect(atualizar).toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: 'Excluir tipo' }));
    expect(excluir).toHaveBeenCalledWith('AVARIA');
    expect(await screen.findByText('Tipo excluído.')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Avaria/ })).toBeNull();
  });
});
