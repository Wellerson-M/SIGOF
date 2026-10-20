/**
 * Texto dos avisos: a linha da notificação no sistema e o e-mail.
 *
 * Funções puras (sem banco, sem rede): recebem o que aconteceu e devolvem o
 * texto pronto, o que deixa cada formato testável isoladamente.
 */

import { nomeDoTipo } from '../../dominio/formulario.js';

export type Status =
  | 'NOVO'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_DOC'
  | 'ESCALADO'
  | 'RESOLVIDO'
  | 'CANCELADO';
export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
/** Código do tipo (um dos do sistema ou um criado pela empresa). */
export type Tipo = string;

/** O que aconteceu na solicitação. */
export type Ocorrido =
  | { tipo: 'ABERTA' }
  | { tipo: 'STATUS'; de: Status; para: Status; observacao: string | null }
  | { tipo: 'PRIORIDADE'; de: Prioridade; para: Prioridade }
  | { tipo: 'RESPONSAVEL'; nome: string }
  | {
      tipo: 'MENSAGEM';
      conteudo: string;
      interna: boolean;
      mensagemId?: string | undefined;
    }
  | {
      tipo: 'ANEXO';
      nomeArquivo: string;
      anexoId?: string | undefined;
      /** Veio pela conversa: aparece junto da mensagem no e-mail. */
      mensagemId?: string | undefined;
    };

export type TipoDeOcorrido = Ocorrido['tipo'];

/** Um acontecimento dentro de um e-mail (vários podem ir juntos). */
export interface ItemDoEmail {
  ocorrido: Ocorrido;
  autor: string;
}

/** O retrato da solicitação que vai no corpo do e-mail. */
export interface Retrato {
  id: string;
  protocolo: string;
  tipo: Tipo;
  /** O nome que a empresa deu ao tipo (sem ele, o do sistema). */
  tipoNome?: string | undefined;
  cte: string | null;
  nf: string | null;
  ctes?: string[] | undefined;
  nfs?: string[] | undefined;
  fatura?: string | null | undefined;
  descricao: string;
  status: Status;
  prioridade: Prioridade;
  solicitante: string;
  responsavel: string | null;
  slaVenceEm: Date | null;
}

export interface Email {
  assunto: string;
  texto: string;
  html: string;
}

export const NOME_DO_STATUS: Record<Status, string> = {
  NOVO: 'Novo',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_DOC: 'Aguardando documento',
  ESCALADO: 'Escalado',
  RESOLVIDO: 'Resolvido',
  CANCELADO: 'Cancelado',
};

export const NOME_DA_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

function nomeDoTipoDo(retrato: Retrato): string {
  return retrato.tipoNome ?? nomeDoTipo(retrato.tipo);
}

export const AVISO_DE_NAO_RESPONDA =
  'Esta é uma mensagem automática do SIGOF. Não responda: respostas a este ' +
  'e-mail não chegam ao sistema. Para falar sobre esta solicitação, use a ' +
  'conversa dentro do SIGOF.';

/** Uma linha curta: o que aparece no sino de notificações. */
export function linhaDaNotificacao(
  ocorrido: Ocorrido,
  protocolo: string,
  autor: string,
): string {
  switch (ocorrido.tipo) {
    case 'ABERTA':
      return `${protocolo}: nova solicitação aberta por ${autor}`;
    case 'STATUS':
      return `${protocolo}: ${NOME_DO_STATUS[ocorrido.de]} → ${NOME_DO_STATUS[ocorrido.para]} (${autor})`;
    case 'PRIORIDADE':
      return `${protocolo}: prioridade ${NOME_DA_PRIORIDADE[ocorrido.para]} (${autor})`;
    case 'RESPONSAVEL':
      return `${protocolo}: agora com ${ocorrido.nome} (${autor})`;
    case 'MENSAGEM':
      return `${protocolo}: ${ocorrido.interna ? 'nota interna' : 'mensagem'} de ${autor}`;
    case 'ANEXO':
      return `${protocolo}: ${autor} anexou ${ocorrido.nomeArquivo}`;
  }
}

/** O título do que aconteceu, no topo do e-mail. */
function manchete(ocorrido: Ocorrido, autor: string): string {
  switch (ocorrido.tipo) {
    case 'ABERTA':
      return `Solicitação aberta por ${autor}`;
    case 'STATUS':
      return `${NOME_DO_STATUS[ocorrido.de]} → ${NOME_DO_STATUS[ocorrido.para]}, por ${autor}`;
    case 'PRIORIDADE':
      return `Prioridade alterada de ${NOME_DA_PRIORIDADE[ocorrido.de]} para ${NOME_DA_PRIORIDADE[ocorrido.para]}, por ${autor}`;
    case 'RESPONSAVEL':
      return `Responsável agora é ${ocorrido.nome} (alterado por ${autor})`;
    case 'MENSAGEM':
      return ocorrido.conteudo
        ? `Nova mensagem de ${autor}`
        : `${autor} enviou arquivos pela conversa`;
    case 'ANEXO':
      return `${autor} anexou o arquivo ${ocorrido.nomeArquivo}`;
  }
}

/** Texto livre que acompanha o ocorrido (motivo, mensagem). */
function complemento(ocorrido: Ocorrido): string | null {
  if (ocorrido.tipo === 'STATUS') return ocorrido.observacao;
  if (ocorrido.tipo === 'MENSAGEM') return ocorrido.conteudo;
  return null;
}

/**
 * O assunto é o mesmo em todos os e-mails do protocolo: junto com os
 * cabeçalhos In-Reply-To e References, é o que faz o Gmail e o Outlook
 * agruparem tudo numa única conversa. Por isso o status não vai no assunto.
 */
export function assuntoDe(retrato: Retrato): string {
  let documento = '';
  const outrosCtes = Math.max(0, (retrato.ctes?.length ?? 0) - 1);
  if (retrato.cte)
    documento = ` — CTe ${retrato.cte}${outrosCtes > 0 ? ` +${outrosCtes}` : ''}`;
  else if (retrato.nf) documento = ` — NF ${retrato.nf}`;
  else if (retrato.fatura) documento = ` — Fatura ${retrato.fatura}`;
  return `[SIGOF ${retrato.protocolo}] ${nomeDoTipoDo(retrato)}${documento}`;
}

function dataDoPrazo(data: Date, fusoHorario: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fusoHorario,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data);
}

/** "123, 124, 125 e mais 7": a lista inteira não cabe num e-mail. */
function listaDeDocumentos(
  principal: string | null,
  lista: string[] | undefined,
): string {
  const todos =
    lista && lista.length > 0 ? lista : principal ? [principal] : [];
  if (todos.length === 0) return '—';
  const mostrados = todos.slice(0, 10).join(', ');
  return todos.length > 10
    ? `${mostrados} e mais ${todos.length - 10}`
    : mostrados;
}

/** Tudo que vem do usuário passa por aqui antes de entrar no HTML. */
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function montarEmail(dados: {
  ocorrido: Ocorrido;
  retrato: Retrato;
  autor: string;
  empresa: string;
  fusoHorario: string;
  /** Endereço do detalhe da solicitação no SIGOF. */
  link: string;
  linkDoAnexo?: ((anexoId: string) => string) | undefined;
}): Email {
  const { ocorrido, autor, ...resto } = dados;
  return montarEmailDeItens({ ...resto, itens: [{ ocorrido, autor }] });
}

/** Um bloco do e-mail: o título, o texto e os arquivos com link. */
interface Bloco {
  titulo: string;
  extra: string | null;
  arquivos: { nome: string; link: string | null }[];
}

/**
 * Junta os acontecimentos em blocos: o arquivo enviado pela conversa entra
 * no bloco da mensagem dele; os outros arquivos seguidos viram um bloco só
 * ("anexou 3 arquivos").
 */
function blocosDe(
  itens: readonly ItemDoEmail[],
  linkDoAnexo: ((anexoId: string) => string) | undefined,
): Bloco[] {
  const blocos: Bloco[] = [];
  const daMensagem = new Map<string, Bloco>();
  let arquivosSoltos: { bloco: Bloco; autor: string } | null = null;

  for (const { ocorrido, autor } of itens) {
    if (ocorrido.tipo === 'ANEXO') {
      const arquivo = {
        nome: ocorrido.nomeArquivo,
        link:
          ocorrido.anexoId && linkDoAnexo
            ? linkDoAnexo(ocorrido.anexoId)
            : null,
      };
      const daConversa = ocorrido.mensagemId
        ? daMensagem.get(ocorrido.mensagemId)
        : undefined;
      if (daConversa) {
        daConversa.arquivos.push(arquivo);
        continue;
      }
      if (arquivosSoltos && arquivosSoltos.autor === autor) {
        arquivosSoltos.bloco.arquivos.push(arquivo);
        const n = arquivosSoltos.bloco.arquivos.length;
        arquivosSoltos.bloco.titulo = `${autor} anexou ${n} arquivos`;
        continue;
      }
      const bloco: Bloco = {
        titulo: manchete(ocorrido, autor),
        extra: null,
        arquivos: [arquivo],
      };
      blocos.push(bloco);
      arquivosSoltos = { bloco, autor };
      continue;
    }
    arquivosSoltos = null;
    const bloco: Bloco = {
      titulo: manchete(ocorrido, autor),
      extra: complemento(ocorrido) || null,
      arquivos: [],
    };
    if (ocorrido.tipo === 'MENSAGEM' && ocorrido.mensagemId) {
      daMensagem.set(ocorrido.mensagemId, bloco);
    }
    blocos.push(bloco);
  }
  return blocos;
}

/**
 * O e-mail de uma ou mais movimentações seguidas. Abrir a solicitação e
 * mandar três arquivos logo em seguida vira um e-mail só, com os arquivos
 * listados e o link de cada um.
 */
export function montarEmailDeItens(dados: {
  itens: readonly ItemDoEmail[];
  retrato: Retrato;
  empresa: string;
  fusoHorario: string;
  link: string;
  linkDoAnexo?: ((anexoId: string) => string) | undefined;
}): Email {
  const { itens, retrato, empresa, fusoHorario, link } = dados;
  const blocos = blocosDe(itens, dados.linkDoAnexo);
  const titulo =
    blocos.length === 1 ? blocos[0]!.titulo : `${blocos.length} atualizações`;

  const linhas: [string, string][] = [
    ['Protocolo', retrato.protocolo],
    ['Tipo', nomeDoTipoDo(retrato)],
    ['CTe', listaDeDocumentos(retrato.cte, retrato.ctes)],
    ['NF', listaDeDocumentos(retrato.nf, retrato.nfs)],
    ...(retrato.fatura ? [['Fatura', retrato.fatura] as [string, string]] : []),
    ['Status', NOME_DO_STATUS[retrato.status]],
    ['Prioridade', NOME_DA_PRIORIDADE[retrato.prioridade]],
    ['Solicitante', retrato.solicitante],
    ['Responsável', retrato.responsavel ?? 'ainda ninguém'],
  ];
  const encerrada =
    retrato.status === 'RESOLVIDO' || retrato.status === 'CANCELADO';
  if (retrato.slaVenceEm && !encerrada) {
    linhas.push(['Prazo (SLA)', dataDoPrazo(retrato.slaVenceEm, fusoHorario)]);
  }

  const textoDosBlocos = blocos.flatMap((b) => [
    ...(blocos.length > 1 ? [`• ${b.titulo}`] : [b.titulo]),
    ...(b.extra ? ['', b.extra] : []),
    ...b.arquivos.map((a) => `  - ${a.nome}${a.link ? `: ${a.link}` : ''}`),
    '',
  ]);

  const texto = [
    ...(blocos.length > 1 ? [titulo, ''] : []),
    ...textoDosBlocos,
    ...linhas.map(([nome, valor]) => `${nome}: ${valor}`),
    '',
    'Descrição:',
    retrato.descricao,
    '',
    `Abrir no SIGOF: ${link}`,
    '',
    '--',
    AVISO_DE_NAO_RESPONDA,
    empresa,
  ].join('\n');

  const celula = 'padding:4px 12px 4px 0;vertical-align:top;';
  const htmlDoBloco = (b: Bloco, comTitulo: boolean) =>
    `${comTitulo ? `<p style="margin:0 0 6px;font-size:14px;font-weight:bold;">${escaparHtml(b.titulo)}</p>` : ''}${
      b.extra
        ? `<div style="margin:0 0 10px;padding:12px;background:#f4f6fa;border-left:3px solid #0e9f8e;white-space:pre-wrap;font-size:14px;">${escaparHtml(b.extra)}</div>`
        : ''
    }${
      b.arquivos.length > 0
        ? `<ul style="margin:0 0 12px;padding-left:18px;font-size:14px;">${b.arquivos
            .map((a) =>
              a.link
                ? `<li><a href="${escaparHtml(a.link)}" style="color:#0b3a6e;">${escaparHtml(a.nome)}</a></li>`
                : `<li>${escaparHtml(a.nome)}</li>`,
            )
            .join('')}</ul>`
        : ''
    }`;

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#142033;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d9e0ea;border-radius:8px;overflow:hidden;">
<div style="background:#0b3a6e;color:#ffffff;padding:14px 20px;font-size:14px;font-weight:bold;">SIGOF · ${escaparHtml(empresa)}</div>
<div style="padding:20px;">
<p style="margin:0 0 4px;font-size:12px;color:#56637a;">${escaparHtml(retrato.protocolo)}</p>
<h1 style="margin:0 0 16px;font-size:18px;">${escaparHtml(titulo)}</h1>
${blocos.map((b) => htmlDoBloco(b, blocos.length > 1)).join('\n')}
<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
${linhas
  .map(
    ([nome, valor]) =>
      `<tr><td style="${celula}color:#56637a;">${escaparHtml(nome)}</td><td style="${celula}">${escaparHtml(valor)}</td></tr>`,
  )
  .join('\n')}
</table>
<p style="margin:0 0 4px;font-size:12px;color:#56637a;">Descrição</p>
<p style="margin:0 0 20px;font-size:14px;white-space:pre-wrap;">${escaparHtml(retrato.descricao)}</p>
<a href="${escaparHtml(link)}" style="display:inline-block;background:#0b3a6e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:bold;">Abrir no SIGOF</a>
</div>
<div style="padding:14px 20px;border-top:1px solid #d9e0ea;font-size:12px;color:#56637a;">${escaparHtml(AVISO_DE_NAO_RESPONDA)}</div>
</div>
</body></html>`;

  return { assunto: assuntoDe(retrato), texto, html };
}

/** E-mail do botão "Enviar e-mail de teste" da configuração. */
export function emailDeTeste(empresa: string, quem: string): Email {
  const titulo = 'Teste de envio do SIGOF';
  const corpo = `Se você recebeu esta mensagem, o e-mail de envio da ${empresa} está configurado corretamente. Teste feito por ${quem}.`;
  return {
    assunto: titulo,
    texto: `${corpo}\n\n--\n${AVISO_DE_NAO_RESPONDA}`,
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#142033;"><h1 style="font-size:18px;">${titulo}</h1><p>${escaparHtml(corpo)}</p><p style="font-size:12px;color:#56637a;">${escaparHtml(AVISO_DE_NAO_RESPONDA)}</p></body></html>`,
  };
}
