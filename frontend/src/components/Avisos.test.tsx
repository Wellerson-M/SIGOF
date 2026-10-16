import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import {
  email,
  haQuantoTempo,
  notificacoes,
  type ConfiguracaoDeEmail,
} from '@/lib/avisos';
import { Email } from './administracao/Email';
import { EVENTO_NOTIFICACOES_LIDAS, INTERVALO_DO_SINO_MS, Sino } from './Sino';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
});

const NOTIFICACOES = {
  naoLidas: 1,
  itens: [
    {
      id: 'n1',
      mensagem: 'SOL-1: Novo → Em andamento (André)',
      lida: false,
      solicitacaoId: 's1',
      criadoEm: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
    {
      id: 'n2',
      mensagem: 'SOL-2: mensagem de Sofia',
      lida: true,
      solicitacaoId: 's2',
      criadoEm: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    },
  ],
};

describe('Sino', () => {
  afterEach(() => vi.useRealTimers());

  it('mostra quantas não lidas, abre a lista e leva à solicitação', async () => {
    vi.spyOn(notificacoes, 'listar').mockResolvedValue(NOTIFICACOES);
    const marcar = vi
      .spyOn(notificacoes, 'marcarLidas')
      .mockResolvedValue({ naoLidas: 0 });
    render(<Sino />);

    const botao = await screen.findByLabelText('Notificações: 1 não lidas');
    await userEvent.click(botao);
    expect(screen.getByText('há 5 min · não lida')).toBeInTheDocument();
    expect(screen.getByText('há 3 dias')).toBeInTheDocument();

    await userEvent.click(
      screen.getByText('SOL-1: Novo → Em andamento (André)'),
    );
    expect(push).toHaveBeenCalledWith('/solicitacoes/s1');
    expect(marcar).toHaveBeenCalledWith({ ids: ['n1'] });
    expect(screen.queryByText('Notificações', { selector: 'p' })).toBeNull();
  });

  it('marca todas como lidas e fecha com Esc', async () => {
    vi.spyOn(notificacoes, 'listar').mockResolvedValue(NOTIFICACOES);
    const marcar = vi
      .spyOn(notificacoes, 'marcarLidas')
      .mockResolvedValue({ naoLidas: 0 });
    render(<Sino />);

    await userEvent.click(await screen.findByLabelText(/Notificações/));
    await userEvent.click(screen.getByText('Marcar todas como lidas'));
    expect(marcar).toHaveBeenCalledWith();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('SOL-2: mensagem de Sofia')).toBeNull();
  });

  it('vazio, e fecha ao clicar fora', async () => {
    vi.spyOn(notificacoes, 'listar').mockResolvedValue({
      naoLidas: 0,
      itens: [],
    });
    render(
      <>
        <Sino />
        <p>fora</p>
      </>,
    );
    await userEvent.click(await screen.findByLabelText('Notificações'));
    expect(screen.getByText('Nada por enquanto.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('fora'));
    expect(screen.queryByText('Nada por enquanto.')).toBeNull();
  });

  it('pergunta de novo a cada intervalo e quando o detalhe avisa', async () => {
    vi.useFakeTimers();
    const listar = vi
      .spyOn(notificacoes, 'listar')
      .mockResolvedValue({ naoLidas: 120, itens: [] });
    render(<Sino />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('99+')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_DO_SINO_MS));
    expect(listar).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_NOTIFICACOES_LIDAS));
    });
    expect(listar).toHaveBeenCalledTimes(3);
  });

  it('sem conexão, fica quieto', async () => {
    vi.spyOn(notificacoes, 'listar').mockRejectedValue(new Error('rede'));
    render(<Sino />);
    expect(await screen.findByLabelText('Notificações')).toBeInTheDocument();
  });
});

describe('haQuantoTempo', () => {
  const agora = new Date('2026-10-16T12:00:00Z');
  it.each([
    ['2026-10-16T11:59:40Z', 'agora'],
    ['2026-10-16T11:30:00Z', 'há 30 min'],
    ['2026-10-16T09:00:00Z', 'há 3 h'],
    ['2026-10-15T11:00:00Z', 'há 1 dia'],
  ])('%s → %s', (iso, esperado) => {
    expect(haQuantoTempo(iso, agora)).toBe(esperado);
  });
});

const CONFIG: ConfiguracaoDeEmail = {
  ativo: false,
  servidor: null,
  porta: null,
  tlsDireto: true,
  usuario: null,
  temSenha: false,
  nomeDoRemetente: null,
  caixaCentral: null,
};

describe('aba E-mail da administração', () => {
  it('preenche com o Gmail, salva e liga o envio', async () => {
    vi.spyOn(email, 'obter').mockResolvedValue(CONFIG);
    vi.spyOn(email, 'envios').mockResolvedValue({
      envios: [],
      total: 0,
      pagina: 1,
    });
    const alterar = vi.spyOn(email, 'alterar').mockResolvedValue({
      ...CONFIG,
      ativo: true,
      servidor: 'smtp.gmail.com',
      porta: 465,
      usuario: 'avisos@gmail.com',
      temSenha: true,
      caixaCentral: 'central@demo.test',
    });
    render(<Email />);

    expect(
      await screen.findByText('Nenhum e-mail enviado ainda.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText('Usar Gmail'));
    expect(screen.getByLabelText('Servidor (SMTP)')).toHaveValue(
      'smtp.gmail.com',
    );
    expect(screen.getByLabelText('Porta')).toHaveValue(465);

    await userEvent.type(
      screen.getByLabelText('E-mail de envio (login)'),
      'avisos@gmail.com',
    );
    await userEvent.type(
      screen.getByLabelText(/^Senha de app/),
      'abcd efgh ijkl mnop',
    );
    await userEvent.type(
      screen.getByLabelText(/^E-mail que recebe cópia de tudo/),
      'central@demo.test',
    );
    await userEvent.click(screen.getByLabelText('Enviar os avisos por e-mail'));
    await userEvent.click(screen.getByText('Salvar'));

    expect(alterar).toHaveBeenCalledWith({
      ativo: true,
      servidor: 'smtp.gmail.com',
      porta: 465,
      tlsDireto: true,
      usuario: 'avisos@gmail.com',
      senha: 'abcd efgh ijkl mnop',
      nomeDoRemetente: '',
      caixaCentral: 'central@demo.test',
    });
    expect(
      await screen.findByText(
        'Configuração salva. Os avisos já saem por e-mail.',
      ),
    ).toBeInTheDocument();
    // A senha não volta para a tela
    expect(screen.getByLabelText(/^Senha de app/)).toHaveValue('');
    expect(
      screen.getByPlaceholderText('Guardada. Preencha só para trocar.'),
    ).toBeInTheDocument();
  });

  it('salvar sem digitar a senha não manda senha; desligado avisa', async () => {
    vi.spyOn(email, 'obter').mockResolvedValue({ ...CONFIG, temSenha: true });
    vi.spyOn(email, 'envios').mockResolvedValue({
      envios: [],
      total: 0,
      pagina: 1,
    });
    const alterar = vi
      .spyOn(email, 'alterar')
      .mockResolvedValue({ ...CONFIG, temSenha: true });
    render(<Email />);
    await userEvent.click(await screen.findByText('Salvar'));
    expect(alterar.mock.calls[0]?.[0]).not.toHaveProperty('senha');
    expect(
      await screen.findByText('Configuração salva. O envio está desligado.'),
    ).toBeInTheDocument();
  });

  it('testa o envio e mostra a recusa do servidor; lista os envios', async () => {
    vi.spyOn(email, 'obter').mockResolvedValue({
      ...CONFIG,
      servidor: 'smtp.gmail.com',
      usuario: 'avisos@gmail.com',
      temSenha: true,
    });
    vi.spyOn(email, 'envios').mockResolvedValue({
      total: 1,
      pagina: 1,
      envios: [
        {
          id: 'e1',
          assunto: '[SIGOF SOL-1] Reversão',
          para: ['central@demo.test'],
          situacao: 'FALHOU',
          tentativas: 5,
          ultimoErro: 'Invalid login',
          enviadoEm: null,
          criadoEm: '2026-10-16T10:00:00Z',
          protocolo: 'SOL-1',
        },
      ],
    });
    const testar = vi
      .spyOn(email, 'testar')
      .mockResolvedValueOnce({ enviadoPara: 'ana@demo.test' })
      .mockRejectedValueOnce(
        new ErroDaApi(
          422,
          'REGRA_DE_NEGOCIO',
          'O servidor de e-mail recusou o envio: 535',
        ),
      );
    render(<Email />);

    const linha = (await screen.findByText('[SIGOF SOL-1] Reversão')).closest(
      'tr',
    );
    expect(
      within(linha as HTMLElement).getByText('Falhou'),
    ).toBeInTheDocument();
    expect(
      within(linha as HTMLElement).getByText('Invalid login'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText('Enviar e-mail de teste'));
    expect(testar).toHaveBeenLastCalledWith(undefined);
    expect(
      await screen.findByText(/enviado para ana@demo.test/),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText('Testar enviando para'),
      'x@demo.test',
    );
    await userEvent.click(screen.getByText('Enviar e-mail de teste'));
    expect(testar).toHaveBeenLastCalledWith('x@demo.test');
    expect(
      await screen.findByText('O servidor de e-mail recusou o envio: 535'),
    ).toBeInTheDocument();
  });

  it('falha ao carregar', async () => {
    vi.spyOn(email, 'obter').mockRejectedValue(
      new ErroDaApi(500, 'ERRO', 'Falhou'),
    );
    vi.spyOn(email, 'envios').mockResolvedValue({
      envios: [],
      total: 0,
      pagina: 1,
    });
    render(<Email />);
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });
});

describe('chamadas da lib de avisos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa os caminhos certos', async () => {
    const fetch = vi.fn<
      (url: string, opcoes?: RequestInit) => Promise<Response>
    >(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await notificacoes.listar();
    await notificacoes.marcarLidas({ solicitacaoId: 's1' });
    await email.obter();
    await email.alterar({ ativo: false });
    await email.testar();
    await email.testar('x@demo.test');
    await email.envios(2);
    expect(
      fetch.mock.calls.map(
        ([url, o]) => `${o?.method ?? 'GET'} ${url} ${o?.body ?? ''}`,
      ),
    ).toEqual([
      'GET /api/notificacoes ',
      'POST /api/notificacoes/lidas {"solicitacaoId":"s1"}',
      'GET /api/admin/email ',
      'PATCH /api/admin/email {"ativo":false}',
      'POST /api/admin/email/teste {}',
      'POST /api/admin/email/teste {"para":"x@demo.test"}',
      'GET /api/admin/email/envios?pagina=2 ',
    ]);
  });
});
