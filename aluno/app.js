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
import * as calc from '../alunos/calc.js?v=2';

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
  ['sec-progresso', 'sec-financeiro', 'sec-avaliacoes', 'sec-feedback'].forEach((id) => { $('#' + id).hidden = !temDados; });

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
  renderEvolucao();
  renderFinanceiro();
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
