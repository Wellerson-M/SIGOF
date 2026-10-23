/** Caixa de sugestões do ambiente de testes: vai por e-mail ao dono do sistema. */
import { pedir } from './api';

export type CategoriaDeSugestao = 'SUGESTAO' | 'PROBLEMA' | 'DUVIDA';

export const CATEGORIAS: { valor: CategoriaDeSugestao; nome: string }[] = [
  { valor: 'SUGESTAO', nome: 'Sugestão de melhoria' },
  { valor: 'PROBLEMA', nome: 'Problema ou erro' },
  { valor: 'DUVIDA', nome: 'Dúvida' },
];

export interface NovaSugestao {
  categoria: CategoriaDeSugestao;
  titulo: string;
  texto: string;
  /** Tela em que a pessoa estava, para quem lê saber do que se trata. */
  pagina?: string;
}

export const sugestoes = {
  enviar: (dados: NovaSugestao) =>
    pedir<{ enviada: boolean }>('/sugestoes', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
};
