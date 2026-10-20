/**
 * Módulos do SIGOF: partes do sistema que cada transportadora pode usar
 * ou não.
 *
 * São duas chaves, uma depois da outra:
 *  1. o administrador da plataforma **libera** o módulo para a empresa
 *     (o que ela contratou ou pode usar);
 *  2. o administrador da empresa **liga** os liberados que quer usar.
 *
 * Só vale o que está liberado *e* ligado. Desligar não apaga nada: os
 * cadastros e os registros antigos continuam lá e voltam ao religar.
 */
export const MODULOS = [
  'FILIAIS',
  'CAUSA_DO_ERRO',
  'VERIFICACOES',
  'REGISTRO_RAPIDO',
  'EMAIL',
  'BALANCO',
  'FORMULARIO',
] as const;

export type Modulo = (typeof MODULOS)[number];

export interface ChavesDosModulos {
  modulosLiberados: string[];
  modulosAtivos: string[];
}

/** Liberado pela plataforma e ligado pela empresa. */
export function moduloLigado(
  empresa: ChavesDosModulos,
  modulo: Modulo,
): boolean {
  return (
    empresa.modulosLiberados.includes(modulo) &&
    empresa.modulosAtivos.includes(modulo)
  );
}

/** Os módulos em uso, na ordem do catálogo. */
export function modulosLigados(empresa: ChavesDosModulos): Modulo[] {
  return MODULOS.filter((m) => moduloLigado(empresa, m));
}

/** Sem repetidos, só nomes conhecidos, na ordem do catálogo. */
export function normalizarModulos(lista: readonly string[]): Modulo[] {
  return MODULOS.filter((m) => lista.includes(m));
}
