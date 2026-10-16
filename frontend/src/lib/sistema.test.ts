import { describe, expect, it } from 'vitest';
import { descreverVersao } from './sistema';

describe('descreverVersao', () => {
  it('release: mostra a etiqueta e aponta para a página da release', () => {
    expect(
      descreverVersao({
        versao: '1.0.0',
        ambiente: 'production',
        construidoEm: null,
      }),
    ).toEqual({
      curta: 'v1.0.0',
      rotulo: 'Release v1.0.0',
      ambiente: 'Produção',
      link: 'https://github.com/Wellerson-M/SIGOF/releases/tag/v1.0.0',
    });
  });

  it('staging sem release: mostra o commit curto', () => {
    const sha = 'A1B2C3D4E5F60718293a4b5c6d7e8f9012345678';
    const descrita = descreverVersao({
      versao: sha,
      ambiente: 'staging',
      construidoEm: '2026-10-16T12:00:00Z',
    });

    expect(descrita.curta).toBe('a1b2c3d');
    expect(descrita.rotulo).toBe('Commit a1b2c3d');
    expect(descrita.ambiente).toBe('Homologação (staging)');
    expect(descrita.link).toBe(
      `https://github.com/Wellerson-M/SIGOF/commit/${sha}`,
    );
  });

  it('na máquina do desenvolvedor: "Local", sem link', () => {
    expect(
      descreverVersao({
        versao: 'local',
        ambiente: 'development',
        construidoEm: null,
      }),
    ).toMatchObject({ curta: 'local', rotulo: 'Local', link: null });
  });
});
