import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  admin,
  horaParaMinutos,
  minutosParaHora,
  resumoDosDetalhes,
  trocarMinhaSenha,
} from './administracao';

describe('conversões de horário', () => {
  it('minutos ↔ HH:MM', () => {
    expect(minutosParaHora(480)).toBe('08:00');
    expect(minutosParaHora(1085)).toBe('18:05');
    expect(horaParaMinutos('07:30')).toBe(450);
    expect(horaParaMinutos(minutosParaHora(1439))).toBe(1439);
  });
});

describe('resumoDosDetalhes', () => {
  it('mostra o antes e o depois de cada campo', () => {
    expect(
      resumoDosDetalhes({
        perfil: { de: 'ANALISTA', para: 'SUPERVISOR' },
        ativo: { de: true, para: false },
        area: { de: 'FINANCEIRO', para: null },
      }),
    ).toBe(
      'perfil: ANALISTA → SUPERVISOR · ativo: sim → não · area: FINANCEIRO → —',
    );
  });

  it('mostra o motivo do login recusado', () => {
    expect(resumoDosDetalhes({ motivo: 'senha errada' })).toBe('senha errada');
  });

  it('mostra valores soltos e listas', () => {
    expect(resumoDosDetalhes({ nome: 'Ana', diasUteis: [1, 2] })).toBe(
      'nome: Ana · diasUteis: 1, 2',
    );
  });

  it('sem detalhes, nada', () => {
    expect(resumoDosDetalhes(null)).toBe('');
    expect(resumoDosDetalhes('texto')).toBe('');
  });
});

describe('chamadas à API', () => {
  afterEach(() => vi.unstubAllGlobals());

  function respondendo(corpo: unknown, status = 200) {
    // Uma resposta nova a cada chamada: o corpo de uma Response só se lê uma vez
    const fetch = vi.fn<
      (url: string, opcoes?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(status === 204 ? null : JSON.stringify(corpo), { status }),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('usa os caminhos e métodos certos', async () => {
    const fetch = respondendo({});
    await admin.usuarios();
    await admin.criarUsuario({
      nome: 'Ana',
      email: 'ana@x.test',
      perfil: 'ANALISTA',
      area: null,
    });
    await admin.alterarUsuario('u1', { ativo: false });
    await admin.redefinirSenha('u1');
    await admin.empresa();
    await admin.alterarEmpresa({ janelaDuplicidadeDias: 3 });
    await admin.auditoria(2);

    const chamadas = fetch.mock.calls.map(
      ([url, opcoes]) => `${opcoes?.method ?? 'GET'} ${url}`,
    );
    expect(chamadas).toEqual([
      'GET /api/admin/usuarios',
      'POST /api/admin/usuarios',
      'PATCH /api/admin/usuarios/u1',
      'POST /api/admin/usuarios/u1/redefinir-senha',
      'GET /api/admin/empresa',
      'PATCH /api/admin/empresa',
      'GET /api/admin/auditoria?pagina=2',
    ]);
  });

  it('troca a própria senha', async () => {
    const fetch = respondendo(null, 204);
    await trocarMinhaSenha('velha', 'Nova12345');
    const [url, opcoes] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/senha');
    expect(JSON.parse(String(opcoes?.body))).toEqual({
      senhaAtual: 'velha',
      novaSenha: 'Nova12345',
    });
  });
});
