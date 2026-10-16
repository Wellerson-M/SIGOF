import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Cifra reversível para segredos que o sistema precisa usar de volta, como
 * a senha do e-mail de envio da empresa (senha de login de usuário nunca
 * passa por aqui: essa só tem hash, com Argon2id).
 *
 * AES-256-GCM: além de esconder o conteúdo, a "tag" de autenticação faz a
 * leitura falhar se alguém alterar um único byte do texto cifrado.
 * Formato gravado: `v1.<iv>.<tag>.<cifrado>`, cada parte em base64url. O
 * IV (12 bytes) é sorteado a cada cifragem: o mesmo texto nunca gera o
 * mesmo resultado duas vezes.
 */
const VERSAO = 'v1';

export class Cifra {
  private readonly chave: Buffer;

  /**
   * @param segredo a variável CHAVE_CIFRA. Qualquer texto serve: a chave de
   * 256 bits é derivada dele por SHA-256.
   */
  constructor(segredo: string) {
    this.chave = createHash('sha256').update(segredo).digest();
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifra = createCipheriv('aes-256-gcm', this.chave, iv);
    const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    const tag = cifra.getAuthTag();
    return [VERSAO, iv, tag, cifrado]
      .map((parte) =>
        typeof parte === 'string' ? parte : parte.toString('base64url'),
      )
      .join('.');
  }

  /** Lança erro se o valor foi adulterado ou cifrado com outra chave. */
  decifrar(valor: string): string {
    const [versao, iv, tag, cifrado] = valor.split('.');
    if (versao !== VERSAO || !iv || !tag || cifrado === undefined) {
      throw new Error('Valor cifrado em formato desconhecido');
    }
    const decifra = createDecipheriv(
      'aes-256-gcm',
      this.chave,
      Buffer.from(iv, 'base64url'),
    );
    decifra.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decifra.update(Buffer.from(cifrado, 'base64url')),
      decifra.final(),
    ]).toString('utf8');
  }
}
