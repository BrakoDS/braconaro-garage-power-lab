// @ts-check
/**
 * Cor de fundo + texto por modalidade — a legenda dos calendários.
 *
 * Mora aqui, e não no render.js do Montador, porque o Portal do Aluno desenha o
 * MESMO calendário e precisa das mesmas cores. Importar o render.js de lá traria
 * junto o gerador, a análise e o catálogo inteiro — ~150 kB de código de coach no
 * celular da aluna, por causa de seis cores. Este módulo não importa nada.
 */

/** @type {Record<string, {bg:string, fg:string, nome:string}>} */
export const COR_MODALIDADE = {
  forca:       { bg: '#FF0000', fg: '#fff',    nome: 'Força' },
  hipertrofia: { bg: '#FFA500', fg: '#1a1300', nome: 'Hipertrofia' },
  hyrox:       { bg: '#FFFF00', fg: '#1a1300', nome: 'HYROX' },
  gap:         { bg: '#FFC0CB', fg: '#3a0d16', nome: 'GAP' },
  hibrido:     { bg: '#800080', fg: '#fff',    nome: 'Híbrido' },
  hiit:        { bg: '#3DDC84', fg: '#06210f', nome: 'HIIT' },
  murph:       { bg: '#9aa0a6', fg: '#12140f', nome: 'Murph' },
};
