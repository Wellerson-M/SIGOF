import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { ErroDeAplicacao } from '../../http/erros.js';

/**
 * Onde os arquivos ficam. A aplicação só conhece esta interface: em
 * produção é um armazenamento S3 (SeaweedFS no servidor), nos testes é a
 * memória. Trocar de fornecedor (AWS S3, Cloudflare R2...) não mexe no
 * resto do código (RFC seção 5.4).
 */
export interface Armazenamento {
  guardar(chave: string, conteudo: Buffer, tipoMime: string): Promise<void>;
  abrir(chave: string): Promise<Readable>;
  apagar(chave: string): Promise<void>;
}

export interface ConfigS3 {
  endpoint: string;
  bucket: string;
  chaveDeAcesso: string;
  segredo: string;
  regiao: string;
}

export class ArmazenamentoS3 implements Armazenamento {
  private bucketPronto: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigS3,
    private readonly cliente: Pick<S3Client, 'send'> = new S3Client({
      endpoint: config.endpoint,
      region: config.regiao,
      credentials: {
        accessKeyId: config.chaveDeAcesso,
        secretAccessKey: config.segredo,
      },
      // SeaweedFS e MinIO endereçam o bucket no caminho, não no subdomínio
      forcePathStyle: true,
    }),
  ) {}

  async guardar(chave: string, conteudo: Buffer, tipoMime: string) {
    await this.garantirBucket();
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: chave,
        Body: conteudo,
        ContentType: tipoMime,
      }),
    );
  }

  async abrir(chave: string): Promise<Readable> {
    const resposta = await this.cliente.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: chave }),
    );
    return resposta.Body as Readable;
  }
  async apagar(chave: string): Promise<void> {
    await this.cliente.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: chave }),
    );
  }

  /** Cria o bucket na primeira vez (servidor novo). */
  private garantirBucket(): Promise<void> {
    this.bucketPronto ??= (async () => {
      try {
        await this.cliente.send(
          new HeadBucketCommand({ Bucket: this.config.bucket }),
        );
      } catch {
        await this.cliente.send(
          new CreateBucketCommand({ Bucket: this.config.bucket }),
        );
      }
    })().catch((erro: unknown) => {
      // Na próxima tentativa, verifica de novo
      this.bucketPronto = null;
      throw erro;
    });
    return this.bucketPronto;
  }
}

/** Sem armazenamento configurado: anexar e baixar respondem 503. */
export class ArmazenamentoIndisponivel implements Armazenamento {
  private erro(): never {
    throw new ErroDeAplicacao(
      503,
      'ARMAZENAMENTO_INDISPONIVEL',
      'O armazenamento de anexos não está configurado neste servidor',
    );
  }

  async guardar(): Promise<void> {
    this.erro();
  }

  async abrir(): Promise<Readable> {
    this.erro();
  }

  async apagar(): Promise<void> {
    this.erro();
  }
}

/** Para testes: guarda na memória do processo. */
export class ArmazenamentoEmMemoria implements Armazenamento {
  readonly arquivos = new Map<string, Buffer>();

  async guardar(chave: string, conteudo: Buffer) {
    this.arquivos.set(chave, conteudo);
  }

  async abrir(chave: string): Promise<Readable> {
    const conteudo = this.arquivos.get(chave);
    if (!conteudo) {
      throw new Error(`Arquivo não encontrado: ${chave}`);
    }
    return Readable.from(conteudo);
  }

  async apagar(chave: string): Promise<void> {
    this.arquivos.delete(chave);
  }
}
