// @ts-check
/**
 * O RÓTULO DE UM GRUPO DE EXERCÍCIOS LINKADOS, num lugar só.
 *
 * No Treino Livre o coach linka uma linha à de cima, e o tamanho do grupo é que
 * diz o nome da coisa. Essa régua é lida em três telas independentes — a de
 * montagem, o card do histórico do coach e o card do aluno no celular — e cada
 * uma agrupava com a sua própria cópia.
 *
 * Cópias de regra são o defeito mais caro desta aba: a leva anterior mandou dois
 * bugs para produção porque a forma do dia livre era interpretada em quatro
 * lugares e um deles ficou para trás. Aqui o risco seria mais silencioso ainda —
 * mudar a régua num lugar só faria o coach ver "Tri-set" e o aluno ver outra
 * coisa no mesmo treino, sem erro nenhum em lugar nenhum.
 *
 * Mora em `config/` porque é pura e sem dependência: o Portal do Aluno pode
 * importar daqui (já importa `config/cores-modalidade.js`) sem puxar nada do app
 * do coach — o que `aluno/treino-dia.js` evita é o `ui/render.js`, não o `config/`.
 */

/**
 * Nome do grupo pelo número de exercícios linkados.
 * @param {number} tamanho  quantos exercícios o grupo tem
 * @returns {string}
 */
export function rotuloGrupo(tamanho) {
  if (tamanho === 2) return 'Bi-set';
  if (tamanho === 3) return 'Tri-set';
  return 'Série gigante';
}
