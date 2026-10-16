import { Router } from 'express';
import { z } from 'zod';
import {
  autenticar,
  exigirPerfil,
  usuarioDa,
} from '../../http/autenticacao.js';
import { validar } from '../../http/validacao.js';
import type { ServicoDeConfiguracaoDeEmail } from './configuracao.js';
import type { ServicoDeNotificacoes } from './notificacoes.js';

const textoOuNulo = (maximo: number) =>
  z.string().trim().max(maximo).nullable().optional();
const emailOuNulo = z
  .string()
  .trim()
  .max(254)
  .refine(
    (valor) => valor === '' || z.string().email().safeParse(valor).success,
    'E-mail inválido',
  )
  .nullable()
  .optional();

const esquemaConfiguracao = z
  .object({
    ativo: z.boolean().optional(),
    servidor: textoOuNulo(200),
    porta: z.number().int().min(1).max(65_535).nullable().optional(),
    tlsDireto: z.boolean().optional(),
    usuario: emailOuNulo,
    senha: z.string().max(200).optional(),
    nomeDoRemetente: textoOuNulo(120),
    caixaCentral: emailOuNulo,
  })
  .strict();

const esquemaTeste = z.object({
  para: z.string().trim().email('E-mail inválido').max(254).optional(),
});

const esquemaPagina = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});

const esquemaLidas = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
  solicitacaoId: z.string().uuid().optional(),
});

/** /api/admin/email — só o administrador. */
export function rotasDeConfiguracaoDeEmail(opcoes: {
  servico: ServicoDeConfiguracaoDeEmail;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();
  rotas.use(autenticar(opcoes.jwtSecret), exigirPerfil('ADMIN'));

  rotas.get('/', async (req, res) => {
    res.json(await servico.obter(usuarioDa(req)));
  });

  rotas.patch('/', async (req, res) => {
    const alteracao = validar(esquemaConfiguracao, req.body);
    res.json(await servico.alterar(usuarioDa(req), alteracao, req.ip));
  });

  rotas.post('/teste', async (req, res) => {
    const { para } = validar(esquemaTeste, req.body ?? {});
    res.json(await servico.testar(usuarioDa(req), para));
  });

  rotas.get('/envios', async (req, res) => {
    const { pagina } = validar(esquemaPagina, req.query);
    res.json(await servico.envios(usuarioDa(req), pagina));
  });

  return rotas;
}

/** /api/notificacoes — cada um vê as suas. */
export function rotasDeNotificacoes(opcoes: {
  servico: ServicoDeNotificacoes;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();
  rotas.use(autenticar(opcoes.jwtSecret));

  rotas.get('/', async (req, res) => {
    res.json(await servico.listar(usuarioDa(req)));
  });

  rotas.post('/lidas', async (req, res) => {
    const filtro = validar(esquemaLidas, req.body ?? {});
    res.json(await servico.marcarLidas(usuarioDa(req), filtro));
  });

  return rotas;
}
