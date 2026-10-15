import type { z } from 'zod';
import { ErroDeValidacao } from './erros.js';

/**
 * Valida a entrada com um esquema Zod e devolve o dado já tipado.
 * Se falhar, responde 400 com a lista de campos e o motivo de cada um.
 */
export function validar<T extends z.ZodTypeAny>(
  esquema: T,
  dado: unknown,
): z.infer<T> {
  const resultado = esquema.safeParse(dado);

  if (!resultado.success) {
    throw new ErroDeValidacao(
      'Dados inválidos',
      resultado.error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensagem: issue.message,
      })),
    );
  }

  return resultado.data;
}
