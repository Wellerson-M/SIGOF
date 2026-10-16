import { randomInt } from 'node:crypto';

/** Sem 0/O, 1/l/I: a senha é ditada ou copiada à mão para a pessoa. */
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITOS = '23456789';
const TODOS = LETRAS + DIGITOS;

/**
 * Senha provisória que o administrador entrega ao funcionário.
 *
 * 12 caracteres sorteados com `crypto.randomInt` (gerador seguro, não o
 * `Math.random`), com ao menos uma letra e um número para passar na regra
 * de senha. Só vale até o primeiro login: ali a pessoa escolhe a dela.
 */
export function gerarSenhaProvisoria(tamanho = 12): string {
  const sortear = (alfabeto: string) => alfabeto[randomInt(alfabeto.length)];
  const caracteres = [sortear(LETRAS), sortear(DIGITOS)];
  while (caracteres.length < tamanho) {
    caracteres.push(sortear(TODOS));
  }
  // Embaralha (Fisher-Yates) para a letra e o número não ficarem sempre no início
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j]!, caracteres[i]!];
  }
  return caracteres.join('');
}
