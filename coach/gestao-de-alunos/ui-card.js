// @ts-check
/**
 * A moldura dos cards da Ficha do Aluno: título, ações no canto e corpo.
 *
 * Os cards abrem em MODO LEITURA. Mexer num dado pede um toque no ✎ (Editar),
 * que troca o corpo pelo formulário; "Pronto" volta à leitura. É de propósito:
 * o coach usa a ficha no celular, no meio da aula, e um esbarrão num campo
 * aberto mudaria dado sem querer. Quem guarda o que foi editado é o salvar
 * global (ui-salvar-global.js) — "Pronto" não grava, só fecha o card.
 *
 * Puro: só monta HTML.
 */
import { esc } from './util/formato.js?v=17';

/**
 * Um card.
 * @param {{ id: string, titulo: string, corpo: string, acoes?: string, classe?: string }} o
 *   id: o nome do card (vira `#card-<id>`); acoes: os botões do canto
 */
export function htmlCard({ id, titulo, corpo, acoes = '', classe = '' }) {
  return `
    <section class="card${classe ? ' ' + classe : ''}" id="card-${esc(id)}" aria-labelledby="card-${esc(id)}-t">
      <header class="card-hd">
        <h2 class="card-t" id="card-${esc(id)}-t">${esc(titulo)}</h2>
        ${acoes ? `<div class="card-acoes">${acoes}</div>` : ''}
      </header>
      <div class="card-bd">${corpo}</div>
    </section>`;
}

/**
 * O botão do canto: ✎ Editar (modo leitura) ou ✓ Pronto (editando).
 * @param {string} card o id do card @param {string} nome o que se edita ("contato e cadastro")
 * @param {boolean} editando
 */
export function botaoEditar(card, nome, editando) {
  return editando
    ? `<button class="card-btn pronto" type="button" data-card="${esc(card)}" data-modo="ver" aria-label="Terminar de editar ${esc(nome)}">✓ Pronto</button>`
    : `<button class="card-btn" type="button" data-card="${esc(card)}" data-modo="editar" aria-label="Editar ${esc(nome)}">✎ Editar</button>`;
}

/**
 * Linhas "rótulo: valor" do modo leitura. Valor vazio aparece como "—"
 * esmaecido, para o coach ver que falta, em vez de a linha sumir.
 * @param {[string, string][]} pares [rótulo, valor já em HTML]
 */
export function htmlLinhas(pares) {
  return `<dl class="card-dl">${pares.map(([r, v]) => `
      <div class="card-linha"><dt>${esc(r)}</dt><dd>${v === '' || v == null ? '<span class="card-vazio">—</span>' : v}</dd></div>`).join('')}
    </dl>`;
}
