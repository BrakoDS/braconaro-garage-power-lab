// @ts-check
/**
 * Portal do Aluno — app principal (Fase 1: read-only).
 * Login e-mail/senha (Firebase, mesmo projeto). Lê a fatia publicada pelo coach
 * em portal/{email} e mostra boas-vindas, progresso, financeiro e avaliações
 * (com comparação). Reaproveita o design e o calc.js do app de alunos.
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, sair, usuario } from '../montador/ui/cloud.js';
import { carregarPortal } from './portal-db.js';
import { enviarFotoPerfil, enviarFeedback } from './portal-inbox.js';
import { carregarAvisos } from './avisos-db.js';
import { carregarNutricao, salvarNutricao } from './nutricao-db.js';
import { carregarRanking } from './ranking-db.js';
import { carregarCargas, salvarCargas } from './cargas-db.js';
import { carregarDesafios, carregarProgressoDesafios, salvarProgressoDesafios } from './desafios-db.js';
import * as game from './gamificacao.js';
import * as calc from '../alunos/calc.js?v=5';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtData(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
function iniciais(n) { return ((n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase(); }
function primeiroNome(n) { return (n || 'Aluno').trim().split(/\s+/)[0]; }
function delta(a, b) { return (a == null || b == null) ? null : b - a; }
function sinal(v, d = 1) { return v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d); }

/** @type {any} */
let PORTAL = null;
/** E-mail do aluno logado (usa a fatia como fallback se a sessão ainda não resolveu). */
const emailAluno = () => (usuario()?.email || PORTAL?.email || '').toLowerCase();

/* ---------- Pagamento via Pix (dados do box) ---------- */
const PIX = {
  chave: '66567011000166',              // o que é copiado (CNPJ sem pontuação)
  chaveFmt: '66.567.011/0001-66',       // como é exibida
  tipo: 'CNPJ',
  recebedor: '66.567.011 Guilherme Braconaro da Silva',
  banco: 'Mercado Pago IP Ltda.',
  whatsapp: '5514998660352',
  nomeQr: 'GUILHERME BRACONARO',        // p/ o BR Code (máx. 25 chars, sem acento)
  cidadeQr: 'AGUDOS',                   // p/ o BR Code (máx. 15 chars)
};

/* ---------- BR Code (Pix copia e cola) ---------- */
/** CRC16-CCITT (0xFFFF / 0x1021), exigido no fim do payload Pix. */
function pixCrc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
/** Campo TLV do EMV: id + tamanho (2 díg.) + valor. */
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
/** Payload estático do Pix com valor embutido (padrão BR Code / Banco Central). */
function pixCopiaECola(valor) {
  const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', PIX.chave);
  let p = tlv('00', '01') + tlv('26', mai) + tlv('52', '0000') + tlv('53', '986');
  if (valor > 0) p += tlv('54', valor.toFixed(2));
  p += tlv('58', 'BR') + tlv('59', PIX.nomeQr) + tlv('60', PIX.cidadeQr) + tlv('62', tlv('05', '***')) + '6304';
  return p + pixCrc16(p);
}

/* ---------- QR Code (lib carregada sob demanda) ---------- */
let _qrLibP = null;
function qrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!_qrLibP) {
    _qrLibP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
      s.onload = () => res(window.qrcode);
      s.onerror = () => { _qrLibP = null; rej(new Error('qr-lib')); };
      document.head.appendChild(s);
    });
  }
  return _qrLibP;
}
/** Desenha o QR do payload dentro de `el` (SVG). Silencioso se a lib falhar. */
async function desenharQr(el, payload) {
  try {
    const lib = await qrLib();
    const qr = lib(0, 'M');
    qr.addData(payload);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { el.closest('.pix-qr-wrap')?.setAttribute('hidden', ''); }
}

/* ============================================================
   Render do dashboard
   ============================================================ */
function alunoLike() { return { sexo: PORTAL?.sexo, nascimento: PORTAL?.nascimento }; }
function avaliacoesOrdenadas() {
  return (PORTAL?.avaliacoes || []).filter((x) => x.dataRealizada).slice().sort((a, b) => (a.dataRealizada < b.dataRealizada ? -1 : 1));
}

function render() {
  const temDados = !!PORTAL;
  $('#sem-dados').hidden = temDados;
  ['sec-atalhos', 'sec-progresso', 'sec-financeiro', 'sec-avaliacoes', 'sec-feedback'].forEach((id) => { $('#' + id).hidden = !temDados; });
  // sec-metas: só quando há metas definidas (controlado em renderMetas)

  // Boas-vindas (sempre, com nome do que tiver) — avatar com botão "Alterar foto"
  const nome = PORTAL?.nome || (usuario()?.email || '').split('@')[0];
  const foto = PORTAL?.fotoUrl;
  const subt = PORTAL ? [PORTAL.objetivo, PORTAL.nivel].filter(Boolean).join(' · ') : 'Bem-vindo(a) ao seu portal.';
  $('#welcome').innerHTML = `
    <div class="wel-avatar" id="wel-avatar">${foto ? `<img src="${esc(foto)}" alt="Foto de ${esc(nome)}" />` : esc(iniciais(nome))}
      <button class="wel-foto-btn" id="btn-foto" type="button" title="Alterar foto" aria-label="Alterar foto">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>
      </button>
      <input type="file" id="foto-input" accept="image/*" hidden />
    </div>
    <div class="wel-txt"><h1>Olá, ${esc(primeiroNome(nome))}! 👋</h1><p>${esc(subt || 'Acompanhe sua evolução.')}</p>
      <span class="wel-foto-msg" id="foto-msg" hidden></span>
    </div>`;

  if (!temDados) return;
  wireFoto();
  renderProgresso();
  renderMetas();
  renderEvolucao();
  renderFinanceiro();
  renderPagLembrete();
  renderFotos();
  renderFeedback();
  renderAvaliacoes();
}

/* ---------- Alterar foto de perfil ---------- */
function wireFoto() {
  const btn = $('#btn-foto'), input = $('#foto-input'), msg = $('#foto-msg');
  if (!btn || !input) return;
  const email = emailAluno();
  if (!email) { btn.hidden = true; return; }
  const diz = (t, erro) => { msg.hidden = false; msg.textContent = t; msg.classList.toggle('erro', !!erro); };
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    btn.classList.add('carregando'); diz('Enviando foto…', false);
    try {
      const url = await enviarFotoPerfil(email, file);
      PORTAL.fotoUrl = url;
      const av = $('#wel-avatar');
      if (av) av.querySelector('img')?.remove(), av.insertAdjacentHTML('afterbegin', `<img src="${esc(url)}" alt="" />`);
      diz('Foto atualizada ✓', false);
    } catch (e) {
      console.warn('Foto:', e?.code || e);
      diz('Não foi possível enviar a foto agora.', true);
    } finally { btn.classList.remove('carregando'); }
  });
}

const fmtDataCurta = (iso) => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${d}/${m}`; };

/** Gráfico SVG de uma série [{d:isoDate, y:number}]. */
function chartSVG(serie, { cor = 'var(--accent)' } = {}) {
  const W = 600, H = 180, pad = { l: 46, r: 14, t: 16, b: 28 };
  const ys = serie.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const rng = max - min; min -= rng * 0.15; max += rng * 0.15;
  const n = serie.length;
  const X = (i) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const pts = serie.map((p, i) => [X(i), Y(p.y)]);
  const linha = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = linha + ` L ${pts[n - 1][0].toFixed(1)} ${H - pad.b} L ${pts[0][0].toFixed(1)} ${H - pad.b} Z`;
  const dots = pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${cor}"/>`).join('');
  const yMax = Math.max(...ys), yMin = Math.min(...ys);
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity="0.25"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" class="ax"/>
    <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="ax"/>
    <text x="${pad.l - 6}" y="${(Y(yMax) + 4).toFixed(1)}" class="clbl" text-anchor="end">${fmt(yMax, 1)}</text>
    <text x="${pad.l - 6}" y="${(Y(yMin) + 4).toFixed(1)}" class="clbl" text-anchor="end">${fmt(yMin, 1)}</text>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
    <text x="${X(0).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="start">${fmtDataCurta(serie[0].d)}</text>
    <text x="${X(n - 1).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="end">${fmtDataCurta(serie[n - 1].d)}</text>
  </svg>`;
}

function renderEvolucao() {
  const avs = avaliacoesOrdenadas();
  const serie = (getY) => avs.map((av) => ({ d: av.dataRealizada, y: getY(av) })).filter((p) => p.y != null && !isNaN(p.y));
  const sPeso = serie((av) => numf(av.peso));
  const sPerc = serie((av) => calc.calcular(av, alunoLike()).perc);
  const sCintura = serie((av) => numf(av.perimetros?.cintura));
  const card = (titulo, s, cor) => `<div class="prog-card"><h4>${titulo}</h4>${chartSVG(s, { cor })}</div>`;
  const cards = [];
  if (sPeso.length >= 2) cards.push(card('Evolução do peso (kg)', sPeso, 'var(--accent)'));
  if (sPerc.length >= 2) cards.push(card('% Gordura corporal', sPerc, '#ff5b50'));
  if (sCintura.length >= 2) cards.push(card('Cintura (cm)', sCintura, 'var(--accent-2)'));
  $('#sec-evolucao').hidden = cards.length === 0;
  $('#evolucao').innerHTML = cards.join('');
}

function renderProgresso() {
  const avs = avaliacoesOrdenadas();
  const pri = avs[0], ult = avs[avs.length - 1];
  const rPri = pri ? calc.calcular(pri, alunoLike()) : null;
  const rUlt = ult ? calc.calcular(ult, alunoLike()) : null;
  const dPeso = delta(numf(pri?.peso), numf(ult?.peso));
  const dPerc = delta(rPri?.perc, rUlt?.perc);
  const card = (v, l, s) => `<div class="card"><span class="v">${v}</span><span class="l">${l}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  $('#progresso').innerHTML =
    card(avs.length, 'Avaliações', ult ? 'última: ' + fmtData(ult.dataRealizada) : '—') +
    card((PORTAL.presencas || []).length, 'Check-ins', 'presenças registradas') +
    card(ult?.peso ? fmt(numf(ult.peso), 1) : '—', 'Peso atual (kg)', avs.length >= 2 && dPeso != null ? `${sinal(dPeso)} kg desde a 1ª` : '') +
    card(rUlt?.perc != null ? fmt(rUlt.perc, 1) + '%' : '—', '% Gordura', avs.length >= 2 && dPerc != null ? `${sinal(dPerc)}% desde a 1ª` : '');
}

/* ---------- Lembrete de mensalidade (banner no topo) ---------- */
function renderPagLembrete() {
  const banner = $('#pag-banner');
  const valor = numf(PORTAL?.mensalidade) || 0;
  if (!valor) { banner.hidden = true; return; }
  const mesId = new Date().toISOString().slice(0, 7);
  const st = statusFin(mesId);
  if (st === 'pago') { banner.hidden = true; return; }
  const M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesNome = M[Number(mesId.split('-')[1]) - 1];
  const txt = st === 'vencido'
    ? `Sua mensalidade de ${mesNome} está <b>vencida</b>.`
    : `Sua mensalidade de ${mesNome}${PORTAL.vencimento ? ` vence dia <b>${esc(String(PORTAL.vencimento))}</b>` : ' está em aberto'}.`;
  banner.hidden = false;
  banner.className = 'pag-banner ' + st;
  banner.innerHTML = `<span class="pb-ic" aria-hidden="true">💳</span><span class="pb-tx">${txt} Pague em segundos pelo Pix.</span><button class="btn btn-sm" id="pb-pix" type="button">Pagar com Pix</button>`;
  $('#pb-pix').addEventListener('click', () => {
    $('#sec-financeiro')?.scrollIntoView({ behavior: 'smooth' });
    const p = $('#pix-panel');
    if (p && p.hidden) $('#btn-pix')?.click();
  });
}

/* ---------- Metas / objetivo (read-only, definidas pelo coach) ---------- */
function renderMetas() {
  const metas = Array.isArray(PORTAL?.metas) ? PORTAL.metas : [];
  const sec = $('#sec-metas');
  if (!metas.length) { sec.hidden = true; return; }
  const avs = PORTAL?.avaliacoes || [];
  const html = metas.map((m) => {
    const p = calc.progressoMeta(m, avs, alunoLike());
    const t = calc.META_TIPOS[m.tipo] || { label: m.tipo, unidade: '', dec: 1 };
    const pct = p.pct != null ? Math.round(p.pct) : null;
    return `<div class="meta-card${p.atingida ? ' atingida' : ''}">
      <div class="meta-card-top"><span class="meta-card-nome">${esc(t.label)}</span>${p.atingida ? '<span class="meta-card-ok">Meta atingida ✓</span>' : pct != null ? `<span class="meta-card-pct">${pct}%</span>` : ''}</div>
      <div class="meta-card-bar"><div class="meta-card-fill${p.atingida ? ' ok' : ''}" style="width:${p.pct != null ? p.pct.toFixed(0) : 0}%"></div></div>
      <div class="meta-card-vals">
        <div><span>Início</span><b>${p.base != null ? fmt(p.base, t.dec) : '—'}</b></div>
        <div class="mc-atual"><span>Você está em</span><b>${p.atual != null ? fmt(p.atual, t.dec) : '—'}${t.unidade ? ' ' + t.unidade : ''}</b></div>
        <div><span>Meta</span><b>${p.alvo != null ? fmt(p.alvo, t.dec) : '—'}</b></div>
      </div>
    </div>`;
  }).join('');
  sec.hidden = false;
  $('#metas').innerHTML = html;
}

function statusFin(mesId) {
  if (PORTAL.pagamentos && PORTAL.pagamentos[mesId]) return 'pago';
  const [ano, m] = mesId.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(1, parseInt(PORTAL.vencimento, 10) || 10), ultimoDia);
  const venc = `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return new Date().toISOString().slice(0, 10) > venc ? 'vencido' : 'pendente';
}

function renderFinanceiro() {
  const valor = numf(PORTAL.mensalidade) || 0;
  if (!valor) {
    $('#financeiro').innerHTML = `<div class="fin-box"><div><div class="fin-cap">Mensalidade</div><div class="fin-val">—</div></div><span class="fin-badge pendente">Não cadastrada</span></div>`;
    return;
  }
  const mesId = new Date().toISOString().slice(0, 7);
  const st = statusFin(mesId);
  const lbl = st === 'pago' ? 'Pago' : st === 'vencido' ? 'Vencido' : 'Pendente';
  const M = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mesNome = M[Number(mesId.split('-')[1]) - 1];

  // Painel Pix — só quando ainda não está pago
  const payload = pixCopiaECola(valor);
  const pixHtml = st === 'pago' ? '' : `
    <button class="btn pix-btn" id="btn-pix" type="button">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 2 12l10 10 10-10L12 2zm0 3.2L18.8 12 12 18.8 5.2 12 12 5.2z"/></svg>
      Pagar com Pix
    </button>
    <div class="pix-panel" id="pix-panel" hidden>
      <div class="pix-head"><span class="pix-titulo">Pague com Pix</span><span class="pix-valor">${brl(valor)}</span></div>

      <div class="pix-qr-wrap">
        <div class="pix-qr" id="pix-qr"></div>
        <span class="pix-qr-cap">Abra o app do seu banco → <b>Pix</b> → <b>Ler QR Code</b><br>O valor já vem preenchido.</span>
      </div>

      <div class="pix-cec">
        <span class="pix-cap">Pix copia e cola</span>
        <div class="pix-cec-box"><code id="pix-payload">${esc(payload)}</code></div>
        <button class="btn btn-sm pix-cec-btn" id="pix-copiar-cec" type="button">Copiar código Pix</button>
      </div>

      <div class="pix-chave-box">
        <div><span class="pix-cap">Ou use a chave (${PIX.tipo})</span><span class="pix-chave">${esc(PIX.chaveFmt)}</span></div>
        <button class="btn ghost btn-sm" id="pix-copiar" type="button">Copiar chave</button>
      </div>

      <div class="pix-dados">
        <div><span class="pix-cap">Recebedor</span><span>${esc(PIX.recebedor)}</span></div>
        <div><span class="pix-cap">Instituição</span><span>${esc(PIX.banco)}</span></div>
      </div>
      <p class="pix-hint">Confira o nome do recebedor no seu banco antes de confirmar. Depois de pagar, envie o comprovante:</p>
      <a class="btn ghost pix-wa" href="https://wa.me/${PIX.whatsapp}?text=${encodeURIComponent(`Olá! Fiz o Pix da mensalidade de ${mesNome}. Segue o comprovante:`)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02z"/></svg>
        Enviar comprovante no WhatsApp
      </a>
    </div>`;

  $('#financeiro').innerHTML = `
    <div class="fin-box">
      <div>
        <div class="fin-cap">Mensalidade · ${mesNome}</div>
        <div class="fin-val">${brl(valor)}</div>
        ${PORTAL.vencimento ? `<div class="av-sub">vence dia ${esc(PORTAL.vencimento)}</div>` : ''}
      </div>
      <span class="fin-badge ${st}">${lbl}</span>
    </div>
    ${pixHtml}`;

  const btnPix = $('#btn-pix');
  let qrFeito = false;
  if (btnPix) btnPix.addEventListener('click', () => {
    const p = $('#pix-panel'); p.hidden = !p.hidden;
    if (!p.hidden && !qrFeito) { qrFeito = true; desenharQr($('#pix-qr'), payload); }
  });
  const btnChave = $('#pix-copiar');
  if (btnChave) btnChave.addEventListener('click', () => copiarTexto(btnChave, PIX.chave, 'Copiar chave'));
  const btnCec = $('#pix-copiar-cec');
  if (btnCec) btnCec.addEventListener('click', () => copiarTexto(btnCec, payload, 'Copiar código Pix'));
}

/** Copia texto para a área de transferência com fallback (execCommand). */
async function copiarTexto(btn, texto, label) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  const orig = btn.textContent; btn.textContent = 'Copiado ✓';
  setTimeout(() => { btn.textContent = label || orig; }, 1800);
}

/* ---------- Fotos de progresso (antes/depois) ---------- */
const temFotos = (av) => { const f = av.fotos || {}; return !!(f.frente || f.lado || f.costas); };
function renderFotos() {
  const sec = $('#sec-fotos');
  const avs = avaliacoesOrdenadas().filter(temFotos);
  if (avs.length < 1) { sec.hidden = true; return; }
  const pri = avs[0], ult = avs[avs.length - 1];
  const umSo = avs.length === 1;
  const slots = [['frente', 'Frente'], ['lado', 'Perfil'], ['costas', 'Costas']];
  const cel = (url, quando) => url
    ? `<a class="foto-cel" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="" loading="lazy"/><span class="foto-cap">${quando}</span></a>`
    : `<div class="foto-cel vazia"><span>—</span><span class="foto-cap">${quando}</span></div>`;
  const linhas = slots.map(([k, l]) => {
    const a = pri.fotos?.[k], b = ult.fotos?.[k];
    if (!a && !b) return '';
    return `<div class="foto-linha"><span class="foto-lbl">${l}</span>
      <div class="foto-par">${cel(a, 'Antes · ' + fmtData(pri.dataRealizada))}${umSo ? '' : cel(b, 'Agora · ' + fmtData(ult.dataRealizada))}</div></div>`;
  }).filter(Boolean).join('');
  sec.hidden = !linhas;
  $('#fotos').innerHTML = linhas + (umSo ? '' : '');
  $('#fotos-sub').textContent = umSo
    ? 'Sua primeira foto de progresso. As próximas avaliações vão render a comparação.'
    : `Comparando sua 1ª avaliação com fotos (${fmtData(pri.dataRealizada)}) e a mais recente (${fmtData(ult.dataRealizada)}).`;
}

/* ---------- Feedback pós-treino (aluno → coach) ---------- */
function renderFeedback() {
  const sec = $('#sec-feedback');
  const email = emailAluno();
  if (!email) { sec.hidden = true; return; }
  const hj = new Date().toISOString().slice(0, 10);
  const dorOpts = [['nenhuma', 'Nenhuma'], ['leve', 'Leve'], ['moderada', 'Moderada'], ['forte', 'Forte']];
  $('#feedback').innerHTML = `
    <form id="fb-form" class="fb-form" novalidate>
      <p class="fb-intro">Acabou de treinar? Conta pro coach como foi — ele acompanha e ajusta seu treino.</p>
      <label class="fb-field"><span>Data do treino</span><input type="date" id="fb-data" value="${hj}" max="${hj}" required></label>
      <div class="fb-field"><span>Nível de esforço (RPE): <b id="fb-rpe-v">7</b>/10</span><input type="range" id="fb-rpe" min="1" max="10" value="7"></div>
      <div class="fb-field"><span>Sentiu dor?</span><div class="fb-dor-opts" id="fb-dor">
        ${dorOpts.map(([v, l], i) => `<button type="button" class="fb-chip${i === 0 ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div></div>
      <label class="fb-field"><span>Observações (opcional)</span><textarea id="fb-obs" rows="2" maxlength="400" placeholder="Ex.: costas travando no agachamento, energia baixa hoje…"></textarea></label>
      <button class="btn" type="submit" id="fb-enviar">Enviar feedback</button>
      <span class="fb-status" id="fb-status" hidden></span>
    </form>`;
  const rpe = $('#fb-rpe');
  rpe.addEventListener('input', () => { $('#fb-rpe-v').textContent = rpe.value; });
  let dor = 'nenhuma';
  $$('#fb-dor .fb-chip').forEach((b) => b.addEventListener('click', () => { dor = b.dataset.v; $$('#fb-dor .fb-chip').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('#fb-status'), btn = $('#fb-enviar');
    const fb = { id: 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), data: $('#fb-data').value || hj, esforco: Number(rpe.value), dor, obs: $('#fb-obs').value.trim(), criadoEm: Date.now() };
    btn.disabled = true; st.hidden = false; st.classList.remove('erro'); st.textContent = 'Enviando…';
    try { await enviarFeedback(email, fb); st.textContent = 'Enviado ao coach ✓'; $('#fb-obs').value = ''; }
    catch (err) { console.warn('Feedback:', err?.code || err); st.classList.add('erro'); st.textContent = 'Não foi possível enviar agora.'; }
    finally { btn.disabled = false; }
  });
}

function renderAvaliacoes() {
  const avs = avaliacoesOrdenadas();
  const ultimas = avs.slice().reverse().slice(0, 3);
  $('#btn-comparar').disabled = avs.length < 2;
  $('#btn-comparar').style.display = avs.length < 2 ? 'none' : '';
  if (!avs.length) { $('#avaliacoes').innerHTML = `<div class="empty">Você ainda não tem avaliações registradas.</div>`; return; }
  $('#avaliacoes').innerHTML = ultimas.map((av) => {
    const r = calc.calcular(av, alunoLike());
    return `<div class="av-row">
      <span class="av-num">#${String(av.num || 0).padStart(2, '0')}</span>
      <div><div class="av-data">${fmtData(av.dataRealizada)}</div><div class="av-sub">${av.dataProxima ? 'próxima: ' + fmtData(av.dataProxima) : ''}</div></div>
      <div class="av-metrics">
        <div class="av-metric"><b>${av.peso ? fmt(numf(av.peso), 1) : '—'}</b><span>Peso</span></div>
        <div class="av-metric"><b>${r.perc != null ? fmt(r.perc, 1) + '%' : '—'}</b><span>% Gord.</span></div>
        <div class="av-metric"><b>${fmt(r.imc, 1)}</b><span>IMC</span></div>
      </div>
    </div>`;
  }).join('');
}

/* ---------- Comparação (últimas 3) ---------- */
function abrirComparar() {
  const avs = avaliacoesOrdenadas();
  const sel = avs.slice(-3); // até 3, em ordem cronológica
  if (sel.length < 2) return;
  const R = sel.map((av) => calc.calcular(av, alunoLike()));
  const rows = [];
  const nc = sel.length + 1;
  const sec = (t) => rows.push(`<tr class="cmp-sec"><td colspan="${nc}">${t}</td></tr>`);
  const lin = (label, vals, un, dec) => {
    if (vals.every((v) => v == null)) return;
    rows.push(`<tr><td>${label}</td>${vals.map((v) => `<td>${v == null ? '—' : fmt(v, dec) + (un ? ' ' + un : '')}</td>`).join('')}</tr>`);
  };
  sec('Composição corporal');
  lin('Peso', sel.map((a) => numf(a.peso)), 'kg', 1);
  lin('IMC', R.map((r) => r.imc), '', 1);
  lin('% Gordura', R.map((r) => r.perc), '%', 1);
  lin('Massa magra', R.map((r) => r.massaMagra), 'kg', 1);
  lin('Massa gorda', R.map((r) => r.massaGorda), 'kg', 1);
  sec('Perímetros (cm)');
  (calc.PERIMETROS || []).forEach((p) => lin(p.label, sel.map((a) => numf(a.perimetros?.[p.key])), 'cm', 1));
  sec('Testes físicos');
  lin('Flexões', sel.map((a) => numf(a.testes?.flexoes)), '', 0);
  lin('Prancha', sel.map((a) => numf(a.testes?.prancha)), 's', 0);
  lin('Agachamentos', sel.map((a) => numf(a.testes?.agachamentos)), '', 0);
  lin('Abdominais', sel.map((a) => numf(a.testes?.abdominais)), '', 0);

  const head = `<tr class="cmp-head"><th>Métrica</th>${sel.map((a) => `<th>${fmtData(a.dataRealizada)}</th>`).join('')}</tr>`;
  $('#modal-comparar-body').innerHTML = `<table class="cmp-table">${head}${rows.join('')}</table>`;
  $('#modal-comparar').classList.add('open');
}
$('#btn-comparar').addEventListener('click', abrirComparar);
$$('.modal-bg').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('open'); }));

/* ============================================================
   Nutrição Básica
   ============================================================ */
const ATIVIDADE = [
  ['1.2', 'Sedentário', 'pouco ou nenhum exercício'],
  ['1.375', 'Leve', '1–3 treinos/semana'],
  ['1.55', 'Moderado', '3–5 treinos/semana'],
  ['1.725', 'Intenso', '6–7 treinos/semana'],
  ['1.9', 'Muito intenso', 'treino pesado + trabalho físico'],
];
/** @type {any} */
let NUT = null; // { nivelAtividade, gastos:[] } — carregado sob demanda

/** Peso/altura/idade/sexo a partir da última avaliação + cadastro. */
function baseNutri() {
  const avs = avaliacoesOrdenadas();
  const ult = avs[avs.length - 1];
  return {
    peso: numf(ult?.peso),
    altura: numf(ult?.estatura) || numf(PORTAL?.altura),
    idade: calc.idadeDe(PORTAL?.nascimento),
    cod: calc.sexoCod({ sexo: PORTAL?.sexo }),
    dataAval: ult?.dataRealizada,
  };
}
/** TMB por Mifflin-St Jeor (kcal/dia). */
function tmbMifflin(peso, altura, idade, cod) {
  if (!peso || !altura || !idade || !cod) return null;
  const b = 10 * peso + 6.25 * altura - 5 * idade;
  return cod === 'F' ? b - 161 : b + 5;
}
/** Segunda a sábado da semana corrente (Date[]). */
function semanaSegSab() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dow = hoje.getDay(); // 0=Dom..6=Sáb
  const mon = new Date(hoje); mon.setDate(hoje.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: 6 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
/** ISO local yyyy-mm-dd (sem deslocar por fuso). */
function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/** Gráfico de barras Seg–Sáb (SVG, padrão do projeto). Destaca o dia de hoje. */
function barrasSemana(valores, labels, hojeIso, dias) {
  const W = 600, H = 210, pad = { l: 16, r: 12, t: 22, b: 30 };
  const max = Math.max(1, ...valores);
  const n = valores.length, area = W - pad.l - pad.r, step = area / n, bw = step * 0.56;
  const Y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const bars = valores.map((v, i) => {
    const x = pad.l + step * i + (step - bw) / 2, y = Y(v), h = (H - pad.b) - y;
    const ehHoje = isoLocal(dias[i]) === hojeIso;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="4" fill="${ehHoje ? 'var(--accent)' : 'var(--accent-2)'}"/>
      ${v > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="clbl" text-anchor="middle">${fmt(v, 0)}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" class="clbl" text-anchor="middle">${labels[i]}</text>`;
  }).join('');
  return `<svg class="chart nut-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto calórico por dia">
    <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="ax"/>${bars}</svg>`;
}

async function abrirNutricao() {
  $('#view-dashboard').hidden = true;
  $('#view-nutricao').hidden = false;
  window.scrollTo(0, 0);
  if (NUT == null) {
    $('#nut-conteudo').innerHTML = '<div class="empty">Carregando…</div>';
    try { NUT = await carregarNutricao(emailAluno()); }
    catch (e) { console.warn('Nutrição:', e?.code || e); NUT = { nivelAtividade: '1.55', gastos: [] }; }
  }
  desenharNutricao();
}
function fecharNutricao() {
  $('#view-nutricao').hidden = true;
  $('#view-dashboard').hidden = false;
  window.scrollTo(0, 0);
}
async function persistirNutricao() {
  try { await salvarNutricao(emailAluno(), NUT); }
  catch (e) { console.warn('Nutrição:', e?.code || e); }
}

function desenharNutricao() {
  const b = baseNutri();
  const tmb = tmbMifflin(b.peso, b.altura, b.idade, b.cod);
  const fator = parseFloat(NUT.nivelAtividade) || 1.55;
  const tdee = tmb != null ? tmb * fator : null;

  let macros = null;
  if (tdee != null && b.peso) {
    const protG = b.peso * 2, protK = protG * 4;
    const gordK = tdee * 0.25, gordG = gordK / 9;
    const carbK = Math.max(0, tdee - protK - gordK), carbG = carbK / 4;
    macros = { protG, protK, gordG, gordK, carbG, carbK };
  }

  const selAtiv = `<select id="nut-ativ">${ATIVIDADE.map(([v, l, d]) => `<option value="${v}"${v === NUT.nivelAtividade ? ' selected' : ''}>${l} — ${d}</option>`).join('')}</select>`;
  const metasHtml = tmb == null ? `
    <div class="empty"><b>Faltam dados da avaliação</b>
    Para calcular suas metas precisamos de peso, altura, sexo e data de nascimento. Fale com seu coach para registrar sua avaliação física.</div>`
    : `
    <div class="nut-nivel"><label for="nut-ativ">Seu nível de atividade</label>${selAtiv}</div>
    <div class="nut-metas">
      <div class="nut-card"><span class="nm-l">TMB · Taxa Metabólica Basal</span><span class="nm-v">${fmt(tmb, 0)}<i>kcal/dia</i></span><span class="nm-s">energia em repouso</span></div>
      <div class="nut-card accent"><span class="nm-l">TDEE · Gasto Calórico Total</span><span class="nm-v">${fmt(tdee, 0)}<i>kcal/dia</i></span><span class="nm-s">com seu nível de atividade</span></div>
    </div>
    ${macros ? `<div class="nut-macros">
      <div class="macro prot"><span class="mc-l">Proteínas</span><span class="mc-g">${fmt(macros.protG, 0)} g</span><span class="mc-k">${fmt(macros.protK, 0)} kcal</span></div>
      <div class="macro carb"><span class="mc-l">Carboidratos</span><span class="mc-g">${fmt(macros.carbG, 0)} g</span><span class="mc-k">${fmt(macros.carbK, 0)} kcal</span></div>
      <div class="macro gord"><span class="mc-l">Gorduras</span><span class="mc-g">${fmt(macros.gordG, 0)} g</span><span class="mc-k">${fmt(macros.gordK, 0)} kcal</span></div>
    </div>` : ''}
    <p class="nut-nota">Estimativa por Mifflin-St Jeor (${fmt(b.peso, 0)} kg · ${b.altura} cm · ${b.idade} anos${b.dataAval ? ' · avaliação de ' + fmtData(b.dataAval) : ''}). Meta de manutenção: proteína 2 g/kg, gordura 25% das calorias, carboidrato o restante. Não substitui orientação de nutricionista.</p>`;

  const dias = semanaSegSab();
  const somaDia = dias.map((d) => { const iso = isoLocal(d); return NUT.gastos.filter((g) => g.data === iso).reduce((s, g) => s + (numf(g.calorias) || 0), 0); });
  const totalSemana = somaDia.reduce((s, v) => s + v, 0);
  const hj = isoLocal(new Date());
  const isoIni = isoLocal(dias[0]), isoFim = isoLocal(dias[5]);
  const lanc = NUT.gastos.filter((g) => g.data >= isoIni && g.data <= isoFim).sort((a, b) => (a.data < b.data ? 1 : -1));

  $('#nut-conteudo').innerHTML = `
    <section class="nut-sec">
      <h3 class="sec-titulo">Suas metas diárias</h3>
      ${metasHtml}
    </section>
    <section class="nut-sec">
      <h3 class="sec-titulo">Registrar gasto do treino</h3>
      <form class="nut-form" id="nut-form" novalidate>
        <label class="nut-field"><span>Data</span><input type="date" id="nut-data" value="${hj}" max="${hj}" required></label>
        <label class="nut-field"><span>Calorias gastas (kcal)</span><input type="number" id="nut-kcal" min="1" step="any" placeholder="Ex.: 450" required></label>
        <button class="btn" type="submit">Registrar</button>
      </form>
      <span class="nut-msg" id="nut-msg" hidden></span>
    </section>
    <section class="nut-sec">
      <h3 class="sec-titulo">Sua semana (Seg a Sáb)</h3>
      <div class="nut-total"><span class="nt-l">Total queimado na semana</span><span class="nt-v">${fmt(totalSemana, 0)} <i>kcal</i></span></div>
      ${barrasSemana(somaDia, ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], hj, dias)}
      ${lanc.length ? `<div class="nut-lanc">${lanc.map((g) => `<div class="nl-row"><span class="nl-d">${fmtData(g.data)}</span><span class="nl-k">${fmt(numf(g.calorias), 0)} kcal</span><button class="nl-x" data-id="${esc(g.id)}" type="button" aria-label="Remover lançamento">×</button></div>`).join('')}</div>` : '<p class="nut-nota">Nenhum treino registrado nesta semana ainda.</p>'}
    </section>`;

  $('#nut-ativ')?.addEventListener('change', (e) => { NUT.nivelAtividade = e.target.value; desenharNutricao(); persistirNutricao(); });
  $('#nut-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = $('#nut-data').value || hj;
    const kcal = numf($('#nut-kcal').value), msg = $('#nut-msg');
    if (!kcal || kcal <= 0) { msg.hidden = false; msg.classList.add('erro'); msg.textContent = 'Informe um valor de calorias.'; return; }
    NUT.gastos.push({ id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), data, calorias: kcal, criadoEm: Date.now() });
    desenharNutricao(); persistirNutricao();
  });
  $$('#nut-conteudo .nl-x').forEach((btn) => btn.addEventListener('click', () => {
    NUT.gastos = NUT.gastos.filter((g) => g.id !== btn.dataset.id);
    desenharNutricao(); persistirNutricao();
  }));
}

$('#ir-nutricao')?.addEventListener('click', abrirNutricao);
$('#nut-voltar')?.addEventListener('click', fecharNutricao);

/* ============================================================
   Conquistas (gamificação)
   ============================================================ */
let CONQ_RANKING = null;
/** @type {any} */ let DES_LISTA = null; // desafios ativos (coach)
/** @type {any} */ let DES_PROG = null;  // progresso do aluno { checks, concluidos }

async function abrirConquistas() {
  $('#view-dashboard').hidden = true;
  $('#view-conquistas').hidden = false;
  window.scrollTo(0, 0);
  $('#conq-conteudo').innerHTML = '<div class="empty">Carregando…</div>';
  if (NUT == null) {
    try { NUT = await carregarNutricao(emailAluno()); }
    catch (e) { console.warn('Nutrição:', e?.code || e); NUT = { nivelAtividade: '1.55', gastos: [] }; }
  }
  if (CONQ_RANKING == null) CONQ_RANKING = (await carregarRanking()) || { mes: '', itens: [] };
  if (DES_LISTA == null) { try { DES_LISTA = await carregarDesafios(); } catch { DES_LISTA = []; } }
  if (DES_PROG == null) { try { DES_PROG = await carregarProgressoDesafios(emailAluno()); } catch { DES_PROG = { checks: {}, concluidos: [] }; } }
  desenharConquistas();
}
function fecharConquistas() {
  $('#view-conquistas').hidden = true;
  $('#view-dashboard').hidden = false;
  window.scrollTo(0, 0);
}

function desenharConquistas() {
  const dias = game.diasTreino(PORTAL?.presencas, NUT?.gastos);
  const streak = game.streakSemanas(dias);
  const c = game.contadores(dias);
  const nAval = avaliacoesOrdenadas().length;
  const concl = DES_PROG?.concluidos || [];
  const gastos = NUT?.gastos || [];
  const meds = game.medalhas({
    total: c.total, mes: c.mes, semana: c.semana, streak, nAvaliacoes: nAval,
    desafios: concl.length,
    desAgua: concl.filter((x) => x.categoria === 'agua').length,
    desAcucar: concl.filter((x) => x.categoria === 'acucar').length,
    meses: Object.values(PORTAL?.pagamentos || {}).filter(Boolean).length,
    calMaxTreino: game.maxCaloriasTreino(gastos),
    calMaxSemana: game.maxCaloriasSemana(gastos),
    feedbacks: numf(PORTAL?.feedbacksCount) || 0,
  });
  const conquistadas = meds.filter((m) => m.ok).length;
  const prs = game.recordes(PORTAL?.avaliacoes);
  const desafiosHtml = montarDesafiosHTML();

  const heroStreak = `
    <div class="cq-hero">
      <div class="cq-streak"><span class="cq-fogo">🔥</span><span class="cq-num">${streak}</span><span class="cq-lbl">${streak === 1 ? 'semana' : 'semanas'} seguidas</span></div>
      <div class="cq-mini">
        <div><b>${c.semana}</b><span>esta semana</span></div>
        <div><b>${c.mes}</b><span>no mês</span></div>
        <div><b>${c.total}</b><span>no total</span></div>
      </div>
    </div>
    ${streak === 0 ? '<p class="cq-dica">Treinou essa semana? Registre na <b>Nutrição</b> ou peça o check-in — sua sequência começa no 1º treino. 💪</p>' : ''}`;

  const medHtml = `<div class="cq-medalhas">${meds.map((m) => `
    <div class="cq-med ${m.ok ? 'on' : 'off'}" title="${esc(m.desc)}">
      <span class="cq-med-ic">${m.ic}</span><span class="cq-med-nm">${esc(m.nome)}</span><span class="cq-med-ds">${esc(m.desc)}</span>
    </div>`).join('')}</div>`;

  const prHtml = prs.length ? `<div class="cq-prs">${prs.map((r) => `
    <div class="cq-pr"><span class="cq-pr-ic">${r.ic}</span><span class="cq-pr-v">${fmt(r.valor, 0)}${r.un ? ' ' + r.un : ''}</span><span class="cq-pr-l">${esc(r.label)}</span>${r.quando ? `<span class="cq-pr-d">${fmtData(r.quando)}</span>` : ''}</div>`).join('')}</div>`
    : `<div class="empty">Seus recordes aparecem aqui conforme você faz os testes físicos nas avaliações (flexões, prancha, agachamentos, abdominais).</div>`;

  const rk = CONQ_RANKING || { mes: '', itens: [] };
  const M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesLbl = rk.mes ? M[Number(rk.mes.split('-')[1]) - 1] : '';
  const medalhaPos = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`);
  const rankHtml = rk.itens.length ? `<div class="cq-rank">${rk.itens.map((it, i) => `
    <div class="cq-rk-row${it.id === PORTAL?.id ? ' eu' : ''}">
      <span class="cq-rk-pos">${medalhaPos(i)}</span>
      <span class="cq-rk-nome">${esc(it.nome)}${it.id === PORTAL?.id ? ' <b>(você)</b>' : ''}</span>
      <span class="cq-rk-n">${it.treinos} treino${it.treinos === 1 ? '' : 's'}</span>
    </div>`).join('')}</div>`
    : `<div class="empty">O ranking do mês aparece aqui assim que os treinos começarem a ser registrados.</div>`;

  $('#conq-conteudo').innerHTML = `
    <section class="nut-sec">${heroStreak}</section>
    ${desafiosHtml}
    <section class="nut-sec">
      <h3 class="sec-titulo">Medalhas <span class="cq-cont">${conquistadas}/${meds.length}</span></h3>
      ${medHtml}
    </section>
    <section class="nut-sec">
      <h3 class="sec-titulo">Seus recordes</h3>
      ${prHtml}
    </section>
    <section class="nut-sec">
      <h3 class="sec-titulo">Ranking do box${mesLbl ? ' · ' + mesLbl : ''}</h3>
      <p class="sec-sub">Treinos registrados no mês (check-in + treinos lançados). Bora subir! 🚀</p>
      ${rankHtml}
    </section>`;
  $$('#conq-conteudo .des-dia').forEach((b) => b.addEventListener('click', () => toggleDesafioDia(b.dataset.id, b.dataset.iso)));
}

/** Seção "Desafios da semana" (vazio se não há desafios ativos). */
function montarDesafiosHTML() {
  const lista = DES_LISTA || [];
  if (!lista.length) return '';
  const dias = game.diasDaSemana();
  const semanaIsos = dias.map(game.isoDia);
  const hojeIso = game.isoDia(new Date());
  const labels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const checks = (DES_PROG && DES_PROG.checks) || {};
  const cards = lista.map((d) => {
    const marc = new Set(checks[d.id] || []);
    const feitos = semanaIsos.filter((x) => marc.has(x)).length;
    const meta = Math.max(1, d.metaDias || 5);
    const pct = Math.min(100, Math.round((feitos / meta) * 100));
    const concl = feitos >= meta;
    const chips = dias.map((dt, i) => {
      const iso = game.isoDia(dt), fut = iso > hojeIso, on = marc.has(iso);
      return `<button class="des-dia${on ? ' on' : ''}${fut ? ' fut' : ''}" data-id="${esc(d.id)}" data-iso="${iso}"${fut ? ' disabled' : ''} type="button" title="${fmtData(iso)}">${labels[i]}</button>`;
    }).join('');
    return `<div class="des-card${concl ? ' ok' : ''}">
      <div class="des-card-head"><span class="des-ic">${esc(d.icone || '⭐')}</span><div class="des-card-tx"><b>${esc(d.titulo)}</b><p>${esc(d.descricao)}</p></div></div>
      <div class="des-dias">${chips}</div>
      <div class="des-bar"><div class="des-fill${concl ? ' ok' : ''}" style="width:${pct}%"></div></div>
      <div class="des-foot">${concl ? '<span class="des-ok">Concluído! ✓</span>' : `${feitos} de ${meta} dias`}</div>
    </div>`;
  }).join('');
  return `<section class="nut-sec"><h3 class="sec-titulo">Desafios da semana</h3><p class="sec-sub">Marque os dias que você cumpriu. Bateu a meta = medalha. 🎯</p>${cards}</section>`;
}

/** Marca/desmarca um dia de um desafio, recomputa conclusão e persiste. */
async function toggleDesafioDia(id, iso) {
  if (!DES_PROG) DES_PROG = { checks: {}, concluidos: [] };
  const s = new Set(DES_PROG.checks[id] || []);
  if (s.has(iso)) s.delete(iso); else s.add(iso);
  DES_PROG.checks[id] = [...s];
  // recomputa conclusão da semana corrente para este desafio
  const d = (DES_LISTA || []).find((x) => x.id === id);
  if (d) {
    const semanaIsos = game.diasDaSemana().map(game.isoDia);
    const seg = semanaIsos[0];
    const feitos = (DES_PROG.checks[id] || []).filter((x) => semanaIsos.includes(x)).length;
    const meta = Math.max(1, d.metaDias || 5);
    DES_PROG.concluidos = DES_PROG.concluidos || [];
    const jaTem = DES_PROG.concluidos.some((c) => c.id === id && c.semana === seg);
    if (feitos >= meta && !jaTem) DES_PROG.concluidos.push({ id, semana: seg, categoria: d.categoria || 'geral', em: Date.now() });
    if (feitos < meta && jaTem) DES_PROG.concluidos = DES_PROG.concluidos.filter((c) => !(c.id === id && c.semana === seg));
  }
  desenharConquistas();
  try { await salvarProgressoDesafios(emailAluno(), DES_PROG); } catch (e) { console.warn('Desafios:', e?.code || e); }
}

$('#ir-conquistas')?.addEventListener('click', abrirConquistas);
$('#conq-voltar')?.addEventListener('click', fecharConquistas);

/* ============================================================
   Registro de Cargas (evolução de força)
   ============================================================ */
/** @type {any} */
let CARGAS = null;
const normEx = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const epley1rm = (carga, reps) => (carga > 0 && reps > 0 ? carga * (1 + reps / 30) : null);

async function abrirCargas() {
  $('#view-dashboard').hidden = true;
  $('#view-cargas').hidden = false;
  window.scrollTo(0, 0);
  if (CARGAS == null) {
    $('#cargas-conteudo').innerHTML = '<div class="empty">Carregando…</div>';
    try { CARGAS = await carregarCargas(emailAluno()); }
    catch (e) { console.warn('Cargas:', e?.code || e); CARGAS = { registros: [] }; }
  }
  desenharCargas();
}
function fecharCargas() {
  $('#view-cargas').hidden = true;
  $('#view-dashboard').hidden = false;
  window.scrollTo(0, 0);
}
async function persistirCargas() {
  try { await salvarCargas(emailAluno(), CARGAS); }
  catch (e) { console.warn('Cargas:', e?.code || e); }
}

function desenharCargas() {
  const regs = CARGAS.registros || [];
  const grupos = new Map();
  regs.forEach((r) => { const k = normEx(r.exercicio); if (!grupos.has(k)) grupos.set(k, { nome: r.exercicio, itens: [] }); grupos.get(k).itens.push(r); });
  const lista = [...grupos.values()].map((g) => {
    g.itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.criadoEm || 0) - (b.criadoEm || 0)));
    return g;
  }).sort((a, b) => (b.itens[b.itens.length - 1].criadoEm || 0) - (a.itens[a.itens.length - 1].criadoEm || 0));

  const hj = new Date().toISOString().slice(0, 10);
  const form = `
    <form class="cargas-form" id="cargas-form">
      <input list="dl-exercicios" id="cg-ex" placeholder="Exercício (ex.: Supino reto)" required>
      <input type="number" id="cg-carga" min="0" step="any" placeholder="Carga (kg)" required>
      <input type="number" id="cg-reps" min="1" step="1" placeholder="Reps" required>
      <input type="date" id="cg-data" value="${hj}" max="${hj}" required>
      <button class="btn" type="submit">Registrar</button>
      <span class="cargas-msg" id="cargas-msg" hidden></span>
    </form>`;

  const cards = lista.map((g) => {
    const itens = g.itens;
    const ult = itens[itens.length - 1];
    const melhorCarga = Math.max(...itens.map((x) => numf(x.cargaKg) || 0));
    const melhor1rm = Math.max(...itens.map((x) => epley1rm(numf(x.cargaKg), numf(x.reps)) || 0));
    // série: melhor carga por dia
    const porDia = new Map();
    itens.forEach((x) => { const c = numf(x.cargaKg); if (c != null) porDia.set(x.data, Math.max(porDia.get(x.data) || 0, c)); });
    const serie = [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, y]) => ({ d, y }));
    const grafico = serie.length >= 2 ? chartSVG(serie, { cor: 'var(--accent)' }) : '<div class="cargas-semgraf">Registre em mais de um dia para ver a curva de evolução. 📈</div>';
    const prog = serie.length >= 2 ? serie[serie.length - 1].y - serie[0].y : null;
    const hist = itens.slice().reverse().slice(0, 6).map((x) => `<div class="cg-hist-row"><span>${fmtData(x.data)}</span><b>${fmt(numf(x.cargaKg), 1)} kg × ${esc(String(x.reps))}</b><button class="cg-del" data-id="${esc(x.id)}" type="button" aria-label="Remover">×</button></div>`).join('');
    return `<div class="cargas-card">
      <div class="cargas-head"><h3>${esc(g.nome)}</h3>${prog != null ? `<span class="cargas-prog ${prog >= 0 ? 'up' : 'down'}">${prog >= 0 ? '+' : '−'}${fmt(Math.abs(prog), 1)} kg</span>` : ''}</div>
      <div class="cargas-kpis">
        <div><b>${fmt(numf(ult.cargaKg), 1)} kg × ${esc(String(ult.reps))}</b><span>último</span></div>
        <div><b>${fmt(melhorCarga, 1)} kg</b><span>recorde</span></div>
        <div><b>${melhor1rm ? fmt(melhor1rm, 0) + ' kg' : '—'}</b><span>1RM estim.</span></div>
      </div>
      ${grafico}
      <div class="cg-hist">${hist}</div>
    </div>`;
  }).join('');

  $('#cargas-conteudo').innerHTML = `
    <p class="sec-sub">Anote suas séries e acompanhe a força subir. O 1RM é uma estimativa (fórmula de Epley).</p>
    ${form}
    ${cards || '<div class="empty"><b>Nenhum registro ainda</b>Comece anotando seu primeiro exercício acima. 💪</div>'}`;

  $('#cargas-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ex = $('#cg-ex').value.trim();
    const carga = numf($('#cg-carga').value), reps = parseInt($('#cg-reps').value, 10);
    const data = $('#cg-data').value || hj;
    const msg = $('#cargas-msg');
    if (!ex || carga == null || carga < 0 || !reps || reps < 1) { msg.hidden = false; msg.classList.add('erro'); msg.textContent = 'Preencha exercício, carga e reps.'; return; }
    CARGAS.registros.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), exercicio: ex, cargaKg: carga, reps, data, criadoEm: Date.now() });
    desenharCargas(); persistirCargas();
  });
  $$('#cargas-conteudo .cg-del').forEach((b) => b.addEventListener('click', () => {
    CARGAS.registros = CARGAS.registros.filter((x) => x.id !== b.dataset.id);
    desenharCargas(); persistirCargas();
  }));
}

$('#ir-cargas')?.addEventListener('click', abrirCargas);
$('#cargas-voltar')?.addEventListener('click', fecharCargas);

/* ============================================================
   GATE de acesso (login do aluno)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gToggle = $('#gate-toggle'), gReset = $('#gate-reset');
const gBtn = gform.querySelector('button[type=submit]');

async function entrar(user) {
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  const email = (user?.email || '').toLowerCase();
  try { PORTAL = email ? await carregarPortal(email) : null; }
  catch (e) { PORTAL = null; console.warn('Portal:', e?.code || e); }
  render();
  carregarAvisos().then(renderAvisos); // mural da academia (independe da fatia do aluno)
}

/* ---------- Avisos da Academia ---------- */
const AVISO_TAG = { info: 'Informativo', importante: 'Importante', evento: 'Evento' };
function renderAvisos(avisos) {
  const sec = $('#sec-avisos');
  if (!avisos || !avisos.length) { sec.hidden = true; return; }
  sec.hidden = false;
  $('#avisos').innerHTML = avisos.map((av) => {
    const d = av.criadoEm ? new Date(av.criadoEm).toLocaleDateString('pt-BR') : '';
    return `<article class="aviso-card tipo-${esc(av.tipo || 'info')}">
      <div class="aviso-card-head"><span class="aviso-tag">${esc(AVISO_TAG[av.tipo] || 'Informativo')}</span><span class="aviso-dt">${d}</span></div>
      <h4>${esc(av.titulo || '')}</h4>
      <p>${esc(av.texto || '')}</p>
    </article>`;
  }).join('');
}
function erroMsg(m) { gErro.style.color = ''; gErro.textContent = m; gErro.style.display = 'block'; }
function okMsg(m) { gErro.style.color = 'var(--ok)'; gErro.textContent = m; gErro.style.display = 'block'; }
function msgAuth(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos. Primeiro acesso? Use "Criar conta".',
    'auth/user-not-found': 'Conta não encontrada. Use "Primeiro acesso? Criar conta".',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — é só fazer login.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
  })[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

$('#sair').addEventListener('click', async () => { try { await sair(); } catch {} location.reload(); });

if (cloudAtivo()) {
  gate.style.display = 'flex';
  let criando = false;
  gToggle.addEventListener('click', (e) => { e.preventDefault(); criando = !criando; gBtn.textContent = criando ? 'Criar conta e entrar' : 'Entrar'; gToggle.textContent = criando ? 'Já tenho conta — entrar' : 'Primeiro acesso? Criar conta'; gErro.style.display = 'none'; });
  gReset.addEventListener('click', async (e) => { e.preventDefault(); const m = gEmail.value.trim(); if (!m) { erroMsg('Digite seu e-mail acima primeiro.'); gEmail.focus(); return; } try { await resetarSenha(m); okMsg('Enviamos um link de redefinição para seu e-mail.'); } catch (err) { erroMsg(msgAuth(err)); } });
  sessaoAtual().then((u) => { if (u) entrar(u); else gEmail.focus(); });
  gform.addEventListener('submit', async (e) => {
    e.preventDefault(); gErro.style.display = 'none';
    try {
      const user = criando ? await criarConta(gEmail.value.trim(), gSenha.value) : await login(gEmail.value.trim(), gSenha.value);
      entrar(user);
    } catch (err) { erroMsg(msgAuth(err)); }
  });
} else {
  gate.style.display = 'flex';
  erroMsg('O Portal do Aluno precisa da nuvem (Firebase) ativa.');
}
