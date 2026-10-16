import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi, type Perfil } from '@/lib/api';
import {
  admin,
  type ParametrosDaEmpresa as Parametros,
  type UsuarioDaEmpresa,
} from '@/lib/administracao';
import PaginaDeAdministracao from '@/app/(sistema)/administracao/page';
import { Auditoria } from './Auditoria';
import { ParametrosDaEmpresa } from './ParametrosDaEmpresa';
import { Usuarios } from './Usuarios';

let perfil: Perfil = 'ADMIN';
vi.mock('@/lib/sessao', () => ({
  useSessao: () => ({
    usuario: {
      id: 'eu',
      nome: 'Ana Admin',
      email: 'ana@demo.test',
      perfil,
      area: null,
      trocarSenha: false,
      empresa: { razaoSocial: 'Transportadora Demo Ltda.', slug: 'demo' },
    },
    sair: vi.fn(),
    atualizar: vi.fn(),
  }),
}));

function usuario(parte: Partial<UsuarioDaEmpresa> = {}): UsuarioDaEmpresa {
  return {
    id: 'u1',
    nome: 'André Analista',
    email: 'andre@demo.test',
    perfil: 'ANALISTA',
    area: 'FINANCEIRO',
    ativo: true,
    trocarSenha: false,
    bloqueado: false,
    ultimoAcessoEm: null,
    criadoEm: '2026-10-16T10:00:00Z',
    ...parte,
  };
}

const PARAMETROS: Parametros = {
  razaoSocial: 'Transportadora Demo Ltda.',
  cnpj: '11222333000181',
  slug: 'demo',
  fusoHorario: 'America/Sao_Paulo',
  expedienteInicioMinuto: 480,
  expedienteFimMinuto: 1080,
  diasUteis: [1, 2, 3, 4, 5],
  slaAtendimentoMinutos: 240,
  janelaDuplicidadeDias: 7,
};

beforeEach(() => {
  vi.restoreAllMocks();
  perfil = 'ADMIN';
});

describe('Usuários', () => {
  it('lista com a situação de cada um e esconde os desativados', async () => {
    vi.spyOn(admin, 'usuarios').mockResolvedValue([
      usuario(),
      usuario({ id: 'u2', nome: 'Bia', trocarSenha: true }),
      usuario({ id: 'u3', nome: 'Caio', bloqueado: true }),
      usuario({ id: 'u4', nome: 'Duda', ativo: false }),
      usuario({ id: 'eu', nome: 'Ana Admin', perfil: 'ADMIN', area: null }),
    ]);
    render(<Usuarios />);

    expect(await screen.findByText('André Analista')).toBeInTheDocument();
    expect(screen.getByText('Aguardando 1º acesso')).toBeInTheDocument();
    expect(screen.getByText('Bloqueado')).toBeInTheDocument();
    expect(screen.queryByText('Duda')).toBeNull();
    // Ninguém desativa a si mesmo
    expect(screen.queryByLabelText('Desativar Ana Admin')).toBeNull();

    await userEvent.click(screen.getByLabelText('Mostrar desativados (1)'));
    expect(screen.getByText('Duda')).toBeInTheDocument();
    expect(screen.getByLabelText('Reativar Duda')).toBeInTheDocument();
  });

  it('cadastra e mostra a senha provisória uma vez', async () => {
    vi.spyOn(admin, 'usuarios').mockResolvedValue([]);
    const criar = vi.spyOn(admin, 'criarUsuario').mockResolvedValue({
      usuario: usuario({ nome: 'Nova Pessoa', email: 'nova@demo.test' }),
      senhaProvisoria: 'Ab3dEf7hJk9m',
    });
    render(<Usuarios />);

    await userEvent.click(await screen.findByText('Novo usuário'));
    const janela = screen.getByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Nova Pessoa');
    await userEvent.type(
      within(janela).getByLabelText('E-mail'),
      'nova@demo.test',
    );
    await userEvent.selectOptions(
      within(janela).getByLabelText(/^Perfil/),
      'SUPERVISOR',
    );
    expect(
      within(janela).getByText(
        'Tudo do analista, mais reatribuir e retomar escalonadas.',
      ),
    ).toBeInTheDocument();
    await userEvent.selectOptions(
      within(janela).getByLabelText('Área'),
      'COMERCIAL',
    );
    await userEvent.click(within(janela).getByText('Cadastrar'));

    expect(criar).toHaveBeenCalledWith({
      nome: 'Nova Pessoa',
      email: 'nova@demo.test',
      perfil: 'SUPERVISOR',
      area: 'COMERCIAL',
    });
    expect(await screen.findByTestId('senha-provisoria')).toHaveTextContent(
      'Ab3dEf7hJk9m',
    );
    expect(screen.getByText('demo')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Pronto'));
    expect(screen.queryByTestId('senha-provisoria')).toBeNull();
  });

  it('mostra o erro da API no formulário', async () => {
    vi.spyOn(admin, 'usuarios').mockResolvedValue([]);
    vi.spyOn(admin, 'criarUsuario').mockRejectedValue(
      new ErroDaApi(409, 'CONFLITO', 'Já existe um usuário com este e-mail'),
    );
    render(<Usuarios />);
    await userEvent.click(await screen.findByText('Novo usuário'));
    const janela = screen.getByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Repetida');
    await userEvent.type(
      within(janela).getByLabelText('E-mail'),
      'andre@demo.test',
    );
    await userEvent.click(within(janela).getByText('Cadastrar'));
    expect(
      await within(janela).findByText('Já existe um usuário com este e-mail'),
    ).toBeInTheDocument();
  });

  it('edita, desativa e gera nova senha', async () => {
    const lista = vi.spyOn(admin, 'usuarios').mockResolvedValue([usuario()]);
    const alterar = vi
      .spyOn(admin, 'alterarUsuario')
      .mockResolvedValue(usuario());
    vi.spyOn(admin, 'redefinirSenha').mockResolvedValue({
      usuario: usuario(),
      senhaProvisoria: 'Zz9yYx8wWv7u',
    });
    render(<Usuarios />);

    await userEvent.click(
      await screen.findByLabelText('Editar André Analista'),
    );
    const nome = within(screen.getByRole('dialog')).getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'André Silva');
    await userEvent.click(screen.getByText('Salvar'));
    expect(alterar).toHaveBeenCalledWith('u1', {
      nome: 'André Silva',
      email: 'andre@demo.test',
      perfil: 'ANALISTA',
      area: 'FINANCEIRO',
    });

    await userEvent.click(screen.getByLabelText('Desativar André Analista'));
    expect(alterar).toHaveBeenLastCalledWith('u1', { ativo: false });

    await userEvent.click(
      screen.getByLabelText('Gerar nova senha para André Analista'),
    );
    expect(await screen.findByTestId('senha-provisoria')).toHaveTextContent(
      'Zz9yYx8wWv7u',
    );
    expect(lista).toHaveBeenCalledTimes(4);
  });

  it('o administrador não muda o próprio perfil', async () => {
    vi.spyOn(admin, 'usuarios').mockResolvedValue([
      usuario({ id: 'eu', nome: 'Ana Admin', perfil: 'ADMIN' }),
    ]);
    render(<Usuarios />);
    await userEvent.click(await screen.findByLabelText('Editar Ana Admin'));
    expect(
      within(screen.getByRole('dialog')).getByLabelText(/^Perfil/),
    ).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falha ao carregar', async () => {
    vi.spyOn(admin, 'usuarios').mockRejectedValue(
      new ErroDaApi(403, 'ACESSO_NEGADO', 'Sem permissão'),
    );
    render(<Usuarios />);
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
  });
});

describe('Parâmetros da empresa', () => {
  it('mostra os valores em horas e salva convertendo para minutos', async () => {
    vi.spyOn(admin, 'empresa').mockResolvedValue(PARAMETROS);
    const alterar = vi
      .spyOn(admin, 'alterarEmpresa')
      .mockImplementation(async (dados) => ({ ...PARAMETROS, ...dados }));
    render(<ParametrosDaEmpresa />);

    const sla = await screen.findByLabelText(
      'Prazo de atendimento (horas úteis)',
    );
    expect(sla).toHaveValue(4);
    await userEvent.clear(sla);
    await userEvent.type(sla, '2.5');
    await userEvent.click(screen.getByLabelText('Sáb'));
    await userEvent.click(screen.getByLabelText('Seg'));
    await userEvent.click(screen.getByText('Salvar parâmetros'));

    expect(alterar).toHaveBeenCalledWith(
      expect.objectContaining({
        slaAtendimentoMinutos: 150,
        diasUteis: [2, 3, 4, 5, 6],
        expedienteInicioMinuto: 480,
        expedienteFimMinuto: 1080,
      }),
    );
    expect(await screen.findByText('Parâmetros salvos.')).toBeInTheDocument();
  });

  it('mostra o erro de regra de negócio', async () => {
    vi.spyOn(admin, 'empresa').mockResolvedValue({
      ...PARAMETROS,
      fusoHorario: 'Europe/Lisbon',
    });
    vi.spyOn(admin, 'alterarEmpresa').mockRejectedValue(
      new ErroDaApi(
        422,
        'REGRA_DE_NEGOCIO',
        'O fim do expediente precisa ser depois do início',
      ),
    );
    render(<ParametrosDaEmpresa />);
    // Fuso fora da lista continua aparecendo como escolhido
    expect(await screen.findByLabelText('Fuso horário')).toHaveValue(
      'Europe/Lisbon',
    );
    await userEvent.click(screen.getByText('Salvar parâmetros'));
    expect(
      await screen.findByText(
        'O fim do expediente precisa ser depois do início',
      ),
    ).toBeInTheDocument();
  });

  it('falha ao carregar', async () => {
    vi.spyOn(admin, 'empresa').mockRejectedValue(
      new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão'),
    );
    render(<ParametrosDaEmpresa />);
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  });
});

describe('Auditoria', () => {
  it('lista os eventos e pagina', async () => {
    const auditoria = vi.spyOn(admin, 'auditoria').mockResolvedValue({
      pagina: 1,
      total: 120,
      eventos: [
        {
          id: 'e1',
          acao: 'LOGIN_RECUSADO',
          autor: null,
          alvo: { id: 'u1', nome: 'André' },
          detalhes: { motivo: 'senha errada' },
          ip: '10.0.0.1',
          criadoEm: '2026-10-16T10:00:00Z',
        },
      ],
    });
    render(<Auditoria />);

    expect(await screen.findByText('Login recusado')).toBeInTheDocument();
    expect(screen.getByText('senha errada')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Mais antigos'));
    expect(auditoria).toHaveBeenLastCalledWith(2);
  });

  it('sem eventos', async () => {
    vi.spyOn(admin, 'auditoria').mockResolvedValue({
      pagina: 1,
      total: 0,
      eventos: [],
    });
    render(<Auditoria />);
    expect(await screen.findByText('Nenhum evento ainda.')).toBeInTheDocument();
  });

  it('falha ao carregar', async () => {
    vi.spyOn(admin, 'auditoria').mockRejectedValue(
      new ErroDaApi(500, 'ERRO', 'Falhou'),
    );
    render(<Auditoria />);
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });
});

describe('página de administração', () => {
  it('troca de aba', async () => {
    vi.spyOn(admin, 'usuarios').mockResolvedValue([]);
    vi.spyOn(admin, 'empresa').mockResolvedValue(PARAMETROS);
    vi.spyOn(admin, 'auditoria').mockResolvedValue({
      pagina: 1,
      total: 0,
      eventos: [],
    });
    render(<PaginaDeAdministracao />);
    expect(await screen.findByText('Novo usuário')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Empresa e expediente' }),
    );
    expect(await screen.findByText('Salvar parâmetros')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Auditoria' }));
    expect(await screen.findByText('Nenhum evento ainda.')).toBeInTheDocument();
  });

  it('quem não é administrador não vê nada', () => {
    perfil = 'SUPERVISOR';
    render(<PaginaDeAdministracao />);
    expect(
      screen.getByText('Só o administrador da empresa acessa esta página.'),
    ).toBeInTheDocument();
  });
});
