// @ts-check
/**
 * A evolução do aluno: gráficos das avaliações, os pontos que melhoraram, as
 * metas combinadas com o coach e o que vem do app e do Portal (gasto calórico,
 * cargas, feedbacks, adesão aos hábitos, medalhas).
 *
 * Saiu do `app.js` no fatiamento, com o código como estava. Era a aba
 * Progresso; com a ficha em cards, as peças de performance (metas, gráficos,
 * força, gasto, feedbacks) são desenhadas pela aba Treino (ui-tab-treino.js),
 * que as importa daqui, e o "Uso do app" — adesão e medalhas — virou um card
 * da aba Histórico (ui-tab-historico.js chama `abrirUsoDoApp`).
 *
 * Quando desenha: TODA vez que a aba Histórico abre. Aqui tudo é leitura (da
 * nuvem), e abrir a aba tem de mostrar o que o aluno acabou de registrar no app.
 */
import * as db from './db.js?v=27';
import * as calc from '../../compartilhado/regras/calc.js?v=27';
import * as game from '../../compartilhado/regras/gamificacao.js?v=27';
import { carregarSemanasPausadas } from '../../compartilhado/firebase/semanas-pausadas.js';
import { resumoDeAdesao } from '../../compartilhado/regras/adesao.js';
import { cardDeAdesao } from '../../compartilhado/ui/adesao-card.js?v=27';
import { carregarGastoTreino } from './nutricao-read.js?v=27';
import { carregarCargasAluno } from './cargas-read.js?v=27';
import { carregarConclusoesDesafios } from './desafios-read.js?v=27';
import { carregarRotinaAluno } from './rotina-read.js?v=27';
import { esc, isoLocal, fmtN, numf, fmtDataCurta, waMsg, semanaSegSab } from './util/formato.js?v=27';
import { $, $$ } from './util/dom.js?v=27';
import { estado, on, EVENTOS } from './estado.js?v=27';
import { metasCorporaisDe, patchDeMetas } from './metas-grupo.js?v=27';

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
    <text x="${pad.l - 6}" y="${(Y(yMax) + 4).toFixed(1)}" class="clbl" text-anchor="end">${fmtN(yMax, 1)}</text>
    <text x="${pad.l - 6}" y="${(Y(yMin) + 4).toFixed(1)}" class="clbl" text-anchor="end">${fmtN(yMin, 1)}</text>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
    <text x="${X(0).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="start">${fmtDataCurta(serie[0].d)}</text>
    <text x="${X(n - 1).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="end">${fmtDataCurta(serie[n - 1].d)}</text>
  </svg>`;
}

function insightsHTML(a, avs) {
  if (avs.length < 2) return `<div class="note">Cadastre ao menos 2 avaliações para ver a evolução.</div>`;
  const pri = avs[0], ult = avs[avs.length - 1];
  const rp = calc.calcular(pri, a), ru = calc.calcular(ult, a);
  const items = [];
  const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const push = (label, va, vb, unidade, melhorSe) => {
    if (va == null || vb == null) return;
    const d = vb - va; if (Math.abs(d) < 1e-9) return;
    const bom = melhorSe === 'down' ? d < 0 : melhorSe === 'up' ? d > 0 : null;
    const cls = bom === true ? 'bom' : bom === false ? 'ruim' : '';
    items.push(`<div class="insight ${cls}"><span class="ic">${d < 0 ? '▼' : '▲'}</span><span><span class="it">${label}: ${d > 0 ? '+' : '−'}${fmtN(Math.abs(d), 1)} ${unidade}</span><br><span class="iv">de ${fmtN(va, 1)} para ${fmtN(vb, 1)} ${unidade}</span></span></div>`);
  };
  push('Peso', numf(pri.peso), numf(ult.peso), 'kg', null);
  push('% Gordura', rp.perc, ru.perc, '%', 'down');
  push('Massa magra', rp.massaMagra, ru.massaMagra, 'kg', 'up');
  push('Cintura', numf(pri.perimetros?.cintura), numf(ult.perimetros?.cintura), 'cm', 'down');
  push('Abdômen', numf(pri.perimetros?.abdomen), numf(ult.perimetros?.abdomen), 'cm', 'down');
  if (!items.length) return `<div class="note">Ainda não há dados comparáveis entre as avaliações.</div>`;
  return `<div class="note" style="margin-bottom:8px">Comparando a 1ª avaliação (${fmtDataCurta(pri.dataRealizada)}) com a última (${fmtDataCurta(ult.dataRealizada)}).</div>` + items.join('');
}

/** As avaliações realizadas, da mais antiga para a mais nova. @param {any} a */
const avaliacoesFeitas = (a) => (a.avaliacoes || []).filter((x) => x.dataRealizada).sort((x, y) => (x.dataRealizada < y.dataRealizada ? -1 : 1));

/**
 * Os gráficos das avaliações (peso, % de gordura, massa magra, cintura e os
 * testes de desempenho), só os que têm ao menos dois pontos.
 * @param {any} a
 */
export function htmlEvolucao(a) {
  const avs = avaliacoesFeitas(a);
  if (avs.length < 2) {
    return `<div class="prog-ph tr-ph">${avs.length ? 'Cadastre ao menos 2 avaliações para ver os gráficos.' : 'Nenhuma avaliação cadastrada ainda.'}</div>`;
  }
  const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const serie = (fn) => avs.map((av) => ({ d: av.dataRealizada, y: fn(av) })).filter((p) => p.y != null && !isNaN(p.y));
  const graficos = [
    ['Peso corporal (kg)', serie((av) => numf(av.peso)), 'var(--accent)'],
    ['% Gordura corporal', serie((av) => calc.calcular(av, a).perc), '#ff5b50'],
    ['Massa magra (kg)', serie((av) => calc.calcular(av, a).massaMagra), '#3fb950'],
    ['Cintura (cm)', serie((av) => numf(av.perimetros?.cintura)), 'var(--accent-2)'],
    ['Flexões (máx.)', serie((av) => numf(av.testes?.flexoes)), 'var(--accent)'],
    ['Prancha (s)', serie((av) => numf(av.testes?.prancha)), '#3fb950'],
    ['Agachamentos (1 min)', serie((av) => numf(av.testes?.agachamentos)), 'var(--accent-2)'],
    ['Abdominais (1 min)', serie((av) => numf(av.testes?.abdominais)), '#ff5b50'],
  ].filter(([, s]) => s.length >= 2);
  if (!graficos.length) return '<div class="prog-ph tr-ph">As avaliações ainda não têm um mesmo dado para comparar.</div>';
  return `<div class="tr-graficos">${graficos.map(([t, s, cor]) => `
    <div class="tr-graf"><h4 class="tr-graf-t">${t}</h4>${chartSVG(s, { cor })}</div>`).join('')}
  </div>`;
}

/** "Pontos que foram melhorados": a 1ª avaliação contra a última. @param {any} a */
export function htmlMelhorias(a) {
  return `<div class="insights">${insightsHTML(a, avaliacoesFeitas(a))}</div>`;
}

/** O card "Uso do app" da aba Histórico: adesão aos hábitos e medalhas (o que o aluno faz no app). */
function renderProgresso() {
  const a = estado.alunoAtual; if (!a) return;
  for (const id of ['#prog-adesao', '#prog-medalhas']) { const el = $(id); if (el) el.innerHTML = '<div class="prog-ph">Carregando…</div>'; }
  carregarAdesaoHabitos(a);
  carregarMedalhasAluno(a);
}

/* ---- Adesão aos hábitos (rotinas/{email}, gravado pelo app mobile) ---- */

/**
 * Painel de adesão do aluno na aba Uso do app.
 *
 * Aqui fica só o transporte: buscar o documento, tratar a troca de aluno durante
 * a carga e a falha de rede. A conta mora em `compartilhado/regras/adesao.js` e o
 * desenho em `compartilhado/ui/adesao-card.js` — os dois puros, testáveis no Node
 * e conferíveis sem um aluno logado.
 */
async function carregarAdesaoHabitos(a) {
  const alvoId = a.id;
  const el = $('#prog-adesao'); if (!el) return;
  const email = (a.email || '').trim().toLowerCase();
  if (!email) { el.innerHTML = `<div class="prog-ph">Aluno sem e-mail cadastrado — sem rotina no app.</div>`; return; }

  let doc = null;
  try { doc = await carregarRotinaAluno(email); }
  catch (e) {
    console.warn('Adesão:', e?.code || e);
    if ($('#prog-adesao') && estado.alunoAtual?.id === alvoId) {
      $('#prog-adesao').innerHTML = `<div class="prog-ph">Não foi possível carregar agora.</div>`;
    }
    return;
  }
  if (!$('#prog-adesao') || estado.alunoAtual?.id !== alvoId) return; // trocou de aluno enquanto carregava

  // Telefone curto demais não vira link de WhatsApp — sem `waHref`, o card
  // simplesmente não oferece o botão.
  const wa = String(a.telefone || '').replace(/\D/g, '');
  $('#prog-adesao').innerHTML = cardDeAdesao(resumoDeAdesao(doc), {
    nome: a.nome,
    waHref: wa.length >= 10 ? (texto) => waMsg(a.telefone, texto) : undefined,
  });
}

/** Resumo das medalhas do aluno (mesma lógica do Portal) — para parabenizar. */
async function carregarMedalhasAluno(a) {
  const alvoId = a.id;
  const el = $('#prog-medalhas'); if (!el) return;
  const email = (a.email || '').trim().toLowerCase();
  let gastos = [], concl = [];
  if (email) {
    try { const g = await carregarGastoTreino(email); gastos = (g && g.gastos) || []; } catch (e) { console.warn('Medalhas:', e?.code || e); }
    try { concl = await carregarConclusoesDesafios(email); } catch (e) { console.warn('Medalhas:', e?.code || e); }
  }
  const pausadas = await carregarSemanasPausadas();
  // Depois de TODAS as leituras: o coach pode ter trocado de aluno enquanto elas voltavam.
  if (!$('#prog-medalhas') || estado.alunoAtual?.id !== alvoId) return;
  const meds = game.medalhasDaFicha(a, { gastos, conclusoes: concl, pausadas });
  const ok = meds.filter((m) => m.ok);
  const prox = meds.find((m) => !m.ok);
  const nome1 = (a.nome || '').trim().split(/\s+/)[0] || 'o aluno';
  const wa = String(a.telefone || '').replace(/\D/g, '');
  el.innerHTML = `
    <div class="med-resumo">
      <span class="med-cont">${ok.length}<small>/${meds.length}</small></span>
      <span class="med-cont-l">medalhas conquistadas</span>
      ${wa.length >= 10 && ok.length ? `<a class="btn btn-sm med-wa" href="${waMsg(a.telefone, `Parabéns, ${nome1}! 🏅 Você já desbloqueou ${ok.length} de ${meds.length} medalhas no Portal do Aluno. Bora pra próxima! 💪`)}" target="_blank" rel="noopener">Parabenizar no WhatsApp</a>` : ''}
    </div>
    ${ok.length ? `<div class="med-grid">${ok.map((m) => `<div class="med-chip" title="${esc(m.desc)}"><span>${m.ic}</span>${esc(m.nome)}</div>`).join('')}</div>` : '<div class="prog-ph">Ainda sem medalhas. Conforme treina, avalia e cumpre desafios, elas aparecem aqui.</div>'}
    ${prox ? `<div class="med-prox">Próxima: <b>${prox.ic} ${esc(prox.nome)}</b> — ${esc(prox.desc)}</div>` : ''}`;
}

/** Card read-only de evolução de força (registro de cargas do Portal). */
export async function carregarCargasForca(a) {
  const alvoId = a.id;
  const el = $('#prog-cargas'); if (!el) return;
  const email = (a.email || '').trim().toLowerCase();
  if (!email) { el.innerHTML = `<div class="prog-ph">Aluno sem e-mail — sem registro de cargas.</div>`; return; }
  let regs;
  try { regs = await carregarCargasAluno(email); }
  catch (e) { console.warn('Cargas:', e?.code || e); if ($('#prog-cargas') && estado.alunoAtual?.id === alvoId) $('#prog-cargas').innerHTML = `<div class="prog-ph">Não foi possível carregar agora.</div>`; return; }
  if (!$('#prog-cargas') || estado.alunoAtual?.id !== alvoId) return;
  if (!regs.length) { $('#prog-cargas').innerHTML = `<div class="prog-ph">O aluno ainda não registrou cargas no Portal.</div>`; return; }
  const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const grupos = new Map();
  regs.forEach((r) => { const k = norm(r.exercicio); if (!grupos.has(k)) grupos.set(k, { nome: r.exercicio, itens: [] }); grupos.get(k).itens.push(r); });
  const lista = [...grupos.values()].sort((x, y) => (Math.max(...y.itens.map((i) => i.criadoEm || 0)) - Math.max(...x.itens.map((i) => i.criadoEm || 0))));
  $('#prog-cargas').innerHTML = lista.map((g) => {
    const porDia = new Map();
    g.itens.forEach((x) => { const c = numf(x.cargaKg); if (c != null) porDia.set(x.data, Math.max(porDia.get(x.data) || 0, c)); });
    const serie = [...porDia.entries()].sort((p, q) => (p[0] < q[0] ? -1 : 1)).map(([d, y]) => ({ d, y }));
    const melhor = Math.max(...g.itens.map((x) => numf(x.cargaKg) || 0));
    const graf = serie.length >= 2 ? chartSVG(serie, { cor: 'var(--accent)' }) : `<div class="prog-ph" style="padding:14px">Só um dia registrado até agora.</div>`;
    return `<div class="forca-item"><div class="forca-top"><b>${esc(g.nome)}</b><span>recorde ${fmtN(melhor, 1)} kg</span></div>${graf}</div>`;
  }).join('');
}

/** Card de metas do aluno (definir/remover + barra de progresso). Publica no Portal ao salvar. */
export function renderMetasCoach(a) {
  const el = $('#prog-metas'); if (!el) return;
  const avs = (a.avaliacoes || []).filter((x) => x.dataRealizada);
  const avsOrd = avs.slice().sort((x, y) => (x.dataRealizada < y.dataRealizada ? -1 : 1));
  const metas = metasCorporaisDe(a);
  const barras = metas.map((m) => {
    const p = calc.progressoMeta(m, avs, a);
    const t = calc.META_TIPOS[m.tipo] || { label: m.tipo, unidade: '', dec: 1 };
    const pctTxt = p.pct != null ? Math.round(p.pct) + '% do caminho' : 'sem avaliação ainda';
    return `<div class="meta-row">
      <div class="meta-top"><span class="meta-nome">${esc(t.label)}${p.atingida ? ' <span class="meta-ok">✓ atingida</span>' : ''}</span><button class="meta-x" data-id="${esc(m.id)}" type="button" title="Remover meta">×</button></div>
      <div class="meta-bar"><div class="meta-fill${p.atingida ? ' ok' : ''}" style="width:${p.pct != null ? p.pct.toFixed(0) : 0}%"></div></div>
      <div class="meta-vals"><span>Início ${p.base != null ? fmtN(p.base, t.dec) : '—'}</span><b>Atual ${p.atual != null ? fmtN(p.atual, t.dec) : '—'} ${esc(t.unidade)}</b><span>Meta ${p.alvo != null ? fmtN(p.alvo, t.dec) : '—'}</span></div>
      <div class="meta-foot">${pctTxt}</div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <form id="meta-form" class="meta-form">
      <select id="meta-tipo">${Object.entries(calc.META_TIPOS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <input id="meta-alvo" type="number" step="any" min="0" placeholder="Valor da meta" required>
      <button class="btn btn-sm" type="submit">Definir meta</button>
    </form>
    ${barras || '<div class="prog-ph">Nenhuma meta ainda. Combine um objetivo com o aluno (peso, % de gordura ou cintura) — ele acompanha a barra no Portal.</div>'}`;
  $('#meta-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = $('#meta-tipo').value;
    const alvo = numf($('#meta-alvo').value);
    if (alvo == null) return;
    const base = calc.valorMetrica(tipo, avsOrd[avsOrd.length - 1], a);
    const nova = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tipo, alvo, base, baseData: avsOrd[avsOrd.length - 1]?.dataRealizada || null, criadoEm: Date.now() };
    db.atualizar(a.id, patchDeMetas(a, [...metas, nova]));
    estado.alunoAtual = db.obter(a.id);
    renderMetasCoach(estado.alunoAtual);
  });
  $$('#prog-metas .meta-x').forEach((b) => b.addEventListener('click', () => {
    db.atualizar(a.id, patchDeMetas(a, metas.filter((m) => m.id !== b.dataset.id)));
    estado.alunoAtual = db.obter(a.id);
    renderMetasCoach(estado.alunoAtual);
  }));
}

/* ---- Gasto calórico de treino (semana, vindo do Portal do Aluno) ---- */

/** Gráfico de barras Seg–Sáb (kcal), no mesmo estilo dos gráficos do progresso. */
function barrasNutri(valores, labels, hojeIso, dias) {
  const W = 600, H = 190, pad = { l: 16, r: 12, t: 22, b: 28 };
  const max = Math.max(1, ...valores);
  const n = valores.length, areaW = W - pad.l - pad.r, step = areaW / n, bw = step * 0.56;
  const Y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const bars = valores.map((v, i) => {
    const x = pad.l + step * i + (step - bw) / 2, y = Y(v), h = (H - pad.b) - y;
    const ehHoje = isoLocal(dias[i]) === hojeIso;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="4" fill="${ehHoje ? 'var(--accent)' : 'var(--accent-2)'}"/>
      ${v > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="clbl" text-anchor="middle">${fmtN(v, 0)}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="middle">${labels[i]}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto calórico por dia">
    <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="ax"/>${bars}</svg>`;
}

export async function carregarGastoSemana(a) {
  const alvoId = a.id;
  const el = $('#prog-nutri'); if (!el) return;
  const email = (a.email || '').trim().toLowerCase();
  if (!email) { el.innerHTML = `<div class="prog-ph">Aluno sem e-mail cadastrado — sem dados do Portal.</div>`; return; }
  let dados;
  try { dados = await carregarGastoTreino(email); }
  catch (e) { console.warn('Nutrição:', e?.code || e); if ($('#prog-nutri') && estado.alunoAtual?.id === alvoId) $('#prog-nutri').innerHTML = `<div class="prog-ph">Não foi possível carregar agora.</div>`; return; }
  if (!$('#prog-nutri') || estado.alunoAtual?.id !== alvoId) return; // trocou de aluno enquanto carregava
  const gastos = (dados && dados.gastos) || [];
  const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const dias = semanaSegSab();
  const somaDia = dias.map((d) => { const iso = isoLocal(d); return gastos.filter((g) => g.data === iso).reduce((s, g) => s + (numf(g.calorias) || 0), 0); });
  const total = somaDia.reduce((s, v) => s + v, 0);
  if (!gastos.length) { $('#prog-nutri').innerHTML = `<div class="prog-ph">O aluno ainda não registrou treinos no Portal.</div>`; return; }
  const hj = isoLocal(new Date());
  $('#prog-nutri').innerHTML = `
    <div class="nutri-total"><span>Total queimado (Seg–Sáb)</span><b>${fmtN(total, 0)} kcal</b></div>
    ${barrasNutri(somaDia, ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], hj, dias)}`;
}

/** Lista os feedbacks pós-treino enviados pelo aluno no Portal (mais recentes primeiro). */
export function feedbacksHTML(a) {
  const fbs = (Array.isArray(a.feedbacks) ? a.feedbacks : []).slice().sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0));
  if (!fbs.length) return `<div class="prog-ph">Nenhum feedback ainda. O aluno pode enviar pelo Portal do Aluno.</div>`;
  const DOR = { nenhuma: ['Sem dor', 'ok'], leve: ['Dor leve', 'ok'], moderada: ['Dor moderada', 'warn'], forte: ['Dor forte', 'bad'] };
  const fmtD = (iso) => { if (!iso) return ''; const [an, m, d] = String(iso).split('-'); return `${d}/${m}/${an}`; };
  return `<ul class="fb-list">` + fbs.map((f) => {
    const [dl, dc] = DOR[f.dor] || ['—', ''];
    const rpe = Math.max(0, Math.min(10, Number(f.esforco) || 0));
    return `<li class="fb-item">
      <div class="fb-top">
        <span class="fb-data">${fmtD(f.data)}</span>
        <span class="fb-rpe">Esforço <b>${rpe}</b>/10</span>
        <span class="fb-dor ${dc}">${dl}</span>
      </div>
      ${f.obs ? `<p class="fb-obs">${String(f.obs).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>` : ''}
    </li>`;
  }).join('') + `</ul>`;
}

/* ============================================================
   Redesenho e a ligação com o barramento
   ============================================================ */

/** A aba Histórico (onde mora o card "Uso do app") está na tela? */
const visivel = () => !!$('#tab-historico')?.classList.contains('active') && !!$('#tela-perfil')?.classList.contains('active');

/** Desenha o card com a ficha do banco (a da abertura do perfil pode estar velha). A aba Histórico chama. */
export function abrirUsoDoApp() {
  if (!estado.alunoAtual) return;
  const id = String(estado.alunoAtual.id);
  estado.alunoAtual = db.obter(id) || estado.alunoAtual;
  renderProgresso();
}

/** Liga o card ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabProgresso() {
  // O aluno mandou algo pelo app ou pelo Portal (o merge das caixas avisa por
  // 'registros-mudaram'): com a aba Histórico aberta, aparece.
  on(EVENTOS.REGISTROS_MUDARAM, (id) => {
    if (visivel() && estado.alunoAtual && String(estado.alunoAtual.id) === String(id)) abrirUsoDoApp();
  });
}
