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
 *
 * Mídia (Etapa 17.3): foto (clique abre em tela cheia), vídeo (player nativo,
 * com a capa) e voz (player próprio: ▶/❚❚, barra e tempo). O coach manda pelo
 * 📎 (ou Ctrl+V de imagem no campo) e grava voz no 🎤. Os balões são
 * reaproveitados entre pinturas (chave = id da mensagem): um tick novo ou uma
 * mensagem chegando não recria o `<audio>` que está tocando.
 *
 * Toda mensagem tem o ⋯ com "Apagar" — a do coach e a do aluno. Toda foto tem
 * o botão de baixar, no balão e na tela cheia: salva o arquivo original como
 * `foto_garage_{timestamp}.jpg` — ou, se o navegador recusar o fetch (CORS),
 * abre a original numa aba nova.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../compartilhado/firebase/coach-guard.js';
import {
  apagarMensagem, editarMensagem, enviarMidia, enviarResposta, marcarStatus, ouvirConversas, ouvirMensagens,
} from './chat-db.js';
import {
  LIMITES_MIDIA,
  MidiaRecusada,
  VOZ_MIN_S,
  aguardaResposta,
  alunoDaConversa,
  casaBusca,
  emailKey,
  formatarDuracao,
  horaDaMensagem,
  iniciais,
  itensDoChat,
  lerEndereco,
  nomeDaFotoBaixada,
  paraMarcar,
  podeApagar,
  podeEditar,
  prepararTexto,
  quandoNaLista,
  resultadoDaFalha,
  resumoAposApagar,
  ticksDoStatus,
} from './chat.js';
import { AVISO_NAVEGADOR, baixarArquivo, iniciarGravacao, prepararArquivo, suportaGravacao } from './midia-web.js';

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

/** Perto do fim da conversa: mensagem nova (ou foto que termina de carregar) puxa para baixo. */
const pertoDoFim = (/** @type {HTMLElement} */ box) => box.scrollHeight - box.scrollTop - box.clientHeight < 80;
/** Se a conversa estava colada no fim antes de algo crescer — atualizado a cada rolagem. */
let coladoNoFim = true;
$('#mensagens').addEventListener('scroll', () => { coladoNoFim = pertoDoFim($('#mensagens')); }, { passive: true });

/** Para áudio e vídeo de um trecho que vai sair da tela. @param {Element} el */
function pausarMidias(el) {
  el.querySelectorAll('audio, video').forEach((m) => /** @type {HTMLMediaElement} */ (m).pause());
}

/**
 * Pinta a conversa reaproveitando o que já está na tela: cada separador e
 * cada balão tem a sua chave (`data-key`), só o que mudou é reescrito, e o
 * miolo da mídia (`<img>`, `<video>`, `<audio>`) nasce uma vez só — um tick
 * novo não para o áudio que o coach está ouvindo.
 */
function renderMensagens(estado = '') {
  const box = $('#mensagens');
  if (estado || !mensagens.length) {
    pausarMidias(box);
    box.innerHTML = `<p class="msgs-estado">${estado || 'Nenhuma mensagem nesta conversa ainda. A primeira pode ser sua.'}</p>`;
    return;
  }
  // Quem está lendo o histórico lá em cima não é puxado para baixo por uma mensagem nova.
  const perto = pertoDoFim(box);
  /** @type {Map<string, HTMLElement>} */
  const naTela = new Map();
  for (const el of /** @type {HTMLElement[]} */ ([...box.children])) if (el.dataset.key) naTela.set(el.dataset.key, el);

  const desejados = itensDoChat(mensagens).map((it) => (it.tipo === 'dia'
    ? separador(naTela.get(it.id), it)
    : balao(naTela.get(it.id), it)));

  // Põe cada um no lugar, movendo só o que está fora de ordem; o que sobra saiu da conversa.
  let cursor = box.firstElementChild;
  for (const el of desejados) {
    if (el === cursor) cursor = cursor.nextElementSibling;
    else box.insertBefore(el, cursor);
  }
  while (cursor) {
    const proximo = cursor.nextElementSibling;
    pausarMidias(cursor);
    cursor.remove();
    cursor = proximo;
  }
  if (perto || descerAoFim) box.scrollTop = box.scrollHeight;
  coladoNoFim = pertoDoFim(box);
  descerAoFim = false;
}

/** @param {HTMLElement|undefined} el @param {{ id: string, rotulo: string }} it */
function separador(el, it) {
  if (!el) {
    el = document.createElement('span');
    el.className = 'dia';
    el.dataset.key = it.id;
  }
  if (el.textContent !== it.rotulo) el.textContent = it.rotulo;
  return el;
}

/** Troca o HTML de um pedaço só quando ele mudou — sem roubar o foco do menu. @param {Element} el @param {string} html */
function trocarSeMudou(el, html) {
  const alvo = /** @type {HTMLElement} */ (el);
  if (alvo.dataset.html !== html) {
    alvo.innerHTML = html;
    alvo.dataset.html = html;
  }
}

/**
 * Um balão: cria na primeira vez (com o miolo da mídia), e depois só
 * atualiza classe, menu, texto e rodapé.
 * @param {HTMLElement|undefined} el
 * @param {{ mensagem: import('./chat.js').Mensagem, continuacao: boolean }} it
 */
function balao(el, it) {
  const m = it.mensagem;
  // Mudou o arquivo (não acontece: mídia não se edita), o balão nasce de novo.
  const midia = m.tipo === 'texto' ? '' : `${m.tipo}|${m.mediaUrl}|${m.thumbUrl || ''}`;
  if (!el || el.dataset.midia !== midia) {
    if (el) pausarMidias(el);
    el = document.createElement('div');
    el.dataset.key = m.id;
    el.dataset.id = m.id;
    el.dataset.midia = midia;
    el.innerHTML = `<span class="acoes-slot"></span>${mioloHtml(m)}<span class="hora"></span>`;
    if (m.tipo !== 'texto') ligarMidia(el, m);
  }
  el.className = ['balao', m.remetente, it.continuacao ? 'seguido' : '', m.pendente ? 'pendente' : '',
    m.id === editando ? 'editando' : '', m.tipo !== 'texto' ? `com-midia midia-${m.tipo}` : ''].filter(Boolean).join(' ');
  trocarSeMudou(/** @type {Element} */ (el.querySelector('.acoes-slot')), acoesHtml(m));
  if (m.tipo === 'texto') {
    const txt = /** @type {HTMLElement} */ (el.querySelector('.txt'));
    if (txt.textContent !== m.texto) txt.textContent = m.texto;
  }
  trocarSeMudou(/** @type {Element} */ (el.querySelector('.hora')),
    `${m.editado ? '<span class="editada">editada</span>' : ''}${horaDaMensagem(m.timestamp)}${marcaHtml(m)}`);
  return el;
}

/** A seta para a bandeja: o "baixar" do balão e da tela cheia. */
const ICONE_BAIXAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
  + 'stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';

/** O miolo do balão: o texto, ou a foto, o vídeo, o player de voz. @param {import('./chat.js').Mensagem} m */
function mioloHtml(m) {
  const url = esc(m.mediaUrl);
  if (m.tipo === 'imagem') {
    // Dois botões lado a lado, e não um dentro do outro: a foto abre a tela cheia, o 📥 baixa.
    return `<div class="midia-foto-caixa"><button class="midia-foto" type="button" data-acao="ver-foto" aria-label="Ver foto em tela cheia">`
      + `<img src="${url}" alt="Foto" loading="lazy" decoding="async" /></button>`
      + `<button class="baixar-foto" type="button" data-acao="baixar-foto" aria-label="Baixar foto" title="Baixar foto">${ICONE_BAIXAR}</button></div>`;
  }
  if (m.tipo === 'video') {
    const capa = m.thumbUrl ? ` poster="${esc(m.thumbUrl)}"` : '';
    return `<video class="midia-video" src="${url}"${capa} controls preload="metadata" playsinline></video>`;
  }
  if (m.tipo === 'audio') {
    return `<div class="audio"><button class="audio-play" type="button" data-acao="tocar" aria-label="Ouvir mensagem de voz">▶</button>`
      + `<input class="audio-barra" type="range" min="0" max="1000" step="1" value="0" aria-label="Posição da mensagem de voz" />`
      + `<span class="audio-tempo">${formatarDuracao(m.duracao || 0)}</span>`
      + `<audio src="${url}" preload="none"></audio></div>`;
  }
  return '<span class="txt"></span>';
}

/**
 * Liga os eventos do miolo recém-criado. A foto e o vídeo, ao carregar,
 * mantêm a conversa colada no fim (se estava). A voz ganha o player: o botão,
 * a barra que acompanha e deixa arrastar, e o tempo — o total parado, o
 * decorrido tocando.
 * @param {HTMLElement} el @param {import('./chat.js').Mensagem} m
 */
function ligarMidia(el, m) {
  const manterNoFim = () => { if (coladoNoFim) { const box = $('#mensagens'); box.scrollTop = box.scrollHeight; } };
  el.querySelector('img')?.addEventListener('load', manterNoFim);
  el.querySelector('video')?.addEventListener('loadedmetadata', manterNoFim);

  const audio = /** @type {HTMLAudioElement|null} */ (el.querySelector('audio'));
  if (!audio) return;
  const botao = /** @type {HTMLButtonElement} */ (el.querySelector('.audio-play'));
  const barra = /** @type {HTMLInputElement} */ (el.querySelector('.audio-barra'));
  const tempo = /** @type {HTMLElement} */ (el.querySelector('.audio-tempo'));
  let arrastando = false;
  const total = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (m.duracao || 0));
  const pintar = () => {
    const t = total();
    if (!arrastando) barra.value = String(t ? Math.round((audio.currentTime / t) * 1000) : 0);
    barra.style.setProperty('--feito', `${Number(barra.value) / 10}%`);
    const mostrar = arrastando ? (Number(barra.value) / 1000) * t
      : (audio.currentTime > 0 || !audio.paused ? audio.currentTime : t);
    tempo.textContent = formatarDuracao(mostrar);
  };
  audio.addEventListener('timeupdate', pintar);
  audio.addEventListener('loadedmetadata', pintar);
  audio.addEventListener('play', () => { botao.textContent = '❚❚'; botao.setAttribute('aria-label', 'Pausar mensagem de voz'); });
  audio.addEventListener('pause', () => { botao.textContent = '▶'; botao.setAttribute('aria-label', 'Ouvir mensagem de voz'); });
  audio.addEventListener('waiting', () => botao.classList.add('carregando'));
  audio.addEventListener('playing', () => botao.classList.remove('carregando'));
  // Acabou: volta ao começo, pronto para ouvir de novo.
  audio.addEventListener('ended', () => { audio.currentTime = 0; pintar(); });
  audio.addEventListener('error', () => {
    botao.classList.remove('carregando');
    tempo.textContent = 'indisponível';
  });
  barra.addEventListener('input', () => { arrastando = true; pintar(); });
  barra.addEventListener('change', () => {
    arrastando = false;
    const t = total();
    if (t) audio.currentTime = (Number(barra.value) / 1000) * t;
    pintar();
  });
}

/** ▶/❚❚ da voz. @param {HTMLElement} el */
function alternarAudio(el) {
  const audio = /** @type {HTMLAudioElement|null} */ (el.querySelector('audio'));
  if (!audio) return;
  if (!audio.paused) { audio.pause(); return; }
  audio.play().catch((e) => {
    console.warn('Chat: não deu para tocar a voz.', e);
    avisar('Não deu para tocar essa mensagem de voz neste navegador.', true);
  });
}

// Uma mídia por vez: começou a tocar, as outras param.
$('#mensagens').addEventListener('play', (/** @type {Event} */ ev) => {
  for (const outra of $('#mensagens').querySelectorAll('audio, video')) {
    if (outra !== ev.target && !outra.paused) outra.pause();
  }
}, true);

/* ---------- a foto em tela cheia ---------- */

/** @type {Element|null} */
let focoAntesDaFoto = null;
/** A mensagem da foto em tela cheia — o 📥 dali baixa esta. @type {import('./chat.js').Mensagem|null} */
let fotoAberta = null;

/** @param {import('./chat.js').Mensagem} m */
function abrirFoto(m) {
  focoAntesDaFoto = document.activeElement;
  fotoAberta = m;
  avisarNaFoto('');
  $('#lightbox-img').src = m.mediaUrl;
  $('#lightbox').hidden = false;
  $('#lightbox-fechar').focus();
}

function fecharFoto() {
  if ($('#lightbox').hidden) return;
  $('#lightbox').hidden = true;
  $('#lightbox-img').removeAttribute('src');
  fotoAberta = null;
  /** @type {HTMLElement|null} */ (focoAntesDaFoto)?.focus?.();
}
// Clique em qualquer lugar (na foto, no fundo ou no ✕) fecha — menos no 📥.
$('#lightbox').addEventListener('click', fecharFoto);
$('#lightbox-baixar').addEventListener('click', (/** @type {MouseEvent} */ ev) => {
  ev.stopPropagation();
  if (fotoAberta) baixarFoto(fotoAberta, /** @type {HTMLButtonElement} */ (ev.currentTarget));
});

/** O aviso por cima da tela cheia — o `#aviso` da conversa fica escondido atrás dela. @param {string} texto */
function avisarNaFoto(texto, erro = false) {
  const p = $('#lightbox-aviso');
  p.textContent = texto;
  p.hidden = !texto;
  p.classList.toggle('erro', erro);
}

/** Os três desfechos do 📥 que viram aviso. */
const AVISOS_DO_DOWNLOAD = {
  aba: 'Abrindo foto original para salvar…',
  bloqueada: 'O navegador bloqueou a aba da foto. Clique de novo em baixar para abrir a original.',
  erro: 'Não deu para baixar a foto. Confira a conexão e tente de novo.',
};

/**
 * O aviso do 📥, na conversa e — com a foto em tela cheia — por cima dela. O
 * "Abrindo…" não é erro e sai sozinho; os de erro ficam até a próxima ação.
 * @param {import('./chat.js').Mensagem} m @param {string} texto @param {boolean} erro
 */
function avisarDownload(m, texto, erro) {
  avisar(texto, erro);
  if (fotoAberta === m) avisarNaFoto(texto, erro);
  if (erro) return;
  setTimeout(() => {
    if ($('#aviso').textContent === texto) avisar('');
    if ($('#lightbox-aviso').textContent === texto) avisarNaFoto('');
  }, 5000);
}

/**
 * Baixa a foto em alta (o arquivo do Storage) como `foto_garage_{timestamp}.jpg`,
 * ou — se o navegador recusar o fetch (CORS) — abre a original numa aba nova.
 * Enquanto o arquivo vem, o botão pulsa e não aceita outro clique.
 * @param {import('./chat.js').Mensagem} m @param {HTMLButtonElement} botao
 */
async function baixarFoto(m, botao) {
  if (!m.mediaUrl || botao.classList.contains('baixando')) return;
  botao.classList.add('baixando');
  botao.setAttribute('aria-busy', 'true');
  avisar('');
  avisarNaFoto('');
  try {
    const r = await baixarArquivo(m.mediaUrl, nomeDaFotoBaixada(m.timestamp));
    if (r?.modo === 'aba') {
      avisarDownload(m, r.aberta ? AVISOS_DO_DOWNLOAD.aba : AVISOS_DO_DOWNLOAD.bloqueada, !r.aberta);
    }
  } catch (e) {
    console.warn('Chat: não deu para baixar a foto.', e);
    avisarDownload(m, AVISOS_DO_DOWNLOAD.erro, true);
  } finally {
    botao.classList.remove('baixando');
    botao.removeAttribute('aria-busy');
  }
}

/** Os ticks da resposta do coach (✓ enviado, ✓✓ entregue, ✓✓ amarelo lido). @param {import('./chat.js').Mensagem} m */
function marcaHtml(m) {
  if (m.remetente !== 'coach') return '';
  if (m.pendente) return ' · enviando…';
  const t = ticksDoStatus(m.status);
  const rotulo = { enviado: 'Enviada', entregue: 'Entregue', lido: 'Lida pelo aluno' }[m.status];
  return ` <span class="ticks${t.lido ? ' lido' : ''}" title="${rotulo}" aria-label="${rotulo}">${t.marca}</span>`;
}

/**
 * O ⋯ de cada mensagem — do coach e do aluno —, e o menu dele quando aberto.
 * @param {import('./chat.js').Mensagem} m
 */
function acoesHtml(m) {
  if (!podeApagar(m)) return '';
  const aberto = m.id === menuAberto;
  // Editar, só a resposta do coach de texto; a do aluno e a mídia, só apagar (a regra também não deixa).
  return `<button class="balao-mais" type="button" data-acao="menu" aria-label="Opções da mensagem"
      aria-haspopup="menu" aria-expanded="${aberto}">⋯</button>`
    + (aberto ? `<div class="balao-menu" role="menu">`
      + (podeEditar(m) ? '<button type="button" role="menuitem" data-acao="editar">Editar</button>' : '')
      + '<button type="button" role="menuitem" data-acao="apagar">Apagar</button></div>' : '');
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
  const balaoEl = /** @type {HTMLElement|null} */ (botao?.closest('.balao'));
  const id = balaoEl?.dataset.id;
  const m = id ? mensagens.find((x) => x.id === id) : undefined;
  const acao = botao?.dataset.acao;
  // A mídia é de quem ver: foto e voz de qualquer um dos dois lados.
  if (acao === 'ver-foto' && m?.mediaUrl) { abrirFoto(m); return; }
  if (acao === 'baixar-foto' && m?.mediaUrl && botao) { baixarFoto(m, /** @type {HTMLButtonElement} */ (botao)); return; }
  if (acao === 'tocar' && balaoEl) { alternarAudio(balaoEl); return; }
  if (!botao || !m || !podeApagar(m)) {
    if (menuAberto) { menuAberto = null; renderMensagens(); }
    return;
  }
  menuAberto = acao === 'menu' && menuAberto !== m.id ? m.id : null;
  renderMensagens();
  if (acao === 'editar' && podeEditar(m)) iniciarEdicao(m);
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
  const oque = { texto: 'esta mensagem', imagem: 'esta foto', video: 'este vídeo', audio: 'esta mensagem de voz' }[m.tipo];
  const doAluno = m.remetente === 'aluno' ? ' do aluno' : '';
  if (!confirm(`Apagar ${oque}${doAluno}? Some para você e para o aluno.`)) return;
  const email = ativa;
  if (!email) return;
  if (editando === m.id) cancelarEdicao();
  avisar('');
  // O arquivo (e a capa do vídeo) sai do Storage junto.
  const arquivos = [m.mediaUrl, m.thumbUrl].filter((a) => typeof a === 'string' && !!a);
  try {
    await apagarMensagem(email, m.id, resumoAposApagar(mensagens, m.id), /** @type {string[]} */ (arquivos));
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
  // A voz gravada era para a conversa anterior: trocou, descarta.
  cancelarGravacao();
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

/**
 * O campo cresce com o texto até o teto do CSS. Como no WhatsApp: com o
 * campo vazio, o 🎤 no lugar do Enviar; editando, nem 🎤 nem 📎.
 */
function ajustarCampo() {
  const ta = $('#resposta');
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
  const temTexto = !!prepararTexto(ta.value);
  const mostrarMicrofone = !temTexto && !editando;
  $('#btn-enviar').disabled = !temTexto;
  $('#btn-enviar').hidden = mostrarMicrofone;
  $('#btn-microfone').hidden = !mostrarMicrofone;
  $('#btn-anexo').hidden = !!editando;
}
$('#resposta').addEventListener('input', ajustarCampo);

/* ---------- mídia do coach: 📎, Ctrl+V e 🎤 ---------- */

const NOME_DA_MIDIA = { imagem: 'a foto', video: 'o vídeo', audio: 'a mensagem de voz' };
const NOME_NO_ENVIO = { imagem: 'foto', video: 'vídeo', audio: 'mensagem de voz' };

/**
 * As mídias subindo, na ordem em que o coach mandou — cada uma com a barra
 * até o balão nascer. `para` é o aluno: o coach pode trocar de conversa
 * enquanto o vídeo sobe.
 * @type {{ id: number, tipo: import('./chat.js').TipoMidia, progresso: number, previaUrl?: string, para: string }[]}
 */
let envios = [];
let proximoEnvio = 0;

function renderEnvios() {
  const ul = $('#envios');
  ul.hidden = !envios.length;
  ul.innerHTML = envios.map((e) => `<li class="envio" data-envio="${e.id}" role="progressbar"
      aria-label="Enviando ${NOME_NO_ENVIO[e.tipo]} para ${esc(e.para)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e.progresso}">`
    + (e.previaUrl ? `<img src="${esc(e.previaUrl)}" alt="" />` : `<span class="envio-ic">${e.tipo === 'audio' ? '🎤' : '🎥'}</span>`)
    + `<div class="envio-meio"><span class="envio-txt"></span><i class="envio-trilha"><i></i></i></div></li>`).join('');
  envios.forEach(atualizarEnvio);
}

/** Só a porcentagem e a barra — sem recriar a miniatura a cada byte. @param {typeof envios[number]} e */
function atualizarEnvio(e) {
  const li = $(`#envios [data-envio="${e.id}"]`);
  if (!li) return;
  li.setAttribute('aria-valuenow', String(e.progresso));
  li.querySelector('.envio-txt').textContent =
    `Enviando ${NOME_NO_ENVIO[e.tipo]} para ${e.para}… ${e.progresso < 100 ? `${e.progresso}%` : 'quase lá'}`;
  li.querySelector('.envio-trilha i').style.width = `${Math.max(3, e.progresso)}%`;
}

/**
 * Sobe uma mídia pronta e diz o que deu errado, se deu.
 * @param {string} email @param {import('./midia-web.js').MidiaPronta} midia
 */
async function mandarMidia(email, midia) {
  const envio = { id: ++proximoEnvio, tipo: midia.tipo, progresso: 0, previaUrl: midia.previaUrl, para: alunoDaConversa(email, alunos).nome };
  envios.push(envio);
  renderEnvios();
  if (email === ativa) descerAoFim = true;
  try {
    await enviarMidia(email, midia, (pct) => { envio.progresso = pct; atualizarEnvio(envio); });
  } catch (e) {
    const r = resultadoDaFalha(e);
    const code = /** @type {any} */ (e)?.code;
    if (!r.motivo) console.warn('Chat: mídia recusada.', code || e);
    const nome = NOME_DA_MIDIA[midia.tipo];
    avisar(r.resultado === 'sem-rede'
      ? `Sem conexão — não deu para enviar ${nome}. Tente de novo.`
      : r.motivo || (code === 'storage/unauthorized' || code === 'permission-denied'
        ? `O Firebase recusou ${nome}. Confira se as regras de mídia do chat estão publicadas.`
        : `Não deu para enviar ${nome}. Confira a conexão e tente de novo.`), true);
  } finally {
    envios = envios.filter((x) => x !== envio);
    if (midia.previaUrl) URL.revokeObjectURL(midia.previaUrl);
    renderEnvios();
  }
}

/**
 * Fotos e vídeos escolhidos no 📎 (ou colados), um depois do outro — as
 * mensagens nascem na ordem em que o coach mandou.
 * @param {File[]} arquivos
 */
async function mandarArquivos(arquivos) {
  const email = ativa;
  if (!email || !arquivos.length) return;
  avisar('');
  for (const arquivo of arquivos) {
    /** @type {import('./midia-web.js').MidiaPronta} */
    let midia;
    try {
      midia = await prepararArquivo(arquivo);
    } catch (e) {
      if (!(e instanceof MidiaRecusada)) console.warn('Chat: arquivo recusado.', e);
      avisar(e instanceof MidiaRecusada ? e.message : 'Não deu para abrir esse arquivo. Tente outro.', true);
      continue;
    }
    await mandarMidia(email, midia);
  }
}

$('#btn-anexo').addEventListener('click', () => $('#arquivo').click());
$('#arquivo').addEventListener('change', () => {
  const input = $('#arquivo');
  const arquivos = /** @type {File[]} */ ([...(input.files || [])]);
  input.value = ''; // o mesmo arquivo de novo também dispara
  mandarArquivos(arquivos);
});

// Ctrl+V de imagem no campo: o print vai direto, sem passar pelo 📎.
$('#resposta').addEventListener('paste', (/** @type {ClipboardEvent} */ ev) => {
  const imagens = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!imagens.length || editando) return;
  ev.preventDefault();
  mandarArquivos(imagens);
});

/* A voz. */

/** @type {import('./midia-web.js').Gravacao|null} */
let gravacao = null;
/** A conversa em que a gravação começou — é para ela que a voz vai. @type {string|null} */
let emailDaGravacao = null;
/** @type {ReturnType<typeof setInterval>|undefined} */
let relogio;
const GRAVA_NESTE_NAVEGADOR = suportaGravacao();

// Navegador que só grava WebM/Opus (Firefox): o 🎤 fica apagado, com o motivo.
// `aria-disabled`, e não `disabled`: botão desligado nem mostra o title.
if (!GRAVA_NESTE_NAVEGADOR) {
  const mic = $('#btn-microfone');
  mic.setAttribute('aria-disabled', 'true');
  mic.classList.add('desligado');
  mic.title = AVISO_NAVEGADOR;
}

async function comecarGravacao() {
  if (!GRAVA_NESTE_NAVEGADOR) { avisar(AVISO_NAVEGADOR); return; }
  if (gravacao || !ativa) return;
  const email = ativa;
  avisar('');
  try {
    const nova = await iniciarGravacao();
    // Trocou de conversa enquanto o navegador pedia o microfone: não grava.
    if (ativa !== email) { nova.cancelar(); return; }
    gravacao = nova;
  } catch (e) {
    avisar(e instanceof MidiaRecusada ? e.message : 'Não deu para usar o microfone. Tente de novo.', true);
    if (!(e instanceof MidiaRecusada)) console.warn('Chat: microfone.', e);
    return;
  }
  emailDaGravacao = email;
  $('#form-resposta').classList.add('gravando');
  $('#gravacao').hidden = false;
  $('#grav-tempo').textContent = '0:00';
  const teto = LIMITES_MIDIA.audio.duracaoMax ?? 300;
  relogio = setInterval(() => {
    if (!gravacao) return;
    const s = gravacao.segundos();
    $('#grav-tempo').textContent = formatarDuracao(s);
    // No teto a voz para sozinha e vai, como se o coach tivesse clicado em Enviar.
    if (s >= teto) enviarGravacao();
  }, 250);
  $('#grav-enviar').focus();
}

function fecharGravacao() {
  clearInterval(relogio);
  gravacao = null;
  emailDaGravacao = null;
  $('#form-resposta').classList.remove('gravando');
  $('#gravacao').hidden = true;
}

async function enviarGravacao() {
  const g = gravacao;
  const email = emailDaGravacao;
  if (!g || !email) return;
  fecharGravacao();
  $('#resposta').focus();
  const voz = await g.parar();
  if (voz.duracao < VOZ_MIN_S) {
    avisar('Gravação curta demais. Clique no microfone, fale e depois em Enviar.');
    return;
  }
  await mandarMidia(email, { tipo: 'audio', blob: voz.blob, nome: 'voz.m4a', mimeType: 'audio/mp4', duracao: voz.duracao });
}

function cancelarGravacao() {
  const g = gravacao;
  if (!g) return;
  fecharGravacao();
  g.cancelar();
}

$('#btn-microfone').addEventListener('click', comecarGravacao);
$('#grav-enviar').addEventListener('click', enviarGravacao);
$('#grav-cancelar').addEventListener('click', () => { cancelarGravacao(); $('#resposta').focus(); });

// Esc: fecha a foto em tela cheia, ou cancela a gravação.
document.addEventListener('keydown', (/** @type {KeyboardEvent} */ ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('#lightbox').hidden) { ev.preventDefault(); fecharFoto(); return; }
  if (gravacao) { ev.preventDefault(); cancelarGravacao(); }
});

// Fechar a aba com mídia subindo (ou gravando) perde o que estava indo.
window.addEventListener('beforeunload', (ev) => {
  if (envios.length || gravacao) ev.preventDefault();
});

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
    if (ativa === email && !editando && !$('#resposta').value && m && podeEditar(m)) {
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
