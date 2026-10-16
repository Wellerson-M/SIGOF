import type { PrismaClient } from '@prisma/client';
import {
  Router,
  type CookieOptions,
  type Request,
  type Response,
} from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  COOKIE_ACESSO,
  COOKIE_SESSAO,
  autenticar,
  usuarioDa,
} from '../../http/autenticacao.js';
import { ErroNaoAutenticado, ErroNaoEncontrado } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import type { ServicoDeAutenticacao, Tokens } from './servico.js';

const esquemaLogin = z.object({
  empresa: z.string().trim().min(1, 'Informe a empresa').max(60),
  email: z.string().trim().email('E-mail inválido').max(254),
  senha: z.string().min(1, 'Informe a senha').max(200),
});

export interface OpcoesDasRotasDeAuth {
  servico: ServicoDeAutenticacao;
  prisma: PrismaClient;
  jwtSecret: string;
  acessoMinutos: number;
  /** `true` fora do desenvolvimento: cookie só trafega em HTTPS. */
  cookieSeguro: boolean;
  /** Tentativas de login por minuto por IP + e-mail. */
  limiteDeLoginPorMinuto?: number;
}

export function rotasDeAutenticacao(opcoes: OpcoesDasRotasDeAuth): Router {
  const { servico, prisma, jwtSecret, acessoMinutos, cookieSeguro } = opcoes;
  const rotas = Router();

  // HttpOnly: o JavaScript da página não lê o cookie (protege contra XSS).
  // SameSite=Lax: outro site não consegue disparar requisições que alterem
  // dados levando o cookie junto (primeira barreira contra CSRF).
  const base: CookieOptions = {
    httpOnly: true,
    secure: cookieSeguro,
    sameSite: 'lax',
  };
  // O cookie de sessão só é enviado para /api/auth: nas demais rotas ele não
  // trafega, o que reduz a superfície de vazamento.
  const opcoesSessao: CookieOptions = { ...base, path: '/api/auth' };

  function gravarCookies(res: Response, tokens: Tokens): void {
    res.cookie(COOKIE_ACESSO, tokens.acesso, {
      ...base,
      path: '/',
      maxAge: acessoMinutos * 60_000,
    });
    res.cookie(COOKIE_SESSAO, tokens.sessao, {
      ...opcoesSessao,
      expires: tokens.sessaoExpiraEm,
    });
  }

  function limparCookies(res: Response): void {
    res.clearCookie(COOKIE_ACESSO, { ...base, path: '/' });
    res.clearCookie(COOKIE_SESSAO, opcoesSessao);
  }

  function contexto(req: Request) {
    return { ip: req.ip, userAgent: req.get('user-agent') };
  }

  const limiteDeLogin = rateLimit({
    windowMs: 60_000,
    limit: opcoes.limiteDeLoginPorMinuto ?? 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Por IP + e-mail: um atacante não esgota o limite de outra pessoa
    // ipKeyGenerator agrupa endereços IPv6 pela sub-rede (/56): sem isso,
    // quem tem um bloco IPv6 trocaria de IP a cada tentativa
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip ?? '')}:${String(
        (req.body as { email?: unknown })?.email ?? '',
      )
        .trim()
        .toLowerCase()}`,
    handler: (_req, res) => {
      res.status(429).json({
        erro: 'Muitas tentativas. Aguarde um minuto e tente de novo.',
        codigo: 'MUITAS_TENTATIVAS',
      });
    },
  });

  rotas.post('/login', limiteDeLogin, async (req, res) => {
    const credenciais = validar(esquemaLogin, req.body);
    const tokens = await servico.entrar(credenciais, contexto(req));

    gravarCookies(res, tokens);
    res.status(204).end();
  });

  rotas.post('/renovar', async (req, res) => {
    const token: unknown = req.cookies?.[COOKIE_SESSAO];
    if (typeof token !== 'string') {
      throw new ErroNaoAutenticado('Sessão expirada');
    }

    try {
      gravarCookies(res, await servico.renovar(token, contexto(req)));
    } catch (erro) {
      // Só apaga os cookies se a sessão morreu de fato; numa falha
      // passageira (banco fora do ar) o usuário pode tentar de novo
      if (erro instanceof ErroNaoAutenticado) {
        limparCookies(res);
      }
      throw erro;
    }
    res.status(204).end();
  });

  rotas.post('/sair', async (req, res) => {
    const token: unknown = req.cookies?.[COOKIE_SESSAO];
    if (typeof token === 'string') {
      await servico.sair(token);
    }

    limparCookies(res);
    res.status(204).end();
  });

  rotas.post('/sair-de-todos', autenticar(jwtSecret), async (req, res) => {
    await servico.sairDeTodos(usuarioDa(req).id);

    limparCookies(res);
    res.status(204).end();
  });

  rotas.get('/eu', autenticar(jwtSecret), async (req, res) => {
    const { id, empresaId } = usuarioDa(req);
    const usuario = await prisma.usuario.findFirst({
      where: { id, empresaId, ativo: true, empresa: { ativa: true } },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        area: true,
        empresa: { select: { razaoSocial: true, slug: true } },
      },
    });

    if (!usuario) {
      throw new ErroNaoEncontrado('Usuário não encontrado');
    }
    res.json(usuario);
  });

  return rotas;
}
