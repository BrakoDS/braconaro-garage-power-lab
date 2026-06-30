// @ts-check
/**
 * VIABILIDADE DE APARELHOS para uma sessão de 8 alunos.
 *
 * Modelo: um treino é um circuito de K exercícios (estações). Os 8 alunos se
 * dividem em K grupos de tamanho `ceil(8/K)`. Cada estação precisa de unidades
 * suficientes do(s) seu(s) equipamento(s) para o seu grupo, considerando que
 * equipamentos "compartilháveis em dupla" servem 2 alunos por unidade.
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 */
import { EQUIP_POR_ID, ALUNOS_POR_SESSAO, unidadesNecessarias, unidadesDe } from '../data/equipamentos.js';

/**
 * @param {Exercicio[]} exercicios  Estações do treino
 * @param {number} [nAlunos]
 * @param {number} [numEstacoes]  Nº FINAL de estações do circuito (default: qtd. de exercícios).
 *                                Necessário ao montar incrementalmente: os grupos são
 *                                dimensionados pelo total de estações, não pelo parcial.
 * @returns {{ ok: boolean, tamanhoGrupo: number, conflitos: string[], demanda: Record<string, number> }}
 */
export function verificarViabilidade(exercicios, nAlunos = ALUNOS_POR_SESSAO, numEstacoes) {
  const K = Math.max(1, numEstacoes ?? exercicios.length);
  const tamanhoGrupo = Math.ceil(nAlunos / K);

  /** @type {Record<string, number>} */
  const demanda = {};
  for (const ex of exercicios) {
    for (const equipId of ex.equipamento) {
      demanda[equipId] = (demanda[equipId] || 0) + unidadesNecessarias(equipId, tamanhoGrupo);
    }
  }

  const conflitos = [];
  for (const [equipId, precisa] of Object.entries(demanda)) {
    const eq = EQUIP_POR_ID[equipId];
    const tem = unidadesDe(equipId);
    if (precisa > tem) {
      conflitos.push(
        `${eq ? eq.nome : equipId}: precisa de ${precisa} unidade(s), box tem ${tem}.`
      );
    }
  }

  return { ok: conflitos.length === 0, tamanhoGrupo, conflitos, demanda };
}

/**
 * Testa se ADICIONAR um exercício a um conjunto mantém a viabilidade.
 * @param {Exercicio[]} atuais
 * @param {Exercicio} candidato
 * @param {number} [nAlunos]
 * @param {number} [numEstacoes]  Nº final de estações do circuito.
 */
export function podeAdicionar(atuais, candidato, nAlunos = ALUNOS_POR_SESSAO, numEstacoes) {
  return verificarViabilidade([...atuais, candidato], nAlunos, numEstacoes).ok;
}
