import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { notificacoes } from '@/lib/avisos';
import { cadastros } from '@/lib/cadastros';
import { api, type Detalhe, type Resumo } from '@/lib/solicitacoes';
import { DetalheDaSolicitacao } from './DetalheDaSolicitacao';

vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'ana',
      nome: 'André Analista',
      email: 'andre@demo.test',
      perfil: 'ANALISTA',
      area: null,
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'demo' },
    },
  }),
}));

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
    filial: null,
    registroRapido: false,
    ctes: [],
    nfs: [],
    fatura: null,
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
        anexos: [],
        autor: { id: 'ana', nome: 'André Analista' },
        criadoEm: '2026-10-15T12:30:00Z',
      },
    ],
    emails: [],
    anexos: [],
    totais: { anexos: 0, mensagens: 1 },
    causa: null,
    pode: {
      mudarPrioridade: true,
      atribuir: true,
      comentarInterno: true,
      classificar: false,
    },
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

    expect(mover).toHaveBeenCalledWith(
      's1',
      'RESOLVIDO',
      'Emitido CTe novo',
      undefined,
    );
    expect(detalhar).toHaveBeenCalledTimes(2);
  });

  it('resolver com causa do erro e documento: anexa antes e manda a causa', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    vi.spyOn(cadastros, 'causas').mockResolvedValue([
      {
        id: 'dig',
        nome: 'Erro de digitação',
        opcoes: ['Ana', 'Bruno'],
        rotuloDasOpcoes: 'Digitador',
        ordem: 1,
        ativa: true,
      },
      {
        id: 'cli',
        nome: 'Erro do cliente',
        opcoes: [],
        rotuloDasOpcoes: null,
        ordem: 2,
        ativa: true,
      },
    ]);
    const ordem: string[] = [];
    vi.spyOn(api, 'anexar').mockImplementation(async () => {
      ordem.push('anexar');
      return {
        id: 'a1',
        nomeArquivo: 'cte.pdf',
        tipoMime: 'application/pdf',
        tamanhoBytes: 4,
        etapa: 'ANDAMENTO',
        mensagemId: null,
        enviadoPor: { id: 'ana', nome: 'André' },
        criadoEm: '2026-10-16T10:00:00Z',
      };
    });
    const mover = vi.spyOn(api, 'mover').mockImplementation(async () => {
      ordem.push('mover');
      return resumo;
    });
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    await usuario.click(
      await screen.findByRole('button', { name: 'Resolver' }),
    );
    const dialogo = screen.getByRole('dialog');
    await usuario.type(
      within(dialogo).getByLabelText(/O que foi feito para resolver/),
      'CTe corrigido',
    );
    await usuario.selectOptions(
      await within(dialogo).findByLabelText('De quem foi o erro'),
      'dig',
    );
    // Digitador que ainda não está na lista: digita e segue
    await usuario.type(within(dialogo).getByLabelText(/^Digitador/), 'Carla');
    expect(
      within(dialogo).getByText('Novo: “Carla” será cadastrado ao salvar.'),
    ).toBeInTheDocument();
    await usuario.type(
      within(dialogo).getByLabelText('Comentário'),
      'CNPJ trocado',
    );
    await usuario.upload(within(dialogo).getByLabelText('Anexar documento'), [
      new File(['%PDF'], 'cte.pdf', { type: 'application/pdf' }),
    ]);
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Confirmar' }),
    );

    await vi.waitFor(() => expect(mover).toHaveBeenCalled());
    expect(mover).toHaveBeenCalledWith('s1', 'RESOLVIDO', 'CTe corrigido', {
      causaId: 'dig',
      detalhe: 'Carla',
      comentario: 'CNPJ trocado',
    });
    expect(ordem).toEqual(['anexar', 'mover']);
  });

  it('mostra de quem foi o erro e deixa corrigir', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(
      detalhe({
        status: 'RESOLVIDO',
        acoes: [],
        causa: {
          id: 'cli',
          nome: 'Erro do cliente',
          detalhe: null,
          comentario: 'Mandou a nota errada',
        },
        pode: {
          mudarPrioridade: false,
          atribuir: false,
          comentarInterno: true,
          classificar: true,
        },
      }),
    );
    vi.spyOn(cadastros, 'causas').mockResolvedValue([
      {
        id: 'dig',
        nome: 'Erro de digitação',
        opcoes: [],
        rotuloDasOpcoes: null,
        ordem: 1,
        ativa: true,
      },
    ]);
    const classificar = vi.spyOn(api, 'classificar').mockResolvedValue({
      id: 'dig',
      nome: 'Erro de digitação',
      detalhe: null,
      comentario: null,
    });
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    expect(await screen.findByText('Erro do cliente')).toBeInTheDocument();
    expect(screen.getByText('Mandou a nota errada')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Corrigir' }));
    await usuario.selectOptions(await screen.findByLabelText('Causa'), 'dig');
    await usuario.clear(screen.getByLabelText('Comentário'));
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(classificar).toHaveBeenCalledWith('s1', { causaId: 'dig' });
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
      anexos: [],
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

    expect(comentar).toHaveBeenCalledWith(
      's1',
      'Pedi a NF ao cliente',
      true,
      false,
    );
    expect(campo).toHaveValue('');
  });

  it('se o envio falhar, o texto fica e o erro aparece', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(
      detalhe({
        pode: {
          mudarPrioridade: false,
          atribuir: false,
          comentarInterno: false,
          classificar: false,
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

  it('mensagem com arquivo: cria a mensagem e anexa ligado a ela', async () => {
    vi.spyOn(api, 'detalhar').mockResolvedValue(detalhe());
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    const comentar = vi.spyOn(api, 'comentar').mockResolvedValue({
      id: 'm9',
      conteudo: '',
      interna: false,
      autor: { id: 'ana', nome: 'André' },
      criadoEm: '2026-10-17T10:00:00Z',
      anexos: [],
    });
    const anexar = vi.spyOn(api, 'anexar').mockResolvedValue({
      id: 'x',
      nomeArquivo: 'nf.pdf',
      tipoMime: 'application/pdf',
      tamanhoBytes: 4,
      etapa: 'ANDAMENTO',
      mensagemId: 'm9',
      enviadoPor: { id: 'ana', nome: 'André' },
      criadoEm: '2026-10-17T10:00:00Z',
    });
    render(<DetalheDaSolicitacao id="s1" />);
    const usuario = userEvent.setup();

    await usuario.upload(
      await screen.findByLabelText('Anexar arquivos à mensagem'),
      [new File(['%PDF'], 'nf.pdf', { type: 'application/pdf' })],
    );
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await vi.waitFor(() => expect(anexar).toHaveBeenCalled());
    expect(comentar).toHaveBeenCalledWith('s1', '', false, true);
    expect(anexar).toHaveBeenCalledWith('s1', expect.any(File), {
      mensagemId: 'm9',
    });
  });

  it('o arquivo aparece dentro da mensagem e abre pelo clique', async () => {
    const base = detalhe();
    vi.spyOn(api, 'detalhar').mockResolvedValue({
      ...base,
      mensagens: [
        {
          ...base.mensagens[0]!,
          anexos: [
            { id: 'x', nomeArquivo: 'nf.xml', tipoMime: 'application/xml' },
          ],
        },
      ],
    });
    vi.spyOn(api, 'responsaveis').mockResolvedValue([]);
    const baixar = vi
      .spyOn(api, 'baixarAnexo')
      .mockResolvedValue(new Blob(['<x/>']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DetalheDaSolicitacao id="s1" />);

    await userEvent.click(await screen.findByText('📎 nf.xml'));
    expect(baixar).toHaveBeenCalledWith('s1', 'x');
  });
});
