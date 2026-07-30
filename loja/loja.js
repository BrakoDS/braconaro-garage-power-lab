// @ts-check
/**
 * VITRINE PÚBLICA da Garage Store.
 *
 * Lê `lojaPortal/atual` — doc de leitura pública, publicado pelo coach na aba Loja
 * da Academia. Sem login: a página abre para qualquer visitante, então nada aqui
 * depende de sessão. O catálogo do coach (academia/{uid}) NÃO é acessível daqui, e
 * é assim que tem que ser.
 */
import { carregarLoja } from './loja-portal.js';

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

async function carregarVitrine() {
  try {
    PRODUTOS = await carregarLoja();
  } catch {
    PRODUTOS = [];
  }
  renderFiltros();
  renderGrid();
}
carregarVitrine();

/* ============================================================
   Entrada da gestão (coach)
   ============================================================
   Tudo aqui é carregado SOB DEMANDA. O visitante que só quer ver a loja não baixa
   o módulo de admin, nem o Firebase Auth, nem a camada de dados da Academia. */
let admin = null; // módulo de gestão, uma vez carregado

const gate = () => document.getElementById('gate');
const fecharGate = () => { gate().hidden = true; document.body.style.overflow = ''; };

gate().addEventListener('click', (ev) => {
  const alvo = /** @type {HTMLElement} */ (ev.target);
  if (alvo === gate() || alvo.closest('[data-fechar]')) fecharGate();
});

document.getElementById('btn-gerenciar').addEventListener('click', async () => {
  // já está no painel → volta para a vitrine
  if (admin && !document.getElementById('admin').hidden) { admin.mostrarVitrine(); return; }

  const { sessaoAtual } = await import('../montador/ui/cloud.js');
  const user = await sessaoAtual();
  if (user) { await entrarNaGestao(user); return; }

  gate().hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('gate-email').focus(), 50);
});

/** Valida que é coach e abre o painel. */
async function entrarNaGestao(user) {
  const { bloquearSeNaoCoach } = await import('../montador/ui/coach-guard.js');
  if (await bloquearSeNaoCoach(user)) return; // barra conta de aluno
  fecharGate();
  admin = admin || await import('./admin.js');
  await admin.abrirGestao(user.uid, carregarVitrine);
}

document.getElementById('gate-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = /** @type {HTMLInputElement} */ (document.getElementById('gate-email')).value.trim();
  const senha = /** @type {HTMLInputElement} */ (document.getElementById('gate-senha')).value;
  const erro = document.getElementById('gate-erro');
  erro.textContent = '';
  if (!email || !senha) { erro.textContent = 'Informe e-mail e senha.'; return; }
  try {
    const { login } = await import('../montador/ui/cloud.js');
    const user = await login(email, senha);
    /** @type {HTMLInputElement} */ (document.getElementById('gate-senha')).value = '';
    await entrarNaGestao(user);
  } catch (e) {
    erro.textContent = ({
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'Conta não encontrada.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
    })[e?.code] || `Não foi possível entrar (${e?.code || 'erro desconhecido'}).`;
  }
});
