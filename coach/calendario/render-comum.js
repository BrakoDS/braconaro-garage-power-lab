// @ts-check
/** Pedaços de HTML que as três visões e o painel usam. Puro. */

/** @param {unknown} s */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/** @param {string} nome */
const partes = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean);

/** 'Bruno Reis' → 'BR'. @param {string} nome */
export function iniciais(nome) {
  const p = partes(nome);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

/** A foto da ficha (só https) ou as iniciais. @param {any} aluno */
export function avatar(aluno) {
  const url = String((aluno && aluno.fotoUrl) || '');
  return /^https:\/\//.test(url)
    ? `<img class="av" src="${esc(url)}" alt="" loading="lazy" />`
    : `<span class="av">${esc(iniciais(aluno && aluno.nome))}</span>`;
}

/** Primeiro nome; dois iguais na mesma turma ganham a inicial do sobrenome. @param {string[]} nomes */
export function nomesCurtos(nomes) {
  const primeiro = nomes.map((n) => partes(n)[0] || '—');
  return nomes.map((n, i) => {
    if (primeiro.filter((x) => x === primeiro[i]).length < 2) return primeiro[i];
    const p = partes(n);
    return p.length > 1 ? `${primeiro[i]} ${p[p.length - 1][0]}.` : primeiro[i];
  });
}

export const ROTULO_DECISAO = Object.freeze({ fechado: 'não abriu', aberto: 'abriu', decidir: 'decidir' });

/** O chip de um item do dia (feriado, aniversário, reavaliação, ou de uma camada futura). @param {any} it */
export function chipDoDia(it) {
  if (it.tipo === 'feriado') {
    const rot = /** @type {Record<string, string>} */ (ROTULO_DECISAO)[it.dados.decisao] || '';
    return `<button class="chip c-fer${it.dados.decisao === 'fechado' ? ' fechado' : ''}" type="button" data-acao="feriado" data-iso="${esc(it.data)}" title="${esc(it.dados.nome)} — o box abriu?">${esc(it.titulo)} · <b>${esc(rot)}</b></button>`;
  }
  if (it.tipo === 'aniversario') return `<span class="chip c-aniv" title="Aniversário">🎂 ${esc(it.titulo)}</span>`;
  if (it.tipo === 'reavaliacao') return `<span class="chip c-reav" title="Reavaliação">📏 ${esc(it.titulo)}</span>`;
  return `<span class="chip">${esc(it.titulo)}</span>`;
}

/** Há quanto tempo, em português curto. @param {number} ms */
export function tempoDesde(ms) {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}
