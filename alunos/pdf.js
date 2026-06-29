// @ts-check
/**
 * Exporta o relatório de UMA avaliação como PDF.
 * Abre uma janela com um documento próprio (tema claro, pronto para impressão)
 * e dispara o print — o usuário escolhe "Salvar como PDF".
 */
import * as calc from './calc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
function fmtData(iso) { if (!iso) return '—'; const [a, m, dd] = iso.split('-'); return `${dd}/${m}/${a}`; }
function row(k, v) { return v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : ''; }

export function exportarAvaliacao(aluno, av) {
  const r = calc.calcular(av, aluno);
  const dobras = calc.dobrasDoSexo(r.cod).map((d) => `${d.label}: ${av.dobras?.[d.key] ? av.dobras[d.key] + ' mm' : '—'}`).join(' · ');
  const perim = calc.PERIMETROS.map((p) => (av.perimetros?.[p.key] ? `${p.label}: ${av.perimetros[p.key]} cm` : null)).filter(Boolean).join(' · ');
  const cond = [['jejum', 'Jejum 2–4h'], ['semTreino', 'Sem treino 12h'], ['roupasLeves', 'Roupas leves'], ['bexiga', 'Bexiga vazia']]
    .filter(([k]) => av.cond?.[k]).map(([, l]) => l).join(' · ') || '—';
  const fotos = av.fotos || {};
  const fotoTags = ['frente', 'lado', 'costas'].filter((s) => fotos[s])
    .map((s) => `<figure><img src="${esc(fotos[s])}"/><figcaption>${s[0].toUpperCase() + s.slice(1)}</figcaption></figure>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>Avaliação ${esc(aluno.nome)} #${String(av.num).padStart(2, '0')}</title>
  <style>
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
    body{margin:0;color:#111;background:#fff;padding:34px}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f5c518;padding-bottom:12px;margin-bottom:18px}
    .hd .t1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#777}
    .hd .t2{font-size:24px;font-weight:800;margin-top:2px}
    .hd .meta{text-align:right;font-size:12px;color:#444;line-height:1.5}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin:18px 0 8px;border-bottom:1px solid #e3e3e3;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;color:#666;font-weight:600;width:34%;padding:5px 0;vertical-align:top}
    td{padding:5px 0}
    .cards{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0}
    .card{border:1px solid #e3e3e3;border-radius:8px;padding:10px 14px;min-width:110px}
    .card .l{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#999}
    .card .v{font-size:20px;font-weight:800;line-height:1.1}
    .card .s{font-size:11px;color:#666}
    .blk{font-size:13px;line-height:1.6}
    .fotos{display:flex;gap:12px}
    figure{margin:0;flex:1;text-align:center}
    figure img{width:100%;border:1px solid #ccc;border-radius:8px}
    figcaption{font-size:11px;color:#666;margin-top:4px}
    .ft{margin-top:26px;border-top:1px solid #e3e3e3;padding-top:10px;font-size:11px;color:#999;display:flex;justify-content:space-between}
    @media print{body{padding:0 6px}}
  </style></head><body>
    <div class="hd">
      <div><div class="t1">Braconaro Garage Power Lab</div><div class="t2">Avaliação Física</div></div>
      <div class="meta">Avaliação #${String(av.num).padStart(2, '0')}<br/>Realizada: ${fmtData(av.dataRealizada)}<br/>Próxima: ${fmtData(av.dataProxima)}</div>
    </div>
    <h2>Aluno</h2>
    <table>${row('Nome', aluno.nome)}${row('ID', '#' + aluno.id)}${row('Sexo', aluno.sexo)}${row('Idade', r.idade ? r.idade + ' anos' : '')}${row('Objetivo', aluno.objetivo)}</table>
    <h2>Resultados</h2>
    <div class="cards">
      <div class="card"><div class="l">IMC</div><div class="v">${fmt(r.imc)}</div><div class="s">${esc(r.imcClass)}</div></div>
      <div class="card"><div class="l">% Gordura</div><div class="v">${r.perc != null ? fmt(r.perc) + '%' : '—'}</div><div class="s">${esc(r.percClass)}</div></div>
      <div class="card"><div class="l">Massa gorda</div><div class="v">${r.massaGorda != null ? fmt(r.massaGorda) : '—'}</div><div class="s">kg</div></div>
      <div class="card"><div class="l">Massa magra</div><div class="v">${r.massaMagra != null ? fmt(r.massaMagra) : '—'}</div><div class="s">kg</div></div>
      <div class="card"><div class="l">RCQ</div><div class="v">${r.rcq != null ? fmt(r.rcq, 2) : '—'}</div><div class="s">${esc(r.rcqClass)}</div></div>
    </div>
    <h2>Medidas</h2>
    <table>${row('Peso', av.peso ? av.peso + ' kg' : '')}${row('Estatura', av.estatura ? av.estatura + ' cm' : '')}${row('Soma 3 dobras', r.soma != null ? r.soma + ' mm' : '')}</table>
    ${(av.pas || av.fc || av.spo2) ? `<h2>Sinais vitais</h2><table>${row('Pressão arterial', av.pas && av.pad ? `${av.pas}/${av.pad} mmHg (${calc.classifPressao(av.pas, av.pad)})` : '')}${row('Freq. cardíaca', av.fc ? av.fc + ' bpm' : '')}${row('Saturação SpO₂', av.spo2 ? av.spo2 + '% (' + calc.classifSpo2(av.spo2) + ')' : '')}</table>` : ''}
    <h2>Dobras cutâneas</h2><div class="blk">${dobras || '—'}</div>
    <h2>Perímetros</h2><div class="blk">${perim || '—'}</div>
    <h2>Condições no dia</h2><div class="blk">${cond}</div>
    ${av.obs ? `<h2>Observações</h2><div class="blk">${esc(av.obs)}</div>` : ''}
    ${fotoTags ? `<h2>Fotos de progresso</h2><div class="fotos">${fotoTags}</div>` : ''}
    <div class="ft"><span>Braconaro Garage Power Lab · Agudos/SP</span><span>Gerado em ${new Date().toLocaleDateString('pt-BR')}</span></div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para exportar o PDF.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
