import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import { ehTerminal } from '../../dominio/status.js';
import {
  TIPOS_ACEITOS,
  detectarTipo,
  extensaoDe,
  nomeSeguro,
} from '../../dominio/tipo-de-arquivo.js';
import { ErroDeRegraDeNegocio, ErroNaoEncontrado } from '../../http/erros.js';
import type { UsuarioAutenticado } from '../auth/tokens.js';
import type { ServicoDeAvisos } from '../avisos/avisos.js';
import { visiveisPara } from '../solicitacoes/servico.js';
import type { Armazenamento } from './armazenamento.js';

/** Limites da issue #29: até 5 MB por arquivo e 10 por solicitação. */
export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const ANEXOS_POR_SOLICITACAO = 10;

export interface AnexoResumido {
  id: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  enviadoPor: { id: string; nome: string };
  criadoEm: Date;
}

export interface ArquivoParaBaixar {
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  exibivel: boolean;
  conteudo: Readable;
}

const LISTA_DE_ACEITOS = 'PDF, PNG, JPG, WEBP ou XML';

/**
 * Anexos das solicitações (RF06). Quem enxerga a solicitação pode anexar e
 * baixar; os arquivos ficam no armazenamento S3 com a chave prefixada pela
 * empresa, e só passam pela API depois de conferido o acesso.
 */
export class ServicoDeAnexos {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly armazenamento: Armazenamento,
    private readonly avisos?: ServicoDeAvisos,
  ) {}

  async anexar(
    usuario: UsuarioAutenticado,
    solicitacaoId: string,
    arquivo: { nome: string; conteudo: Buffer },
  ): Promise<AnexoResumido> {
    const solicitacao = await this.prisma.solicitacao.findFirst({
      where: { id: solicitacaoId, ...visiveisPara(usuario) },
      select: { id: true, status: true, _count: { select: { anexos: true } } },
    });
    if (!solicitacao) {
      throw new ErroNaoEncontrado('Solicitação não encontrada');
    }
    if (ehTerminal(solicitacao.status)) {
      throw new ErroDeRegraDeNegocio('Solicitação encerrada não recebe anexos');
    }
    if (solicitacao._count.anexos >= ANEXOS_POR_SOLICITACAO) {
      throw new ErroDeRegraDeNegocio(
        `Cada solicitação aceita até ${ANEXOS_POR_SOLICITACAO} anexos`,
      );
    }
    if (arquivo.conteudo.length === 0) {
      throw new ErroDeRegraDeNegocio('O arquivo está vazio');
    }

    // O tipo vem do conteúdo, nunca do nome nem do que o navegador diz
    const tipo = detectarTipo(arquivo.conteudo);
    if (tipo === null) {
      throw new ErroDeRegraDeNegocio(
        `Tipo de arquivo não aceito. Envie ${LISTA_DE_ACEITOS}.`,
      );
    }
    const nome = nomeSeguro(arquivo.nome);
    const extensao = extensaoDe(nome);
    const aceito = TIPOS_ACEITOS[tipo];
    if (!(aceito.extensoes as readonly string[]).includes(extensao)) {
      throw new ErroDeRegraDeNegocio(
        `O conteúdo do arquivo é ${tipo.toUpperCase()}, mas o nome termina em ".${extensao}". Confira o arquivo.`,
      );
    }

    // Cada empresa tem a sua "pasta"; o nome original não entra na chave
    const chave = `empresas/${usuario.empresaId}/solicitacoes/${solicitacao.id}/${randomUUID()}.${extensao}`;
    await this.armazenamento.guardar(chave, arquivo.conteudo, aceito.mime);

    return this.prisma.$transaction(async (tx) => {
      const anexo = await tx.anexo.create({
        data: {
          empresaId: usuario.empresaId,
          solicitacaoId: solicitacao.id,
          enviadoPorId: usuario.id,
          nomeArquivo: nome,
          chaveStorage: chave,
          tipoMime: aceito.mime,
          tamanhoBytes: arquivo.conteudo.length,
        },
        include: { enviadoPor: { select: { id: true, nome: true } } },
      });
      await this.avisos?.registrar(tx, usuario, solicitacao.id, {
        tipo: 'ANEXO',
        nomeArquivo: nome,
      });
      return this.resumir(anexo);
    });
  }

  async baixar(
    usuario: UsuarioAutenticado,
    solicitacaoId: string,
    anexoId: string,
  ): Promise<ArquivoParaBaixar> {
    // O anexo só é encontrado se a solicitação dele estiver visível para
    // quem pede: o id do anexo sozinho não dá acesso a nada
    const anexo = await this.prisma.anexo.findFirst({
      where: {
        id: anexoId,
        solicitacaoId,
        empresaId: usuario.empresaId,
        solicitacao: visiveisPara(usuario),
      },
    });
    if (!anexo) {
      throw new ErroNaoEncontrado('Anexo não encontrado');
    }

    const tipo = Object.values(TIPOS_ACEITOS).find(
      (t) => t.mime === anexo.tipoMime,
    );
    return {
      nomeArquivo: anexo.nomeArquivo,
      tipoMime: anexo.tipoMime,
      tamanhoBytes: anexo.tamanhoBytes,
      exibivel: tipo?.exibivel ?? false,
      conteudo: await this.armazenamento.abrir(anexo.chaveStorage),
    };
  }

  private resumir(anexo: {
    id: string;
    nomeArquivo: string;
    tipoMime: string;
    tamanhoBytes: number;
    enviadoPor: { id: string; nome: string };
    criadoEm: Date;
  }): AnexoResumido {
    return {
      id: anexo.id,
      nomeArquivo: anexo.nomeArquivo,
      tipoMime: anexo.tipoMime,
      tamanhoBytes: anexo.tamanhoBytes,
      enviadoPor: anexo.enviadoPor,
      criadoEm: anexo.criadoEm,
    };
  }
}
