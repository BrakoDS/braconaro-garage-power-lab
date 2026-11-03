// @ts-check
/**
 * A agenda do box: a próxima reavaliação de cada aluno e o que cai em cada dia
 * do mês (reavaliações e aniversários). Puro — sem DOM, sem rede.
 *
 * Nasceu na Agenda da Gestão (ui-tela-agenda.js), que deu lugar ao Calendário
 * (coach/calendario/). O painel do hub (coach/coach.js) e as camadas do
 * Calendário leem daqui.
 */

/**
 * @typedef {{ tipo: 'reav'|'aniv', nome: string, alunoId: string, idade?: number }} EventoAgenda
 *   idade: a que o aluno FAZ no ano pedido (só no aniversário).
 */

/** A próxima reavaliação (a `dataProxima` da avaliação mais recente), ou null. @param {any} a @returns {string|null} */
export function proxReav(a) {
  const avs = ((a && a.avaliacoes) || []).filter((/** @type {any} */ x) => x.dataRealizada);
  if (!avs.length) return null;
  const ult = avs.reduce((/** @type {any} */ m, /** @type {any} */ x) => (x.dataRealizada > m.dataRealizada ? x : m), avs[0]);
  return ult.dataProxima || null;
}

/**
 * O que cai em cada dia do mês: a próxima reavaliação (só no mês dela) e o
 * aniversário (todo ano). Aluno inativo fica de fora.
 * @param {any[]} alunos @param {number} ano @param {number} mes 1–12
 * @returns {Record<number, EventoAgenda[]>}
 */
export function eventosDoMes(alunos, ano, mes) {
  /** @type {Record<number, EventoAgenda[]>} */
  const evs = {};
  const add = (/** @type {number} */ dia, /** @type {EventoAgenda} */ ev) => { (evs[dia] = evs[dia] || []).push(ev); };
  for (const a of alunos.filter((x) => (x.status || 'ativo') !== 'inativo')) {
    const alunoId = String(a.id ?? '');
    const prox = proxReav(a);
    if (prox) {
      const [pa, pm, pd] = prox.split('-').map(Number);
      if (pa === ano && pm === mes) add(pd, { tipo: 'reav', nome: a.nome, alunoId });
    }
    if (a.nascimento) {
      const [na, nm, nd] = String(a.nascimento).split('-').map(Number);
      if (nm === mes) add(nd, { tipo: 'aniv', nome: a.nome, alunoId, idade: ano - na });
    }
  }
  return evs;
}
