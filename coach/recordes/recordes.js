// @ts-check
/**
 * MURAL DE RECORDES — os PRs que os alunos registram no Garage App, num feed.
 *
 * Uma escuta em tempo real (`prs-db.js`) traz os PRs de todos os alunos; a
 * ordem (o mais recente primeiro), os filtros e os números do topo saem de
 * `prs.js`. O nome e a foto vêm da ficha da Gestão de Alunos (e-mail → aluno),
 * como na Central de Mensagens. Sem ficha, o PR aparece pelo e-mail.
 *
 * Por PR, duas ações: "Parabéns" abre a conversa com o aluno na Central, com
 * a mensagem pronta no campo; a lixeira apaga o PR digitado errado.
 *
 * Os filtros ficam no endereço (`#exercicio=…&aluno=…`): voltar da Central,
 * depois do parabéns, cai no mesmo recorte.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../compartilhado/firebase/coach-guard.js';
import { confirmar } from '../../compartilhado/ui/dialogo.js';
import { alunoDaConversa, iniciais } from '../mensagens/chat.js';
import { apagarPR, ouvirPRs } from './prs-db.js';
import {
  LIMITE_FEED,
  chaveExercicio,
  dataBr,
  ehNovo,
  enderecoDoFiltro,
  filtrarPRs,
  formatarCarga,
  formatarReps,
  lerFiltro,
  linkDeParabens,
  opcoesDeAluno,
  opcoesDeExercicio,
  resumoDoMural,
  rotuloDaData,
} from './prs.js';

const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const esc = (/** @type {unknown} */ s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/** @type {import('./prs.js').PR[]} */
let prs = [];
/** @type {any[]} */
let alunos = [];
let carregando = true;
/** @type {string|null} */
let erro = null;
/** @type {import('./prs.js').Filtro} */
let filtro = lerFiltro(location.hash);
/** Os PRs com a exclusão a caminho do servidor: a lixeira não dispara duas vezes. */
const apagando = new Set();

const ICONE_LIXEIRA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
const ICONE_CHAT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/* ============================================================
   Topo — os números da box
   ============================================================ */
function renderResumo() {
  const r = resumoDoMural(prs);
  const stat = (/** @type {string} */ rotulo, /** @type {number|string} */ valor, /** @type {string} */ sub) =>
    `<div class="stat"><span class="stat-v">${valor}</span><span class="stat-l">${rotulo}</span><span class="stat-s">${sub}</span></div>`;
  const v = (/** @type {number} */ n) => (carregando ? '–' : n);
  $('#stats').innerHTML =
    stat('PRs na semana', v(r.naSemana), 'últimos 7 dias') +
    stat('Alunos com PR', v(r.alunos), 'já registraram recorde') +
    stat('PRs no mural', v(r.total), 'desde o primeiro registro');
}

/* ============================================================
   Filtros
   ============================================================ */
/** @param {any} select @param {{ valor: string, nome: string, total: number }[]} opcoes @param {string} atual */
function preencherSelect(select, opcoes, atual) {
  select.innerHTML = '<option value="">Todos</option>'
    + opcoes.map((o) => `<option value="${esc(o.valor)}">${esc(o.nome)} (${o.total})</option>`).join('');
  select.value = atual;
}

function renderFiltros() {
  const exercicios = opcoesDeExercicio(prs);
  const doAluno = opcoesDeAluno(prs, alunos);
  // Filtro que não casa com mais nada (o PR foi apagado, o endereço veio torto) volta para "Todos".
  if (!carregando) {
    const limpo = {
      exercicio: exercicios.some((o) => o.chave === filtro.exercicio) ? filtro.exercicio : '',
      aluno: doAluno.some((o) => o.email === filtro.aluno) ? filtro.aluno : '',
    };
    if (limpo.exercicio !== filtro.exercicio || limpo.aluno !== filtro.aluno) aplicarFiltro(limpo, false);
  }
  preencherSelect($('#f-exercicio'), exercicios.map((o) => ({ valor: o.chave, nome: o.nome, total: o.total })), filtro.exercicio);
  preencherSelect($('#f-aluno'), doAluno.map((o) => ({ valor: o.email, nome: o.nome, total: o.total })), filtro.aluno);
  $('#f-limpar').hidden = !filtro.exercicio && !filtro.aluno;
}

/** @param {import('./prs.js').Filtro} novo @param {boolean} [desenhar] */
function aplicarFiltro(novo, desenhar = true) {
  filtro = { exercicio: chaveExercicio(novo.exercicio), aluno: novo.aluno };
  const hash = enderecoDoFiltro(filtro);
  if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  if (desenhar) render();
}

$('#f-exercicio').addEventListener('change', (/** @type {Event} */ ev) =>
  aplicarFiltro({ ...filtro, exercicio: /** @type {HTMLSelectElement} */ (ev.target).value }));
$('#f-aluno').addEventListener('change', (/** @type {Event} */ ev) =>
  aplicarFiltro({ ...filtro, aluno: /** @type {HTMLSelectElement} */ (ev.target).value }));
$('#f-limpar').addEventListener('click', () => aplicarFiltro({ exercicio: '', aluno: '' }));

/* ============================================================
   Feed
   ============================================================ */
function avatarHtml(/** @type {{ nome: string, foto: string }} */ a) {
  return a.foto
    ? `<img src="${esc(a.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : esc(iniciais(a.nome));
}

/** @param {import('./prs.js').PR} pr @param {number} agora */
function itemHtml(pr, agora) {
  const a = alunoDaConversa(pr.email, alunos);
  const novo = ehNovo(pr, agora);
  const cls = ['pr', novo ? 'novo' : '', apagando.has(pr.caminho) ? 'apagando' : ''].filter(Boolean).join(' ');
  return `<li class="${cls}" data-caminho="${esc(pr.caminho)}">
    <span class="pr-selo" aria-hidden="true">🏆</span>
    <div class="pr-quem">
      <span class="avatar">${avatarHtml(a)}</span>
      <div class="pr-quem-txt">
        <button type="button" class="pr-nome" data-filtro="aluno" data-valor="${esc(pr.email)}"
          title="${esc(a.naFicha ? `Só os PRs de ${a.nome}` : `${pr.email} · sem ficha na Gestão`)}">${esc(a.nome)}</button>
        <button type="button" class="pr-exercicio" data-filtro="exercicio" data-valor="${esc(chaveExercicio(pr.exercicio))}"
          title="Só os PRs de ${esc(pr.exercicio)}">${esc(pr.exercicio)}</button>
      </div>
    </div>
    <div class="pr-marca" aria-label="${esc(`${formatarCarga(pr.carga)} kg, ${formatarReps(pr.reps)}`)}">
      <b>${formatarCarga(pr.carga)}</b><span class="un">kg</span>
      <span class="reps">× ${formatarReps(pr.reps)}</span>
    </div>
    <div class="pr-quando">
      <time datetime="${pr.data}" title="${dataBr(pr.data)}">${rotuloDaData(pr.data, agora)}</time>
      ${novo ? '<span class="selo-novo">Novo</span>' : ''}
    </div>
    <div class="pr-acoes">
      <a class="btn btn-sm pr-parabens" href="${esc(linkDeParabens(pr, a.nome))}"
        title="Abrir a conversa com ${esc(a.nome)} com o parabéns pronto">${ICONE_CHAT}<span>Parabéns</span></a>
      <button type="button" class="pr-apagar" data-acao="apagar" ${apagando.has(pr.caminho) ? 'disabled' : ''}
        aria-label="Apagar este PR" title="Apagar PR digitado errado">${ICONE_LIXEIRA}</button>
    </div>
  </li>`;
}

function renderFeed() {
  const ol = $('#feed');
  const rodape = $('#feed-rodape');
  rodape.hidden = true;
  const estado = (/** @type {string} */ html) => { ol.innerHTML = `<li class="feed-estado">${html}</li>`; $('#f-resumo').textContent = ''; };

  if (erro) return estado(erro);
  if (carregando) return estado('Carregando os recordes…');
  if (!prs.length) {
    return estado(`<span class="feed-estado-ic" aria-hidden="true">🏆</span><b>Nenhum PR registrado ainda.</b><br>
      Quando um aluno registrar um recorde no Garage App (Meus Recordes), ele aparece aqui na hora.`);
  }

  const lista = filtrarPRs(prs, filtro);
  const filtrado = !!(filtro.exercicio || filtro.aluno);
  $('#f-resumo').textContent = filtrado
    ? `${lista.length} de ${prs.length} PR${prs.length === 1 ? '' : 's'}`
    : `${prs.length} PR${prs.length === 1 ? '' : 's'}, do mais recente para o mais antigo`;
  if (!lista.length) return estado('Nenhum PR com esses filtros.');

  const agora = Date.now();
  ol.innerHTML = lista.slice(0, LIMITE_FEED).map((pr) => itemHtml(pr, agora)).join('');
  if (lista.length > LIMITE_FEED) {
    rodape.textContent = `Mostrando os ${LIMITE_FEED} mais recentes de ${lista.length}. Filtre por exercício ou aluno para ver os outros.`;
    rodape.hidden = false;
  }
}

function render() {
  renderResumo();
  renderFiltros();
  renderFeed();
}

$('#feed').addEventListener('click', async (/** @type {MouseEvent} */ ev) => {
  const alvo = /** @type {HTMLElement} */ (ev.target);
  const atalho = /** @type {HTMLElement|null} */ (alvo.closest('[data-filtro]'));
  if (atalho) {
    const campo = atalho.dataset.filtro === 'aluno' ? 'aluno' : 'exercicio';
    aplicarFiltro({ ...filtro, [campo]: atalho.dataset.valor || '' });
    return;
  }
  if (!alvo.closest('[data-acao="apagar"]')) return;
  const caminho = /** @type {HTMLElement|null} */ (alvo.closest('.pr'))?.dataset.caminho;
  const pr = caminho ? prs.find((x) => x.caminho === caminho) : undefined;
  if (pr) await apagar(pr);
});

/** @param {import('./prs.js').PR} pr */
async function apagar(pr) {
  if (apagando.has(pr.caminho)) return;
  const nome = alunoDaConversa(pr.email, alunos).nome;
  const ok = await confirmar({
    titulo: 'Apagar PR',
    texto: `O PR de <b>${esc(nome)}</b> — ${esc(pr.exercicio)}, ${formatarCarga(pr.carga)} kg × ${formatarReps(pr.reps)}
      em ${dataBr(pr.data)} — sai do mural e do Meus Recordes do aluno. Não dá para desfazer.`,
    ok: 'Apagar',
    perigo: true,
  });
  if (!ok) return;
  avisar('');
  apagando.add(pr.caminho);
  renderFeed();
  try {
    await apagarPR(pr.caminho); // a escuta tira o PR da lista
  } catch (e) {
    console.warn('Recordes: exclusão recusada.', /** @type {any} */ (e)?.code || e);
    avisar(/** @type {any} */ (e)?.code === 'permission-denied'
      ? 'O Firestore recusou a exclusão. Confira se o bloco alunos/prs das regras está publicado.'
      : 'Não deu para apagar o PR. Confira a conexão e tente de novo.', true);
  } finally {
    apagando.delete(pr.caminho);
    renderFeed();
  }
}

function avisar(/** @type {string} */ texto, comErro = false) {
  const p = $('#aviso');
  p.textContent = texto;
  p.hidden = !texto;
  p.classList.toggle('erro', comErro);
}

/* ============================================================
   Entrada
   ============================================================ */
async function carregarAlunos(/** @type {string} */ uid) {
  try {
    const db = await import('../gestao-de-alunos/db.js');
    const atualizar = () => { alunos = db.listar(); render(); };
    atualizar(); // o que está neste navegador, já
    await db.iniciarSync(uid, atualizar); // e a ficha da nuvem quando chegar
  } catch (e) {
    console.warn('Recordes: fichas da Gestão indisponíveis — o mural mostra os e-mails.', e);
  }
}

async function entrar(/** @type {any} */ user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra conta de aluno
  $('#gate').style.display = 'none';
  $('#app').removeAttribute('hidden');
  render();
  if (user?.uid) carregarAlunos(user.uid);

  try {
    await ouvirPRs((lista) => {
      prs = lista;
      carregando = false;
      erro = null;
      render();
    }, (e) => {
      console.warn('Recordes: não deu para escutar os PRs.', e?.code || e);
      carregando = false;
      erro = e?.code === 'permission-denied'
        ? '<b>O Firestore recusou a leitura.</b><br>Confira se o bloco <b>{path=**}/prs</b> das regras está publicado.'
        : '<b>Não deu para carregar os recordes.</b><br>Confira a conexão e recarregue a página.';
      render();
    });
  } catch (e) {
    carregando = false;
    erro = '<b>Não deu para conectar ao Firestore.</b><br>Recarregue a página.';
    render();
    console.warn('Recordes:', e);
  }
}

const gate = $('#gate'), gErro = $('#gate-erro');

$('#gate-form').addEventListener('submit', async (/** @type {SubmitEvent} */ ev) => {
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
    const code = /** @type {any} */ (e)?.code;
    gErro.textContent = /** @type {Record<string, string>} */ ({
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'Conta não encontrada.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
    })[code] || `Não foi possível entrar (${code || 'erro desconhecido'}).`;
  }
});

$('#gate-reset').addEventListener('click', async (/** @type {MouseEvent} */ ev) => {
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
