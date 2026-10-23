import { Router } from 'express';
import { z } from 'zod';
import { autenticar, usuarioDa } from '../../http/autenticacao.js';
import { validar } from '../../http/validacao.js';
import { CATEGORIAS, type ServicoDeSugestoes } from './servico.js';

/** Uma linha só: o título vai no assunto do e-mail. */
const umaLinha = (minimo: number, maximo: number) =>
  z
    .string()
    .transform((valor) => valor.replaceAll(/\s+/g, ' ').trim())
    .pipe(z.string().min(minimo).max(maximo));

const esquemaSugestao = z
  .object({
    categoria: z.enum(CATEGORIAS),
    titulo: umaLinha(3, 100),
    texto: z.string().trim().min(5, 'Escreva um pouco mais').max(4000),
    pagina: umaLinha(1, 200).optional(),
  })
  .strict();

/** /api/sugestoes — qualquer pessoa logada pode mandar. */
export function rotasDeSugestoes(opcoes: {
  servico: ServicoDeSugestoes;
  jwtSecret: string;
}): Router {
  const rotas = Router();
  rotas.use(autenticar(opcoes.jwtSecret));

  rotas.post('/', async (req, res) => {
    const sugestao = validar(esquemaSugestao, req.body);
    await opcoes.servico.enviar(usuarioDa(req), sugestao);
    res.status(202).json({ enviada: true });
  });

  return rotas;
}
