// @ts-check
/**
 * As camadas do Calendário, na ordem das chaves da tela. Camada nova: um
 * arquivo nesta pasta e uma linha aqui (ex.: treino do dia, experimentais).
 */
import { camadaFeriados } from './feriados.js';
import { camadaAniversarios } from './aniversarios.js';
import { camadaReavaliacoes } from './reavaliacoes.js';

/** @type {import('../core/camadas.js').Camada[]} */
export const CAMADAS = [camadaFeriados, camadaAniversarios, camadaReavaliacoes];
