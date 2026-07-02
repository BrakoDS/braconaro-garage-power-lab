// @ts-check
/**
 * Geração de PDF (via janela de impressão — o usuário escolhe "Salvar como PDF").
 *  - exportarAvaliacao(aluno, av): relatório de uma avaliação.
 *  - exportarFicha(aluno): ficha completa (dados + anamnese + PAR-Q + histórico).
 */
import * as calc from './calc.js?v=4';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
function fmtData(iso) { if (!iso) return '—'; const [a, m, dd] = iso.split('-'); return `${dd}/${m}/${a}`; }
function row(k, v) { return v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : ''; }

const PARQ_Q = [
  'Algum médico já disse que você possui um problema cardíaco e que só deveria praticar atividade física sob supervisão médica?',
  'Você sente dor no peito quando pratica atividade física?',
  'No último mês, você sentiu dor no peito sem estar praticando atividade física?',
  'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
  'Você tem algum problema ósseo ou articular que poderia piorar com a mudança na atividade física?',
  'Você toma atualmente algum medicamento para pressão arterial ou problema cardíaco?',
  'Você sabe de alguma outra razão pela qual não deveria praticar atividade física?',
];
const ANAMNESE_LABELS = [
  ['experiencia', 'Experiência'], ['historicoTreino', 'Histórico de treino'], ['rotina', 'Profissão / rotina'],
  ['sono', 'Sono (h/noite)'], ['estresse', 'Estresse'], ['refeicoes', 'Refeições/dia'], ['hidratacao', 'Hidratação (L/dia)'],
  ['tabagismo', 'Tabagismo'], ['alcool', 'Álcool'], ['doencas', 'Doenças / cirurgias'], ['medicamentos', 'Medicamentos'],
  ['histFamiliar', 'Histórico familiar'], ['doresLesoes', 'Dores / lesões atuais'], ['objetivoDetalhe', 'Objetivo detalhado'],
];

const STYLE = `
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
  body{margin:0;color:#111;background:#fff;padding:34px}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f5c518;padding-bottom:12px;margin-bottom:18px}
  .hd .t1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#777}
  .hd .t2{font-size:24px;font-weight:800;margin-top:2px}
  .hd .meta{text-align:right;font-size:12px;color:#444;line-height:1.5}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin:18px 0 8px;border-bottom:1px solid #e3e3e3;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:#666;font-weight:600;width:34%;padding:5px 0;vertical-align:top}
  td{padding:5px 0;vertical-align:top}
  .cards{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0}
  .card{border:1px solid #e3e3e3;border-radius:8px;padding:10px 14px;min-width:108px}
  .card .l{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#999}
  .card .v{font-size:20px;font-weight:800;line-height:1.1}
  .card .s{font-size:11px;color:#666}
  .blk{font-size:13px;line-height:1.6}
  .dt{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
  .dt th,.dt td{border:1px solid #ddd;padding:6px 8px;text-align:left;width:auto}
  .dt th{background:#f5f5f5;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#666}
  .parq-ol{font-size:12.5px;line-height:1.5;margin:4px 0;padding-left:20px}
  .parq-ol b{color:#111}
  .banner{padding:10px 14px;border-radius:6px;font-size:12.5px;margin:6px 0;border:1px solid #ddd}
  .banner.alerta{background:#fff6e6;border-color:#f0c36d;color:#8a5a00}
  .banner.ok{background:#eef9f0;border-color:#9cd6a6;color:#1f7a36}
  .fotos{display:flex;gap:12px}
  figure{margin:0;flex:1;text-align:center}
  figure img{width:100%;border:1px solid #ccc;border-radius:8px}
  figcaption{font-size:11px;color:#666;margin-top:4px}
  .ft{margin-top:26px;border-top:1px solid #e3e3e3;padding-top:10px;font-size:11px;color:#999;display:flex;justify-content:space-between}
  @media print{
    *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
    body{padding:0 6px} .pagebreak{page-break-before:always}
  }

  /* ---------- Relatório visual (avaliação) ---------- */
  .hd2{display:flex;align-items:center;gap:14px;border-bottom:4px solid #f5c518;padding-bottom:14px;margin-bottom:18px}
  .hd2 .hd-logo{width:46px;height:46px;border-radius:9px;flex:0 0 auto;display:block}
  .hd2 .hd-brand{flex:1}
  .hd2 .t1{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#777}
  .hd2 .t2{font-size:20px;font-weight:800;margin-top:2px}
  .hd2 .meta{text-align:right;font-size:12px;color:#444;line-height:1.55}
  .stu-card{display:flex;justify-content:space-between;align-items:center;background:#fafafa;border:1px solid #eee;border-radius:10px;padding:14px 18px;margin-bottom:14px}
  .stu-card .nm{font-size:16px;font-weight:800}
  .stu-card .sub{font-size:12px;color:#666;margin-top:2px}
  .peso-row{display:flex;align-items:center;justify-content:space-between;border-top:1px dashed #ddd;border-bottom:1px dashed #ddd;padding:12px 4px;margin:0 0 18px}
  .peso-row .lbl{font-size:13px;color:#666;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .peso-row .val{font-size:24px;font-weight:800}
  .sec-tt{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 2px}
  .comp-wrap{display:flex;align-items:center;gap:24px;margin:10px 0 22px}
  .comp-legend{flex:1;font-size:13px;line-height:2.1}
  .comp-legend .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}
  .comp-legend .dot.gorda{background:#ff5b50}
  .comp-legend .dot.magra{background:#3fb950}
  .comp-proto{font-size:11px;color:#999;margin-top:4px}

  /* Cartão de indicador: ícone | régua+ticks | legenda de faixas */
  .ga-row{display:flex;gap:16px;align-items:center;border:1px solid #eee;border-radius:10px;padding:14px 18px;margin-bottom:12px}
  .ga-icon{width:52px;height:52px;border-radius:50%;background:#12203a;color:#f5c518;flex:0 0 auto;
    display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:13px;line-height:1.1}
  .ga-icon span{font-size:8.5px;color:#cbd5e1;font-weight:600;margin-top:1px;text-transform:uppercase;letter-spacing:.03em}
  .ga-mid{flex:1;min-width:0}
  .ga-title-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;gap:8px}
  .ga-title{font-size:13px;font-weight:800;white-space:nowrap}
  .ga-sub{font-size:10.5px;color:#999}
  .ga-badge{font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;color:#fff;white-space:nowrap}
  .gauge{position:relative;margin-top:8px;padding-bottom:14px}
  .g-bar{position:relative;display:flex;height:20px;border-radius:10px;overflow:visible}
  .g-bar span{height:100%}
  .g-bar span:first-child{border-radius:10px 0 0 10px}
  .g-bar span:last-child{border-radius:0 10px 10px 0}
  .g-val{position:absolute;top:50%;transform:translate(-50%,-50%);background:#12203a;color:#fff;
    font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35)}
  .g-ticks{position:relative;height:13px;margin-top:3px}
  .g-tick{position:absolute;top:0;transform:translateX(-50%);font-size:9px;color:#999}
  .ga-legend{flex:0 0 132px;font-size:9.5px;line-height:1.85;border-left:1px solid #eee;padding-left:12px;color:#555}
  .ga-legend .dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
  .refs{font-size:10.5px;color:#999;line-height:1.6;margin-top:6px}
`;

function abrirImpressao(title, inner) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${STYLE}</style></head><body>${inner}
    <div class="ft"><span>Braconaro Garage Power Lab · Agudos/SP</span><span>Gerado em ${new Date().toLocaleDateString('pt-BR')}</span></div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para exportar o PDF.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/* ============================================================
   Gauges e gráfico de composição (relatório visual)
   ============================================================ */
const LOGO_URL = new URL('../icons/icon-512.png', import.meta.url).href;

/** Zona de classificação atual (cor + nome) a partir de uma faixa [limite, cor, nome][]. */
function zonaAtual(valor, faixas) {
  for (const [lim, cor, nome] of faixas) if (valor < lim) return { cor, nome };
  return null;
}

/** Régua de faixas coloridas com o valor atual flutuando sobre a barra + ticks nos limites. */
function gaugeHTML(valor, faixas, { min, max, dec = 1 } = {}) {
  if (valor == null || !faixas?.length) return '<div class="gauge"></div>';
  const bounds = faixas.map(([lim]) => (lim === Infinity ? max : lim));
  let prev = min;
  const segs = faixas.map(([, cor], i) => {
    const to = Math.min(bounds[i], max);
    const w = Math.max(0, ((to - Math.max(prev, min)) / (max - min)) * 100);
    prev = bounds[i];
    return `<span style="width:${w}%;background:${cor}"></span>`;
  }).join('');
  const val = Math.min(max, Math.max(min, valor));
  const pct = ((val - min) / (max - min)) * 100;
  const ticks = bounds.slice(0, -1).map((b) => `<span class="g-tick" style="left:${(((b - min) / (max - min)) * 100).toFixed(1)}%">${fmt(b, dec)}</span>`).join('');
  return `<div class="gauge">
    <div class="g-bar">${segs}<span class="g-val" style="left:${pct.toFixed(1)}%">${fmt(valor, dec)}</span></div>
    <div class="g-ticks">${ticks}</div>
  </div>`;
}

/** Cartão de indicador no estilo "ícone + régua + legenda de faixas". */
function gaugeCard({ icone, unidadeIcone, titulo, subtitulo, valor, faixas, opts }) {
  if (valor == null) return '';
  const zona = zonaAtual(valor, faixas);
  const legenda = faixas.map(([, cor, nome]) => `<div><span class="dot" style="background:${cor}"></span>${esc(nome)}</div>`).join('');
  return `<div class="ga-row">
    <div class="ga-icon">${esc(icone)}${unidadeIcone ? `<span>${esc(unidadeIcone)}</span>` : ''}</div>
    <div class="ga-mid">
      <div class="ga-title-row">
        <div><span class="ga-title">${esc(titulo)}</span> <span class="ga-sub">${esc(subtitulo)}</span></div>
        ${zona ? `<span class="ga-badge" style="background:${zona.cor}">${esc(zona.nome)}</span>` : ''}
      </div>
      ${gaugeHTML(valor, faixas, opts)}
    </div>
    <div class="ga-legend">${legenda}</div>
  </div>`;
}

/** Anel de composição corporal: vermelho = % gordura, verde = % massa magra. */
function donutSVG(percGorda) {
  const raio = 44, circ = 2 * Math.PI * raio;
  const p = Math.min(100, Math.max(0, percGorda));
  const len = (circ * p) / 100;
  return `<svg width="112" height="112" viewBox="0 0 112 112">
    <circle cx="56" cy="56" r="${raio}" fill="none" stroke="#3fb950" stroke-width="14"/>
    <circle cx="56" cy="56" r="${raio}" fill="none" stroke="#ff5b50" stroke-width="14"
      stroke-dasharray="${len.toFixed(1)} ${(circ - len).toFixed(1)}" transform="rotate(-90 56 56)"/>
  </svg>`;
}

/* ============================================================
   Relatório de UMA avaliação
   ============================================================ */
export function exportarAvaliacao(aluno, av) {
  const r = calc.calcular(av, aluno);
  const rce = calc.rcest(av.perimetros?.cintura, av.estatura);
  const dobras = calc.DOBRAS_7.filter((d) => av.dobras?.[d.key]).map((d) => `${d.label}: ${av.dobras[d.key]} mm`).join(' · ');
  const perim = calc.PERIMETROS.map((p) => (av.perimetros?.[p.key] ? `${p.label}: ${av.perimetros[p.key]} cm` : null)).filter(Boolean).join(' · ');
  const cond = [['jejum', 'Jejum 2–4h'], ['semTreino', 'Sem treino 12h'], ['roupasLeves', 'Roupas leves'], ['bexiga', 'Bexiga vazia']]
    .filter(([k]) => av.cond?.[k]).map(([, l]) => l).join(' · ') || '—';
  const testes = [['flexoes', 'Flexões'], ['prancha', 'Prancha (s)'], ['agachamentos', 'Agachamentos 1min'], ['abdominais', 'Abdominais 1min']]
    .filter(([k]) => av.testes?.[k]).map(([k, l]) => `${l}: ${av.testes[k]}`).join(' · ');
  const mob = [['tornozeloD', 'Tornozelo D'], ['tornozeloE', 'Tornozelo E'], ['ombroD', 'Ombro D'], ['ombroE', 'Ombro E'], ['sentarAlcancar', 'Sentar-e-alcançar']]
    .filter(([k]) => av.mobilidade?.[k]).map(([k, l]) => `${l}: ${av.mobilidade[k]} cm`).join(' · ');
  const fotos = av.fotos || {};
  const fotoTags = ['frente', 'lado', 'costas'].filter((s) => fotos[s])
    .map((s) => `<figure><img src="${esc(fotos[s])}"/><figcaption>${s[0].toUpperCase() + s.slice(1)}</figcaption></figure>`).join('');

  // ---------- Página 1: relatório visual ----------
  const temComposicao = r.perc != null && r.massaGorda != null && r.massaMagra != null;
  const composicao = temComposicao ? `
    <div class="sec-tt">Composição Corporal</div>
    <div class="comp-proto">${esc(r.protocolo || 'Pollock')} · Jackson &amp; Pollock (1978/1980)</div>
    <div class="comp-wrap">
      ${donutSVG(r.perc)}
      <div class="comp-legend">
        <div><span class="dot gorda"></span>${fmt(r.perc)}% / ${fmt(r.massaGorda)} kg — Massa gorda</div>
        <div><span class="dot magra"></span>${fmt(100 - r.perc)}% / ${fmt(r.massaMagra)} kg — Massa magra</div>
      </div>
    </div>` : '';

  const agua = numf(av.aguaCorporal), visceral = numf(av.gorduraVisceral);
  const gauges = [
    r.perc != null && gaugeCard({ icone: '%', unidadeIcone: 'gordura', titulo: '% de Gordura Corporal', subtitulo: 'ACSM/ACE, por sexo',
      valor: r.perc, faixas: calc.faixaGordura(r.cod), opts: { min: 0, max: r.cod === 'F' ? 38 : 32, dec: 1 } }),
    r.imc != null && gaugeCard({ icone: 'IMC', unidadeIcone: 'kg/m²', titulo: 'IMC', subtitulo: 'Índice de Massa Corporal',
      valor: r.imc, faixas: calc.FAIXA_IMC, opts: { min: 14, max: 42, dec: 1 } }),
    (r.rcq != null && r.cod) && gaugeCard({ icone: 'RCQ', unidadeIcone: 'cintura/quadril', titulo: 'RCQ', subtitulo: 'Relação Cintura-Quadril',
      valor: r.rcq, faixas: calc.faixaRcq(r.cod), opts: { min: 0.65, max: 1.05, dec: 2 } }),
    rce != null && gaugeCard({ icone: 'C/E', unidadeIcone: 'cintura/altura', titulo: 'RCEst', subtitulo: 'Relação Cintura-Estatura',
      valor: rce, faixas: calc.FAIXA_RCEST, opts: { min: 0.35, max: 0.75, dec: 2 } }),
    (agua != null && r.cod) && gaugeCard({ icone: 'H₂O', unidadeIcone: '% do peso', titulo: 'Água Corporal', subtitulo: 'Bioimpedância',
      valor: agua, faixas: calc.faixaAgua(r.cod), opts: { min: r.cod === 'F' ? 35 : 40, max: r.cod === 'F' ? 70 : 75, dec: 1 } }),
    visceral != null && gaugeCard({ icone: 'GV', unidadeIcone: 'nível', titulo: 'Gordura Visceral', subtitulo: 'Bioimpedância',
      valor: visceral, faixas: calc.FAIXA_VISCERAL, opts: { min: 1, max: 20, dec: 0 } }),
  ].filter(Boolean).join('');

  const pagina1 = `
    <div class="hd2">
      <img class="hd-logo" src="${LOGO_URL}" alt="" />
      <div class="hd-brand"><div class="t1">Braconaro Garage Power Lab</div><div class="t2">Relatório de Avaliação Física</div></div>
      <div class="meta">Avaliação #${String(av.num).padStart(2, '0')}<br/>Realizada: ${fmtData(av.dataRealizada)}<br/>Próxima: ${fmtData(av.dataProxima)}</div>
    </div>
    <div class="stu-card">
      <div><div class="nm">${esc(aluno.nome || '')}</div><div class="sub">${[aluno.objetivo, r.idade ? r.idade + ' anos' : '', aluno.sexo].filter(Boolean).join(' · ') || '—'}</div></div>
      <div class="sub">#${esc(aluno.id)}</div>
    </div>
    <div class="peso-row"><span class="lbl">Peso</span><span class="val">${av.peso ? fmt(numf(av.peso), 1) + ' kg' : '—'}</span></div>
    ${av.massaOssea ? `<div class="peso-row"><span class="lbl">Massa óssea</span><span class="val">${fmt(numf(av.massaOssea), 2)} kg</span></div>` : ''}
    ${composicao}
    ${gauges}
    <div class="refs">Referências: % de gordura (ACSM/ACE) e IMC (OMS), por faixa etária/sexo · RCQ e RCEst (OMS/IDF) — risco cardiometabólico ·
    Água corporal e gordura visceral seguem escalas usuais de balanças de bioimpedância, quando informadas.
    Os valores desta avaliação são estimativas antropométricas e não substituem avaliação médica.</div>`;

  // ---------- Página 2: detalhes técnicos ----------
  const pagina2 = `
    <div class="pagebreak"></div>
    <h2>Medidas</h2>
    <table>${row('Peso', av.peso ? av.peso + ' kg' : '')}${row('Estatura', av.estatura ? av.estatura + ' cm' : '')}${row('Soma das dobras' + (r.protocolo ? ' (' + r.protocolo + ')' : ''), r.soma != null ? r.soma + ' mm' : '')}</table>
    ${(av.pas || av.fc || av.spo2) ? `<h2>Sinais vitais</h2><table>${row('Pressão arterial', av.pas && av.pad ? `${av.pas}/${av.pad} mmHg (${calc.classifPressao(av.pas, av.pad)})` : '')}${row('Freq. cardíaca', av.fc ? av.fc + ' bpm' : '')}${row('Saturação SpO₂', av.spo2 ? av.spo2 + '% (' + calc.classifSpo2(av.spo2) + ')' : '')}</table>` : ''}
    ${(av.aguaCorporal || av.gorduraVisceral || av.massaOssea) ? `<h2>Bioimpedância</h2><table>${row('Água corporal', av.aguaCorporal ? av.aguaCorporal + '% (' + calc.classifAgua(numf(av.aguaCorporal), r.cod) + ')' : '')}${row('Gordura visceral', av.gorduraVisceral ? 'Nível ' + av.gorduraVisceral + ' (' + calc.classifVisceral(numf(av.gorduraVisceral)) + ')' : '')}${row('Massa óssea', av.massaOssea ? av.massaOssea + ' kg' : '')}</table>` : ''}
    <h2>Dobras cutâneas</h2><div class="blk">${dobras || '—'}</div>
    <h2>Perímetros</h2><div class="blk">${perim || '—'}</div>
    ${testes ? `<h2>Testes físicos</h2><div class="blk">${testes}</div>` : ''}
    ${mob ? `<h2>Mobilidade</h2><div class="blk">${mob}</div>` : ''}
    <h2>Condições no dia</h2><div class="blk">${cond}</div>
    ${av.obs ? `<h2>Observações</h2><div class="blk">${esc(av.obs)}</div>` : ''}
    ${fotoTags ? `<h2>Fotos de progresso</h2><div class="fotos">${fotoTags}</div>` : ''}`;

  abrirImpressao(`Avaliação ${aluno.nome} #${String(av.num).padStart(2, '0')}`, pagina1 + pagina2);
}

/* ============================================================
   Ficha completa do aluno
   ============================================================ */
export function exportarFicha(aluno) {
  const idade = aluno.nascimento ? calc.idadeDe(aluno.nascimento) : numf(aluno.idade);
  const an = aluno.anamnese || {};
  const pq = aluno.parq || {}; const resp = pq.respostas || {};
  const avs = (aluno.avaliacoes || []).slice().sort((a, b) => (a.dataRealizada < b.dataRealizada ? -1 : 1));

  // PAR-Q
  const respondidas = PARQ_Q.filter((_, i) => resp['q' + i]).length;
  let parqBanner = '';
  if (respondidas === PARQ_Q.length) {
    const algumSim = PARQ_Q.some((_, i) => resp['q' + i] === 'sim');
    parqBanner = algumSim
      ? `<div class="banner alerta"><b>Atenção:</b> há resposta "Sim" — recomenda-se avaliação médica antes de iniciar ou intensificar a atividade física.</div>`
      : `<div class="banner ok">Todas as respostas "Não" — apto a iniciar atividade física com bom senso.</div>`;
  } else if (respondidas > 0) {
    parqBanner = `<div class="banner">Triagem incompleta (${respondidas}/${PARQ_Q.length} respondidas).</div>`;
  }
  const parqLista = respondidas > 0
    ? `<ol class="parq-ol">${PARQ_Q.map((q, i) => `<li>${esc(q)} <b>${resp['q' + i] === 'sim' ? 'Sim' : resp['q' + i] === 'nao' ? 'Não' : '—'}</b></li>`).join('')}</ol>${pq.data ? `<div class="blk" style="color:#666">Triagem em ${fmtData(pq.data)}.</div>` : ''}${pq.obs ? `<div class="blk">${esc(pq.obs)}</div>` : ''}`
    : `<div class="blk" style="color:#999">PAR-Q ainda não preenchido.</div>`;

  // Anamnese
  const anLinhas = ANAMNESE_LABELS.map(([k, l]) => row(l, an[k])).join('');
  const anamnese = anLinhas ? `<table>${anLinhas}</table>` : `<div class="blk" style="color:#999">Anamnese ainda não preenchida.</div>`;

  // Histórico de avaliações
  let historico = `<div class="blk" style="color:#999">Nenhuma avaliação registrada.</div>`;
  if (avs.length) {
    const linhas = avs.map((av) => {
      const r = calc.calcular(av, aluno);
      const re = calc.rcest(av.perimetros?.cintura, av.estatura);
      return `<tr><td>#${String(av.num).padStart(2, '0')}</td><td>${fmtData(av.dataRealizada)}</td><td>${av.peso || '—'}</td><td>${r.perc != null ? fmt(r.perc) + '%' : '—'}</td><td>${fmt(r.imc)}</td><td>${re != null ? fmt(re, 2) : '—'}</td><td>${av.perimetros?.cintura || '—'}</td></tr>`;
    }).join('');
    historico = `<table class="dt"><tr><th>Aval.</th><th>Data</th><th>Peso (kg)</th><th>% Gord.</th><th>IMC</th><th>C/Est.</th><th>Cintura</th></tr>${linhas}</table>`;
  }

  // Evolução (1ª x última)
  let evolucao = '';
  if (avs.length >= 2) {
    const pri = avs[0], ult = avs[avs.length - 1];
    const rp = calc.calcular(pri, aluno), ru = calc.calcular(ult, aluno);
    const lin = (label, va, vb, un) => {
      if (va == null || vb == null) return '';
      const d = vb - va;
      return `<tr><td>${label}</td><td>${fmt(va, 1)} ${un}</td><td>${fmt(vb, 1)} ${un}</td><td>${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 1)} ${un}</td></tr>`;
    };
    evolucao = `<h2>Evolução (1ª × última avaliação)</h2>
      <table class="dt"><tr><th>Métrica</th><th>${fmtData(pri.dataRealizada)}</th><th>${fmtData(ult.dataRealizada)}</th><th>Δ</th></tr>
        ${lin('Peso', numf(pri.peso), numf(ult.peso), 'kg')}
        ${lin('% Gordura', rp.perc, ru.perc, '%')}
        ${lin('Massa magra', rp.massaMagra, ru.massaMagra, 'kg')}
        ${lin('Cintura', numf(pri.perimetros?.cintura), numf(ult.perimetros?.cintura), 'cm')}
      </table>`;
  }

  const wa = (aluno.telefone || '').replace(/\D/g, '');
  const inner = `
    <div class="hd">
      <div><div class="t1">Braconaro Garage Power Lab</div><div class="t2">Ficha do Aluno</div></div>
      <div class="meta">${esc(aluno.nome || '')}<br/>ID #${esc(aluno.id)} · ${esc((aluno.status || 'ativo'))}</div>
    </div>
    <h2>Dados pessoais</h2>
    <table>
      ${row('Nome', aluno.nome)}${row('Sexo', aluno.sexo)}${row('Idade', idade ? idade + ' anos' : '')}${row('Nascimento', fmtData(aluno.nascimento))}
      ${row('Telefone', aluno.telefone)}${row('E-mail', aluno.email)}${row('Endereço', aluno.endereco)}
    </table>
    <h2>Dados do treino</h2>
    <table>
      ${row('Altura', aluno.altura ? aluno.altura + ' cm' : '')}${row('Peso atual', aluno.peso ? aluno.peso + ' kg' : '')}${row('Objetivo', aluno.objetivo)}
      ${row('Frequência', aluno.freqVezes ? aluno.freqVezes + 'x/semana' + (aluno.freqHorario ? ' · ' + aluno.freqHorario : '') : aluno.freqHorario)}
      ${row('Obs. médicas / restrições', aluno.obs)}
    </table>
    <h2>Anamnese</h2>${anamnese}
    <h2>PAR-Q — Prontidão para atividade física</h2>${parqBanner}${parqLista}
    <h2>Histórico de avaliações</h2>${historico}
    ${evolucao}`;
  abrirImpressao(`Ficha — ${aluno.nome}`, inner);
}
