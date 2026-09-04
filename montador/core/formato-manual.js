// @ts-check
/**
 * FORMATO DO TREINO MANUAL — a forma que cada modalidade tem.
 *
 * O Treino Manual costumava ter a estrutura presa no código (8 blocos + 8
 * mobilidades, para qualquer modalidade). Este módulo é a resposta à pergunta
 * "qual é a forma da modalidade X": quantos slots, que padrões cada um deveria
 * cobrir, qual a prescrição de partida e — nas modalidades que não são listas de
 * exercícios — qual é a estrutura real (estações TABATA, músicas de GAP, postos de
 * bi-set, estações de prova).
 *
 * É ARITMÉTICA E CONFIGURAÇÃO, nada mais: não conhece o catálogo de exercícios nem
 * toca DOM. Quem monta a tela é `ui/manual.js` e os editores; quem escolhe
 * exercício é cada editor, a partir do catálogo vivo.
 *
 * Os números aqui ESPELHAM os do gerador automático de propósito — é o que faz o
 * treino manual sair com a mesma duração e a mesma estrutura do automático. Onde há
 * espelhamento, o comentário diz de onde o número veio; mudar lá e não aqui faz as
 * duas telas divergirem em silêncio.
 *
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 * @typedef {'blocos'|'tabata4'|'gapMusicas'|'postosBiset'|'hyroxEstacoes'|'murphFixo'} FormatoManualId
 */
import { MODALIDADES } from '../config/modalidades.js';
import { padroesObrigatorios } from '../config/padroes.js';
import { FORMATOS_WOD } from '../config/wod-formatos.js';
import { HIIT_ESTACOES, TABATA as TABATA_HIIT } from './hiitTabata.js';
import { TABATA as TABATA_GAP } from './gap.js';
import { HYROX_ESTACOES, HYROX_CORRIDA } from './hyrox.js';
import {
  PARES_ANTAGONISTAS, calcularPostos, calcularSeries, prescricaoSemana, duracaoWodPorSemana,
} from './hibrido-postos.js';

/** @type {Record<string, FormatoManualId>} */
export const FORMATO_POR_MODALIDADE = {
  forca: 'blocos',
  hipertrofia: 'blocos',
  hiit: 'tabata4',
  gap: 'gapMusicas',
  hibrido: 'postosBiset',
  hyrox: 'hyroxEstacoes',
  murph: 'murphFixo',
};

/**
 * Reps de partida e faixa da modalidade.
 *
 * Tabela explícita, e não um parse de `mod.reps`: aquele campo é texto livre para o
 * coach ler ('TABATA 20s on / 10s off', '8–12 reps + WOD final'), e derivar número
 * dele quebraria na primeira vez que alguém reescrevesse a frase.
 */
export const REPS_MANUAL = {
  forca: { padrao: 5, faixa: /** @type {[number,number]} */ ([1, 6]) },
  hipertrofia: { padrao: 10, faixa: /** @type {[number,number]} */ ([8, 12]) },
};

/** Espelha AQUECIMENTO_SEG de core/gerador.js — é o orçamento que faz a aula caber em 55 min. */
const MOB_SEG = { forca: 450, default: 240 };
/** Duração típica de uma mobilidade. A faixa real é 30–60s (ver `duracaoMobilidade`). */
const MOB_SEG_TIPICO = 45;
/** Mesmo teto do gerador (MOB_MAX_EXERCICIOS): passou disso não é aquecimento, é circuito. */
const MOB_MAX_SLOTS = 8;

/** Espelha MOBILIDADE_SEG / MOBILIDADE_DELOAD_SEG de core/hibrido.js. */
const MOB_HIBRIDO_SEG = { normal: 240, deload: 720 };
/** Espelha o `nItens` de `montarMobilidade` (core/hibrido.js). */
const MOB_HIBRIDO_SLOTS = { normal: 3, deload: 6 };
/**
 * A lista vinha copiada à mão daqui de dentro porque importar de `core/hibrido.js`
 * arrastaria o catálogo real junto. Agora ela mora em `config/wod-formatos.js`,
 * que não depende de nada — então este módulo pode usar a fonte de verdade e
 * parar de espelhar. No deload o WOD trava em EMOM.
 */
const FORMATOS_WOD_MANUAL = FORMATOS_WOD;
/** Quantos movimentos o WOD comporta — mesma faixa que `montarWod` sorteia (3 + 0..2). */
const WOD_MOVIMENTOS = /** @type {[number,number]} */ ([3, 5]);

/**
 * Quantos slots de mobilidade cabem no orçamento, com o mesmo teto do gerador.
 * @param {number} orcamentoSeg
 */
function slotsDeMobilidade(orcamentoSeg) {
  return Math.min(MOB_MAX_SLOTS, Math.max(1, Math.floor(orcamentoSeg / MOB_SEG_TIPICO)));
}

/**
 * A forma da modalidade para o Treino Manual.
 *
 * @param {ModalidadeId} modalidade
 * @param {{nAlunos?: number, semana?: number, nivel?: Nivel}} [opcoes]
 *        `nAlunos` decide o nº de postos do Híbrido; `semana` e `nivel`, a
 *        prescrição dele. As demais modalidades ignoram os três.
 */
export function formatoManual(modalidade, opcoes = {}) {
  const { nAlunos = 8, semana = 1, nivel = 'intermediario' } = opcoes;
  // Modalidade fora da tabela cai em `blocos`: é o formato genérico, e uma tela
  // vazia por causa de um id novo seria pior que uma grade de blocos.
  const tipo = FORMATO_POR_MODALIDADE[modalidade] || 'blocos';

  if (tipo === 'tabata4') {
    return {
      tipo,
      modalidade,
      protocolo: TABATA_HIIT,
      estacoes: HIIT_ESTACOES.map(({ grupo, titulo }) => ({
        grupo, titulo, nSlots: TABATA_HIIT.slotsPorEstacao,
      })),
    };
  }

  if (tipo === 'gapMusicas') {
    return {
      tipo,
      modalidade,
      protocolo: TABATA_GAP,
      // A distribuição é a da metodologia (9 músicas), igual à de `gerarGap`.
      partes: [
        { nome: 'Aquecimento', banco: 'aquecimento', musicas: 1, modo: 'trio' },
        { nome: 'Pernas', banco: 'pernas', musicas: 3, modo: 'membro' },
        { nome: 'Glúteo', banco: 'gluteo', musicas: 3, modo: 'membro' },
        { nome: 'Abdômen', banco: 'abdomen', musicas: 2, modo: 'trio' },
      ],
    };
  }

  if (tipo === 'postosBiset') {
    const nPostos = calcularPostos(nAlunos);
    const presc = prescricaoSemana(semana, nivel);
    // Mesma regra de `montarPostos` (core/hibrido.js): as séries seguram o bloco em
    // 24 min, e o deload tira uma. Divergir daqui faria o manual montar uma aula com
    // duração errada sem avisar ninguém.
    const seriesBase = calcularSeries(nPostos);
    const chave = presc.ehDeload ? 'deload' : 'normal';
    return {
      tipo,
      modalidade,
      nPostos,
      series: presc.ehDeload ? Math.max(2, seriesBase - 1) : seriesBase,
      presc,
      pares: PARES_ANTAGONISTAS.slice(0, nPostos),
      mobilidade: {
        orcamentoSeg: MOB_HIBRIDO_SEG[chave],
        nSlots: MOB_HIBRIDO_SLOTS[chave],
      },
      wod: {
        duracaoMin: duracaoWodPorSemana(semana),
        nMovimentos: WOD_MOVIMENTOS,
        formatos: presc.ehDeload ? ['EMOM'] : [...FORMATOS_WOD_MANUAL],
      },
    };
  }

  if (tipo === 'hyroxEstacoes') {
    return { tipo, modalidade, estacoes: HYROX_ESTACOES, corrida: HYROX_CORRIDA };
  }

  // O Murph não tem parâmetro: o desafio inteiro é fixo, e o editor só o mostra
  // para conferência antes de agendar.
  if (tipo === 'murphFixo') return { tipo, modalidade };

  // -------- blocos (Força, Hipertrofia) --------
  const mod = MODALIDADES[modalidade];
  const nBlocos = mod ? mod.faixaExercicios[1] : 5;
  // Os padrões obrigatórios etiquetam os primeiros slots; o que passar disso é
  // livre (`null`), porque `padroesObrigatorios` só vai até 6.
  const obrigatorios = padroesObrigatorios(
    /** @type {4|5|6} */ (Math.min(6, Math.max(4, nBlocos))));
  const padroesSugeridos = Array.from({ length: nBlocos }, (_, i) => obrigatorios[i] ?? null);
  const reps = REPS_MANUAL[modalidade] || { padrao: 10, faixa: [8, 12] };
  const orcamentoSeg = MOB_SEG[modalidade] ?? MOB_SEG.default;

  return {
    tipo: /** @type {'blocos'} */ ('blocos'),
    modalidade,
    nBlocos,
    padroesSugeridos,
    seriesPadrao: mod ? mod.series : 4,
    repsPadrao: reps.padrao,
    repsFaixa: reps.faixa,
    descansoSeg: mod ? mod.descansoSeg : 75,
    mobilidade: { orcamentoSeg, nSlots: slotsDeMobilidade(orcamentoSeg) },
  };
}
