// @ts-check
/**
 * CARD DE PRODUTO da vitrine — fonte única.
 *
 * Usado pela loja pública (`loja/loja.js`) e pela aba de Prévia do app de gestão
 * (`loja-gestao/`). A prévia só é honesta se for o MESMO código; duplicar o markup
 * faria as duas divergirem no primeiro ajuste. O CSS que acompanha é
 * `loja/vitrine.css` — os dois andam juntos.
 *
 * @typedef {Object} ProdutoVitrine
 * @property {string} id
 * @property {string} nome
 * @property {string} url
 * @property {string} categoria
 * @property {string} [subcategoria]
 * @property {number|null} preco
 * @property {string} imagem
 * @property {string} dica
 * @property {number} [verificadoEm]  carimbo do feed de preços; ausente = preço do catálogo
 */

import { rotuloVerificado } from './precos.js';

export const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Preço em reais. Sem preço válido devolve '' — o card então não mostra a linha. */
export const formatarPreco = (n) => (typeof n === 'number' && Number.isFinite(n))
  ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : '';

/** Ordem fixa das categorias na barra de filtros. */
export const CATEGORIAS = ['Suplementos', 'Equipamentos', 'Acessórios', 'Vestuário', 'Outros'];

/** Subcategorias por categoria — só quem está aqui ganha a segunda linha de filtros. */
export const SUBCATEGORIAS = {
  Suplementos: ['Creatinas', 'Vitaminas', 'Pré-treinos', 'Wheys'],
  'Vestuário': ['Feminino', 'Masculino', 'Unissex'],
};

/**
 * Um card.
 * @param {ProdutoVitrine} p
 * @param {{ inerte?: boolean }} [opcoes]  `inerte`: botão sem link (prévia do coach)
 * @returns {string}
 */
export function cardProduto(p, opcoes = {}) {
  const preco = formatarPreco(typeof p.preco === 'number' ? p.preco : null);
  // Sem carimbo do robô o preço é o que o coach digitou — e aí a legenda antiga
  // continua sendo a verdade sobre ele.
  const legenda = rotuloVerificado(p.verificadoEm) || 'preço de referência';
  const seta = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  // `sponsored` sinaliza link de afiliado (padrão de SEO); `noopener noreferrer`
  // impede que a loja de destino acesse a janela de origem.
  const acao = opcoes.inerte
    ? `<span class="btn-comprar">Ver na loja ${seta}</span>`
    : `<a class="btn-comprar" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer sponsored">Ver na loja ${seta}</a>`;

  return `
  <article class="produto">
    <div class="produto-foto${p.imagem ? '' : ' sem-foto'}">
      ${p.imagem
      ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy"
             onerror="this.closest('.produto-foto').classList.add('sem-foto');this.remove()" />`
      : ''}
      <span class="produto-sem">Foto indisponível</span>
    </div>
    <div class="produto-bd">
      <span class="badges">
        <span class="badge">${esc(p.categoria || 'Outros')}</span>
        ${p.subcategoria ? `<span class="badge badge-sub">${esc(p.subcategoria)}</span>` : ''}
      </span>
      <h2 class="produto-nome">${esc(p.nome)}</h2>
      ${preco ? `<div class="produto-preco">${esc(preco)}<small>${esc(legenda)}</small></div>` : ''}
      ${p.dica ? `<p class="produto-dica">${esc(p.dica)}</p>` : ''}
      ${acao}
    </div>
  </article>`;
}

/**
 * Grid completo (ou o estado vazio correspondente).
 * @param {ProdutoVitrine[]} itens  já filtrados
 * @param {number} total  total antes do filtro, p/ distinguir "loja vazia" de "busca sem resultado"
 * @param {{ inerte?: boolean, vazioHTML?: string }} [opcoes]
 */
export function gridVitrine(itens, total, opcoes = {}) {
  if (!total) {
    return opcoes.vazioHTML || `<p class="estado"><b>A vitrine ainda está sendo montada.</b><br>
      Volte em breve — ou fale com o coach para saber o que ele recomenda.</p>`;
  }
  if (!itens.length) return '<p class="estado">Nenhum produto encontrado. Tente outra busca ou toque em “Todos”.</p>';
  return `<div class="grid">${itens.map((p) => cardProduto(p, opcoes)).join('')}</div>`;
}

/** Filtro comum de busca + categoria + subcategoria. @param {ProdutoVitrine[]} produtos */
export function filtrar(produtos, busca, categoria, subcategoria) {
  const q = norm(busca);
  return produtos.filter((p) => {
    if (categoria && categoria !== 'todas' && (p.categoria || 'Outros') !== categoria) return false;
    if (subcategoria && subcategoria !== 'todas' && (p.subcategoria || '') !== subcategoria) return false;
    return !q || norm(p.nome).includes(q) || norm(p.dica).includes(q) || norm(p.categoria).includes(q);
  });
}

/** Chips de categoria, só as que têm produto. @param {ProdutoVitrine[]} produtos */
export function chipsCategoria(produtos, ativa) {
  const presentes = new Set(produtos.map((p) => p.categoria || 'Outros'));
  const cats = CATEGORIAS.filter((c) => presentes.has(c));
  if (cats.length < 2) return ''; // uma categoria só não precisa de filtro
  return ['todas', ...cats]
    .map((c) => `<button class="chip${ativa === c ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c === 'todas' ? 'Todos' : c)}</button>`)
    .join('');
}

/**
 * Chips de subcategoria da categoria ativa, só as que têm produto. Vazio quando a
 * categoria não tem subcategorias definidas, ou está em "todas".
 * @param {ProdutoVitrine[]} produtos  já filtrados pela categoria ativa
 */
export function chipsSubcategoria(produtos, categoriaAtiva, subAtiva) {
  const subs = SUBCATEGORIAS[categoriaAtiva];
  if (!subs) return '';
  const presentes = new Set(produtos.map((p) => p.subcategoria).filter(Boolean));
  const cats = subs.filter((s) => presentes.has(s));
  if (!cats.length) return '';
  return ['todas', ...cats]
    .map((s) => `<button class="chip chip-sub${subAtiva === s ? ' on' : ''}" data-sub="${esc(s)}" type="button">${esc(s === 'todas' ? 'Todos' : s)}</button>`)
    .join('');
}
