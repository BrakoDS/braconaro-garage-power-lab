// @ts-check
/**
 * MESOCICLO — encadeia N semanas (padrão 4) com progressão de carga/volume e
 * deload na última. Reúne os planos semanais e um resumo de progressão.
 *
 * @typedef {import('../config/frequencias.js').CombinacaoDias} CombinacaoDias
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 */
import { gerarPlanoSemanal } from './planoSemanal.js';
import { ehDeload, intensidadeSemana } from './periodizacao.js';
import { MODALIDADES } from '../config/modalidades.js';

/**
 * @param {Object} opcoes
 * @param {CombinacaoDias} opcoes.combinacao
 * @param {'iniciante'|'intermediario'|'avancado'} opcoes.nivel
 * @param {number} [opcoes.nSemanas]
 * @param {Partial<Record<string, ModalidadeId>>} [opcoes.modalidadesPorDia]
 * @param {number} [opcoes.seed]
 */
export function gerarMesociclo(opcoes) {
  const { combinacao, nivel, nSemanas = 4, modalidadesPorDia = {}, seed } = opcoes;

  const semanas = [];
  for (let semana = 1; semana <= nSemanas; semana++) {
    const plano = gerarPlanoSemanal({
      combinacao, nivel, semana, modalidadesPorDia,
      seed: seed != null ? seed + semana * 100 : undefined,
    });

    // intensidade média do mesociclo a partir das modalidades usadas na semana
    const faixas = plano.treinos.map((t) => MODALIDADES[t.modalidade].intensidadePctRM);
    const lo = Math.round(faixas.reduce((a, f) => a + f[0], 0) / faixas.length);
    const hi = Math.round(faixas.reduce((a, f) => a + f[1], 0) / faixas.length);
    const intensidade = intensidadeSemana([lo, hi], semana);

    semanas.push({
      semana,
      deload: ehDeload(semana),
      intensidade,            // { pctRM, rotulo }
      totalSeries: plano.volumeSemanal.totalSeries,
      volumeSemanal: plano.volumeSemanal,
      aderencia: plano.aderencia,
      plano,
    });
  }

  return { combinacao, nivel, nSemanas, semanas };
}
