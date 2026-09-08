// @ts-check
/**
 * DIÁLOGO MODAL — um único overlay reaproveitado por TODAS as telas do coach.
 *
 * Substitui `confirm()` e `alert()` do navegador. Não é questão de estética: o
 * Chrome deixa o usuário SUPRIMIR diálogos nativos ("impedir esta página de criar
 * diálogos"), e a partir daí `confirm()` responde `false` sozinho, sem mostrar
 * nada. O código lê isso como "o coach cancelou" e não faz nada — foi exatamente
 * assim que a exclusão de exercícios da Academia parou de funcionar, sem erro,
 * sem pista, e sem jeito de descobrir olhando o console.
 *
 * Este overlay é HTML da própria página: nenhum navegador o desliga.
 *
 * As duas funções devolvem Promise, então quem chama espera a resposta:
 *   if (!(await confirmar({ ... }))) return;
 *   const acao = await painel({ ..., acoes: [{ id: 'excluir', ... }] });
 */

const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));

/**
 * Garante o overlay no DOM. Só o montador trazia `#modal-app` no HTML; em vez de
 * repetir a mesma marcação em quatro `index.html` (e de descobrir tarde, numa
 * tela só, que alguém esqueceu), o módulo monta o que precisa na primeira vez.
 * As classes já existem em todas as folhas de estilo do coach.
 */
function garantirOverlay() {
  if (document.querySelector('#modal-app')) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'modal-app';
  bg.hidden = true;
  bg.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-app-titulo">
      <div class="modal-hd">
        <h3 id="modal-app-titulo"></h3>
        <button class="modal-x" data-fechar type="button" aria-label="Fechar">×</button>
      </div>
      <div class="modal-bd" id="modal-app-corpo"></div>
      <div class="modal-ft" id="modal-app-acoes"></div>
    </div>`;
  document.body.appendChild(bg);
}

/**
 * O site tem DUAS convenções para mostrar/esconder overlay, e as duas estão em
 * uso: a Academia e a Gestão de Alunos usam a classe `.open` (`.modal-bg` nasce
 * com `display:none`), enquanto o Montador e a Gestão da Loja usam o atributo
 * `hidden`. Um módulo compartilhado que só conhecesse uma delas simplesmente não
 * apareceria em metade das telas — e sem erro nenhum, porque o elemento existe,
 * está no DOM e o código segue achando que abriu. Por isso mexemos nas duas.
 */
const mostrar = (bg, sim) => { bg.hidden = !sim; bg.classList.toggle('open', sim); };
const aberto = (bg) => !bg.hidden || bg.classList.contains('open');

/** @type {((v:any) => void) | null} */
let _resolver = null;

/** Fecha o modal devolvendo `valor` a quem estava esperando. */
function fechar(valor) {
  const bg = /** @type {HTMLElement|null} */ (document.querySelector('#modal-app'));
  if (!bg || !aberto(bg)) return;
  mostrar(bg, false);
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
  garantirOverlay();
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
  garantirOverlay();
  ligarFechamentos();
  fechar(null); // se já houver um aberto, resolve o anterior antes de reusar o elemento
  $('#modal-app-titulo').textContent = titulo;
  $('#modal-app-corpo').innerHTML = corpoHTML;
  $('#modal-app-acoes').innerHTML = acoesHTML;
  $('#modal-app').querySelector('.modal').classList.toggle('largo', largo);
  mostrar($('#modal-app'), true);
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

/**
 * Aviso de um botão só — o substituto do `alert()`, pelo mesmo motivo do
 * `confirmar()`: o nativo pode estar suprimido, e aí a mensagem simplesmente
 * não aparece. Aqui o coach vê o que aconteceu.
 * @param {{titulo?: string, texto: string, ok?: string}} o
 * @returns {Promise<void>}
 */
export async function avisar({ titulo = 'Aviso', texto, ok = 'Entendi' }) {
  await abrir({
    titulo,
    corpoHTML: `<p class="dlg-texto">${esc(texto)}</p>`,
    acoesHTML: `<button class="btn" data-acao="ok" type="button">${esc(ok)}</button>`,
  });
}
