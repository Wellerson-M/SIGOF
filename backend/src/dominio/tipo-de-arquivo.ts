/**
 * Descobre o tipo real de um arquivo pelos primeiros bytes ("assinatura" ou
 * "número mágico"), sem confiar na extensão nem no Content-Type que o
 * navegador manda — os dois o usuário controla. Um `.exe` renomeado para
 * `.pdf` começa com `MZ`, não com `%PDF`, e é recusado.
 *
 * Só entram os formatos que aparecem numa ocorrência de frete: PDF (CTe,
 * DANFE, comprovantes), imagens (foto da mercadoria, canhoto) e XML (o
 * arquivo da NF-e e do CTe).
 */

export interface TipoAceito {
  mime: string;
  extensoes: readonly string[];
  /** Mostrar no navegador (true) ou só baixar (false). */
  exibivel: boolean;
}

export const TIPOS_ACEITOS = {
  pdf: { mime: 'application/pdf', extensoes: ['pdf'], exibivel: true },
  png: { mime: 'image/png', extensoes: ['png'], exibivel: true },
  jpeg: { mime: 'image/jpeg', extensoes: ['jpg', 'jpeg'], exibivel: true },
  webp: { mime: 'image/webp', extensoes: ['webp'], exibivel: true },
  // XML nunca é exibido: o navegador poderia interpretar scripts embutidos
  xml: { mime: 'application/xml', extensoes: ['xml'], exibivel: false },
} as const satisfies Record<string, TipoAceito>;

export type NomeDoTipo = keyof typeof TIPOS_ACEITOS;

function comecaCom(bytes: Uint8Array, assinatura: number[], deslocamento = 0) {
  return assinatura.every((b, i) => bytes[deslocamento + i] === b);
}

const ASCII = (texto: string) => [...texto].map((c) => c.charCodeAt(0));

/** O tipo pelo conteúdo, ou null se não for um dos aceitos. */
export function detectarTipo(bytes: Uint8Array): NomeDoTipo | null {
  if (comecaCom(bytes, ASCII('%PDF-'))) return 'pdf';
  if (comecaCom(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'png';
  if (comecaCom(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (comecaCom(bytes, ASCII('RIFF')) && comecaCom(bytes, ASCII('WEBP'), 8))
    return 'webp';
  if (pareceXml(bytes)) return 'xml';
  return null;
}

/**
 * XML não tem assinatura binária: é texto que começa (depois de um BOM e
 * de espaços opcionais) com `<?xml` ou com uma tag. Bytes de controle no
 * começo denunciam binário disfarçado.
 */
function pareceXml(bytes: Uint8Array): boolean {
  let i = comecaCom(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (i < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[i]!)) i++;
  if (bytes[i] !== 0x3c) return false; // "<"
  const inicio = bytes.subarray(i, i + 512);
  return inicio.every((b) => b >= 0x20 || [0x09, 0x0a, 0x0d].includes(b));
}

export function extensaoDe(nomeDoArquivo: string): string {
  const ponto = nomeDoArquivo.lastIndexOf('.');
  return ponto === -1 ? '' : nomeDoArquivo.slice(ponto + 1).toLowerCase();
}

/**
 * Nome seguro para guardar e devolver no download: sem caminho (`../`),
 * sem caracteres de controle e com tamanho limitado.
 */
export function nomeSeguro(nomeDoArquivo: string): string {
  const semCaminho = nomeDoArquivo.split(/[/\\]/).pop() ?? '';
  const limpo = [...semCaminho]
    .filter((c) => c.charCodeAt(0) >= 0x20 && c !== '\u007f')
    .join('')
    .replaceAll(/["<>|:*?]/g, '_')
    .trim();
  return (limpo || 'arquivo').slice(-120);
}
