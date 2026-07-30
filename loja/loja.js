// @ts-check
/**
 * VITRINE PÚBLICA da Garage Store.
 *
 * Lê `lojaPortal/atual` — doc de leitura pública, publicado pelo coach na aba Loja
 * da Academia. Sem login: a página abre para qualquer visitante, então nada aqui
 * depende de sessão. O catálogo do coach (academia/{uid}) NÃO é acessível daqui, e
 * é assim que tem que ser.
 */
import { carregarLoja } from '../academia/loja-portal.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const formatarPreco = (n) => (typeof n === 'number' && Number.isFinite(n))
  ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';

/** @type {any[]} */ let PRODUTOS = [];
let busca = '';
let categoria = 'todas';

/** Só as categorias que têm produto — filtro vazio é ruído. */
function categoriasEmUso() {
  const ordem = ['Suplementos', 'Equipamentos', 'Acessórios', 'Vestuário', 'Outros'];
  const presentes = new Set(PRODUTOS.map((p) => p.categoria || 'Outros'));
  return ordem.filter((c) => presentes.has(c));
}

function renderFiltros() {
  const cats = categoriasEmUso();
  if (cats.length < 2) { $('#filtros').innerHTML = ''; return; } // 1 categoria não precisa de filtro
  $('#filtros').innerHTML = ['todas', ...cats].map((c) => {
    const rot = c === 'todas' ? 'Todos' : c;
    return `<button class="chip${categoria === c ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(rot)}</button>`;
  }).join('');
}

function filtrados() {
  const q = norm(busca);
  return PRODUTOS.filter((p) => {
    if (categoria !== 'todas' && (p.categoria || 'Outros') !== categoria) return false;
    return !q || norm(p.nome).includes(q) || norm(p.dica).includes(q) || norm(p.categoria).includes(q);
  });
}

function renderGrid() {
  const itens = filtrados();
  if (!PRODUTOS.length) {
    $('#saida').innerHTML = `<p class="estado"><b>A vitrine ainda está sendo montada.</b><br>
      Volte em breve — ou fale com o coach para saber o que ele recomenda.</p>`;
    return;
  }
  if (!itens.length) {
    $('#saida').innerHTML = '<p class="estado">Nenhum produto encontrado. Tente outra busca ou toque em “Todos”.</p>';
    return;
  }
  $('#saida').innerHTML = `<div class="grid">${itens.map(card).join('')}</div>`;
}

function card(p) {
  const preco = formatarPreco(typeof p.preco === 'number' ? p.preco : null);
  return `
  <article class="produto">
    <div class="produto-foto">
      ${p.imagem
        ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy"
             onerror="this.closest('.produto-foto').classList.add('sem-foto');this.remove()" />`
        : ''}
      <span class="produto-sem">Foto indisponível</span>
    </div>
    <div class="produto-bd">
      <span class="badge">${esc(p.categoria || 'Outros')}</span>
      <h2 class="produto-nome">${esc(p.nome)}</h2>
      ${preco ? `<div class="produto-preco">${esc(preco)}<small>preço de referência</small></div>` : ''}
      ${p.dica ? `<p class="produto-dica">${esc(p.dica)}</p>` : ''}
      <a class="btn-comprar" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer sponsored">
        Ver na loja
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </a>
    </div>
  </article>`;
}

$('#busca').addEventListener('input', (e) => { busca = /** @type {HTMLInputElement} */ (e.target).value; renderGrid(); });
$('#filtros').addEventListener('click', (e) => {
  const c = /** @type {HTMLElement} */ (e.target).closest('.chip');
  if (!c) return;
  categoria = /** @type {HTMLElement} */ (c).dataset.cat;
  renderFiltros(); renderGrid();
});

(async () => {
  try {
    PRODUTOS = await carregarLoja();
  } catch {
    PRODUTOS = [];
  }
  renderFiltros();
  renderGrid();
})();
