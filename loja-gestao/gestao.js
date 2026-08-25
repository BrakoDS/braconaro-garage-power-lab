// @ts-check
/**
 * GESTÃO GARAGE STORE — app do coach.
 *
 * Três abas: Painel (métricas), Produtos (CRUD + publicar) e Prévia (o que o aluno
 * vê). A loja pública (`loja/`) não tem nada disto — é só vitrine.
 *
 * A camada de dados continua sendo a do app Academia (`academia/db.js`, documento
 * `academia/{uid}`). Isso dita a ordem das coisas aqui:
 *
 *   `db.gravar()` só envia à nuvem depois de `iniciarSync(uid)`, e envia o documento
 *   INTEIRO. Editar sem sincronizar deixaria o produto só neste navegador — e o
 *   próximo login da Academia adotaria a nuvem por cima, apagando a edição (mesma
 *   armadilha do `seedVersion`). Por isso o app só sai da tela de "sincronizando"
 *   depois do `await db.iniciarSync(uid)`; se falhar, nem mostra o painel.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../montador/ui/cloud.js';
import { bloquearSeNaoCoach } from '../montador/ui/coach-guard.js';
import * as db from '../academia/db.js';
import { publicarLoja, carregarVitrine, assinatura, assinaturaPublicada } from '../loja/loja-portal.js';
import { cardProduto, gridVitrine, filtrar, chipsCategoria, formatarPreco, esc, norm, CATEGORIAS, SUBCATEGORIAS } from '../loja/vitrine-card.js';
import { analisarUrl, lerPreco, buscarMetadados } from './loja-url.js';
import { estadoPrecos, carregarPrecos, pedirAtualizacao } from '../loja/precos.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));
const $$ = (s) => [...document.querySelectorAll(s)];

let UID = null;
let prodEdit = null;
let abaAtiva = 'painel';

/** Estado do que está publicado, p/ o painel e a prévia. */
let publicado = { produtos: [], atualizadoEm: null };

/** Última rodada do robô de preços, p/ a faixa do painel. */
let feedPrecos = null;

const F = { prodBusca: '', prodCat: 'todas', previaBusca: '', previaCat: 'todas', previaModo: 'ar' };

/* ============================================================
   Abas
   ============================================================ */
$$('.tab').forEach((t) => t.addEventListener('click', () => trocarAba(t.dataset.tab)));
function trocarAba(aba) {
  abaAtiva = aba;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === aba));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + aba));
  if (aba === 'previa') renderPrevia();
}

/* ============================================================
   Status de publicação — comparação REAL, não flag de sessão
   ============================================================ */
/** @returns {{ pendentes: boolean, qtdAtivos: number, quando: string }} */
function estadoPublicacao() {
  const local = db.listarProdutos();
  const pendentes = assinatura(local) !== assinaturaPublicada(publicado.produtos);
  const quando = publicado.atualizadoEm
    ? new Date(publicado.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return { pendentes, qtdAtivos: local.filter((p) => p.ativo !== false && p.nome && p.url).length, quando };
}

/* ============================================================
   Aba 1 — Painel
   ============================================================ */
function renderPainel() {
  const produtos = db.listarProdutos();
  const ativos = produtos.filter((p) => p.ativo !== false && p.nome && p.url);
  const rascunhos = produtos.length - ativos.length;
  const st = estadoPublicacao();

  const cardStatus = st.pendentes
    ? `<div class="metrica alerta">
         <span class="metrica-n">!</span>
         <span class="metrica-rot">Alterações pendentes</span>
         <span class="metrica-sub">${st.quando ? `no ar desde ${esc(st.quando)}` : 'a vitrine nunca foi publicada'} — publique para o aluno ver</span>
       </div>`
    : `<div class="metrica ok">
         <span class="metrica-n">✓</span>
         <span class="metrica-rot">Vitrine em dia</span>
         <span class="metrica-sub">${st.quando ? `atualizada em ${esc(st.quando)}` : 'nada publicado ainda'}</span>
       </div>`;

  const ep = estadoPrecos(feedPrecos, produtos);
  const classePreco = { ok: 'ok', falhas: 'alerta', travou: 'alerta', nunca: '' }[ep.tipo];

  $('#painel-cards').innerHTML = `
    <div class="metricas">
      <div class="metrica"><span class="metrica-n">${produtos.length}</span><span class="metrica-rot">${produtos.length === 1 ? 'Produto cadastrado' : 'Produtos cadastrados'}</span></div>
      <div class="metrica"><span class="metrica-n destaque">${ativos.length}</span><span class="metrica-rot">Ativos</span><span class="metrica-sub">vão para a vitrine</span></div>
      <div class="metrica"><span class="metrica-n">${rascunhos}</span><span class="metrica-rot">${rascunhos === 1 ? 'Rascunho' : 'Rascunhos'}</span><span class="metrica-sub">só você vê</span></div>
      ${cardStatus}
      <div class="metrica ${classePreco}">
        <span class="metrica-n">${ep.tipo === 'ok' ? '✓' : ep.tipo === 'nunca' ? '–' : '!'}</span>
        <span class="metrica-rot">Preços do Mercado Livre</span>
        <span class="metrica-sub">${esc(ep.texto)}</span>
      </div>
    </div>`;

  // Categorias: barra proporcional ao maior valor, com ativos destacados dentro do total
  const porCat = CATEGORIAS.map((c) => {
    const doCat = produtos.filter((p) => (p.categoria || 'Outros') === c);
    return { c, total: doCat.length, ativos: doCat.filter((p) => p.ativo !== false && p.nome && p.url).length };
  });
  const maior = Math.max(1, ...porCat.map((x) => x.total));

  $('#painel-categorias').innerHTML = `
    <h2 class="sec-titulo">Por categoria</h2>
    ${produtos.length ? `<div class="cats">${porCat.map(({ c, total, ativos: a }) => `
      <div class="cat-linha">
        <span class="cat-nome">${esc(c)}</span>
        <span class="cat-barra"><span class="cat-fill" style="width:${(total / maior) * 100}%"></span>
          <span class="cat-fill ativos" style="width:${(a / maior) * 100}%"></span></span>
        <span class="cat-num">${total}${total ? ` <small>${a} ativo${a === 1 ? '' : 's'}</small>` : ''}</span>
      </div>`).join('')}</div>`
    : '<p class="estado">Nenhum produto cadastrado ainda.</p>'}`;
}

/* ============================================================
   Aba 2 — Produtos
   ============================================================ */
function renderProdutos() {
  const base = db.listarProdutos();
  const q = norm(F.prodBusca);
  const itens = base.filter((p) => {
    if (F.prodCat !== 'todas' && (p.categoria || 'Outros') !== F.prodCat) return false;
    return !q || norm(p.nome).includes(q) || norm(p.dica).includes(q);
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  $('#count-prod').textContent = `${itens.length} de ${base.length}`;
  $('#filtros-prod').innerHTML = ['todas', ...CATEGORIAS]
    .map((c) => `<button class="chip${F.prodCat === c ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c === 'todas' ? 'Todas' : c)}</button>`).join('');

  $('#lista-prod').innerHTML = !itens.length
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

  const st = estadoPublicacao();
  $('#status-pub').innerHTML = st.pendentes
    ? `<span class="erro">alterações pendentes</span> · ${st.qtdAtivos} ativo${st.qtdAtivos === 1 ? '' : 's'}`
    : `<span class="ok">vitrine em dia</span>${st.quando ? ` · ${esc(st.quando)}` : ''}`;
}

/* ============================================================
   Aba 3 — Prévia (mesmo card e mesmo CSS da loja pública)
   ============================================================ */
function produtosDaPrevia() {
  if (F.previaModo === 'ar') return publicado.produtos;
  // "como ficará": os ativos locais, passados pela mesma normalização da publicação
  return db.listarProdutos()
    .filter((p) => p.ativo !== false && p.nome && p.url)
    .map((p) => ({ ...p, preco: typeof p.preco === 'number' ? p.preco : lerPreco(p.preco) }));
}

function renderPrevia() {
  const produtos = produtosDaPrevia();
  const st = estadoPublicacao();
  $$('.modos .chip').forEach((c) => c.classList.toggle('on', c.dataset.modo === F.previaModo));
  $('#count-previa').textContent = `${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'}`;
  $('#previa-nota').innerHTML = F.previaModo === 'ar'
    ? (publicado.atualizadoEm
      ? `Exatamente o que está no ar agora, publicado em <b>${esc(st.quando)}</b>.${st.pendentes ? ' Há alterações locais que ainda não subiram.' : ''}`
      : 'A vitrine ainda não foi publicada — o aluno vê a tela de "em construção".')
    : 'Como a vitrine ficará <b>depois</b> de você publicar. Os rascunhos não entram.';

  $('#filtros-previa').innerHTML = chipsCategoria(produtos, F.previaCat);
  // `inerte`: na prévia o botão não navega — clicar aqui não deve abrir a loja parceira
  $('#saida-previa').innerHTML = gridVitrine(
    filtrar(produtos, F.previaBusca, F.previaCat), produtos.length,
    { inerte: true, vazioHTML: '<p class="estado"><b>Nada para mostrar.</b><br>Ative pelo menos um produto para a vitrine sair do ar vazia.</p>' },
  );
}

/* ============================================================
   Modal de produto
   ============================================================ */
const abrirModal = () => { $('#modal-produto').hidden = false; document.body.style.overflow = 'hidden'; };
const fecharModal = () => { $('#modal-produto').hidden = true; document.body.style.overflow = ''; };
$('#modal-produto').addEventListener('click', (ev) => {
  const alvo = /** @type {HTMLElement} */ (ev.target);
  if (alvo === $('#modal-produto') || alvo.closest('[data-fechar]')) fecharModal();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#modal-produto').hidden) fecharModal(); });

function produtoDoForm() {
  const f = $('#form-produto');
  return {
    nome: f.nome.value.trim(), url: f.url.value.trim(), categoria: f.categoria.value,
    subcategoria: $('#campo-subcategoria').hidden ? '' : f.subcategoria.value,
    preco: lerPreco(f.preco.value), imagem: f.imagem.value.trim(),
    dica: f.dica.value.trim(), ativo: f.ativo.checked,
  };
}

/** Preenche o select de subcategoria conforme a categoria escolhida; esconde o campo se não houver nenhuma. */
function popularSubcategoria(categoria, valorAtual) {
  const subs = SUBCATEGORIAS[categoria];
  $('#campo-subcategoria').hidden = !subs;
  if (!subs) { $('#pr-subcategoria').innerHTML = ''; return; }
  $('#pr-subcategoria').innerHTML = ['', ...subs]
    .map((s) => `<option value="${esc(s)}"${s === valorAtual ? ' selected' : ''}>${esc(s || '— nenhuma —')}</option>`).join('');
}

function atualizarPrevia() {
  const p = produtoDoForm();
  const info = analisarUrl(p.url);
  $('#pr-analise').innerHTML = !p.url ? ''
    : info.ok
      ? `<span class="ok">✓ ${esc(info.loja)}</span>${info.codigo ? ` · código <b>${esc(info.codigo)}</b>` : ''}`
      : `<span class="erro">⚠ ${esc(info.erro)}</span>`;
  // mesmo card da vitrine, também aqui — o coach vê o resultado enquanto digita
  $('#pr-preview').innerHTML = cardProduto({ ...p, nome: p.nome || 'Nome do produto' }, { inerte: true });
}

function abrirProduto(item = null) {
  prodEdit = item;
  const f = $('#form-produto');
  $('#modal-produto-titulo').textContent = item ? `Editar ${item.nome}` : 'Novo produto';
  $('#pr-categoria').innerHTML = CATEGORIAS
    .map((c) => `<option value="${esc(c)}"${c === (item?.categoria || 'Suplementos') ? ' selected' : ''}>${esc(c)}</option>`).join('');
  f.url.value = item?.url || '';
  f.nome.value = item?.nome || '';
  popularSubcategoria(item?.categoria || 'Suplementos', item?.subcategoria || '');
  f.preco.value = item?.preco === '' || item?.preco == null ? '' : String(item.preco).replace('.', ',');
  f.imagem.value = item?.imagem || '';
  f.dica.value = item?.dica || '';
  f.ativo.checked = item ? item.ativo !== false : true;
  $('#erro-produto').textContent = '';
  $('#btn-del-produto').hidden = !item;
  atualizarPrevia();
  abrirModal();
  setTimeout(() => f.url.focus(), 50);
}

$('#pr-categoria').addEventListener('change', () => popularSubcategoria($('#pr-categoria').value, ''));
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
  fecharModal();
  renderTudo();
});

$('#btn-del-produto').addEventListener('click', () => {
  if (!prodEdit) return;
  if (!confirm(`Excluir o produto "${prodEdit.nome}"?`)) return;
  db.removerProduto(prodEdit.id);
  fecharModal();
  renderTudo();
});

/* ============================================================
   Eventos das abas
   ============================================================ */
$('#btn-novo').addEventListener('click', () => abrirProduto());
$('#busca-prod').addEventListener('input', (e) => { F.prodBusca = e.target.value; renderProdutos(); });
$('#filtros-prod').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  F.prodCat = c.dataset.cat; renderProdutos();
});
$('#lista-prod').addEventListener('click', (e) => {
  const r = e.target.closest('.prod'); if (!r) return;
  const p = db.obterProduto(r.dataset.id); if (p) abrirProduto(p);
});
$('#busca-previa').addEventListener('input', (e) => { F.previaBusca = e.target.value; renderPrevia(); });
$('#filtros-previa').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  F.previaCat = c.dataset.cat; renderPrevia();
});
$('.modos').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  F.previaModo = c.dataset.modo; F.previaCat = 'todas'; renderPrevia();
});

$('#btn-publicar').addEventListener('click', async () => {
  const btn = $('#btn-publicar');
  btn.disabled = true;
  $('#status-pub').textContent = 'publicando…';
  const ok = await publicarLoja(db.listarProdutos());
  if (ok) publicado = await carregarVitrine(); // relê para o status refletir a verdade
  btn.disabled = false;
  if (!ok) { $('#status-pub').innerHTML = '<span class="erro">⚠ não deu para publicar (sem conexão ou sem permissão)</span>'; return; }
  renderTudo();
});

$('#btn-precos').addEventListener('click', async () => {
  const btn = $('#btn-precos');

  // A função lê a VITRINE PUBLICADA (`lojaPortal/atual`), não o catálogo local
  // do coach — contar `db.listarProdutos()` prometeria buscar rascunhos e
  // alterações ainda não publicados, que a função nem enxerga. Por isso a
  // contagem vem de `publicado.produtos` (preenchido por `carregarVitrine()`
  // na abertura), não do catálogo local. Não "corrija" isto de volta.
  const qtd = publicado.produtos.length;

  if (qtd === 0) {
    $('#status-pub').innerHTML = '<span class="erro">nada publicado ainda — publique a vitrine antes de atualizar preços</span>';
    return;
  }

  // Confirmação é guarda contra clique acidental, não aprovação de preço: quem
  // manda no valor é a leitura, e a rodada das 05:00 aplica sem perguntar de
  // qualquer forma. O número abaixo é o tamanho da vitrine publicada, não uma
  // promessa de quantas buscas vão rodar: a função ainda descarta dali os
  // produtos cujo link não é do Mercado Livre, e essa regra vive só no código
  // dela — não duplicar aqui.
  if (!confirm(`Buscar preços atuais no Mercado Livre para os produtos da vitrine publicada (${qtd} ao todo)?\nPode levar alguns minutos.`)) return;

  // Desabilitar é obrigatório, não só cosmético: a função só atende uma chamada
  // por vez, então um segundo clique não roda em paralelo — fica na fila e o
  // coach espera duas rodadas.
  btn.disabled = true;
  const rotulo = btn.textContent;
  btn.textContent = 'Buscando…';
  try {
    const r = await pedirAtualizacao();
    feedPrecos = await carregarPrecos();
    $('#status-pub').innerHTML = r.veioDoCache
      ? '<span class="ok">leitura recente reaproveitada — nada foi buscado agora (aguarde 1 min e tente de novo)</span>'
      : r.travou
        ? '<span class="erro">a leitura falhou geral — nenhum preço foi alterado</span>'
        : `<span class="ok">${r.lidos} lidos · ${r.mudaram} mudaram · ${r.falhas} falha${r.falhas === 1 ? '' : 's'}</span>`;
    renderPainel();
  } catch (e) {
    $('#status-pub').innerHTML = '<span class="erro">⚠ não deu para atualizar os preços</span>';
    console.warn('Atualizar preços:', e?.code || e);
  } finally {
    btn.disabled = false;
    btn.textContent = rotulo;
  }
});

function renderTudo() {
  renderPainel();
  renderProdutos();
  if (abaAtiva === 'previa') renderPrevia();
}

/* ============================================================
   Gate + entrada
   ============================================================ */
const gate = $('#gate'), gErro = $('#gate-erro');

async function entrar(user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra conta de aluno
  UID = user?.uid || null;
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  $('#painel-cards').innerHTML = '<p class="estado">Sincronizando o catálogo…</p>';

  // NADA de edição antes disto — ver o cabeçalho deste arquivo.
  if (UID) {
    try {
      await db.iniciarSync(UID);
    } catch (e) {
      console.warn('Sync da Academia indisponível:', e?.code || e);
      $('#painel-cards').innerHTML = `<p class="estado"><b>Não deu para sincronizar com a nuvem.</b><br>
        Editar agora deixaria as alterações só neste aparelho, e elas seriam perdidas no próximo acesso.<br>
        Verifique a conexão e recarregue a página.</p>`;
      return;
    }
  }
  // Duas atribuições em vez de desestruturar um array: uma linha começando com
  // `[` depende do ponto e vírgula da linha anterior para não virar índice.
  // Preços é acessório (o painel só perde a faixa se falhar); catálogo é o
  // trabalho do coach, por isso só ele passa pelo `try/catch` do sync acima.
  const [pub, precos] = await Promise.all([carregarVitrine(), carregarPrecos()]);
  publicado = pub;
  feedPrecos = precos;
  renderTudo();
}

$('#gate-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('#gate-email').value.trim();
  const senha = $('#gate-senha').value;
  gErro.textContent = '';
  if (!email || !senha) { gErro.textContent = 'Informe e-mail e senha.'; return; }
  try {
    const user = await login(email, senha);
    $('#gate-senha').value = '';
    await entrar(user);
  } catch (e) {
    gErro.textContent = ({
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'Conta não encontrada.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
    })[e?.code] || `Não foi possível entrar (${e?.code || 'erro desconhecido'}).`;
  }
});

$('#gate-reset').addEventListener('click', async (ev) => {
  ev.preventDefault();
  const email = $('#gate-email').value.trim();
  if (!email) { gErro.textContent = 'Digite seu e-mail para receber o link.'; return; }
  try { await resetarSenha(email); gErro.textContent = 'Link de redefinição enviado para o seu e-mail.'; }
  catch { gErro.textContent = 'Não foi possível enviar o link.'; }
});

(async () => {
  gate.style.display = 'flex';
  if (!cloudAtivo()) { gErro.textContent = 'Login indisponível (nuvem desativada).'; return; }
  const user = await sessaoAtual();
  if (user) await entrar(user);
})();
