import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { notificacoes } from '@/lib/avisos';
import { api, type Detalhe, type Resumo } from '@/lib/solicitacoes';
import { DetalheDaSolicitacao } from './DetalheDaSolicitacao';

function detalhe(extra: Partial<Detalhe> = {}): Detalhe {
  return {
    id: 's1',
    protocolo: 'SOL-2026-10-0007',
    tipo: 'TROCA_PAGADOR',
    cte: '12345',
    nf: '998877',
    descricao: 'Pagador errado no CTe.',
    status: 'EM_ANDAMENTO',
    prioridade: 'MEDIA',
    solicitante: { id: 'sol', nome: 'Sofia Solicitante' },
    responsavel: { id: 'ana', nome: 'André Analista' },
    criadoEm: '2026-10-15T12:00:00Z',
    atualizadoEm: '2026-10-15T12:00:00Z',
    slaVenceEm: '2026-10-15T16:00:00Z',
    sla: { situacao: 'ATENCAO', minutosRestantes: 45 },
    acoes: ['AGUARDANDO_DOC', 'ESCALADO', 'RESOLVIDO'],
    pagadorCorreto: 'Destinatário',
    resolvidoEm: null,
    historico: [
      {
        id: 'h1',
        statusAnterior: null,
        statusNovo: 'NOVO',
        observacao: null,
        autor: { id: 'sol', nome: 'Sofia Solicitante' },
        criadoEm: '2026-10-15T12:00:00Z',
      },
      {
        id: 'h2',
        statusAnterior: 'NOVO',
        statusNovo: 'EM_ANDAMENTO',
        observacao: null,
        autor: { id: 'ana', nome: 'André Analista' },
        criadoEm: '2026-10-15T12:10:00Z',
      },
      {
        id: 'h3',
        statusAnterior: 'EM_ANDAMENTO',
        statusNovo: 'EM_ANDAMENTO',
        observacao: 'Prioridade: Baixa → Média',
        autor: { id: 'ana', nome: 'André Analista' },
        criadoEm: '2026-10-15T12:20:00Z',
      },
    ],
    mensagens: [
      {
        id: 'm1',
        conteudo: 'Conferir com o fiscal',
        interna: true,
        autor: { id: 'ana', nome: 'André Analista' },
        criadoEm: '2026-10-15T12:30:00Z',
      },
    ],
    emails: [],
    pode: { mudarPrioridade: true, atribuir: true, comentarInterno: true },
    ...extra,
  };
}

const resumo = {} as Resumo;

describe('DetalheDaSolicitacao', () => {
  it('lista os e-mails enviados e marca as notificações dela como lidas', async () => {
    const marcar = vi
      .spyOn(notificacoes, 'marcarLidas')
      .mockResolvedValue({ naoLidas: 0 });
    const ouvinte = vi.fn();
    window.addEventListener('sigof:notificacoes-lidas', ouvinte);
    vi.spyOn(api, 'detalhar').mockResolvedValue(
      detalhe({
        emails: [
          {
            id: 'e1',
            para: ['central@demo.test', 'sofia@demo.test'],
            situacao: 'ENVIADO',
            tentativas: 1,
            ultimoErro: null,
            enviadoEm: '2026-10-15T12:01:00Z',
            criadoEm: '2026-10-15T12:00:00Z',
          },
          {
            id: 'e2',
            para: ['central@demo.test'],
            situacao: 'PENDENTE',
            tentativas: 2,
            ultimoErro: 'connect ETIMEDOUT',
            enviadoEm: null,
            criadoEm: '2026-10-15T12:10:00Z',
          },
        ],
      }),
    );
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    render(<DetalheDaSolicitacao id="s1" />);

    expect(await screen.findByText('E-mails enviados')).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getByText('Na fila')).toBeInTheDocument();
    expect(screen.getByText('connect ETIMEDOUT')).toBeInTheDocument();
    expect(marcar).toHaveBeenCalledWith({ solicitacaoId: 's1' });
    expect(ouvinte).toHaveBeenCalled();
    window.removeEventListener('sigof:notificacoes-lidas', ouvinte);
  });

  it('mostra os dados, a conversa e o histórico', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    render(<DetalheDaSolicitacao id="s1" />);

    expect(
      await screen.findByRole('heading', { name: 'SOL-2026-10-0007' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Troca de pagador')).toBeInTheDocument();
    expect(screen.getByText('Destinatário')).toBeInTheDocument();
    expect(screen.getByText('Vence em 45min úteis')).toBeInTheDocument();
    expect(screen.getByText(/interna \(só a equipe vê\)/)).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
    expect(screen.getByText('Alteração')).toBeInTheDocument();
    expect(screen.getByText('Prioridade: Baixa → Média')).toBeInTheDocument();
  });

  it('resolver pede o que foi feito e recarrega', async () => {
    const detalhar = vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    const mover = vi.spyOn(api, 'mover').mockResolvedValue(resumo);
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    await usuario.click(
      await screen.findByRole('button', { name: 'Resolver' }),
    );
    const dialogo = screen.getByRole('dialog');
    await usuario.type(
      within(dialogo).getByRole('textbox'),
      'Emitido CTe novo',
    );
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Confirmar' }),
    );

    expect(mover).toHaveBeenCalledWith('s1', 'RESOLVIDO', 'Emitido CTe novo');
    expect(detalhar).toHaveBeenCalledTimes(2);
  });

  it('a janela de observação fecha com Voltar sem mover', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    const mover = vi.spyOn(api, 'mover');
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Escalar' }));
    await usuario.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mover).not.toHaveBeenCalled();
  });

  it('assumir não pede observação', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(
      detalhe({ status: 'NOVO', responsavel: null, acoes: ['EM_ANDAMENTO'] }),
    );
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    const mover = vi.spyOn(api, 'mover').mockResolvedValue(resumo);
    render(<DetalheDaSolicitacao id="s1" />);

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Assumir / retomar' }));

    expect(mover).toHaveBeenCalledWith('s1', 'EM_ANDAMENTO');
    expect(screen.getByText('Ninguém ainda')).toBeInTheDocument();
  });

  it('muda a prioridade e o responsável', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([
      { id: 'ana', nome: 'André Analista' },
      { id: 'sup', nome: 'Sérgio Supervisor' },
    ]);
    const priorizar = vi.spyOn(api, 'priorizar').mockResolvedValue(resumo);
    const atribuir = vi.spyOn(api, 'atribuir').mockResolvedValue(resumo);
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    await usuario.selectOptions(
      await screen.findByLabelText('Prioridade'),
      'URGENTE',
    );
    expect(priorizar).toHaveBeenCalledWith('s1', 'URGENTE');

    await screen.findByRole('option', { name: 'Sérgio Supervisor' });
    await usuario.selectOptions(screen.getByLabelText('Responsável'), 'sup');
    expect(atribuir).toHaveBeenCalledWith('s1', 'sup');
  });

  it('envia mensagem interna e limpa o campo', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    const comentar = vi.spyOn(api, 'comentar').mockResolvedValue({
      id: 'm2',
      conteudo: 'x',
      interna: true,
      autor: { id: 'ana', nome: 'André' },
      criadoEm: '2026-10-15T13:00:00Z',
    });
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    const campo = await screen.findByLabelText('Nova mensagem');
    await usuario.type(campo, 'Pedi a NF ao cliente');
    await usuario.click(
      screen.getByLabelText('Comentário interno (o solicitante não vê)'),
    );
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(comentar).toHaveBeenCalledWith('s1', 'Pedi a NF ao cliente', true);
    expect(campo).toHaveValue('');
  });

  it('se o envio falhar, o texto fica e o erro aparece', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(
      detalhe({
        pode: {
          mudarPrioridade: false,
          atribuir: false,
          comentarInterno: false,
        },
      }),
    );
    vi.spyOn(api, 'comentar').mockRejectedValue(
      new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor'),
    );
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    const campo = await screen.findByLabelText('Nova mensagem');
    expect(screen.queryByLabelText(/Comentário interno/)).toBeNull();
    await usuario.type(campo, 'Mensagem importante');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Sem conexão com o servidor'),
    ).toBeInTheDocument();
    expect(campo).toHaveValue('Mensagem importante');
  });

  it('conflito (409): avisa e recarrega o estado verdadeiro', async () => {
    const detalhar = vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    vi.spyOn(api, 'mover').mockRejectedValue(
      new ErroDaApi(409, 'CONFLITO', 'Outra pessoa alterou esta solicitação'),
    );
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    await usuario.click(
      await screen.findByRole('button', { name: 'Resolver' }),
    );
    await usuario.type(
      screen.getByRole('textbox', { name: /O que foi feito/ }),
      'ok',
    );
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/Outra pessoa alterou/)).toBeInTheDocument();
    expect(detalhar).toHaveBeenCalledTimes(2);
  });

  it('inexistente ou de outra pessoa: diz que não encontrou', async () => {
    vi.spyOn(api, 'detalhar').mockRejectedValue(
      new ErroDaApi(404, 'NAO_ENCONTRADO', 'Solicitação não encontrada'),
    );
    render(<DetalheDaSolicitacao id="s1" />);

    expect(
      await screen.findByRole('heading', {
        name: 'Solicitação não encontrada',
      }),
    ).toBeInTheDocument();
  });

  it('outra falha ao carregar: mostra o erro', async () => {
    vi.spyOn(api, 'detalhar').mockRejectedValue(new Error('rede'));
    render(<DetalheDaSolicitacao id="s1" />);

    expect(await screen.findByText(/Algo deu errado/)).toBeInTheDocument();
  });
});
