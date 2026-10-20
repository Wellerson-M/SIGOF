import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CampoDeSenha } from '@/components/CampoDeSenha';
import { notificacoes } from '@/lib/avisos';
import { api, tempoDesde, type Detalhe, type Resumo } from '@/lib/solicitacoes';
import { Anexos } from './Anexos';
import { DetalheDaSolicitacao } from './DetalheDaSolicitacao';
import { EscolhaDeArquivos } from './EscolhaDeArquivos';
import { Quadro } from './Quadro';

vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'sup',
      nome: 'Sara Supervisora',
      email: 'sara@demo.test',
      perfil: 'SUPERVISOR',
      area: null,
      empresa: {
        razaoSocial: 'Transportadora Demo Ltda.',
        slug: 'demo',
        diasNoQuadroDepoisDeEncerrar: 7,
      },
    },
  }),
}));

const HORA = 3_600_000;

function resumo(extra: Partial<Resumo> = {}): Resumo {
  return {
    id: 's1',
    protocolo: 'SOL-2026-10-0001',
    tipo: 'REVERSAO',
    cte: '12345',
    nf: null,
    ctes: [],
    nfs: [],
    fatura: null,
    descricao: 'Mercadoria recusada pelo cliente.',
    status: 'NOVO',
    prioridade: 'MEDIA',
    solicitante: { id: 'sol', nome: 'Sofia' },
    responsavel: null,
    filial: null,
    registroRapido: false,
    criadoEm: '2026-10-15T12:00:00Z',
    atualizadoEm: '2026-10-15T12:00:00Z',
    slaVenceEm: null,
    sla: { situacao: 'NO_PRAZO', minutosRestantes: 100 },
    acoes: [],
    totais: { anexos: 0, mensagens: 0 },
    ...extra,
  };
}

describe('há quanto tempo', () => {
  it('fala como gente: agora, minutos, horas e dias', () => {
    const agora = Date.parse('2026-10-20T12:00:00Z');
    expect(tempoDesde('2026-10-20T11:59:40Z', agora)).toBe('agora');
    expect(tempoDesde('2026-10-20T11:48:00Z', agora)).toBe('há 12 min');
    expect(tempoDesde('2026-10-20T09:00:00Z', agora)).toBe('há 3 h');
    expect(tempoDesde('2026-10-19T10:00:00Z', agora)).toBe('há 1 dia');
    expect(tempoDesde('2026-10-17T10:00:00Z', agora)).toBe('há 3 dias');
  });
});

describe('cartão do quadro', () => {
  it('mostra a última movimentação e destaca a espera longa em Aguardando', async () => {
    vi.spyOn(api, 'listar').mockResolvedValue([
      resumo({
        id: 'a',
        protocolo: 'SOL-A',
        status: 'AGUARDANDO_DOC',
        ultimaMovimentacaoEm: new Date(Date.now() - 50 * HORA).toISOString(),
      }),
      resumo({
        id: 'b',
        protocolo: 'SOL-B',
        ultimaMovimentacaoEm: new Date(Date.now() - 2 * HORA).toISOString(),
      }),
    ]);
    render(<Quadro />);

    const parada = await screen.findByText('Aguardando há 2 dias');
    expect(parada).toHaveClass('text-atencao');
    expect(parada).toHaveAttribute(
      'title',
      expect.stringMatching(/^Última movimentação:/),
    );
    expect(screen.getByText('Movimentada há 2 h')).not.toHaveClass(
      'text-atencao',
    );
    // O prazo do quadro vem da empresa
    expect(
      screen.getByText(/Encerradas ficam aqui por 7 dias/),
    ).toBeInTheDocument();
  });
});

describe('campo de senha', () => {
  it('o olho mostra e esconde o que foi digitado', async () => {
    render(
      <label>
        Senha
        <CampoDeSenha defaultValue="segredo1" />
      </label>,
    );
    const campo = screen.getByLabelText('Senha');
    expect(campo).toHaveAttribute('type', 'password');

    const usuario = userEvent.setup();
    await usuario.click(
      screen.getByRole('button', { name: 'Mostrar a senha' }),
    );
    expect(campo).toHaveAttribute('type', 'text');
    await usuario.click(
      screen.getByRole('button', { name: 'Esconder a senha' }),
    );
    expect(campo).toHaveAttribute('type', 'password');
  });
});

describe('escolha de arquivos', () => {
  function Escolha() {
    const [arquivos, setArquivos] = useState<File[]>([]);
    return (
      <EscolhaDeArquivos
        rotulo="Anexos"
        arquivos={arquivos}
        aoMudar={setArquivos}
      />
    );
  }

  it('soma o que é escolhido depois, sem repetir, e deixa tirar', async () => {
    render(<Escolha />);
    const usuario = userEvent.setup({ applyAccept: false });
    const nota = new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' });
    const canhoto = new File(['%PDF canhoto'], 'canhoto.pdf', {
      type: 'application/pdf',
    });

    await usuario.upload(screen.getByLabelText('Anexos'), nota);
    await usuario.upload(screen.getByLabelText('Anexos'), [nota, canhoto]);

    const lista = screen.getByRole('list');
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2 arquivos')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Adicionar mais' }),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Tirar nota.pdf' }));
    expect(screen.queryByText(/nota\.pdf/)).toBeNull();
    expect(screen.getByText(/canhoto\.pdf/)).toBeInTheDocument();
  });
});

describe('anexo que ainda pode ser excluído', () => {
  it('mostra o botão só no prazo e exclui depois de confirmar', async () => {
    const excluir = vi.spyOn(api, 'excluirAnexo').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const aoMudar = vi.fn().mockResolvedValue(undefined);
    const base = {
      tipoMime: 'application/pdf',
      tamanhoBytes: 2048,
      etapa: 'ANDAMENTO' as const,
      mensagemId: null,
      enviadoPor: { id: 'sup', nome: 'Sara' },
      criadoEm: '2026-10-20T10:00:00Z',
    };
    render(
      <Anexos
        solicitacaoId="s1"
        podeAnexar
        aoMudar={aoMudar}
        anexos={[
          {
            ...base,
            id: 'novo',
            nomeArquivo: 'trocado.pdf',
            podeExcluirAte: '2026-10-20T10:15:00Z',
          },
          {
            ...base,
            id: 'velho',
            nomeArquivo: 'certo.pdf',
            podeExcluirAte: null,
          },
        ]}
      />,
    );
    const botoes = screen.getAllByRole('button', { name: 'Excluir' });
    expect(botoes).toHaveLength(1);
    await userEvent.setup().click(botoes[0]!);
    expect(excluir).toHaveBeenCalledWith('s1', 'novo');
    expect(aoMudar).toHaveBeenCalled();
  });
});

describe('detalhe: excluir e devolver para a fila', () => {
  function detalhe(extra: Partial<Detalhe> = {}): Detalhe {
    return {
      ...resumo({
        status: 'RESOLVIDO',
        responsavel: { id: 'ana', nome: 'André' },
      }),
      pagadorCorreto: null,
      resolvidoEm: '2026-10-16T12:00:00Z',
      causa: null,
      verificacoes: [],
      historico: [],
      mensagens: [],
      emails: [],
      anexos: [],
      pode: {
        mudarPrioridade: false,
        atribuir: false,
        comentarInterno: true,
        classificar: false,
        excluir: true,
      },
      ...extra,
    };
  }

  it('exclui a encerrada com o motivo e avisa que saiu de tudo', async () => {
    vi.spyOn(notificacoes, 'marcarLidas').mockResolvedValue({ naoLidas: 0 });
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    const excluir = vi.spyOn(api, 'excluir').mockResolvedValue();
    render(<DetalheDaSolicitacao id="s1" />);

    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole('button', { name: 'Excluir solicitação' }),
    );
    await usuario.type(
      screen.getByLabelText('Motivo (opcional)'),
      'Aberta em duplicidade',
    );
    await usuario.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(excluir).toHaveBeenCalledWith('s1', 'Aberta em duplicidade');
    expect(
      await screen.findByRole('heading', { name: 'Solicitação excluída' }),
    ).toBeInTheDocument();
  });

  it('"Ninguém" devolve a solicitação para a fila', async () => {
    vi.spyOn(notificacoes, 'marcarLidas').mockResolvedValue({ naoLidas: 0 });
    vi.spyOn(api, 'detalhar').mockResolvedValue(
      detalhe({
        status: 'EM_ANDAMENTO',
        pode: {
          mudarPrioridade: false,
          atribuir: true,
          comentarInterno: true,
          classificar: false,
          excluir: false,
        },
      }),
    );
    vi.spyOn(api, 'responsaveis').mockResolvedValue([
      { id: 'ana', nome: 'André' },
    ]);
    const atribuir = vi.spyOn(api, 'atribuir').mockResolvedValue(resumo());
    render(<DetalheDaSolicitacao id="s1" />);

    const campo = await screen.findByLabelText('Responsável');
    await screen.findByRole('option', { name: 'André' });
    await userEvent.setup().selectOptions(campo, '');
    expect(atribuir).toHaveBeenCalledWith('s1', null);
    expect(
      screen.queryByRole('button', { name: 'Excluir solicitação' }),
    ).toBeNull();
  });
});
