import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  autenticar,
  exigirPerfil,
  usuarioDa,
} from '../../http/autenticacao.js';
import { ErroNaoEncontrado } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import type { ServicoDeCadastros } from './servico.js';

const nome = z.string().trim().min(1, 'Informe o nome').max(80);

const esquemaNovaFilial = z.object({ nome });
const esquemaAlteracaoDeFilial = z
  .object({ nome: nome.optional(), ativa: z.boolean().optional() })
  .strict();
const esquemaListagem = z.object({
  todas: z
    .enum(['0', '1'])
    .optional()
    .transform((valor) => valor === '1'),
});

function idDa(req: Request): string {
  const resultado = z.string().uuid().safeParse(req.params.id);
  if (!resultado.success) {
    throw new ErroNaoEncontrado('Item não encontrado');
  }
  return resultado.data;
}

/** Leitura para todos os logados; criar e alterar, só o administrador. */
export function rotasDeCadastros(opcoes: {
  servico: ServicoDeCadastros;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();
  const soAdmin = exigirPerfil('ADMIN');

  rotas.use(autenticar(opcoes.jwtSecret));

  rotas.get('/filiais', async (req, res) => {
    const usuario = usuarioDa(req);
    const { todas } = validar(esquemaListagem, req.query);
    // As desativadas só interessam a quem administra
    res.json(
      await servico.filiais(usuario, todas && usuario.perfil === 'ADMIN'),
    );
  });

  rotas.post('/filiais', soAdmin, async (req, res) => {
    const { nome: novo } = validar(esquemaNovaFilial, req.body);
    res
      .status(201)
      .json(await servico.criarFilial(usuarioDa(req), novo, req.ip));
  });

  rotas.patch('/filiais/:id', soAdmin, async (req, res) => {
    const alteracao = validar(esquemaAlteracaoDeFilial, req.body);
    res.json(
      await servico.alterarFilial(usuarioDa(req), idDa(req), alteracao, req.ip),
    );
  });

  return rotas;
}
