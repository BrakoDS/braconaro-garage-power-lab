// @ts-check
/**
 * Geração de PDF (via janela de impressão — o usuário escolhe "Salvar como PDF").
 *  - exportarAvaliacao(aluno, av): relatório de uma avaliação.
 *  - exportarFicha(aluno): ficha completa (dados + anamnese + PAR-Q + histórico).
 */
import * as calc from './calc.js?v=2';

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
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
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
  @media print{body{padding:0 6px}}
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

  const inner = `
    <div class="hd">
      <div><div class="t1">Braconaro Garage Power Lab</div><div class="t2">Avaliação Física</div></div>
      <div class="meta">Avaliação #${String(av.num).padStart(2, '0')}<br/>Realizada: ${fmtData(av.dataRealizada)}<br/>Próxima: ${fmtData(av.dataProxima)}</div>
    </div>
    <h2>Aluno</h2>
    <table>${row('Nome', aluno.nome)}${row('ID', '#' + aluno.id)}${row('Sexo', aluno.sexo)}${row('Idade', r.idade ? r.idade + ' anos' : '')}${row('Objetivo', aluno.objetivo)}</table>
    <h2>Resultados</h2>
    <div class="cards">
      <div class="card"><div class="l">% Gordura</div><div class="v">${r.perc != null ? fmt(r.perc) + '%' : '—'}</div><div class="s">${esc(r.percClass)}${r.protocolo ? ' · ' + r.protocolo : ''}</div></div>
      <div class="card"><div class="l">IMC</div><div class="v">${fmt(r.imc)}</div><div class="s">${esc(r.imcClass)}</div></div>
      <div class="card"><div class="l">Massa gorda</div><div class="v">${r.massaGorda != null ? fmt(r.massaGorda) : '—'}</div><div class="s">kg</div></div>
      <div class="card"><div class="l">Massa magra</div><div class="v">${r.massaMagra != null ? fmt(r.massaMagra) : '—'}</div><div class="s">kg</div></div>
      <div class="card"><div class="l">RCQ</div><div class="v">${r.rcq != null ? fmt(r.rcq, 2) : '—'}</div><div class="s">${esc(r.rcqClass)}</div></div>
      <div class="card"><div class="l">Cintura/estatura</div><div class="v">${rce != null ? fmt(rce, 2) : '—'}</div><div class="s">${esc(calc.classifRcest(rce))}</div></div>
    </div>
    <h2>Medidas</h2>
    <table>${row('Peso', av.peso ? av.peso + ' kg' : '')}${row('Estatura', av.estatura ? av.estatura + ' cm' : '')}${row('Soma das dobras' + (r.protocolo ? ' (' + r.protocolo + ')' : ''), r.soma != null ? r.soma + ' mm' : '')}</table>
    ${(av.pas || av.fc || av.spo2) ? `<h2>Sinais vitais</h2><table>${row('Pressão arterial', av.pas && av.pad ? `${av.pas}/${av.pad} mmHg (${calc.classifPressao(av.pas, av.pad)})` : '')}${row('Freq. cardíaca', av.fc ? av.fc + ' bpm' : '')}${row('Saturação SpO₂', av.spo2 ? av.spo2 + '% (' + calc.classifSpo2(av.spo2) + ')' : '')}</table>` : ''}
    <h2>Dobras cutâneas</h2><div class="blk">${dobras || '—'}</div>
    <h2>Perímetros</h2><div class="blk">${perim || '—'}</div>
    ${testes ? `<h2>Testes físicos</h2><div class="blk">${testes}</div>` : ''}
    ${mob ? `<h2>Mobilidade</h2><div class="blk">${mob}</div>` : ''}
    <h2>Condições no dia</h2><div class="blk">${cond}</div>
    ${av.obs ? `<h2>Observações</h2><div class="blk">${esc(av.obs)}</div>` : ''}
    ${fotoTags ? `<h2>Fotos de progresso</h2><div class="fotos">${fotoTags}</div>` : ''}`;
  abrirImpressao(`Avaliação ${aluno.nome} #${String(av.num).padStart(2, '0')}`, inner);
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
