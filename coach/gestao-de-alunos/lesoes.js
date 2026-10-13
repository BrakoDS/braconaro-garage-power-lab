// @ts-check
/**
 * As lesões do aluno na ficha — a ÚNICA fonte de "lesão ativa"
 * (`matrizIndividualizacao.adaptacoes.lesoes`, que o Motor e o alerta médico
 * leem). Editadas no card "Alerta médico e lesões" da aba Saúde; a Matriz só
 * as mostra.
 *
 * Puro: a linha do editor, a limpeza (a MESMA do Motor, via `matrizDe`) e o
 * texto de uma lesão.
 */
import { esc, fmtData } from './util/formato.js?v=20';
import { CAMPO, matrizDe, rotulo, REGIOES_LESAO, GRAVIDADES } from '../../compartilhado/regras/matriz-individualizacao.js?v=20';

/** O caminho das lesões na ficha (para o rascunho do salvar global). */
export const CAMINHO_LESOES = `${CAMPO}.adaptacoes.lesoes`;

/** As opções de um <select>. @param {string[][]} lista @param {string} atual @param {string} [vazio] */
const opcoes = (lista, atual, vazio = '—') =>
  (vazio ? `<option value="">${esc(vazio)}</option>` : '') +
  lista.map(([v, r]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(r)}</option>`).join('');

/**
 * Uma linha do editor de lesões.
 * @param {{ regiao?: string, gravidade?: string, desde?: string, obs?: string }} [l]
 */
export function linhaLesao(l = {}) {
  return `
  <div class="mtz-lesao" data-lesao>
    <select data-campo="regiao" aria-label="Região da lesão">${opcoes(REGIOES_LESAO, l.regiao || '', 'Região…')}</select>
    <select data-campo="gravidade" aria-label="Gravidade">${opcoes(GRAVIDADES, l.gravidade || 'leve', '')}</select>
    <input type="date" data-campo="desde" value="${esc(l.desde || '')}" aria-label="Desde quando" />
    <input type="text" data-campo="obs" value="${esc(l.obs || '')}" placeholder="Observação (ex.: menisco)" aria-label="Observação" />
    <button class="btn danger btn-sm" type="button" data-remover-lesao aria-label="Remover lesão">✕</button>
  </div>`;
}

/**
 * As lesões como o Motor as entende: região fora da lista some (linha ainda sem
 * região não é lesão), gravidade desconhecida vira leve, texto aparado.
 * @param {any[]} lista
 * @returns {{ regiao: string, gravidade: string, desde: string, obs: string }[]}
 */
export function normalizarLesoes(lista) {
  return matrizDe({ [CAMPO]: { adaptacoes: { lesoes: Array.isArray(lista) ? lista : [] } } }).adaptacoes.lesoes;
}

/** As lesões ativas da ficha, já limpas. @param {any} a */
export function lesoesDe(a) {
  return matrizDe(a).adaptacoes.lesoes;
}

/** "Joelho · severa · desde 01/08/2026 · menisco" @param {{ regiao: string, gravidade: string, desde?: string, obs?: string }} l */
export function descreverLesao(l) {
  return [
    rotulo(REGIOES_LESAO, l.regiao),
    (rotulo(GRAVIDADES, l.gravidade) || '').toLowerCase(),
    l.desde ? `desde ${fmtData(l.desde)}` : '',
    l.obs || '',
  ].filter(Boolean).join(' · ');
}

/** As linhas do editor lidas do formulário (cruas; `normalizarLesoes` limpa). @param {ParentNode} raiz */
export function lerLinhasDeLesao(raiz) {
  return [...raiz.querySelectorAll('[data-lesao]')].map((el) => ({
    regiao: /** @type {any} */ (el.querySelector('[data-campo=regiao]'))?.value || '',
    gravidade: /** @type {any} */ (el.querySelector('[data-campo=gravidade]'))?.value || '',
    desde: /** @type {any} */ (el.querySelector('[data-campo=desde]'))?.value || '',
    obs: /** @type {any} */ (el.querySelector('[data-campo=obs]'))?.value || '',
  }));
}
