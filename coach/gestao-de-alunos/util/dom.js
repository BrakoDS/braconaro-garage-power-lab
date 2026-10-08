// @ts-check
/**
 * Atalhos de DOM das telas da Gestão. Só funções — nada roda ao importar.
 */

/** @param {string} s @param {ParentNode} [r] @returns {any} */
export const $ = (s, r = document) => r.querySelector(s);
/** @param {string} s @param {ParentNode} [r] @returns {any[]} */
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Abre o modal `#id` (o fundo `.modal-bg`). @param {string} id */
export function abrirModal(id) { $('#' + id)?.classList.add('open'); }
/** Fecha o modal `#id`. @param {string} id */
export function fecharModal(id) { $('#' + id)?.classList.remove('open'); }
