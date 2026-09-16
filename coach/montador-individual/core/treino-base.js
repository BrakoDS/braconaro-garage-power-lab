// @ts-check
/**
 * O TREINO BASE DO DIA — o estado que a tela edita, sem DOM e sem nuvem.
 *
 * É "base" porque é o treino da aula, igual para a turma. A versão de cada aluno
 * (Etapa 4) nasce daqui somada ao perfil dele, e não é gravada: o que se guarda
 * é isto, uma vez por dia.
 *
 * A conta de volume mora aqui em cima de três peças compartilhadas —
 * `equivalencia.js` (relógio e reps viram série), `volume.js` (primário 1,0 e
 * secundário 0,5) e `grupos.js` (músculo fino vira grupo grande) — para o coach e
 * o aluno lerem o mesmo número.
 *
 * @typedef {Object} Linha
 * @property {string} id          id no catálogo efetivo; '' enquanto o coach não escolheu
 * @property {string} nome
 * @property {string} [padrao]
 * @property {string[]} [musculosPrimarios]
 * @property {string[]} [musculosSecundarios]
 * @property {number} [series]      musculação
 * @property {string} [reps]        musculação ('8–12')
 * @property {number} [descansoSeg]
 * @property {number} [trabalhoSeg] tempo: segundos de trabalho por round
 * @property {number} [rounds]      tempo: quantos rounds
 * @property {number} [duracaoSeg]  tempo: bloco de duração direta (Hyrox, WOD)
 * @property {number} [rodadas]     WOD
 * @property {boolean} travado      o cadeado da linha (sem efeito até a Etapa 4)
 *
 * @typedef {Object} Bloco
 * @property {string} nome
 * @property {string} tipo
 * @property {Linha[]} exercicios
 *
 * @typedef {Object} TreinoBase
 * @property {string} dateId
 * @property {string} dia
 * @property {string} estrutura
 * @property {string} geradoEm
 * @property {number} nAlunos
 * @property {{nome: string, duracaoSeg: number}[]} aquecimento
 * @property {Bloco[]} blocos
 * @property {Record<string, number>} volPorPadrao
 * @property {Record<string, number>} volPorMusculo
 * @property {Record<string, number>} volPorGrupo
 * @property {number} [totalSeries]
 */
import { blocosIniciais, linhaPadrao, estruturaDe } from '../../../compartilhado/config/estruturas.js';
import { seriesPorTempo, FATOR_DENSIDADE_WOD } from '../../../compartilhado/regras/equivalencia.js';
import { calcularVolume } from '../../../compartilhado/regras/volume.js';
import { agregarPorGrupo } from '../../../compartilhado/regras/grupos.js';
import { diaSemanaDe } from '../../../compartilhado/regras/datas-treino.js';

/** Uma linha vazia, com os campos que a estrutura pede. @param {string} estruturaId */
export function linhaNova(estruturaId) {
  return { id: '', nome: '', travado: false, ...linhaPadrao(estruturaId) };
}

/** Um bloco vazio. @param {string} nome @param {string} [tipo] */
export function blocoNovo(nome, tipo = 'principal') {
  return { nome, tipo, exercicios: [] };
}

/**
 * Treino do dia, em branco, com os blocos de partida da estrutura.
 * @param {{dateId: string, estrutura?: string, nAlunos?: number}} args
 * @returns {TreinoBase}
 */
export function treinoNovo({ dateId, estrutura = 'musculacao', nAlunos = 8 }) {
  const est = estruturaDe(estrutura);
  return {
    dateId,
    dia: diaSemanaDe(dateId),
    estrutura: est.id,
    geradoEm: new Date().toISOString(),
    nAlunos,
    aquecimento: [],
    blocos: blocosIniciais(est.id).map((b) => blocoNovo(b.nome, b.tipo)),
    volPorPadrao: {}, volPorMusculo: {}, volPorGrupo: {},
  };
}

/**
 * Troca a estrutura PRESERVANDO os exercícios já digitados.
 *
 * O coach escolhe a estrutura errada, digita sete exercícios e só então percebe —
 * limpar a lista aqui seria cobrar o erro dele com o trabalho todo. Os campos que
 * a nova estrutura pede e a linha não tem entram com o padrão dela; os que sobram
 * ficam guardados na linha, para a volta atrás não perder o que estava escrito.
 * @param {TreinoBase} treino @param {string} estruturaId
 * @returns {TreinoBase}
 */
export function trocarEstrutura(treino, estruturaId) {
  const est = estruturaDe(estruturaId);
  // Dia ainda em branco: adota os blocos da estrutura nova. Preservar "Principal"
  // num dia de GAP só entregaria ao coach um nome errado para ele corrigir à mão.
  if (!linhasDoTreino(treino).some((l) => l.nome || l.id)) {
    return { ...treino, estrutura: est.id, blocos: blocosIniciais(est.id).map((b) => blocoNovo(b.nome, b.tipo)) };
  }
  const padrao = linhaPadrao(est.id);
  const blocos = treino.blocos.map((b) => ({
    ...b,
    exercicios: b.exercicios.map((l) => ({ ...padrao, ...l })),
  }));
  return { ...treino, estrutura: est.id, blocos };
}

/**
 * Séries equivalentes de uma linha, na régua da estrutura.
 *
 * Musculação conta a série que está escrita. As estruturas de tempo contam o
 * relógio: rounds × trabalho, ou a duração direta do bloco. O WOD leva o desconto
 * de densidade, porque o relógio dele tem transição e descanso embutidos.
 * @param {Linha} linha @param {string} estruturaId
 */
export function seriesDaLinha(linha, estruturaId) {
  const est = estruturaDe(estruturaId);
  if (est.contagem === 'series') return Number(linha.series) > 0 ? Number(linha.series) : 0;
  const segundos = Number(linha.duracaoSeg) > 0
    ? Number(linha.duracaoSeg)
    : (Number(linha.rounds) || 0) * (Number(linha.trabalhoSeg) || 0);
  const series = seriesPorTempo(segundos);
  return est.densidadeWod ? series * FATOR_DENSIDADE_WOD : series;
}

/** Todas as linhas do treino, em ordem. @param {TreinoBase} treino */
export function linhasDoTreino(treino) {
  return (treino?.blocos || []).flatMap((b) => b.exercicios || []);
}

/** Ids de exercício de verdade que o treino usa (linha vazia não conta). @param {TreinoBase} treino */
export function idsDoTreino(treino) {
  return linhasDoTreino(treino).map((l) => l.id).filter(Boolean);
}

/**
 * Volume do treino: por padrão de movimento, por músculo e por grupo grande.
 *
 * Linha sem exercício escolhido fica de fora — o coach ainda está montando, e
 * contá-la como zero-com-padrão sujaria a tabela com uma chave vazia.
 * @param {TreinoBase} treino
 * @returns {{porPadrao: Record<string, number>, porMusculo: Record<string, number>, porGrupo: Record<string, number>, totalSeries: number}}
 */
export function volumeDoTreino(treino) {
  const itens = linhasDoTreino(treino)
    .filter((l) => l.id || l.nome)
    .map((l) => ({
      exercicio: {
        padrao: l.padrao,
        musculosPrimarios: l.musculosPrimarios || [],
        musculosSecundarios: l.musculosSecundarios || [],
      },
      series: seriesDaLinha(l, treino.estrutura),
    }))
    .filter((i) => i.series > 0);
  const { porMusculo, porPadrao, totalSeries } = calcularVolume(/** @type {any} */ (itens));
  return { porPadrao, porMusculo, porGrupo: agregarPorGrupo(porMusculo), totalSeries };
}

/**
 * O treino pronto para salvar: o volume vai junto, calculado agora.
 *
 * Gravado e não recalculado na leitura de propósito — é o que o histórico e a
 * semana leem sem reabrir o catálogo, e é como o montador atual já guarda o dia.
 * @param {TreinoBase} treino
 * @returns {TreinoBase}
 */
export function paraSalvar(treino) {
  const vol = volumeDoTreino(treino);
  return {
    ...treino,
    volPorPadrao: vol.porPadrao,
    volPorMusculo: vol.porMusculo,
    volPorGrupo: vol.porGrupo,
    // Guardado porque não dá para recuperá-lo somando os outros: exercício que o
    // coach escreveu fora do catálogo não tem padrão nem músculo, e some deles —
    // o histórico mostraria um total menor do que a tela mostrou na hora de salvar.
    totalSeries: vol.totalSeries,
  };
}
