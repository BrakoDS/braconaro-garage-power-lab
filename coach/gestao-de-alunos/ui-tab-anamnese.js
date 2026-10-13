// @ts-check
/**
 * O formulário da Anamnese — treino e rotina, hábitos, saúde e objetivo.
 *
 * Era uma aba; hoje é uma seção do card Formulários da aba Saúde
 * (ui-tab-saude.js), que o desenha (em leitura ou, no ✎, este formulário) e o
 * lê para o salvar global. Os campos (nome, rótulo, opções) moram em
 * `saude.js`, que o PDF da ficha e a linha da aba Registros também leem.
 */
import { esc, opt } from './util/formato.js?v=18';
import { ANAMNESE_SECOES } from './saude.js?v=18';

/** @param {string[]} arr @param {string} [atual] */
function optsSelect(arr, atual) { return `<option value="">—</option>` + arr.map((s) => opt(s, atual)).join(''); }

/** Um campo do formulário. @param {import('./saude.js').CampoAnamnese} c @param {any} an */
function campoHTML(c, an) {
  const v = an[c.k];
  if (c.tipo === 'select') return `<div class="field"><label>${c.rotulo}</label><select name="${c.k}">${optsSelect(c.opcoes || [], v)}</select></div>`;
  if (c.tipo === 'area') return `<div class="field full"><label>${c.rotulo}</label><textarea name="${c.k}">${esc(v)}</textarea></div>`;
  if (c.tipo === 'numero') return `<div class="field"><label>${c.rotulo}</label><input name="${c.k}" type="number" step="any" value="${esc(v)}" /></div>`;
  return `<div class="field"><label>${c.rotulo}</label><input name="${c.k}" value="${esc(v)}" /></div>`;
}

/** O formulário da aba (sem os eventos). @param {any} a */
export function htmlAnamnese(a) {
  const an = (a && a.anamnese) || {};
  const secoes = ANAMNESE_SECOES.map(([titulo, campos]) => `
      <div class="form-sec"><h3>${titulo}</h3><div class="grid-form">
        ${campos.map((c) => campoHTML(c, an)).join('\n        ')}
      </div></div>`).join('');
  return `
    <form id="form-anamnese">${secoes}
    </form>`;
}

/** Lê o formulário para o objeto gravado em `anamnese`. @param {HTMLFormElement} form */
export function lerAnamnese(form) {
  /** @type {Record<string, any>} */ const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}
