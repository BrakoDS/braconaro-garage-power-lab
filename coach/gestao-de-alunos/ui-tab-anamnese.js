// @ts-check
/**
 * Aba Anamnese do perfil — treino e rotina, hábitos, saúde e objetivo.
 *
 * Saiu do `app.js` no fatiamento. Os campos (nome, rótulo, opções) moram em
 * `saude.js`, que o PDF da ficha e a linha da aba Registros também leem.
 *
 * Quem desenha e grava é o salvar global (ui-salvar-global.js): a aba se
 * desenha toda vez que abre, a partir da ficha com o rascunho por cima — o que
 * o coach digitou e ainda não salvou continua lá —, e o que mudou vai para a
 * gravação única da ficha, com o log "Anamnese editada · …".
 */
import { esc, opt } from './util/formato.js?v=16';
import { $ } from './util/dom.js?v=16';
import { ANAMNESE_SECOES } from './saude.js?v=16';
import { registrarFormulario, comPrefixo } from './ui-salvar-global.js?v=16';

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

/** Desenha a aba com a ficha recebida (no app, a ficha com o rascunho por cima). @param {any} a */
function renderAnamnese(a) {
  const painel = $('#tab-anamnese'); if (!painel) return;
  painel.innerHTML = htmlAnamnese(a);
}

/** Liga a aba ao salvar global. Chamar uma vez, antes do resto do app (depois de `iniciarSalvarGlobal`). */
export function iniciarTabAnamnese() {
  registrarFormulario({
    aba: 'anamnese',
    desenhar: renderAnamnese,
    ler: () => { const form = $('#form-anamnese'); return form ? comPrefixo('anamnese', lerAnamnese(form)) : null; },
  });
}
