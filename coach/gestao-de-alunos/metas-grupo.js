// @ts-check
/**
 * Os dois tipos de "meta" da ficha, cada um no seu campo.
 *
 *   metas       [{ id, tipo, alvo, base, baseData, criadoEm }]  metas CORPORAIS
 *               (peso, % de gordura, cintura) — a aba Progresso grava, o
 *               Portal e o app mostram a barra de progresso;
 *   metasGrupo  { perna: 20, ... }  séries por semana de um grupo muscular —
 *               o Montador Individual lê (`metasDoAluno`), o Portal recebe como
 *               `metasGrupo` e monta o treino individual do aluno.
 *
 * Os dois moravam no MESMO campo `metas`: primeiro como mapa por grupo (o
 * Montador Individual), depois a aba Progresso passou a gravar ali a lista de
 * metas corporais. O `portal-sync` publicava `metasGrupo: a.metas` — a lista
 * corporal saía como meta por grupo. Não quebrava porque os leitores descartam
 * lista, mas era questão de tempo.
 *
 * Ficha antiga que ainda tem o mapa por grupo em `metas` continua valendo: ele
 * é lido como meta por grupo até a primeira gravação de meta corporal, que o
 * muda para `metasGrupo` (ver `patchDeMetas`). Nada é renomeado no banco à
 * força — uma aba aberta com o código antigo não teria como desfazer.
 *
 * Puro: sem DOM, sem banco.
 */

/** Objeto comum (não lista, não null). @param {unknown} v @returns {v is Record<string, any>} */
const ehMapa = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * As metas por grupo muscular do aluno: `metasGrupo`, ou o mapa antigo em `metas`.
 * @param {any} a a ficha
 * @returns {Record<string, any>}
 */
export function metasGrupoDe(a) {
  if (ehMapa(a?.metasGrupo)) return a.metasGrupo;
  if (ehMapa(a?.metas)) return a.metas;
  return {};
}

/**
 * As metas corporais do aluno (sempre uma lista; o mapa antigo por grupo não é meta corporal).
 * @param {any} a a ficha
 * @returns {any[]}
 */
export function metasCorporaisDe(a) {
  return Array.isArray(a?.metas) ? a.metas : [];
}

/**
 * O que gravar quando a lista de metas corporais muda. Se a ficha ainda guarda
 * o mapa antigo por grupo em `metas`, ele vai para `metasGrupo` na mesma
 * gravação — senão a lista nova o apagaria.
 * @param {any} a a ficha @param {any[]} lista as metas corporais novas
 * @returns {{ metas: any[], metasGrupo?: Record<string, any> }}
 */
export function patchDeMetas(a, lista) {
  /** @type {{ metas: any[], metasGrupo?: Record<string, any> }} */
  const patch = { metas: lista };
  if (ehMapa(a?.metas) && !ehMapa(a?.metasGrupo)) patch.metasGrupo = a.metas;
  return patch;
}
