import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com Argon2id (RNF03).
 *
 * Parâmetros mínimos recomendados pela OWASP (Password Storage Cheat Sheet):
 * 19 MiB de memória, 2 iterações, 1 thread. O custo de memória é o que torna
 * ataques com GPU caros. O sal é gerado pela biblioteca e fica embutido no
 * próprio hash, junto com os parâmetros, no formato PHC
 * (`$argon2id$v=19$m=19456,t=2,p=1$<sal>$<hash>`).
 */
const OPCOES = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function gerarHashDeSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

/** Compara em tempo constante; hash malformado conta como senha errada. */
export async function verificarSenha(
  hashArmazenado: string,
  senha: string,
): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}
