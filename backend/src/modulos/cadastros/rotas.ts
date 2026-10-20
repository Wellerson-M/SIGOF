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
const opcoes = z
  .array(z.string().trim().max(80))
  .max(100, 'No máximo 100 opções');
const esquemaNovaCausa = z.object({
  nome,
  opcoes: opcoes.optional(),
  rotuloDasOpcoes: z.string().trim().max(40).nullable().optional(),
  ordem: z.number().int().min(0).max(1000).optional(),
});
const esquemaAlteracaoDeCausa = esquemaNovaCausa
  .partial()
  .extend({ ativa: z.boolean().optional() })
  .strict();

const esquemaNovaVerificacao = z.object({
  texto: z.string().trim().min(3, 'Escreva o que deve ser marcado').max(200),
  tipos: z
    .array(z.string().regex(/^[A-Z0-9_]{1,40}$/, 'Tipo de ocorrência inválido'))
    .max(40)
    .optional(),
  quemMarca: z.enum(['SOLICITANTE', 'EQUIPE', 'QUALQUER']).optional(),
  obrigatorioParaResolver: z.boolean().optional(),
  ordem: z.number().int().min(0).max(1000).optional(),
});
const esquemaAlteracaoDeVerificacao = esquemaNovaVerificacao
  .partial()
  .extend({ ativo: z.boolean().optional() })
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

  // Causa do erro é controle interno: o solicitante nem sabe que existe
  rotas.get(
    '/causas',
    exigirPerfil('ANALISTA', 'SUPERVISOR', 'ADMIN'),
    async (req, res) => {
      const usuario = usuarioDa(req);
      const { todas } = validar(esquemaListagem, req.query);
      res.json(
        await servico.causas(usuario, todas && usuario.perfil === 'ADMIN'),
      );
    },
  );

  rotas.post('/causas', soAdmin, async (req, res) => {
    const dados = validar(esquemaNovaCausa, req.body);
    res
      .status(201)
      .json(await servico.criarCausa(usuarioDa(req), dados, req.ip));
  });

  rotas.patch('/causas/:id', soAdmin, async (req, res) => {
    const alteracao = validar(esquemaAlteracaoDeCausa, req.body);
    res.json(
      await servico.alterarCausa(usuarioDa(req), idDa(req), alteracao, req.ip),
    );
  });

  rotas.get('/verificacoes', async (req, res) => {
    const usuario = usuarioDa(req);
    const { todas } = validar(esquemaListagem, req.query);
    res.json(
      await servico.verificacoes(usuario, todas && usuario.perfil === 'ADMIN'),
    );
  });

  rotas.post('/verificacoes', soAdmin, async (req, res) => {
    const dados = validar(esquemaNovaVerificacao, req.body);
    res
      .status(201)
      .json(await servico.criarVerificacao(usuarioDa(req), dados, req.ip));
  });

  rotas.patch('/verificacoes/:id', soAdmin, async (req, res) => {
    const alteracao = validar(esquemaAlteracaoDeVerificacao, req.body);
    res.json(
      await servico.alterarVerificacao(
        usuarioDa(req),
        idDa(req),
        alteracao,
        req.ip,
      ),
    );
  });

  return rotas;
}
