// @ts-check
/**
 * PLANO SEMANAL — gera os treinos de todos os dias de uma combinação,
 * encadeando `treinoAnterior` para garantir variedade entre dias consecutivos,
 * e confere o volume semanal contra a meta da frequência.
 *
 * @typedef {import('../config/frequencias.js').CombinacaoDias} CombinacaoDias
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 */
import { gerarTreino } from './gerador.js';
import { somarVolumes, projetarMensal } from './volume.js';
import { META_SERIES_SEMANAIS } from '../config/frequencias.js';

/** Rotação padrão de modalidades caso o aluno não tenha agenda fixa. */
const ROTACAO_PADRAO = ['forca', 'hipertrofia', 'hyrox', 'hipertrofia', 'hibrido'];

/**
 * @param {Object} opcoes
 * @param {CombinacaoDias} opcoes.combinacao
 * @param {'iniciante'|'intermediario'|'avancado'} opcoes.nivel
 * @param {number} [opcoes.semana]
 * @param {Partial<Record<string, ModalidadeId>>} [opcoes.modalidadesPorDia]  ex.: { seg:'forca', qua:'hyrox' }
 * @param {number} [opcoes.seed]
 */
export function gerarPlanoSemanal(opcoes) {
  const { combinacao, nivel, semana = 1, modalidadesPorDia = {}, seed } = opcoes;

  const treinos = [];
  /** @type {import('./tipos.js').Treino|null} */
  let anterior = null;

  combinacao.dias.forEach((dia, i) => {
    const modalidade = /** @type {ModalidadeId} */ (
      modalidadesPorDia[dia] ?? ROTACAO_PADRAO[i % ROTACAO_PADRAO.length]
    );
    const treino = gerarTreino({
      modalidade, nivel, dia, semana,
      treinoAnterior: anterior,
      seed: seed != null ? seed + i : undefined,
    });
    treinos.push(treino);
    anterior = treino;
  });

  // -------- volume semanal e mensal --------
  const volumeSemanal = somarVolumes(treinos.map((t) => t.volume));
  const volumeMensal = projetarMensal(volumeSemanal);
  const meta = META_SERIES_SEMANAIS[combinacao.frequencia];

  // confronto meta x realizado por padrão
  /** @type {Record<string, {meta:number, realizado:number, ok:boolean}>} */
  const aderencia = {};
  for (const [padrao, alvo] of Object.entries(meta)) {
    const realizado = Math.round(volumeSemanal.porPadrao[padrao] || 0);
    aderencia[padrao] = { meta: alvo, realizado, ok: realizado >= alvo * 0.85 };
  }

  return { combinacao, nivel, semana, treinos, volumeSemanal, volumeMensal, meta, aderencia };
}
