// @ts-check
/**
 * DIÁLOGO MODAL do Montador — um único overlay reaproveitado.
 *
 * Substitui o `confirm()` do navegador (caixa do sistema, fora do tema) e o painel
 * inline de detalhes do histórico. Ambos viram o mesmo overlay, com as mesmas cores
 * e o mesmo comportamento de fechar (× · fundo · Esc).
 *
 * As duas funções devolvem Promise, então quem chama espera a resposta:
 *   if (!(await confirmar({ ... }))) return;
 *   const acao = await painel({ ..., acoes: [{ id: 'excluir', ... }] });
 */

const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));

/** @type {((v:any) => void) | null} */
let _resolver = null;

/** Fecha o modal devolvendo `valor` a quem estava esperando. */
function fechar(valor) {
  const bg = $('#modal-app');
  if (!bg || bg.hidden) return;
  bg.hidden = true;
  document.body.style.overflow = '';
  const r = _resolver;
  _resolver = null;
  if (r) r(valor);
}

let _ligado = false;
/** Liga os fechamentos (× · clique no fundo · Esc). Idempotente. */
function ligarFechamentos() {
  if (_ligado) return;
  _ligado = true;
  const bg = $('#modal-app');
  bg.addEventListener('click', (ev) => {
    const alvo = /** @type {HTMLElement} */ (ev.target);
    // fundo ou botão de fechar → mesmo resultado de cancelar
    if (alvo === bg || alvo.closest('[data-fechar]')) { fechar(null); return; }
    const acao = alvo.closest('[data-acao]');
    if (acao) fechar(/** @type {HTMLElement} */ (acao).dataset.acao);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fechar(null); });
}

/**
 * @param {{titulo: string, corpoHTML: string, acoesHTML: string, largo?: boolean}} o
 * @returns {Promise<any>}
 */
function abrir({ titulo, corpoHTML, acoesHTML, largo = false }) {
  ligarFechamentos();
  fechar(null); // se já houver um aberto, resolve o anterior antes de reusar o elemento
  $('#modal-app-titulo').textContent = titulo;
  $('#modal-app-corpo').innerHTML = corpoHTML;
  $('#modal-app-acoes').innerHTML = acoesHTML;
  $('#modal-app').querySelector('.modal').classList.toggle('largo', largo);
  $('#modal-app').hidden = false;
  document.body.style.overflow = 'hidden'; // trava o scroll do fundo
  /** @type {HTMLElement|null} */ (($('#modal-app-acoes').querySelector('.btn')))?.focus();
  return new Promise((resolve) => { _resolver = resolve; });
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Confirmação em modal. Resolve `true` só no botão de confirmar — fundo, × e Esc
 * resolvem `false`, que é o padrão seguro para uma ação destrutiva.
 * @param {{titulo: string, texto: string, ok?: string, cancelar?: string, perigo?: boolean}} o
 * @returns {Promise<boolean>}
 */
export async function confirmar({ titulo, texto, ok = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
  const r = await abrir({
    titulo,
    corpoHTML: `<p class="dlg-texto">${texto}</p>`,
    acoesHTML: `<button class="btn ghost" data-fechar type="button">${esc(cancelar)}</button>
      <button class="btn${perigo ? ' danger' : ''}" data-acao="ok" type="button">${esc(ok)}</button>`,
  });
  return r === 'ok';
}

/**
 * Painel de conteúdo com botões de ação. Resolve com o `id` da ação clicada, ou
 * `null` se foi fechado sem escolher.
 * @param {{titulo: string, corpoHTML: string, acoes?: {id: string, label: string, perigo?: boolean}[], largo?: boolean}} o
 * @returns {Promise<string|null>}
 */
export function painel({ titulo, corpoHTML, acoes = [], largo = true }) {
  const botoes = acoes
    .map((a) => `<button class="btn${a.perigo ? ' danger' : ''}" data-acao="${esc(a.id)}" type="button">${esc(a.label)}</button>`)
    .join('');
  return abrir({
    titulo,
    corpoHTML,
    acoesHTML: `<button class="btn ghost" data-fechar type="button">Fechar</button>${botoes}`,
    largo,
  });
}
