import {
  Router,
  type CookieOptions,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { MODULOS } from '../../dominio/modulos.js';
import { ErroNaoAutenticado, ErroNaoEncontrado } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import { esquemaNovaSenha } from '../auth/rotas.js';
import {
  HORAS_DE_SESSAO,
  verificarTokenDaPlataforma,
  type AdministradorAutenticado,
  type ServicoDaPlataforma,
} from './servico.js';

export const COOKIE_DA_PLATAFORMA = 'sigof_plataforma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- extensão de tipo do Express
  namespace Express {
    interface Request {
      administrador?: AdministradorAutenticado;
    }
  }
}

const email = z.string().trim().email('E-mail inválido').max(254);
const esquemaEntrada = z.object({ email, senha: z.string().min(1).max(200) });
const esquemaTroca = z.object({
  senhaAtual: z.string().min(1).max(200),
  novaSenha: esquemaNovaSenha,
});
const esquemaNovaEmpresa = z.object({
  razaoSocial: z.string().trim().min(2).max(200),
  cnpj: z.string().trim().min(14).max(20),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Use só letras minúsculas, números e hífen (ex.: transportadora-sul)',
    )
    .min(3)
    .max(60),
  administrador: z.object({
    nome: z.string().trim().min(2).max(120),
    email,
  }),
});
const esquemaAlteracao = z
  .object({
    razaoSocial: z.string().trim().min(2).max(200).optional(),
    ativa: z.boolean().optional(),
    modulosLiberados: z
      .array(z.enum(MODULOS, { message: 'Módulo desconhecido' }))
      .max(30)
      .optional(),
  })
  .strict();
const esquemaNovoAdmin = z.object({
  nome: z.string().trim().min(2).max(120),
  email,
});
const esquemaPagina = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});

function idDa(req: Request): string {
  const r = z.string().uuid().safeParse(req.params.id);
  if (!r.success) throw new ErroNaoEncontrado('Empresa não encontrada');
  return r.data;
}

function administradorDa(req: Request): AdministradorAutenticado {
  if (!req.administrador) throw new ErroNaoAutenticado();
  return req.administrador;
}

/** /api/plataforma — só administradores da plataforma. */
export function rotasDaPlataforma(opcoes: {
  servico: ServicoDaPlataforma;
  segredo: string;
  cookieSeguro: boolean;
  limiteDeEntradaPorMinuto?: number;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();
  // Strict: este cookie nunca vai em navegação vinda de outro site
  const cookie: CookieOptions = {
    httpOnly: true,
    secure: opcoes.cookieSeguro,
    sameSite: 'strict',
    path: '/api/plataforma',
  };

  async function autenticar(req: Request, _res: Response, next: NextFunction) {
    const token: unknown = req.cookies?.[COOKIE_DA_PLATAFORMA];
    const admin =
      typeof token === 'string'
        ? await verificarTokenDaPlataforma(token, opcoes.segredo)
        : null;
    if (!admin) throw new ErroNaoAutenticado();
    // Desativado perde o acesso na hora, mesmo com o token na validade
    await servico.eu(admin);
    req.administrador = admin;
    next();
  }

  const limite = rateLimit({
    windowMs: 60_000,
    limit: opcoes.limiteDeEntradaPorMinuto ?? 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    handler: (_req, res) => {
      res.status(429).json({
        erro: 'Muitas tentativas. Aguarde um minuto e tente de novo.',
        codigo: 'MUITAS_TENTATIVAS',
      });
    },
  });

  rotas.post('/entrar', limite, async (req, res) => {
    const { email: endereco, senha } = validar(esquemaEntrada, req.body);
    const token = await servico.entrar(endereco, senha, req.ip);
    res.cookie(COOKIE_DA_PLATAFORMA, token, {
      ...cookie,
      maxAge: HORAS_DE_SESSAO * 3_600_000,
    });
    res.status(204).end();
  });

  rotas.post('/sair', (_req, res) => {
    res.clearCookie(COOKIE_DA_PLATAFORMA, cookie);
    res.status(204).end();
  });

  rotas.use(autenticar);

  rotas.get('/eu', async (req, res) => {
    res.json(await servico.eu(administradorDa(req)));
  });

  rotas.post('/senha', async (req, res) => {
    const { senhaAtual, novaSenha } = validar(esquemaTroca, req.body);
    await servico.trocarSenha(
      administradorDa(req),
      senhaAtual,
      novaSenha,
      req.ip,
    );
    res.status(204).end();
  });

  rotas.get('/empresas', async (_req, res) => {
    res.json(await servico.empresas());
  });

  rotas.post('/empresas', async (req, res) => {
    const dados = validar(esquemaNovaEmpresa, req.body);
    res
      .status(201)
      .json(await servico.criarEmpresa(administradorDa(req), dados, req.ip));
  });

  rotas.patch('/empresas/:id', async (req, res) => {
    const alteracao = validar(esquemaAlteracao, req.body);
    res.json(
      await servico.alterarEmpresa(
        administradorDa(req),
        idDa(req),
        alteracao,
        req.ip,
      ),
    );
  });

  rotas.post('/empresas/:id/administradores', async (req, res) => {
    const dados = validar(esquemaNovoAdmin, req.body);
    res
      .status(201)
      .json(
        await servico.criarAdministradorDaEmpresa(
          administradorDa(req),
          idDa(req),
          dados,
          req.ip,
        ),
      );
  });

  rotas.get('/eventos', async (req, res) => {
    const { pagina } = validar(esquemaPagina, req.query);
    res.json(await servico.eventos(pagina));
  });

  return rotas;
}
