import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi, entrar, pedir } from './api';

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
    expect(fetch).toHaveBeenCalledWith('/api/auth/eu', expect.objectContaining({ credentials: 'same-origin' }));
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
      .mockResolvedValueOnce(resposta(401, { erro: 'Autenticação necessária', codigo: 'NAO_AUTENTICADO' }))
      .mockResolvedValueOnce(resposta(401, { erro: 'Sessão expirada' }));
    vi.stubGlobal('fetch', fetch);

    await expect(pedir('/auth/eu')).rejects.toMatchObject({ status: 401, codigo: 'NAO_AUTENTICADO' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sem conexão, dá uma mensagem que o usuário entende', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const erro = await pedir('/auth/eu').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect((erro as ErroDaApi).message).toMatch(/servidor/);
  });

  it('resposta 204 devolve undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(204)));

    await expect(pedir('/auth/sair', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('entrar', () => {
  it('envia empresa, e-mail e senha em JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(204));
    vi.stubGlobal('fetch', fetch);

    await entrar('demo', 'a@b.test', 'segredo');

    const [, opcoes] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(opcoes.body))).toEqual({ empresa: 'demo', email: 'a@b.test', senha: 'segredo' });
  });

  it('não tenta renovar quando a senha está errada', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(resposta(401, { erro: 'Empresa, e-mail ou senha inválidos', codigo: 'NAO_AUTENTICADO' }));
    vi.stubGlobal('fetch', fetch);

    await expect(entrar('demo', 'a@b.test', 'errada')).rejects.toThrow('Empresa, e-mail ou senha inválidos');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
