import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/lib/api';
import { plataforma, sugerirCodigo } from '@/lib/plataforma';
import { PainelDaPlataforma } from './PainelDaPlataforma';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const EMPRESA = {
  id: 'e1',
  razaoSocial: 'Transportadora Demo Ltda.',
  cnpj: '11222333000181',
  slug: 'transportadora-demo',
  ativa: true,
  criadoEm: '2026-10-01T10:00:00Z',
  usuariosAtivos: 4,
  solicitacoesEmAberto: 3,
  solicitacoesNoMes: 12,
  ultimoAcessoEm: '2026-10-17T10:00:00Z',
};

beforeEach(() => {
  replace.mockReset();
  vi.spyOn(plataforma, 'eventos').mockResolvedValue({
    eventos: [],
    total: 0,
    pagina: 1,
  });
});

describe('código da empresa', () => {
  it('sai da razão social, sem acento nem "Ltda."', () => {
    expect(sugerirCodigo('Transportes São José Ltda.')).toBe(
      'transportes-sao-jose',
    );
  });
});

describe('PainelDaPlataforma', () => {
  it('sem sessão da plataforma, vai para a entrada dela', async () => {
    vi.spyOn(plataforma, 'eu').mockRejectedValue(
      new ErroDaApi(401, 'NAO_AUTENTICADO', 'Entre de novo'),
    );
    vi.spyOn(plataforma, 'empresas').mockResolvedValue([]);
    render(<PainelDaPlataforma />);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/plataforma/entrar'),
    );
  });

  it('lista as transportadoras e cria uma nova, mostrando a senha provisória', async () => {
    vi.spyOn(plataforma, 'eu').mockResolvedValue({
      id: 'a',
      nome: 'Dono',
      email: 'dono@sigof.test',
      trocarSenha: false,
    });
    vi.spyOn(plataforma, 'empresas').mockResolvedValue([EMPRESA]);
    const criar = vi.spyOn(plataforma, 'criarEmpresa').mockResolvedValue({
      empresa: { ...EMPRESA, id: 'e2', slug: 'nova-transportes' },
      senhaProvisoria: 'Abc123Xyz456',
    });
    render(<PainelDaPlataforma />);

    expect(
      await screen.findByText('Transportadora Demo Ltda.'),
    ).toBeInTheDocument();
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument();

    const usuario = userEvent.setup();
    await usuario.click(
      screen.getByRole('button', { name: 'Nova transportadora' }),
    );
    await usuario.type(
      screen.getByLabelText('Razão social'),
      'Nova Transportes Ltda.',
    );
    await usuario.type(screen.getByLabelText('CNPJ'), '11.222.333/0001-81');
    await usuario.type(
      screen.getByLabelText('Administrador da empresa (nome)'),
      'TI Nova',
    );
    await usuario.type(
      screen.getByLabelText('E-mail do administrador'),
      'ti@nova.test',
    );
    expect(screen.getByLabelText('Código (usado no login)')).toHaveValue(
      'nova-transportes',
    );
    await usuario.click(
      screen.getByRole('button', { name: 'Criar transportadora' }),
    );

    expect(criar).toHaveBeenCalledWith({
      razaoSocial: 'Nova Transportes Ltda.',
      cnpj: '11.222.333/0001-81',
      slug: 'nova-transportes',
      administrador: { nome: 'TI Nova', email: 'ti@nova.test' },
    });
    expect(await screen.findByText(/Abc123Xyz456/)).toBeInTheDocument();
  });

  it('com a senha provisória, pede para criar a própria antes de tudo', async () => {
    vi.spyOn(plataforma, 'eu').mockResolvedValue({
      id: 'a',
      nome: 'Dono',
      email: 'dono@sigof.test',
      trocarSenha: true,
    });
    vi.spyOn(plataforma, 'empresas').mockResolvedValue([EMPRESA]);
    render(<PainelDaPlataforma />);
    expect(await screen.findByText('Crie a sua senha')).toBeInTheDocument();
    expect(screen.queryByText('Transportadora Demo Ltda.')).toBeNull();
  });

  it('libera e bloqueia os módulos de uma transportadora', async () => {
    vi.spyOn(plataforma, 'eu').mockResolvedValue({
      id: 'a',
      nome: 'Dono',
      email: 'dono@sigof.test',
      trocarSenha: false,
    });
    vi.spyOn(plataforma, 'empresas').mockResolvedValue([
      { ...EMPRESA, modulosLiberados: ['FILIAIS', 'EMAIL'] },
    ]);
    const alterar = vi
      .spyOn(plataforma, 'alterarEmpresa')
      .mockResolvedValue(EMPRESA);
    render(<PainelDaPlataforma />);

    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Módulos' }));
    expect(screen.getByLabelText(/Filiais/)).toBeChecked();
    expect(screen.getByLabelText(/Balanço por digitador/)).not.toBeChecked();
    await usuario.click(screen.getByLabelText(/Avisos por e-mail/));
    await usuario.click(screen.getByLabelText(/Balanço por digitador/));
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(alterar).toHaveBeenCalledWith('e1', {
      modulosLiberados: ['FILIAIS', 'BALANCO'],
    });
    expect(
      await screen.findByText(/Módulos de Transportadora Demo Ltda. salvos/),
    ).toBeInTheDocument();
  });
});
