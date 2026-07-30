// @ts-check
/**
 * VITRINE PÚBLICA da Garage Store.
 *
 * Lê `lojaPortal/atual` — doc de leitura pública, publicado pelo app de gestão
 * (`loja-gestao/`). Esta página é SÓ vitrine: sem login, sem admin, sem a camada de
 * dados da Academia. Quem abre a loja baixa isto e mais nada.
 *
 * O card e os filtros vêm de `vitrine-card.js`, o mesmo módulo que a aba de Prévia
 * do coach usa — é o que garante que a prévia dele seja fiel a esta tela.
 */
import { carregarLoja } from './loja-portal.js';
import { gridVitrine, filtrar, chipsCategoria } from './vitrine-card.js';

const $ = (s) => document.querySelector(s);

/** @type {any[]} */ let PRODUTOS = [];
let busca = '';
let categoria = 'todas';

function render() {
  $('#filtros').innerHTML = chipsCategoria(PRODUTOS, categoria);
  $('#saida').innerHTML = gridVitrine(filtrar(PRODUTOS, busca, categoria), PRODUTOS.length);
}

$('#busca').addEventListener('input', (e) => {
  busca = /** @type {HTMLInputElement} */ (e.target).value;
  render();
});

$('#filtros').addEventListener('click', (e) => {
  const c = /** @type {HTMLElement} */ (e.target).closest('.chip');
  if (!c) return;
  categoria = /** @type {HTMLElement} */ (c).dataset.cat;
  render();
});

(async () => {
  try {
    PRODUTOS = await carregarLoja();
  } catch {
    PRODUTOS = [];
  }
  render();
})();
