import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { validar } from '../../http/validacao.js';
import type { ServicoDeRecuperacao } from './recuperacao.js';
import { esquemaNovaSenha } from './rotas.js';

/** O token tem 32 bytes em base64url: 43 caracteres, sem mais nada. */
const esquemaPedido = z.object({
  empresa: z.string().trim().min(1, 'Informe a empresa').max(60),
  email: z.string().trim().email('E-mail inválido').max(254),
});

const esquemaRedefinicao = z.object({
  token: z.string().regex(/^[\w-]{43}$/, 'Link inválido'),
  novaSenha: esquemaNovaSenha,
});

/** A mesma resposta para qualquer e-mail: cadastrado ou não. */
export const RESPOSTA_DO_PEDIDO =
  'Se o e-mail estiver cadastrado nesta empresa, enviamos um link para trocar a senha. Ele vale por 30 minutos.';

export interface OpcoesDasRotasDeRecuperacao {
  servico: ServicoDeRecuperacao;
  /** Pedidos de link por janela, por IP + e-mail. */
  limiteDePedidos?: number;
  /** Tentativas de redefinição por janela, por IP. */
  limiteDeRedefinicoes?: number;
}

function limitador(
  limite: number,
  chave: (ip: string, corpo: unknown) => string,
) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // ipKeyGenerator agrupa endereços IPv6 pela sub-rede, como no login
    keyGenerator: (req) => chave(ipKeyGenerator(req.ip ?? ''), req.body),
    handler: (_req, res) => {
      res.status(429).json({
        erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
        codigo: 'MUITAS_TENTATIVAS',
      });
    },
  });
}

/** /api/auth/esqueci-senha e /api/auth/redefinir-senha — sem login. */
export function rotasDeRecuperacao(
  opcoes: OpcoesDasRotasDeRecuperacao,
): Router {
  const { servico } = opcoes;
  const rotas = Router();

  rotas.post(
    '/esqueci-senha',
    limitador(
      opcoes.limiteDePedidos ?? 5,
      (ip, corpo) =>
        `${ip}:${String((corpo as { email?: unknown })?.email ?? '')
          .trim()
          .toLowerCase()}`,
    ),
    async (req, res) => {
      const pedido = validar(esquemaPedido, req.body);
      await servico.solicitar(pedido, { ip: req.ip });
      res.status(202).json({ mensagem: RESPOSTA_DO_PEDIDO });
    },
  );

  rotas.post(
    '/redefinir-senha',
    // Por IP: quem erra o token não pode tentar milhares de vezes
    limitador(opcoes.limiteDeRedefinicoes ?? 10, (ip) => ip),
    async (req, res) => {
      const { token, novaSenha } = validar(esquemaRedefinicao, req.body);
      await servico.redefinir(token, novaSenha, { ip: req.ip });
      res.status(204).end();
    },
  );

  return rotas;
}
