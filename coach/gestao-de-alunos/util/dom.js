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

/**
 * Fechar qualquer modal: clique no fundo escuro, num botão com `data-close`, ou
 * Esc. Chamar uma vez, depois que a marcação dos modais existe.
 */
export function iniciarModais() {
  $$('.modal-bg').forEach((bg) => {
    bg.addEventListener('click', (/** @type {any} */ e) => { if (e.target === bg || e.target.closest('[data-close]')) bg.classList.remove('open'); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal-bg.open').forEach((m) => m.classList.remove('open')); });
}
