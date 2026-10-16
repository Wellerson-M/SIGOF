import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi, entrar, pedir, pedirArquivo } from './api';

function resposta(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('pedir', () => {
  it('chama a API em /api e devolve o JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);

    await expect(pedir('/auth/eu')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/eu',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('com sessão vencida (401), renova uma vez e repete o pedido', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(401, { erro: 'x' }))
      .mockResolvedValueOnce(resposta(204))
      .mockResolvedValueOnce(resposta(200, { nome: 'Ana' }));
    vi.stubGlobal('fetch', fetch);

    await expect(pedir('/auth/eu')).resolves.toEqual({ nome: 'Ana' });
    expect(fetch.mock.calls.map((chamada) => chamada[0])).toEqual([
      '/api/auth/eu',
      '/api/auth/renovar',
      '/api/auth/eu',
    ]);
  });

  it('se a renovação falha, devolve o erro da API', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        resposta(401, {
          erro: 'Autenticação necessária',
          codigo: 'NAO_AUTENTICADO',
        }),
      )
      .mockResolvedValueOnce(resposta(401, { erro: 'Sessão expirada' }));
    vi.stubGlobal('fetch', fetch);

    await expect(pedir('/auth/eu')).rejects.toMatchObject({
      status: 401,
      codigo: 'NAO_AUTENTICADO',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('vários pedidos com o token vencido fazem uma renovação só', async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/auth/renovar'
          ? resposta(204)
          : fetch.mock.calls.filter(([u]) => u === url).length === 1
            ? resposta(401, { erro: 'x' })
            : resposta(200, { url }),
      ),
    );
    vi.stubGlobal('fetch', fetch);

    await Promise.all([pedir('/a'), pedir('/b'), pedir('/c')]);

    expect(
      fetch.mock.calls.filter(([u]) => u === '/api/auth/renovar'),
    ).toHaveLength(1);
  });

  it('se a renovação falha por outro motivo (500), o erro é esse, e não "sem sessão"', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(401, { erro: 'x' }))
      .mockResolvedValueOnce(
        resposta(500, {
          erro: 'Erro interno do servidor',
          codigo: 'ERRO_INTERNO',
        }),
      );
    vi.stubGlobal('fetch', fetch);

    const erro = (await pedir('/auth/eu').catch(
      (e: unknown) => e,
    )) as ErroDaApi;
    expect(erro.status).toBe(500);
    expect(erro.semSessao).toBe(false);
  });

  it('sem conexão, dá uma mensagem que o usuário entende', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const erro = await pedir('/auth/eu').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect((erro as ErroDaApi).message).toMatch(/servidor/);
  });

  it('resposta 204 devolve undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(204)));

    await expect(
      pedir('/auth/sair', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });
});

describe('pedirArquivo e envio de arquivo', () => {
  it('devolve o conteúdo bruto, renovando a sessão se precisar', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(401, { erro: 'x' }))
      .mockResolvedValueOnce(resposta(204))
      .mockResolvedValueOnce(new Response('%PDF-1.7', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const arquivo = await pedirArquivo('/solicitacoes/s1/anexos/a1');
    expect(await arquivo.text()).toBe('%PDF-1.7');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('FormData vai sem o Content-Type de JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(201, { id: 'a1' }));
    vi.stubGlobal('fetch', fetch);
    await pedir('/solicitacoes/s1/anexos', {
      method: 'POST',
      body: new FormData(),
    });
    const opcoes = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(opcoes.headers).toEqual({});
  });
});

describe('entrar', () => {
  it('envia empresa, e-mail e senha em JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(204));
    vi.stubGlobal('fetch', fetch);

    await entrar('demo', 'a@b.test', 'segredo');

    const [, opcoes] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(opcoes.body))).toEqual({
      empresa: 'demo',
      email: 'a@b.test',
      senha: 'segredo',
    });
  });

  it('não tenta renovar quando a senha está errada', async () => {
    const fetch = vi.fn().mockResolvedValue(
      resposta(401, {
        erro: 'Empresa, e-mail ou senha inválidos',
        codigo: 'NAO_AUTENTICADO',
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(entrar('demo', 'a@b.test', 'errada')).rejects.toThrow(
      'Empresa, e-mail ou senha inválidos',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
