import { describe, expect, it } from 'vitest';
import { emailConfigurado } from './avisos.js';

const configurada = {
  emailAtivo: true,
  smtpServidor: 'smtp.gmail.com',
  smtpUsuario: 'sigof@exemplo.com',
  smtpSenhaCifrada: 'cifrada',
};

describe('emailConfigurado', () => {
  it('precisa do envio ligado e dos dados do servidor', () => {
    expect(emailConfigurado(configurada)).toBe(true);
    expect(emailConfigurado({ ...configurada, emailAtivo: false })).toBe(false);
    expect(emailConfigurado({ ...configurada, smtpSenhaCifrada: null })).toBe(
      false,
    );
  });

  it('com os módulos informados, o de e-mail precisa estar em uso', () => {
    const modulos = { modulosLiberados: ['EMAIL'], modulosAtivos: ['EMAIL'] };
    expect(emailConfigurado({ ...configurada, ...modulos })).toBe(true);
    expect(
      emailConfigurado({ ...configurada, ...modulos, modulosAtivos: [] }),
    ).toBe(false);
    expect(
      emailConfigurado({ ...configurada, ...modulos, modulosLiberados: [] }),
    ).toBe(false);
  });
});
