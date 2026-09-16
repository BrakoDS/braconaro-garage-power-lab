// @ts-check
/**
 * O TREINO ESTRUTURADO no lado do navegador — leitura, conta e edição, sem DOM
 * e sem rede.
 *
 * Espelha os tipos de `functions/src/lousa.ts`, que é quem produz este objeto.
 * Não é duplicação de REGRA: nenhuma decisão de leitura (regra global do box,
 * descarte de músculo inventado, padrão de série por bloco) mora aqui — isso é
 * do servidor, e reimplementar qualquer parte disso no cliente criaria duas
 * verdades sobre o mesmo treino. O que mora aqui é o que só o cliente precisa:
 * somar séries para a tela, aplicar a troca que o coach aceitou em um clique e
 * preparar o objeto para salvar.
 *
 * @typedef {Object} ExercicioLousa
 * @property {string} nome
 * @property {'A'|'B'|'C'|'D'} bloco
 * @property {number} series
 * @property {string} reps
 * @property {string} implemento
 * @property {string[]} grupamentos
 * @property {string} observacao
 *
 * @typedef {Object} BlocoLousa
 * @property {'A'|'B'|'C'|'D'} id
 * @property {string} nome
 * @property {ExercicioLousa[]} exercicios
 *
 * @typedef {Object} TreinoEstruturado
 * @property {'HIIT'|'GAP'|'Hipertrofia'|'Hyrox'} sistema
 * @property {string} titulo
 * @property {BlocoLousa[]} blocos
 * @property {number} estimativaSeries
 * @property {{de: string, para: string, regra: string}[]} substituicoes
 * @property {string[]} avisos
 */

/** Os quatro blocos, na ordem da aula — mesma tabela de `functions/src/lousa.ts`. */
export const BLOCOS = [
  { id: 'A', nome: 'Mobilidade' },
  { id: 'B', nome: 'Aquecimento' },
  { id: 'C', nome: 'Força' },
  { id: 'D', nome: 'Metcon' },
];

/** Todos os exercícios, achatados na ordem dos blocos. @param {TreinoEstruturado|null} treino */
export function exerciciosDo(treino) {
  return (treino?.blocos || []).flatMap((b) => b.exercicios || []);
}

/**
 * A soma das séries do treino.
 *
 * Recalcula em vez de ler `estimativaSeries` porque o coach EDITA o treino na
 * prévia: aceitar uma troca ou apagar um exercício muda a conta, e o campo que
 * veio do servidor ficaria congelado no valor de antes da edição.
 * @param {TreinoEstruturado|null} treino
 */
export function totalSeries(treino) {
  return exerciciosDo(treino).reduce((s, e) => s + (Number(e.series) || 0), 0);
}

/** Quantos exercícios usam cada implemento. @param {TreinoEstruturado|null} treino */
export function usoPorImplemento(treino) {
  /** @type {Record<string, number>} */
  const uso = {};
  for (const e of exerciciosDo(treino)) {
    const k = (e.implemento || '').trim();
    if (k) uso[k] = (uso[k] || 0) + 1;
  }
  return uso;
}

/** Minúsculas e sem acento — mesma normalização do servidor, para casar nomes. */
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aplica a troca de implemento que o coach aceitou.
 *
 * `alvo` pode ser o nome de um exercício (alerta de duplicação) ou o rótulo de
 * um implemento (alerta de saturação): no primeiro caso muda UMA linha, no
 * segundo muda todas as que usam aquele implemento. É a diferença entre "troca
 * o agachamento de hoje" e "tira um pouco de barra da semana", e é por isso que
 * a mesma função atende os dois — o que o coach clicou já diz qual dos dois ele
 * quis.
 *
 * Devolve SEMPRE um treino novo. A prévia mostra lousa original × estruturado
 * lado a lado, e mutar o objeto apagaria o lado esquerdo da comparação.
 *
 * @param {TreinoEstruturado} treino
 * @param {{alvo: string, de: string, para: string}} troca
 * @returns {TreinoEstruturado}
 */
export function trocarImplemento(treino, { alvo, de, para }) {
  const alvoN = normalizar(alvo);
  const deN = normalizar(de);
  if (!para || !alvoN) return treino;

  const blocos = (treino.blocos || []).map((b) => ({
    ...b,
    exercicios: (b.exercicios || []).map((e) => {
      const casaPorNome = normalizar(e.nome) === alvoN;
      const casaPorImplemento = normalizar(e.implemento) === alvoN;
      if (!casaPorNome && !casaPorImplemento) return e;
      // Alerta de duplicação: o alvo é o exercício, e o que troca é o
      // implemento DELE, que o alerta carrega em `de`.
      if (casaPorNome && deN && normalizar(e.implemento) !== deN) return e;
      return { ...e, implemento: para };
    }),
  }));
  return { ...treino, blocos };
}

/** Remove um exercício pelo nome (o coach descartou na prévia). @param {TreinoEstruturado} treino @param {string} nome */
export function removerExercicio(treino, nome) {
  const n = normalizar(nome);
  const blocos = (treino.blocos || [])
    .map((b) => ({ ...b, exercicios: (b.exercicios || []).filter((e) => normalizar(e.nome) !== n) }))
    .filter((b) => b.exercicios.length);
  return { ...treino, blocos };
}

/**
 * O treino pronto para gravar: estimativa recalculada e campos garantidos.
 *
 * `dateId` e `titulo` entram aqui e não no servidor porque são do coach, não da
 * leitura: ele escolhe a data no formulário e pode reescrever o título que a IA
 * sugeriu antes de salvar.
 *
 * @param {TreinoEstruturado} treino
 * @param {{dateId: string, titulo: string, classTime?: string}} meta
 */
export function paraGravar(treino, { dateId, titulo, classTime = '' }) {
  return {
    dateId,
    classTime,
    geradoEm: new Date().toISOString(),
    treino: {
      ...treino,
      titulo: (titulo || treino.titulo || '').trim() || treino.sistema,
      estimativaSeries: totalSeries(treino),
    },
  };
}

/** Um rótulo curto do treino para listas e cabeçalhos. @param {TreinoEstruturado|null} treino */
export function resumo(treino) {
  if (!treino) return '';
  const n = exerciciosDo(treino).length;
  return `${treino.sistema} · ${n} exercício${n === 1 ? '' : 's'} · ${totalSeries(treino)} séries`;
}
