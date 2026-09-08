// @ts-check
/**
 * FORMATOS DE WOD — constantes neutras, sem dependência do catálogo real.
 *
 * Vivem aqui (e não em `core/hibrido.js`, que as definia antes) porque
 * `core/livre.js` também precisa delas e é PURO de propósito: recebe `porId`
 * por injeção para não arrastar `data/exercicios.js` para dentro do módulo.
 * `hibrido.js` importa `EXERCICIOS` do catálogo real — se `livre.js` importasse
 * `FORMATOS_WOD`/`DESCRICAO_FORMATO` de lá, o catálogo entraria de carona no
 * grafo de import do módulo puro. Um lugar neutro em `config/` (mesmo padrão
 * de `config/padroes.js`) resolve os dois lados sem ciclo e sem acoplamento.
 */

/** Os quatro formatos de WOD suportados — exatamente estes, nesta ordem. */
export const FORMATOS_WOD = /** @type {const} */ (['AMRAP', 'EMOM', 'For Time', 'Chipper']);

/**
 * O EMOM do Treino Livre é ROTAÇÃO: o minuto 1 é o primeiro movimento, o minuto 2
 * é o segundo, e a lista reinicia até fechar o tempo. É como o coach escreve na
 * lousa e foi a forma que ele escolheu para a aba.
 *
 * O EMOM do Híbrido é outro: lá o sorteio não sabe quantos minutos cada movimento
 * ocupa, então a instrução é "faça o bloco todo e descanse o resto do minuto".
 * Duas frases porque são duas execuções diferentes — unificar mentiria para um
 * dos dois lados.
 */
export const DESCRICAO_EMOM_ROTACAO = 'A cada minuto, um movimento na ordem — a lista reinicia até fechar o tempo.';

/** Texto explicativo de cada formato, para o coach e para o aluno. */
export const DESCRICAO_FORMATO = {
  'AMRAP': 'Máximo de rodadas possíveis no tempo — cronômetro corre até o fim.',
  'EMOM': 'A cada minuto, execute o bloco de movimentos e descanse o restante do minuto.',
  'For Time': 'Complete tudo o mais rápido possível — cronometra o tempo total.',
  'Chipper': 'Uma lista longa de movimentos, na ordem, sem repetir rodada (cada um só 1×).',
};
