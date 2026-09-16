// @ts-check
/**
 * TREINOS POR MÊS — a parte pura de como o histórico é dividido na nuvem.
 *
 * O documento `coaches/{uid}` guardava tudo: alunos, config, todos os treinos e
 * os `programas` do formato semanal antigo. Em 15/09/2026 eram 164 KB, com o teto
 * do Firestore em 1 MB por documento, e cada salvamento reescrevia o conjunto
 * inteiro para mudar uma carga. Passando do teto, o `setDoc` falha e o coach não
 * vê erro na tela — perde trabalho achando que salvou.
 *
 * Divisão: `coaches/{uid}/treinos/{YYYY-MM}` guarda o mês; o documento do coach
 * fica só com alunos e config. Um mês cheio fica perto de 70 KB.
 *
 * Aqui mora só a regra — agrupar, fundir, decidir o que mudou. Quem fala com o
 * Firestore é `cloud.js`. Assim a parte que erra caro é testável sem rede.
 */

/** Mês ('YYYY-MM') de um dateId ('YYYY-MM-DD'). @param {string} dateId */
export function mesDe(dateId) { return String(dateId).slice(0, 7); }

/**
 * JSON com as chaves em ordem, para comparar dois estados por texto. O objeto do
 * store muda de ordem conforme as edições, e sem isso um mês intocado pareceria
 * diferente a cada salvamento — reenviando o que não mudou.
 * @param {any} v
 * @returns {string}
 */
export function assinatura(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(assinatura).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${assinatura(v[k])}`).join(',')}}`;
}

/**
 * Agrupa `{ dateId: treino }` em `{ mesId: { dateId: treino } }`.
 * @param {Record<string, any>} treinos
 * @returns {Record<string, Record<string, any>>}
 */
export function agruparPorMes(treinos) {
  /** @type {Record<string, Record<string, any>>} */
  const meses = {};
  for (const [dateId, t] of Object.entries(treinos || {})) {
    const m = mesDe(dateId);
    (meses[m] || (meses[m] = {}))[dateId] = t;
  }
  return meses;
}

/**
 * Achata `{ mesId: { dateId: treino } }` de volta num mapa por data.
 * @param {Record<string, Record<string, any>>} meses
 * @returns {Record<string, any>}
 */
export function juntarMeses(meses) {
  /** @type {Record<string, any>} */
  const treinos = {};
  for (const mes of Object.keys(meses || {}).sort()) Object.assign(treinos, meses[mes]);
  return treinos;
}

/**
 * O documento do coach ainda carrega o formato antigo?
 *
 * Não é pergunta de uma vez só: uma aba velha, num navegador que ainda não pegou
 * o código novo, regrava `treinos` lá dentro depois de a migração ter rodado. Todo
 * login pergunta de novo.
 * @param {any} base  dados de `coaches/{uid}`
 */
export function precisaMigrar(base) {
  if (!base) return false;
  return !!(Object.keys(base.treinos || {}).length || Object.keys(base.programas || {}).length);
}

/**
 * Funde o que veio dos meses com o que sobrou no documento do coach. O legado
 * ganha: quem escreveu lá foi a aba velha, e foi a última a mexer no documento
 * que ela conhece — descartá-lo apagaria o treino que o coach acabou de salvar nela.
 * @param {Record<string, any>} dosMeses
 * @param {Record<string, any>} doLegado
 */
export function fundirTreinos(dosMeses, doLegado) {
  return { ...(dosMeses || {}), ...(doLegado || {}) };
}

/** O que fica no documento do coach. @param {any} est estado do store */
export function fatiaDoCoach(est) {
  return { alunos: est?.alunos || [], config: est?.config || {} };
}

/**
 * Meses a reenviar: os que mudaram e os que sumiram (apagar o último treino de um
 * mês tem que esvaziar o documento dele, senão o treino volta no próximo login).
 * @param {Record<string, Record<string, any>>} antes   meses como a nuvem tem
 * @param {Record<string, Record<string, any>>} agora   meses do estado atual
 * @returns {string[]} mesIds em ordem
 */
export function mesesQueMudaram(antes, agora) {
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(agora || {})]);
  return [...chaves]
    .filter((m) => assinatura((antes || {})[m] || {}) !== assinatura((agora || {})[m] || {}))
    .sort();
}
