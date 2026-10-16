import { describe, expect, it } from 'vitest';
import { detectarTipo, extensaoDe, nomeSeguro } from './tipo-de-arquivo.js';

const bytes = (...partes: (string | number[])[]) =>
  Uint8Array.from(
    partes.flatMap((p) =>
      typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

describe('detectarTipo', () => {
  it.each([
    ['pdf', bytes('%PDF-1.7\n...')],
    ['png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ['webp', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')],
    ['xml', bytes('<?xml version="1.0"?><nfeProc/>')],
    ['xml', bytes([0xef, 0xbb, 0xbf], '\r\n  <cteProc></cteProc>')],
  ])('reconhece %s', (tipo, conteudo) => {
    expect(detectarTipo(conteudo)).toBe(tipo);
  });

  it.each([
    ['executável renomeado', bytes('MZ', [0x90, 0, 3, 0])],
    ['zip', bytes('PK', [3, 4, 20, 0])],
    ['texto comum', bytes('Olá, isto não é XML')],
    ['binário que começa com <', bytes('<', [0, 1, 2, 3])],
    ['vazio', bytes()],
    ['RIFF que não é WEBP', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
  ])('recusa %s', (_nome, conteudo) => {
    expect(detectarTipo(conteudo)).toBeNull();
  });
});

describe('nomes de arquivo', () => {
  it('extensaoDe', () => {
    expect(extensaoDe('CTe 123.PDF')).toBe('pdf');
    expect(extensaoDe('sem-extensao')).toBe('');
    expect(extensaoDe('a.b.xml')).toBe('xml');
  });

  it('nomeSeguro tira caminho, controle e caracteres perigosos', () => {
    expect(nomeSeguro('../../etc/passwd')).toBe('passwd');
    expect(nomeSeguro('C:\\Users\\x\\nota "fiscal".pdf')).toBe(
      'nota _fiscal_.pdf',
    );
    expect(nomeSeguro('a\u0000b\u001fc.pdf')).toBe('abc.pdf');
    expect(nomeSeguro('   ')).toBe('arquivo');
    expect(nomeSeguro(`${'x'.repeat(200)}.pdf`)).toHaveLength(120);
    expect(nomeSeguro(`${'x'.repeat(200)}.pdf`).endsWith('.pdf')).toBe(true);
  });
});
