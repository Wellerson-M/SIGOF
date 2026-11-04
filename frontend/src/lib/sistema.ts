/**
 * Qual versão do SIGOF está no ar. Enquanto não houver release, o staging
 * roda o último commit da main; depois da v1.0.0, a etiqueta da release.
 */
import { pedir } from './api';

export interface VersaoNoAr {
  /** Etiqueta da release (ex.: "v1.0.0") ou o commit completo. */
  versao: string;
  ambiente: 'development' | 'test' | 'staging' | 'production';
  /** Data do commit, quando a imagem foi gerada pelo pipeline. */
  construidoEm: string | null;
  /** A caixa de sugestões está ligada neste ambiente. */
  sugestoes?: boolean;
}

export function versaoNoAr(): Promise<VersaoNoAr> {
  return pedir<VersaoNoAr>('/sistema');
}

const NOME_DO_AMBIENTE: Record<VersaoNoAr['ambiente'], string> = {
  development: 'Desenvolvimento',
  test: 'Teste',
  staging: 'Homologação (staging)',
  production: 'Produção',
};

const RELEASE = /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const COMMIT = /^[0-9a-f]{7,40}$/i;

export interface VersaoDescrita {
  /** Curto, para o rodapé do menu: "v1.0.0" ou "a1b2c3d". */
  curta: string;
  /** "Release v1.0.0", "Commit a1b2c3d" ou "Local". */
  rotulo: string;
  ambiente: string;
  /** Página do commit ou da release no GitHub, quando der para saber. */
  link: string | null;
}

const REPOSITORIO = 'https://github.com/Wellerson-M/SIGOF';

export function descreverVersao(v: VersaoNoAr): VersaoDescrita {
  const ambiente = NOME_DO_AMBIENTE[v.ambiente] ?? v.ambiente;
  if (RELEASE.test(v.versao)) {
    const etiqueta = v.versao.startsWith('v') ? v.versao : `v${v.versao}`;
    return {
      curta: etiqueta,
      rotulo: `Release ${etiqueta}`,
      ambiente,
      link: `${REPOSITORIO}/releases/tag/${etiqueta}`,
    };
  }
  if (COMMIT.test(v.versao)) {
    const curto = v.versao.slice(0, 7).toLowerCase();
    return {
      curta: curto,
      rotulo: `Commit ${curto}`,
      ambiente,
      link: `${REPOSITORIO}/commit/${v.versao}`,
    };
  }
  return {
    curta: v.versao,
    rotulo: v.versao === 'local' ? 'Local' : v.versao,
    ambiente,
    link: null,
  };
}
