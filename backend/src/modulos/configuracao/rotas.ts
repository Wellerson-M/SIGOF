import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  CAMPOS,
  TIPOS,
  type TipoOcorrencia,
} from '../../dominio/formulario.js';
import { MODULOS } from '../../dominio/modulos.js';
import {
  autenticar,
  exigirPerfil,
  usuarioDa,
} from '../../http/autenticacao.js';
import { ErroNaoEncontrado } from '../../http/erros.js';
import { validar } from '../../http/validacao.js';
import type { ServicoDeConfiguracao } from './servico.js';

const campo = z.object({
  modo: z.enum(['OCULTO', 'OPCIONAL', 'OBRIGATORIO'], {
    message: 'Modo do campo inválido',
  }),
  padrao: z.string().max(2000).optional(),
});

const esquemaDosCampos = z.object(
  Object.fromEntries(CAMPOS.map((nome) => [nome, campo])) as Record<
    (typeof CAMPOS)[number],
    typeof campo
  >,
);

const esquemaDoFormulario = z.object({
  ativo: z.boolean(),
  exigirDocumento: z.boolean(),
  campos: esquemaDosCampos,
  motivos: z
    .array(z.string().trim().max(80, 'Motivo com no máximo 80 caracteres'))
    .max(50, 'No máximo 50 motivos'),
});

const esquemaDosModulos = z.object({
  ativos: z.array(z.enum(MODULOS, { message: 'Módulo desconhecido' })).max(30),
});

const esquemaListagem = z.object({
  todos: z
    .enum(['0', '1'])
    .optional()
    .transform((valor) => valor === '1'),
});

function tipoDa(req: Request): TipoOcorrencia {
  const tipo = TIPOS.find((t) => t === req.params.tipo);
  if (!tipo) throw new ErroNaoEncontrado('Tipo de ocorrência não encontrado');
  return tipo;
}

/** Leitura para todos os logados; alterar, só o administrador da empresa. */
export function rotasDeConfiguracao(opcoes: {
  servico: ServicoDeConfiguracao;
  jwtSecret: string;
}): Router {
  const { servico } = opcoes;
  const rotas = Router();
  const soAdmin = exigirPerfil('ADMIN');

  rotas.use(autenticar(opcoes.jwtSecret));

  rotas.get('/modulos', async (req, res) => {
    res.json(await servico.modulos(usuarioDa(req)));
  });

  rotas.put('/modulos', soAdmin, async (req, res) => {
    const { ativos } = validar(esquemaDosModulos, req.body);
    res.json(await servico.alterarModulos(usuarioDa(req), ativos, req.ip));
  });

  rotas.get('/formulario', async (req, res) => {
    const usuario = usuarioDa(req);
    const { todos } = validar(esquemaListagem, req.query);
    res.json(
      await servico.formulario(usuario, todos && usuario.perfil === 'ADMIN'),
    );
  });

  rotas.put('/formulario/:tipo', soAdmin, async (req, res) => {
    const alteracao = validar(esquemaDoFormulario, req.body);
    res.json(
      await servico.alterarFormulario(
        usuarioDa(req),
        tipoDa(req),
        alteracao,
        req.ip,
      ),
    );
  });

  rotas.delete('/formulario/:tipo', soAdmin, async (req, res) => {
    res.json(
      await servico.restaurarFormulario(usuarioDa(req), tipoDa(req), req.ip),
    );
  });

  return rotas;
}
