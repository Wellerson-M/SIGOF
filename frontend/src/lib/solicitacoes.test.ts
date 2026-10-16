import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from './api';
import { api, documentos, mensagemDoErro, textoDoSla } from './solicitacoes';

describe('textoDoSla', () => {
  it('escreve o tempo útil restante em horas e minutos', () => {
    expect(textoDoSla({ situacao: 'NO_PRAZO', minutosRestantes: 240 })).toBe(
      'Vence em 4h úteis',
    );
    expect(textoDoSla({ situacao: 'NO_PRAZO', minutosRestantes: 135 })).toBe(
      'Vence em 2h 15min úteis',
    );
    expect(textoDoSla({ situacao: 'ATENCAO', minutosRestantes: 20 })).toBe(
      'Vence em 20min úteis',
    );
  });

  it('vencido, pausado e encerrado têm texto próprio', () => {
    expect(textoDoSla({ situacao: 'VENCIDO', minutosRestantes: 0 })).toBe(
      'SLA vencido',
    );
    expect(textoDoSla({ situacao: 'PAUSADO', minutosRestantes: 90 })).toBe(
      'SLA pausado',
    );
    expect(textoDoSla({ situacao: 'ENCERRADO', minutosRestantes: null })).toBe(
      'Encerrada',
    );
  });
});

describe('mensagemDoErro', () => {
  it('no 400, junta o motivo de cada campo', () => {
    const erro = new ErroDaApi(400, 'VALIDACAO', 'Dados inválidos', [
      { campo: 'descricao', mensagem: 'Descrição curta' },
      { campo: 'tipo', mensagem: 'Escolha o tipo' },
    ]);
    expect(mensagemDoErro(erro)).toBe('Descrição curta. Escolha o tipo');
  });

  it('nos demais, usa a mensagem da API; erro desconhecido vira genérico', () => {
    expect(mensagemDoErro(new ErroDaApi(403, 'X', 'Sem permissão'))).toBe(
      'Sem permissão',
    );
    expect(mensagemDoErro(new ErroDaApi(400, 'X', 'JSON malformado'))).toBe(
      'JSON malformado',
    );
    expect(mensagemDoErro(new Error('boom'))).toMatch(/Algo deu errado/);
  });
});

describe('documentos', () => {
  it('mostra CTe e NF que existirem', () => {
    expect(documentos({ cte: '1', nf: '2' })).toBe('CTe 1 · NF 2');
    expect(documentos({ cte: null, nf: '2' })).toBe('NF 2');
    expect(documentos({ cte: null, nf: null })).toBe('');
  });
});

describe('chamadas à API', () => {
  afterEach(() => vi.unstubAllGlobals());

  function simularFetch() {
    // Uma resposta nova a cada chamada: o corpo só pode ser lido uma vez
    const chamado = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', chamado);
    return chamado;
  }

  it('cada ação vai ao endereço e método certos', async () => {
    const fetch = simularFetch();

    await api.listar('SOL 1');
    await api.detalhar('a');
    await api.abrir({ tipo: 'OUTRO', descricao: 'x', prioridade: 'BAIXA' });
    await api.mover('a', 'RESOLVIDO', 'feito');
    await api.priorizar('a', 'ALTA');
    await api.atribuir('a', 'b');
    await api.comentar('a', 'oi', false);
    await api.responsaveis();
    await api.listar();

    const chamadas = fetch.mock.calls.map(
      ([url, opcoes]) => `${opcoes?.method ?? 'GET'} ${String(url)}`,
    );
    expect(chamadas).toEqual([
      'GET /api/solicitacoes?busca=SOL%201',
      'GET /api/solicitacoes/a',
      'POST /api/solicitacoes',
      'POST /api/solicitacoes/a/status',
      'PATCH /api/solicitacoes/a/prioridade',
      'POST /api/solicitacoes/a/atribuir',
      'POST /api/solicitacoes/a/mensagens',
      'GET /api/solicitacoes/responsaveis',
      'GET /api/solicitacoes',
    ]);
    expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toEqual({
      status: 'RESOLVIDO',
      observacao: 'feito',
    });
  });
});
