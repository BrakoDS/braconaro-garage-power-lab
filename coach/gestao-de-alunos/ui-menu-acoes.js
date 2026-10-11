// @ts-check
/**
 * O menu ⋯ do cabeçalho da ficha (padrão WAI-ARIA de menu de botão).
 *
 * Abre e fecha no botão; fecha no clique fora, no Esc (devolvendo o foco ao
 * botão) e ao escolher um item. Setas, Home e End andam pelos itens.
 *
 * Ligado por DELEGAÇÃO no contêiner do cabeçalho: o cabeçalho é redesenhado
 * a cada 'alunos-mudaram', e um ouvinte preso ao botão antigo morreria junto.
 * Quem decide o que cada item faz é quem chama (`aoEscolher`).
 *
 * Marcação esperada (ver `htmlCabecalho` em ui-perfil.js):
 *   <button data-menu-botao aria-haspopup="menu" aria-expanded="false" aria-controls="X">
 *   <div id="X" role="menu" hidden> <button role="menuitem" data-acao="…"> … </div>
 */

/** @param {Element} raiz */
const botaoDe = (raiz) => /** @type {HTMLElement|null} */ (raiz.querySelector('[data-menu-botao]'));
/** @param {Element} raiz */
const listaDe = (raiz) => {
  const b = botaoDe(raiz);
  const id = b?.getAttribute('aria-controls');
  return id ? /** @type {HTMLElement|null} */ (raiz.querySelector('#' + id)) : null;
};
/** Os itens que dá para escolher agora (um item escondido pelo CSS fica de fora). @param {HTMLElement} lista */
const itensDe = (lista) => /** @type {HTMLElement[]} */ ([...lista.querySelectorAll('[role="menuitem"]:not([disabled])')])
  .filter((i) => i.getClientRects().length > 0);

/** O menu está aberto? @param {Element} raiz */
export function menuAberto(raiz) {
  return botaoDe(raiz)?.getAttribute('aria-expanded') === 'true';
}

/**
 * Abre ou fecha o menu.
 * @param {Element} raiz @param {boolean} abrir
 * @param {{ foco?: 'primeiro'|'ultimo'|'botao'|null }} [o] para onde vai o foco
 */
export function alternarMenu(raiz, abrir, o = {}) {
  const b = botaoDe(raiz), lista = listaDe(raiz);
  if (!b || !lista) return;
  b.setAttribute('aria-expanded', String(abrir));
  lista.hidden = !abrir;
  const itens = itensDe(lista);
  if (abrir && o.foco === 'primeiro') itens[0]?.focus();
  else if (abrir && o.foco === 'ultimo') itens[itens.length - 1]?.focus();
  else if (!abrir && o.foco === 'botao') b.focus();
}

/**
 * Liga o menu dentro de `raiz`. Chamar uma vez.
 * @param {HTMLElement} raiz o contêiner (redesenhável) do cabeçalho
 * @param {(acao: string, item: HTMLElement) => void} aoEscolher
 */
export function ligarMenu(raiz, aoEscolher) {
  raiz.addEventListener('click', (e) => {
    const alvo = /** @type {HTMLElement} */ (e.target);
    if (alvo.closest('[data-menu-botao]')) {
      // Abrir pelo clique leva o foco ao primeiro item só no teclado
      // (detail === 0); no toque, o foco num item mostraria o contorno à toa.
      alternarMenu(raiz, !menuAberto(raiz), { foco: /** @type {MouseEvent} */ (e).detail === 0 ? 'primeiro' : null });
      return;
    }
    const item = /** @type {HTMLElement|null} */ (alvo.closest('[role="menuitem"]'));
    if (item && item.dataset.acao) {
      alternarMenu(raiz, false, { foco: null });
      aoEscolher(item.dataset.acao, item);
    }
  });

  raiz.addEventListener('keydown', (e) => {
    const lista = listaDe(raiz);
    if (!lista) return;
    const noBotao = !!/** @type {HTMLElement} */ (e.target).closest?.('[data-menu-botao]');
    if (noBotao && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      alternarMenu(raiz, true, { foco: e.key === 'ArrowDown' ? 'primeiro' : 'ultimo' });
      return;
    }
    if (!menuAberto(raiz)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); alternarMenu(raiz, false, { foco: 'botao' }); return; }
    if (e.key === 'Tab') { alternarMenu(raiz, false); return; }
    const itens = itensDe(lista);
    const i = itens.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const prox = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: itens.length - 1 }[e.key];
    if (prox === undefined || !itens.length) return;
    e.preventDefault();
    itens[(prox + itens.length) % itens.length].focus();
  });

  // Clique fora fecha. (O DOM de mentira dos testes não tem addEventListener no document.)
  document.addEventListener?.('click', (e) => {
    if (menuAberto(raiz) && !raiz.contains(/** @type {Node} */ (e.target))) alternarMenu(raiz, false);
  });
}
