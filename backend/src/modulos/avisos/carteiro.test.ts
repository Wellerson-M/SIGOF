import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cifra } from '../../seguranca/cifra.js';
import {
  Carteiro,
  contaDaEmpresa,
  enviarPorSmtp,
  resumoDoErro,
  type ContaDeEnvio,
} from './carteiro.js';

const sendMail = vi.fn();
const close = vi.fn();
const createTransport = vi.fn((_opcoes: unknown) => ({ sendMail, close }));
vi.mock('nodemailer', () => ({
  default: { createTransport: (opcoes: unknown) => createTransport(opcoes) },
}));

const CONTA: ContaDeEnvio = {
  servidor: 'smtp.gmail.com',
  porta: 587,
  tlsDireto: false,
  usuario: 'envio@demo.test',
  senha: 'segredo',
  nomeDoRemetente: 'SIGOF Demo',
};

const MENSAGEM = {
  para: ['a@demo.test', 'b@demo.test'],
  assunto: '[SIGOF P1] Reversão',
  texto: 'texto',
  html: '<p>html</p>',
  messageId: '<sigof.1.2@sigof.test>',
  respondendoA: '<sigof.1@sigof.test>',
};

describe('enviarPorSmtp', () => {
  afterEach(() => vi.clearAllMocks());

  it('na porta 587 exige STARTTLS e manda os cabeçalhos da conversa', async () => {
    sendMail.mockResolvedValue({});
    await enviarPorSmtp(CONTA, MENSAGEM);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'envio@demo.test', pass: 'segredo' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'SIGOF Demo', address: 'envio@demo.test' },
        to: MENSAGEM.para,
        subject: MENSAGEM.assunto,
        messageId: MENSAGEM.messageId,
        inReplyTo: MENSAGEM.respondendoA,
        references: [MENSAGEM.respondendoA],
        headers: expect.objectContaining({
          'Auto-Submitted': 'auto-generated',
        }),
      }),
    );
    expect(close).toHaveBeenCalled();
  });

  it('o primeiro e-mail do protocolo não responde a ninguém; fecha a conexão mesmo na falha', async () => {
    sendMail.mockRejectedValue(new Error('recusado'));
    await expect(
      enviarPorSmtp(
        { ...CONTA, tlsDireto: true, porta: 465 },
        { ...MENSAGEM, respondendoA: null },
      ),
    ).rejects.toThrow('recusado');

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, requireTLS: false }),
    );
    const opcoes = sendMail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(opcoes).not.toHaveProperty('inReplyTo');
    expect(close).toHaveBeenCalled();
  });
});

it('o servidor de testes local (Mailpit) dispensa o STARTTLS', async () => {
  sendMail.mockResolvedValue({});
  await enviarPorSmtp(
    { ...CONTA, servidor: 'localhost', porta: 1025 },
    MENSAGEM,
  );
  expect(createTransport).toHaveBeenLastCalledWith(
    expect.objectContaining({ requireTLS: false }),
  );
});

describe('contaDaEmpresa', () => {
  const cifra = new Cifra('chave-de-teste');
  const empresa = {
    razaoSocial: 'Demo',
    smtpServidor: 'smtp.gmail.com',
    smtpPorta: null,
    smtpTlsDireto: true,
    smtpUsuario: 'envio@demo.test',
    smtpSenhaCifrada: cifra.cifrar('segredo'),
    emailRemetenteNome: null,
  };

  it('decifra a senha e completa porta e nome padrão', () => {
    expect(contaDaEmpresa(empresa, cifra)).toEqual({
      servidor: 'smtp.gmail.com',
      porta: 465,
      tlsDireto: true,
      usuario: 'envio@demo.test',
      senha: 'segredo',
      nomeDoRemetente: 'SIGOF — Demo',
    });
    expect(
      contaDaEmpresa({ ...empresa, smtpTlsDireto: false }, cifra)?.porta,
    ).toBe(587);
  });

  it('incompleta não serve', () => {
    expect(
      contaDaEmpresa({ ...empresa, smtpSenhaCifrada: null }, cifra),
    ).toBeNull();
  });
});

describe('Carteiro', () => {
  afterEach(() => vi.useRealTimers());

  it('roda a cada intervalo até ser parado', async () => {
    vi.useFakeTimers();
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { emailSaida: { findMany } } as unknown as PrismaClient;
    const carteiro = new Carteiro(prisma, new Cifra('x'));

    carteiro.iniciar(1000);
    carteiro.iniciar(1000); // chamar de novo não cria outro relógio
    await vi.advanceTimersByTimeAsync(3000);
    expect(findMany).toHaveBeenCalledTimes(3);

    carteiro.parar();
    await vi.advanceTimersByTimeAsync(3000);
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('erro do banco não derruba o processo: é registrado e a rodada termina', async () => {
    const prisma = {
      emailSaida: {
        findMany: vi.fn().mockRejectedValue(new Error('banco fora')),
      },
    } as unknown as PrismaClient;
    const registrar = vi.fn();
    const carteiro = new Carteiro(
      prisma,
      new Cifra('x'),
      undefined,
      undefined,
      registrar,
    );

    expect(await carteiro.rodada()).toBe(0);
    expect(registrar).toHaveBeenCalledWith(
      'Falha ao processar a fila de e-mails',
      expect.any(Error),
    );
  });

  it('não começa uma rodada enquanto a anterior não terminou', async () => {
    let liberar: (valor: unknown[]) => void = () => {};
    const findMany = vi.fn(
      () => new Promise<unknown[]>((resolver) => (liberar = resolver)),
    );
    const prisma = { emailSaida: { findMany } } as unknown as PrismaClient;
    const carteiro = new Carteiro(prisma, new Cifra('x'));

    const primeira = carteiro.rodada();
    expect(await carteiro.rodada()).toBe(0);
    liberar([]);
    await primeira;
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe('resumoDoErro', () => {
  it('uma linha, no máximo 500 caracteres', () => {
    expect(resumoDoErro(new Error('a\n  b'))).toBe('a b');
    expect(resumoDoErro('x'.repeat(900))).toHaveLength(500);
  });
});
