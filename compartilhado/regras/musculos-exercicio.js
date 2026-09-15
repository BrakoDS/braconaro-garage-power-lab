// @ts-check
/**
 * MÚSCULO PRIMÁRIO × SECUNDÁRIO de um exercício.
 *
 * O volume conta 1,0 série para cada músculo primário e 0,5 para cada secundário.
 * Até aqui a Academia gravava uma lista só (`musculos`), e o catálogo efetivo
 * tratava todo músculo de exercício novo como primário — uma rosca com bíceps e
 * antebraço marcados contava os dois inteiros e inflava o volume.
 *
 * A convenção "o primeiro da lista é o primário", que o GAP e o Murph usam, não
 * serve aqui: a grade de checkbox grava na ordem da TELA, não na ordem do clique.
 * Por isso a separação é explícita, em dois campos, e as regras moram neste
 * módulo — a semente, o formulário, a pesquisa e o catálogo só chamam.
 *
 * A Academia grava RÓTULO ('Bíceps'); o montador conta CHAVE ('biceps'). Quem
 * chama passa a tradução, para este módulo não depender de dado nenhum.
 */

/**
 * Lista de strings sem repetição, sem vazio e sem nada que esteja em `excluir`.
 * @param {unknown} v @param {Set<string>} [excluir]
 * @returns {string[]}
 */
function limpar(v, excluir = new Set()) {
  if (!Array.isArray(v)) return [];
  /** @type {string[]} */
  const saida = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x || excluir.has(x) || saida.includes(x)) continue;
    saida.push(x);
  }
  return saida;
}

/**
 * O que foi marcado, pronto para gravar na Academia.
 *
 * Um músculo é primário OU secundário: se aparecer nos dois, fica no primário —
 * errar para mais num músculo que o coach marcou como principal é melhor que
 * rebaixá-lo em silêncio. `musculos` continua existindo como a união, porque os
 * filtros e as etiquetas da lista da Academia usam a lista única.
 * @param {{primarios?: unknown, secundarios?: unknown}} [p]
 */
export function normalizarSeparacao({ primarios, secundarios } = {}) {
  const musculosPrimarios = limpar(primarios);
  const musculosSecundarios = limpar(secundarios, new Set(musculosPrimarios));
  return { musculosPrimarios, musculosSecundarios, musculos: [...musculosPrimarios, ...musculosSecundarios] };
}

/**
 * O exercício tem uma separação em que dá para confiar?
 *
 * Vale a presença do campo, mesmo vazio — um exercício de mobilidade sem músculo
 * primário é uma escolha, não um dado antigo —, desde que a separação ainda bata
 * com a lista única `musculos`. Quem grava só a lista única (o formulário da
 * Academia antes da Etapa 2, publicado até o merge) deixa os dois campos parados:
 * se eles mandassem, o volume contaria os músculos velhos, sem aviso nenhum.
 * Separação que não bate volta a ser tratada como ausente, e a Academia pede revisão.
 * @param {any} a  exercício no formato da Academia
 */
export function temSeparacao(a) {
  if (!a || !Array.isArray(a.musculosPrimarios)) return false;
  if (!Array.isArray(a.musculos)) return true;
  const separados = new Set([...a.musculosPrimarios, ...(Array.isArray(a.musculosSecundarios) ? a.musculosSecundarios : [])]);
  const lista = new Set(a.musculos);
  return separados.size === lista.size && [...lista].every((m) => separados.has(m));
}

/**
 * Exercício com músculo marcado e nunca separado. Ele conta tudo como primário
 * até o coach revisar — é como contava antes desta mudança, então nenhum número
 * muda sozinho —, e a Academia avisa.
 * @param {any} a  exercício no formato da Academia
 */
export function precisaRevisaoMusculos(a) {
  return !!a && !temSeparacao(a) && Array.isArray(a.musculos) && a.musculos.length > 0;
}

/**
 * Os músculos de um exercício da Academia no formato do montador.
 *
 * Três casos, nesta ordem:
 *  1. Separação gravada na Academia: ela manda, como as tags já mandam — assim o
 *     que o coach edita vale na montagem, inclusive nos exercícios semeados.
 *  2. Sem separação, mas o exercício existe no catálogo base: vale o base.
 *  3. Sem separação e sem base (exercício criado antes desta mudança): tudo como
 *     primário, como sempre contou.
 * @param {any} a  exercício no formato da Academia (rótulos)
 * @param {{musculosPrimarios: string[], musculosSecundarios: string[]}|undefined} base  catálogo base (chaves)
 * @param {Record<string, string>} chaveDoRotulo  rótulo → chave
 * @returns {{musculosPrimarios: string[], musculosSecundarios: string[]}}
 */
export function musculosParaMontador(a, base, chaveDoRotulo) {
  /** @param {unknown} lista */
  const chaves = (lista) => limpar(
    (Array.isArray(lista) ? lista : []).map((r) => chaveDoRotulo[/** @type {string} */ (r)]),
  );
  if (temSeparacao(a)) {
    const musculosPrimarios = chaves(a.musculosPrimarios);
    return { musculosPrimarios, musculosSecundarios: limpar(chaves(a.musculosSecundarios), new Set(musculosPrimarios)) };
  }
  if (base) return { musculosPrimarios: base.musculosPrimarios.slice(), musculosSecundarios: base.musculosSecundarios.slice() };
  return { musculosPrimarios: chaves(a && a.musculos), musculosSecundarios: [] };
}
