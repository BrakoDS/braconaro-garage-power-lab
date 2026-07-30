// @ts-check
/**
 * GESTÃO da Garage Store (coach).
 *
 * Carregado SOB DEMANDA, quando o coach clica em "Gerenciar" — visitante nunca
 * baixa nem executa nada disto, nem o Firebase Auth.
 *
 * A camada de dados continua sendo a do app Academia (`academia/db.js`,
 * documento `academia/{uid}`): a Loja é um app separado, o banco não. Isso tem uma
 * consequência que dita a ordem das coisas aqui:
 *
 *   `db.gravar()` só envia para a nuvem depois de `iniciarSync(uid)`, e quando
 *   envia, envia o documento INTEIRO. Editar sem sincronizar deixaria o produto só
 *   no navegador — e o próximo login da Academia adotaria a nuvem por cima,
 *   apagando a edição (mesma armadilha do `seedVersion`).
 *
 * Por isso `abrirGestao()` só revela o painel DEPOIS do `await db.iniciarSync(uid)`.
 */
import * as db from '../academia/db.js';
import { analisarUrl, lerPreco, formatarPreco, buscarMetadados } from './loja-url.js';
import { publicarLoja } from './loja-portal.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let UID = null;
let prodEdit = null;
let busca = '';
let categoria = 'todas';
/** Callback para a vitrine se recarregar depois de publicar. @type {() => void} */
let aoPublicar = () => {};

/* ---------- modais ---------- */
const abrirModal = (id) => { $('#' + id).hidden = false; document.body.style.overflow = 'hidden'; };
const fecharModal = (id) => { $('#' + id).hidden = true; document.body.style.overflow = ''; };
document.querySelectorAll('.modal-bg').forEach((m) => {
  m.addEventListener('click', (ev) => {
    const alvo = /** @type {HTMLElement} */ (ev.target);
    if (alvo === m || alvo.closest('[data-fechar]')) fecharModal(/** @type {HTMLElement} */ (m).id);
  });
});

/* ============================================================
   Painel
   ============================================================ */
function render() {
  const q = norm(busca);
  const base = db.listarProdutos();
  const itens = base.filter((p) => {
    if (categoria !== 'todas' && (p.categoria || 'Outros') !== categoria) return false;
    return !q || norm(p.nome).includes(q) || norm(p.dica).includes(q);
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  const ativos = base.filter((p) => p.ativo !== false && p.nome && p.url).length;
  const chips = ['todas', ...db.CATEGORIAS_LOJA]
    .map((c) => `<button class="chip${categoria === c ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c === 'todas' ? 'Todas' : c)}</button>`).join('');

  const lista = !itens.length
    ? `<p class="estado">${base.length ? 'Nenhum produto com esse filtro.' : '<b>Catálogo vazio.</b><br>Use “+ Produto” para cadastrar o primeiro.'}</p>`
    : itens.map((p) => {
      const ativo = p.ativo !== false;
      const preco = formatarPreco(typeof p.preco === 'number' ? p.preco : lerPreco(p.preco));
      const info = analisarUrl(p.url || '');
      return `
      <button class="prod${ativo ? '' : ' rascunho'}" data-id="${esc(p.id)}" type="button">
        <span class="prod-foto">${p.imagem ? `<img src="${esc(p.imagem)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}</span>
        <span class="prod-info">
          <span class="prod-nome">${esc(p.nome)}${ativo ? '' : ' <span class="tag-rascunho">Rascunho</span>'}</span>
          <span class="prod-meta"><span class="badge">${esc(p.categoria || 'Outros')}</span>${preco ? `<b>${esc(preco)}</b>` : ''}</span>
          ${p.dica ? `<span class="prod-dica">${esc(p.dica)}</span>` : ''}
          <span class="prod-loja">${info.ok ? esc(info.loja) : '<em class="erro">link inválido</em>'}${info.codigo ? ` · ${esc(info.codigo)}` : ''}</span>
        </span>
      </button>`;
    }).join('');

  $('#admin').innerHTML = `
    <section class="admin-hd">
      <div>
        <h1>Gestão da Garage Store</h1>
        <p class="mut">${base.length} ${base.length === 1 ? 'produto no catálogo' : 'produtos no catálogo'} · <b>${ativos}</b> ${ativos === 1 ? 'ativo' : 'ativos'}</p>
      </div>
      <div class="admin-acoes">
        <button class="btn" id="btn-novo" type="button">+ Produto</button>
        <button class="btn ghost" id="btn-publicar" type="button">Publicar na vitrine</button>
        <button class="btn ghost" id="btn-ver-vitrine" type="button">Ver a vitrine</button>
      </div>
    </section>
    <p class="admin-status" id="admin-status"></p>
    <label class="busca">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="admin-busca" type="search" placeholder="Buscar produto…" value="${esc(busca)}" />
    </label>
    <div class="filtros" id="admin-filtros">${chips}</div>
    <div class="admin-lista">${lista}</div>`;
}

/** A vitrine só muda quando o coach publica — o aviso deixa isso explícito. */
const avisarPendente = () => { $('#admin-status').innerHTML = '<span class="erro">alterações não publicadas</span>'; };

/* ============================================================
   Formulário
   ============================================================ */
function produtoDoForm() {
  const f = $('#form-produto');
  return {
    nome: f.nome.value.trim(),
    url: f.url.value.trim(),
    categoria: f.categoria.value,
    preco: lerPreco(f.preco.value),
    imagem: f.imagem.value.trim(),
    dica: f.dica.value.trim(),
    ativo: f.ativo.checked,
  };
}

function atualizarPrevia() {
  const p = produtoDoForm();
  const info = analisarUrl(p.url);
  $('#pr-analise').innerHTML = !p.url ? ''
    : info.ok
      ? `<span class="ok">✓ ${esc(info.loja)}</span>${info.codigo ? ` · código <b>${esc(info.codigo)}</b>` : ''}`
      : `<span class="erro">⚠ ${esc(info.erro)}</span>`;

  const preco = formatarPreco(p.preco);
  $('#pr-preview').innerHTML = `
    <article class="produto previa">
      <div class="produto-foto">
        ${p.imagem ? `<img src="${esc(p.imagem)}" alt="" onerror="this.closest('.produto-foto').classList.add('sem-foto');this.remove()" />` : ''}
        <span class="produto-sem">Foto indisponível</span>
      </div>
      <div class="produto-bd">
        <span class="badge">${esc(p.categoria)}</span>
        <h2 class="produto-nome">${esc(p.nome || 'Nome do produto')}</h2>
        ${preco ? `<div class="produto-preco">${esc(preco)}<small>preço de referência</small></div>` : ''}
        ${p.dica ? `<p class="produto-dica">${esc(p.dica)}</p>` : ''}
        <span class="btn-comprar">Ver na loja</span>
      </div>
    </article>`;
  if (!p.imagem) $('#pr-preview .produto-foto').classList.add('sem-foto');
}

function abrirProduto(item = null) {
  prodEdit = item;
  const f = $('#form-produto');
  $('#modal-produto-titulo').textContent = item ? `Editar ${item.nome}` : 'Novo produto';
  $('#pr-categoria').innerHTML = db.CATEGORIAS_LOJA
    .map((c) => `<option value="${esc(c)}"${c === (item?.categoria || 'Suplementos') ? ' selected' : ''}>${esc(c)}</option>`).join('');
  f.url.value = item?.url || '';
  f.nome.value = item?.nome || '';
  f.preco.value = item?.preco === '' || item?.preco == null ? '' : String(item.preco).replace('.', ',');
  f.imagem.value = item?.imagem || '';
  f.dica.value = item?.dica || '';
  f.ativo.checked = item ? item.ativo !== false : true;
  $('#erro-produto').textContent = '';
  $('#btn-del-produto').hidden = !item;
  atualizarPrevia();
  abrirModal('modal-produto');
  setTimeout(() => f.url.focus(), 50);
}

$('#form-produto').addEventListener('input', atualizarPrevia);
$('#form-produto').addEventListener('change', atualizarPrevia);

// Colar o link dispara a automação possível (ver loja-url.js: o que dá e o que não dá).
$('#pr-url').addEventListener('paste', () => {
  setTimeout(async () => {
    atualizarPrevia();
    const meta = await buscarMetadados($('#pr-url').value.trim());
    const f = $('#form-produto');
    if (meta.nome && !f.nome.value) f.nome.value = meta.nome;
    if (meta.preco && !f.preco.value) f.preco.value = String(meta.preco).replace('.', ',');
    if (meta.imagem && !f.imagem.value) f.imagem.value = meta.imagem;
    atualizarPrevia();
  }, 0);
});

$('#form-produto').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const p = produtoDoForm();
  if (!p.nome) return;
  const info = analisarUrl(p.url);
  if (!info.ok) { $('#erro-produto').textContent = info.erro; return; }
  const dados = { ...p, url: info.url, preco: p.preco == null ? '' : p.preco };
  if (prodEdit) dados.id = prodEdit.id;
  db.salvarProduto(dados);
  fecharModal('modal-produto');
  render();
  avisarPendente();
});

$('#btn-del-produto').addEventListener('click', () => {
  if (!prodEdit) return;
  if (!confirm(`Excluir o produto "${prodEdit.nome}"?`)) return;
  db.removerProduto(prodEdit.id);
  fecharModal('modal-produto');
  render();
  avisarPendente();
});

/* ---------- delegação do painel ---------- */
$('#admin').addEventListener('click', async (ev) => {
  const alvo = /** @type {HTMLElement} */ (ev.target);
  if (alvo.closest('#btn-novo')) { abrirProduto(); return; }
  if (alvo.closest('#btn-ver-vitrine')) { mostrarVitrine(); return; }
  if (alvo.closest('#btn-publicar')) { await publicar(); return; }
  const chip = alvo.closest('.chip');
  if (chip) { categoria = /** @type {HTMLElement} */ (chip).dataset.cat; render(); return; }
  const card = alvo.closest('.prod');
  if (card) { const p = db.obterProduto(/** @type {HTMLElement} */ (card).dataset.id); if (p) abrirProduto(p); }
});
$('#admin').addEventListener('input', (ev) => {
  const alvo = /** @type {HTMLInputElement} */ (ev.target);
  if (alvo.id === 'admin-busca') { busca = alvo.value; const foco = document.activeElement === alvo; render(); if (foco) { const el = $('#admin-busca'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
});

async function publicar() {
  const btn = $('#btn-publicar');
  const st = $('#admin-status');
  btn.disabled = true;
  st.textContent = 'publicando…';
  const produtos = db.listarProdutos();
  const ok = await publicarLoja(produtos);
  const ativos = produtos.filter((p) => p.ativo !== false && p.nome && p.url).length;
  st.innerHTML = ok
    ? `<span class="ok">✓ vitrine publicada — ${ativos} ${ativos === 1 ? 'produto no ar' : 'produtos no ar'}</span>`
    : '<span class="erro">⚠ não deu para publicar (sem conexão ou sem permissão)</span>';
  btn.disabled = false;
  if (ok) aoPublicar();
}

/* ============================================================
   Entrada / saída do modo gestão
   ============================================================ */
function mostrarVitrine() {
  $('#admin').hidden = true;
  $('#vitrine').hidden = false;
  $('#btn-gerenciar').textContent = 'Gerenciar';
}

/**
 * Entra no modo gestão. `uid` já autenticado e validado como coach.
 * @param {string} uid @param {() => void} [recarregarVitrine]
 */
export async function abrirGestao(uid, recarregarVitrine) {
  UID = uid;
  if (recarregarVitrine) aoPublicar = recarregarVitrine;

  $('#vitrine').hidden = true;
  $('#admin').hidden = false;
  $('#btn-gerenciar').textContent = 'Ver a vitrine';
  $('#admin').innerHTML = '<p class="estado">Sincronizando o catálogo…</p>';

  // NADA de edição antes disto: sem `iniciarSync`, o que for salvo fica só neste
  // navegador e o próximo login da Academia sobrescreve com a nuvem.
  try {
    await db.iniciarSync(uid);
  } catch (e) {
    console.warn('Sync da Academia indisponível:', e?.code || e);
    $('#admin').innerHTML = `<p class="estado"><b>Não deu para sincronizar com a nuvem.</b><br>
      Editar agora deixaria as alterações só neste aparelho e elas seriam perdidas no próximo acesso.<br>
      Verifique a conexão e recarregue a página.</p>`;
    return;
  }
  render();
}

export { mostrarVitrine };
