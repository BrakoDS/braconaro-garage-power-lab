// @ts-check
/**
 * Tipos compartilhados (apenas JSDoc — arquivo sem runtime).
 *
 * @typedef {Object} ItemPrincipal
 * @property {import('../data/exercicios.js').Exercicio} exercicio
 * @property {number} series
 * @property {string} reps
 * @property {number} descansoSeg
 * @property {number} tempoSeg
 *
 * @typedef {Object} ItemAquecimento
 * @property {import('../data/exercicios.js').Exercicio} exercicio
 * @property {number} duracaoSeg
 *
 * @typedef {Object} Finalizador
 * @property {string} tipo
 * @property {string} descricao
 * @property {import('../data/exercicios.js').Exercicio[]} itens
 * @property {number} tempoSeg
 *
 * @typedef {Object} Treino
 * @property {import('../config/modalidades.js').ModalidadeId} modalidade
 * @property {string} dia
 * @property {number} semana
 * @property {string} nivel
 * @property {number} nAlunos
 * @property {number} tamanhoGrupo
 * @property {boolean} deload
 * @property {ItemAquecimento[]} aquecimento
 * @property {ItemPrincipal[]} principal
 * @property {Finalizador|null} finalizador
 * @property {import('./volume.js').Volume} volume
 * @property {{ok:boolean, conflitos:string[], demanda:Record<string,number>}} viabilidade
 * @property {number} tempoAquecimentoSeg
 * @property {number} tempoPrincipalSeg
 * @property {number} tempoFinalizadorSeg
 * @property {number} tempoTotalSeg
 * @property {ReturnType<import('./hyrox.js')['gerarHyrox']>} [hyrox]         Presente só quando modalidade==='hyrox'
 * @property {ReturnType<import('./hiitTabata.js')['gerarHiitTabata']>} [hiit]  Presente só quando modalidade==='hiit'
 * @property {ReturnType<import('./gap.js')['gerarGap']>} [gap]                Presente só quando modalidade==='gap'
 * @property {import('./hibrido.js').Hibrido} [hibrido] Presente só quando modalidade==='hibrido'
 */
export {};
