import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  autenticar,
  exigirPerfil,
  usuarioDa,
} from '../../http/autenticacao.js';
import { ErroNaoEncontrado } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import type { ServicoDeAdministracao } from './servico.js';

const PERFIS = ['SOLICITANTE', 'ANALISTA', 'SUPERVISOR', 'ADMIN'] as const;
const AREAS = ['FINANCEIRO', 'COMERCIAL', 'OPERACIONAL'] as const;

const nome = z.string().trim().min(2, 'Informe o nome').max(120);
const email = z.string().trim().email('E-mail inválido').max(254);
const perfil = z.enum(PERFIS, { message: 'Perfil inválido' });
const area = z.enum(AREAS, { message: 'Área inválida' }).nullable();

const esquemaNovoUsuario = z.object({
  nome,
  email,
  perfil,
  area: area.optional(),
});

const esquemaAlteracaoDeUsuario = z
  .object({
    nome: nome.optional(),
    email: email.optional(),
    perfil: perfil.optional(),
    area: area.optional(),
    ativo: z.boolean().optional(),
  })
  .strict();

/** Fuso IANA que o próprio Node reconhece (ex.: America/Manaus). */
const fuso = z
  .string()
  .max(60)
  .refine((valor) => {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: valor });
      return true;
    } catch {
      return false;
    }
  }, 'Fuso horário desconhecido');

const minutoDoDia = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);

const esquemaAlteracaoDaEmpresa = z
  .object({
    razaoSocial: z.string().trim().min(2).max(200).optional(),
    fusoHorario: fuso.optional(),
    expedienteInicioMinuto: minutoDoDia.optional(),
    expedienteFimMinuto: minutoDoDia.optional(),
    diasUteis: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Escolha pelo menos um dia útil')
      .max(7)
      .optional(),
    slaAtendimentoMinutos: z
      .number()
      .int()
      .min(15, 'O prazo mínimo é de 15 minutos')
      .max(7 * 24 * 60, 'O prazo máximo é de 7 dias')
      .optional(),
    janelaDuplicidadeDias: z.number().int().min(0).max(90).optional(),
    exigirCausaAoResolver: z.boolean().optional(),
    diasNoQuadroDepoisDeEncerrar: z.number().int().min(0).max(90).optional(),
    minutosParaExcluirAnexo: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .optional(),
    analistaAtribui: z.boolean().optional(),
  })
  .strict();

const ACOES = [
  'LOGIN',
  'LOGIN_RECUSADO',
  'SAIDA',
  'SENHA_ALTERADA',
  'USUARIO_CRIADO',
  'USUARIO_ALTERADO',
  'SENHA_REDEFINIDA',
  'EMPRESA_ALTERADA',
  'EMAIL_CONFIGURADO',
  'CADASTRO_ALTERADO',
] as const;

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD')
  .optional();

const esquemaTrilha = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  // "LOGIN,LOGIN_RECUSADO" → ['LOGIN', 'LOGIN_RECUSADO']
  acao: z
    .string()
    .optional()
    .transform((texto) =>
      texto ? texto.split(',').filter(Boolean) : undefined,
    )
    .pipe(z.array(z.enum(ACOES)).optional()),
  usuarioId: z.string().uuid('Usuário inválido').optional(),
  de: data,
  ate: data,
});

function idDa(req: Request): string {
  const resultado = z.string().uuid().safeParse(req.params.id);
  if (!resultado.success) {
    throw new ErroNaoEncontrado('Usuário não encontrado');
  }
  return resultado.data;
}

/** Tudo aqui é só do administrador da empresa. */
export function rotasDeAdministracao(opcoes: {
  servico: ServicoDeAdministracao;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();

  rotas.use(autenticar(opcoes.jwtSecret), exigirPerfil('ADMIN'));

  rotas.get('/usuarios', async (req, res) => {
    res.json(await servico.listarUsuarios(usuarioDa(req)));
  });

  rotas.post('/usuarios', async (req, res) => {
    const dados = validar(esquemaNovoUsuario, req.body);
    res
      .status(201)
      .json(await servico.criarUsuario(usuarioDa(req), dados, req.ip));
  });

  rotas.patch('/usuarios/:id', async (req, res) => {
    const alteracao = validar(esquemaAlteracaoDeUsuario, req.body);
    res.json(
      await servico.alterarUsuario(
        usuarioDa(req),
        idDa(req),
        alteracao,
        req.ip,
      ),
    );
  });

  rotas.post('/usuarios/:id/redefinir-senha', async (req, res) => {
    res.json(await servico.redefinirSenha(usuarioDa(req), idDa(req), req.ip));
  });

  rotas.get('/empresa', async (req, res) => {
    res.json(await servico.parametrosDaEmpresa(usuarioDa(req)));
  });

  rotas.patch('/empresa', async (req, res) => {
    const alteracao = validar(esquemaAlteracaoDaEmpresa, req.body);
    res.json(await servico.alterarEmpresa(usuarioDa(req), alteracao, req.ip));
  });

  rotas.get('/auditoria', async (req, res) => {
    const { pagina, acao, ...filtros } = validar(esquemaTrilha, req.query);
    res.json(
      await servico.trilha(usuarioDa(req), pagina, {
        ...filtros,
        acoes: acao,
      }),
    );
  });

  return rotas;
}
