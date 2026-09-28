// @ts-check
/**
 * CENTRAL DE MENSAGENS — o coach conversa com os alunos do Garage App.
 *
 * Duas escutas em tempo real (`chat-db.js`):
 *   - a lista de conversas (`chats`), da mais recente para a mais antiga;
 *   - as mensagens da conversa aberta (`chats/{email}/mensagens`), trocada a
 *     cada clique — só uma conversa escutada por vez.
 *
 * O nome e a foto do aluno saem da ficha da Gestão de Alunos (e-mail → aluno),
 * a mesma que o hub do coach lê. Sem ficha, a conversa aparece pelo e-mail.
 *
 * A conversa aberta fica no endereço (`#email`): recarregar a página volta
 * nela, e dá para abrir uma conversa nova com quem ainda não escreveu. Com
 * `&rascunho=`, o texto chega pronto no campo (o parabéns do Mural de Recordes).
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../compartilhado/firebase/coach-guard.js';
import {
  apagarMensagem, editarMensagem, enviarResposta, marcarStatus, ouvirConversas, ouvirMensagens,
} from './chat-db.js';
import {
  TEXTO_APAGADA,
  aguardaResposta,
  alunoDaConversa,
  casaBusca,
  emailKey,
  horaDaMensagem,
  iniciais,
  itensDoChat,
  lerEndereco,
  paraMarcar,
  podeAlterar,
  prepararTexto,
  quandoNaLista,
  ticksDoStatus,
} from './chat.js';

const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const esc = (/** @type {unknown} */ s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/** @type {import('./chat.js').Conversa[]} */
let conversas = [];
/** @type {any[]} */
let alunos = [];
/** @type {import('./chat.js').Mensagem[]} */
let mensagens = [];
/** @type {string|null} */
let ativa = null;
/** @type {(() => void)|null} */
let pararMensagens = null;
/** Cada troca de conversa ganha um número: escuta de conversa antiga que chega atrasada é descartada. */
let rodada = 0;
let carregandoLista = true;
/** @type {string|null} */
let erroLista = null;
/** A próxima pintura das mensagens desce até o fim (conversa aberta agora, ou resposta enviada). */
let descerAoFim = false;
/** A resposta do coach que está no campo para ser editada. @type {string|null} */
let editando = null;
/** A mensagem com o menu (Editar / Apagar) aberto. @type {string|null} */
let menuAberto = null;
/**
 * Status já mandado por mensagem do aluno: o snapshot volta a cada escrita, e
 * uma recusa da regra não pode virar um laço de tentativas.
 * @type {Map<string, string>}
 */
let jaMarcadas = new Map();

const TITULO = document.title;

/* ============================================================
   Esquerda — lista de conversas
   ============================================================ */
function avatarHtml(/** @type {{ nome: string, foto: string }} */ a) {
  return a.foto
    ? `<img src="${esc(a.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : esc(iniciais(a.nome));
}

function renderLista() {
  const ul = $('#conversas');
  const aguardando = conversas.filter(aguardaResposta).length;
  document.title = aguardando ? `(${aguardando}) ${TITULO}` : TITULO;
  $('#lista-resumo').innerHTML = conversas.length
    ? `${conversas.length} conversa${conversas.length === 1 ? '' : 's'}${aguardando ? ` · <b>${aguardando} aguardando resposta</b>` : ''}`
    : '';

  if (erroLista) { ul.innerHTML = `<li class="lista-estado">${erroLista}</li>`; return; }
  if (carregandoLista) { ul.innerHTML = '<li class="lista-estado">Carregando conversas…</li>'; return; }
  if (!conversas.length) {
    ul.innerHTML = `<li class="lista-estado"><b>Nenhuma mensagem ainda.</b><br>
      Quando um aluno escrever pelo Garage App (Cronograma › 💬 Coach), a conversa aparece aqui na hora.</li>`;
    return;
  }

  const termo = $('#busca').value;
  const linhas = conversas
    .map((c) => ({ c, a: alunoDaConversa(c.email, alunos) }))
    .filter(({ c, a }) => casaBusca({ nome: a.nome, email: c.email }, termo));
  if (!linhas.length) { ul.innerHTML = '<li class="lista-estado">Nenhum aluno com esse nome.</li>'; return; }

  const agora = Date.now();
  ul.innerHTML = linhas.map(({ c, a }) => {
    const u = c.ultimaMensagem;
    const espera = aguardaResposta(c);
    const previa = u ? `${u.remetente === 'coach' ? '<em>Você: </em>' : ''}${esc(u.texto.replace(/\s+/g, ' '))}` : '';
    return `<li class="conv-item${espera ? ' aguarda' : ''}" role="option" tabindex="0"
        data-email="${esc(c.email)}" aria-selected="${c.email === ativa}">
      <span class="avatar">${avatarHtml(a)}</span>
      <div class="conv-meio">
        <div class="conv-linha">
          <span class="conv-nome">${esc(a.nome)}</span>
          <span class="conv-quando">${esc(quandoNaLista(c.atualizadoEm, agora))}</span>
        </div>
        <div class="conv-previa"><span>${previa}</span>${espera ? '<i class="ponto" aria-label="aguardando resposta"></i>' : ''}</div>
      </div>
    </li>`;
  }).join('');
}

$('#conversas').addEventListener('click', (/** @type {MouseEvent} */ ev) => {
  const li = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest('.conv-item'));
  if (li?.dataset.email) abrirConversa(li.dataset.email);
});
$('#conversas').addEventListener('keydown', (/** @type {KeyboardEvent} */ ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const li = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest('.conv-item'));
  if (!li?.dataset.email) return;
  ev.preventDefault();
  abrirConversa(li.dataset.email);
});
$('#busca').addEventListener('input', renderLista);

/* ============================================================
   Direita — conversa aberta
   ============================================================ */
function renderCabecalho() {
  if (!ativa) return;
  const a = alunoDaConversa(ativa, alunos);
  $('#conv-avatar').innerHTML = avatarHtml(a);
  $('#conv-nome').textContent = a.nome;
  $('#conv-email').textContent = a.naFicha ? ativa : `${ativa} · sem ficha na Gestão`;
}

function renderMensagens(estado = '') {
  const box = $('#mensagens');
  if (estado) { box.innerHTML = `<p class="msgs-estado">${estado}</p>`; return; }
  if (!mensagens.length) {
    box.innerHTML = '<p class="msgs-estado">Nenhuma mensagem nesta conversa ainda. A primeira pode ser sua.</p>';
    return;
  }
  // Quem está lendo o histórico lá em cima não é puxado para baixo por uma mensagem nova.
  const perto = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = itensDoChat(mensagens).map((it) => {
    if (it.tipo === 'dia') return `<span class="dia">${esc(it.rotulo)}</span>`;
    const m = it.mensagem;
    const cls = ['balao', m.remetente, it.continuacao ? 'seguido' : '', m.pendente ? 'pendente' : '',
      m.apagado ? 'apagada' : '', m.id === editando ? 'editando' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-id="${esc(m.id)}">${acoesHtml(m)}<span class="txt">${esc(m.apagado ? TEXTO_APAGADA : m.texto)}</span>`
      + `<span class="hora">${m.editado ? '<span class="editada">editada</span>' : ''}${horaDaMensagem(m.timestamp)}${marcaHtml(m)}</span></div>`;
  }).join('');
  if (perto || descerAoFim) box.scrollTop = box.scrollHeight;
  descerAoFim = false;
}

/** Os ticks da resposta do coach (✓ enviado, ✓✓ entregue, ✓✓ amarelo lido). @param {import('./chat.js').Mensagem} m */
function marcaHtml(m) {
  if (m.remetente !== 'coach' || m.apagado) return '';
  if (m.pendente) return ' · enviando…';
  const t = ticksDoStatus(m.status);
  const rotulo = { enviado: 'Enviada', entregue: 'Entregue', lido: 'Lida pelo aluno' }[m.status];
  return ` <span class="ticks${t.lido ? ' lido' : ''}" title="${rotulo}" aria-label="${rotulo}">${t.marca}</span>`;
}

/** O ⋯ da resposta do coach, e o menu dele quando aberto. @param {import('./chat.js').Mensagem} m */
function acoesHtml(m) {
  if (!podeAlterar(m)) return '';
  const aberto = m.id === menuAberto;
  return `<button class="balao-mais" type="button" data-acao="menu" aria-label="Opções da mensagem"
      aria-haspopup="menu" aria-expanded="${aberto}">⋯</button>`
    + (aberto ? `<div class="balao-menu" role="menu">
        <button type="button" role="menuitem" data-acao="editar">Editar</button>
        <button type="button" role="menuitem" data-acao="apagar">Apagar</button>
      </div>` : '');
}

/** Se a mensagem é a última da conversa, o que o resumo precisa para acompanhar a troca. @param {string} id */
function ultimaSeFor(id) {
  const ultima = mensagens[mensagens.length - 1];
  return ultima?.id === id ? { remetente: ultima.remetente, timestamp: ultima.timestamp } : undefined;
}

/**
 * Os ticks do lado do aluno: com a conversa à vista, as mensagens dele viram
 * 'lido'; com a aba escondida (ou a lista por cima, no celular), só 'entregue'.
 */
function marcarRecebidas() {
  const email = ativa;
  if (!email) return;
  const aVista = !document.hidden && $('#conv-ativa').offsetParent !== null;
  const { status, ids } = paraMarcar(mensagens, aVista);
  const novos = ids.filter((id) => jaMarcadas.get(id) !== status && jaMarcadas.get(id) !== 'lido');
  if (!novos.length) return;
  novos.forEach((id) => jaMarcadas.set(id, status));
  marcarStatus(email, novos, status).catch((e) => {
    // Sem rede, o lote já está na fila do SDK e sobe quando a conexão voltar.
    console.warn(`Chat: não deu para marcar como ${status}.`, e?.code || e);
  });
}
document.addEventListener('visibilitychange', marcarRecebidas);

$('#mensagens').addEventListener('click', async (/** @type {MouseEvent} */ ev) => {
  const botao = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-acao]'));
  const id = /** @type {HTMLElement|null} */ (botao?.closest('.balao'))?.dataset.id;
  const m = id ? mensagens.find((x) => x.id === id) : undefined;
  if (!botao || !m || !podeAlterar(m)) {
    if (menuAberto) { menuAberto = null; renderMensagens(); }
    return;
  }
  const acao = botao.dataset.acao;
  menuAberto = acao === 'menu' && menuAberto !== m.id ? m.id : null;
  renderMensagens();
  if (acao === 'editar') iniciarEdicao(m);
  if (acao === 'apagar') await apagar(m);
});

/** @param {import('./chat.js').Mensagem} m */
function iniciarEdicao(m) {
  editando = m.id;
  const ta = $('#resposta');
  ta.value = m.texto;
  $('#editando').hidden = false;
  $('#btn-enviar').textContent = 'Salvar';
  ajustarCampo();
  renderMensagens();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function cancelarEdicao() {
  if (!editando) return;
  editando = null;
  $('#resposta').value = '';
  $('#editando').hidden = true;
  $('#btn-enviar').textContent = 'Enviar';
  ajustarCampo();
  renderMensagens();
}
$('#editando-cancelar').addEventListener('click', cancelarEdicao);

/** @param {import('./chat.js').Mensagem} m */
async function apagar(m) {
  if (!confirm('Apagar esta mensagem? Ela some para você e para o aluno.')) return;
  const email = ativa;
  if (!email) return;
  if (editando === m.id) cancelarEdicao();
  avisar('');
  try {
    await apagarMensagem(email, m.id, ultimaSeFor(m.id));
  } catch (e) {
    console.warn('Chat: exclusão recusada.', /** @type {any} */ (e)?.code || e);
    avisar('Não deu para apagar a mensagem. Confira a conexão e tente de novo.', true);
  }
}

/** @param {string} email */
function abrirConversa(email) {
  const id = emailKey(email);
  if (!id) return;
  $('#shell').classList.add('aberta');
  if (id === ativa) { marcarRecebidas(); return; }

  cancelarEdicao();
  ativa = id;
  rodada += 1;
  const minha = rodada;
  if (location.hash.slice(1) !== encodeURIComponent(id)) history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  pararMensagens?.();
  pararMensagens = null;
  mensagens = [];
  menuAberto = null;
  jaMarcadas = new Map();
  descerAoFim = true;
  avisar('');
  $('#conv-vazia').hidden = true;
  $('#conv-ativa').hidden = false;
  $('#resposta').value = '';
  ajustarCampo();
  renderCabecalho();
  renderMensagens('Carregando mensagens…');
  renderLista();

  ouvirMensagens(id, (lista) => {
    if (minha !== rodada) return;
    mensagens = lista;
    renderMensagens();
    marcarRecebidas();
  }, (e) => {
    if (minha !== rodada) return;
    console.warn('Chat: não deu para escutar a conversa.', e?.code || e);
    renderMensagens(e?.code === 'permission-denied'
      ? 'O Firestore recusou a leitura. Confira se o bloco <b>chats</b> das regras está publicado.'
      : 'Não deu para carregar a conversa. Confira a conexão e recarregue a página.');
  }).then((parar) => {
    // A troca de conversa pode ter vindo antes de a escuta ficar pronta.
    if (minha === rodada) pararMensagens = parar; else parar();
  }).catch((e) => {
    if (minha === rodada) renderMensagens('Não deu para conectar ao Firestore. Recarregue a página.');
    console.warn('Chat:', e);
  });

  if (matchMedia('(min-width: 761px)').matches) $('#resposta').focus();
}

$('#conv-voltar').addEventListener('click', () => {
  $('#shell').classList.remove('aberta');
});

/* ============================================================
   Resposta
   ============================================================ */
function avisar(/** @type {string} */ texto, erro = false) {
  const p = $('#aviso');
  p.textContent = texto;
  p.hidden = !texto;
  p.classList.toggle('erro', erro);
}

/** O campo cresce com o texto até o teto do CSS, e o botão só acende com texto. */
function ajustarCampo() {
  const ta = $('#resposta');
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
  $('#btn-enviar').disabled = !prepararTexto(ta.value);
}
$('#resposta').addEventListener('input', ajustarCampo);

$('#resposta').addEventListener('keydown', (/** @type {KeyboardEvent} */ ev) => {
  // Enter envia; Shift+Enter quebra a linha. Durante a composição (acento no
  // teclado internacional, IME) o Enter é do sistema, não nosso.
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    $('#form-resposta').requestSubmit();
  }
  if (ev.key === 'Escape' && editando) { ev.preventDefault(); cancelarEdicao(); }
});

/** Salva a edição que está no campo. @param {string} email @param {string} id @param {string} texto */
async function salvarEdicao(email, id, texto) {
  const original = mensagens.find((m) => m.id === id);
  const ultima = ultimaSeFor(id);
  cancelarEdicao();
  if (original && prepararTexto(texto) === original.texto) return; // nada mudou
  try {
    await editarMensagem(email, id, texto, ultima);
  } catch (e) {
    console.warn('Chat: edição recusada.', /** @type {any} */ (e)?.code || e);
    const m = mensagens.find((x) => x.id === id);
    if (ativa === email && !editando && !$('#resposta').value && m && podeAlterar(m)) {
      iniciarEdicao(m);
      $('#resposta').value = texto;
      ajustarCampo();
    }
    avisar('Não deu para salvar a edição. Confira a conexão e tente de novo.', true);
  }
}

$('#form-resposta').addEventListener('submit', async (/** @type {SubmitEvent} */ ev) => {
  ev.preventDefault();
  const email = ativa;
  const ta = $('#resposta');
  const texto = ta.value;
  if (!email || !prepararTexto(texto)) return;
  if (editando) { avisar(''); await salvarEdicao(email, editando, texto); return; }
  // Limpa antes de esperar: o balão aparece na hora (o SDK devolve a escrita
  // pendente), e um segundo Enter não acha texto para repetir.
  ta.value = '';
  ajustarCampo();
  avisar('');
  descerAoFim = true;
  try {
    await enviarResposta(email, texto);
  } catch (e) {
    console.warn('Chat: resposta recusada.', /** @type {any} */ (e)?.code || e);
    if (!ta.value && ativa === email) { ta.value = texto; ajustarCampo(); }
    avisar(/** @type {any} */ (e)?.code === 'permission-denied'
      ? 'O Firestore recusou a resposta. Confira se o bloco chats das regras está publicado.'
      : 'Não deu para enviar. Confira a conexão e tente de novo.', true);
  }
});

/* ============================================================
   Entrada
   ============================================================ */
async function carregarAlunos(/** @type {string} */ uid) {
  try {
    const db = await import('../gestao-de-alunos/db.js');
    const atualizar = () => {
      alunos = db.listar();
      renderLista();
      renderCabecalho();
    };
    atualizar(); // o que está neste navegador, já
    await db.iniciarSync(uid, atualizar); // e a ficha da nuvem quando chegar
  } catch (e) {
    console.warn('Mensagens: fichas da Gestão indisponíveis — a lista mostra os e-mails.', e);
  }
}

async function entrar(/** @type {any} */ user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra conta de aluno
  $('#gate').style.display = 'none';
  $('#app').removeAttribute('hidden');
  renderLista();
  if (user?.uid) carregarAlunos(user.uid);

  try {
    await ouvirConversas((lista) => {
      conversas = lista;
      carregandoLista = false;
      erroLista = null;
      renderLista();
    }, (e) => {
      console.warn('Chat: não deu para escutar as conversas.', e?.code || e);
      carregandoLista = false;
      erroLista = e?.code === 'permission-denied'
        ? '<b>O Firestore recusou a leitura.</b><br>Confira se o bloco <b>chats</b> das regras está publicado.'
        : '<b>Não deu para carregar as conversas.</b><br>Confira a conexão e recarregue a página.';
      renderLista();
    });
  } catch (e) {
    carregandoLista = false;
    erroLista = '<b>Não deu para conectar ao Firestore.</b><br>Recarregue a página.';
    renderLista();
    console.warn('Chat:', e);
  }

  // Lido antes de abrir: a conversa aberta regrava o endereço só com o e-mail.
  const { email: doEndereco, rascunho } = lerEndereco(location.hash);
  if (doEndereco) {
    abrirConversa(doEndereco);
    if (rascunho) colarRascunho(rascunho);
  }
}

/**
 * O texto pronto que outra tela mandou pelo endereço (o parabéns do Mural de
 * Recordes) vai para o campo — sem enviar: o coach revisa e aperta Enter.
 * @param {string} texto
 */
function colarRascunho(texto) {
  const ta = $('#resposta');
  ta.value = texto;
  ajustarCampo();
  ta.setSelectionRange(texto.length, texto.length);
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
