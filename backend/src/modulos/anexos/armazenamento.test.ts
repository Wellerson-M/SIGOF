import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { describe, expect, it, vi } from 'vitest';
// Lê o .env: com o docker compose ligado, testa também contra o SeaweedFS
import '../../config/env.js';
import {
  ArmazenamentoEmMemoria,
  ArmazenamentoIndisponivel,
  ArmazenamentoS3,
} from './armazenamento.js';

const CONFIG = {
  endpoint: 'http://localhost:9000',
  bucket: 'sigof-anexos',
  chaveDeAcesso: 'sigof',
  segredo: 'sigof-secret',
  regiao: 'us-east-1',
};

describe('ArmazenamentoS3 (cliente simulado)', () => {
  it('cria o bucket que falta uma única vez e guarda com o tipo', async () => {
    const send = vi.fn(async (comando: { constructor: { name: string } }) => {
      if (comando.constructor.name === 'HeadBucketCommand') {
        throw new Error('NotFound');
      }
      return {};
    });
    const s3 = new ArmazenamentoS3(CONFIG, { send } as never);

    await s3.guardar('a/b.pdf', Buffer.from('x'), 'application/pdf');
    await s3.guardar('a/c.pdf', Buffer.from('y'), 'application/pdf');

    const nomes = send.mock.calls.map(([c]) => c.constructor.name);
    expect(nomes).toEqual([
      'HeadBucketCommand',
      'CreateBucketCommand',
      'PutObjectCommand',
      'PutObjectCommand',
    ]);
    const put = send.mock.calls[2]?.[0] as unknown as {
      input: Record<string, unknown>;
    };
    expect(put.input).toMatchObject({
      Bucket: 'sigof-anexos',
      Key: 'a/b.pdf',
      ContentType: 'application/pdf',
    });
  });

  it('se não conseguir criar o bucket, tenta de novo no próximo envio', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('NotFound'))
      .mockRejectedValueOnce(new Error('fora do ar'))
      .mockResolvedValue({});
    const s3 = new ArmazenamentoS3(CONFIG, { send } as never);

    await expect(
      s3.guardar('k', Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow('fora do ar');
    await s3.guardar('k', Buffer.from('x'), 'application/pdf');
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('abre devolvendo o conteúdo', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ Body: Readable.from(Buffer.from('oi')) });
    const s3 = new ArmazenamentoS3(CONFIG, { send } as never);
    expect(await text(await s3.abrir('k'))).toBe('oi');
  });
});

describe('outros armazenamentos', () => {
  it('em memória guarda e devolve; chave desconhecida falha', async () => {
    const memoria = new ArmazenamentoEmMemoria();
    await memoria.guardar('k', Buffer.from('conteudo'));
    expect(await text(await memoria.abrir('k'))).toBe('conteudo');
    await expect(memoria.abrir('nada')).rejects.toThrow();
  });

  it('indisponível responde 503 nas duas operações', async () => {
    const indisponivel = new ArmazenamentoIndisponivel();
    await expect(indisponivel.guardar()).rejects.toMatchObject({ status: 503 });
    await expect(indisponivel.abrir()).rejects.toMatchObject({ status: 503 });
  });
});

// Contra o SeaweedFS de verdade (docker compose). No CI não há storage, e
// estes testes são pulados
describe.skipIf(!process.env.STORAGE_ENDPOINT)(
  'ArmazenamentoS3 (SeaweedFS real)',
  () => {
    it('guarda e lê de volta', async () => {
      const s3 = new ArmazenamentoS3({
        endpoint: process.env.STORAGE_ENDPOINT ?? '',
        bucket: process.env.STORAGE_BUCKET ?? 'sigof-anexos',
        chaveDeAcesso: process.env.STORAGE_ACCESS_KEY ?? '',
        segredo: process.env.STORAGE_SECRET_KEY ?? '',
        regiao: 'us-east-1',
      });
      const chave = `testes/${randomUUID()}.txt`;
      await s3.guardar(chave, Buffer.from('anexo de teste'), 'text/plain');
      expect(await text(await s3.abrir(chave))).toBe('anexo de teste');
    });
  },
);
