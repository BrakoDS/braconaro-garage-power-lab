// @ts-check
/**
 * Aba Avaliações do perfil — o histórico, o formulário (modal) com resultados
 * calculados e fotos de progresso, a exclusão e a comparação entre duas.
 *
 * Saiu do `app.js` no fatiamento. Desenha a lista quando a aba abre e de novo
 * a cada 'alunos-mudaram' com a aba à vista (uma avaliação salva no modal, uma
 * foto, a nuvem trazendo dado de outro aparelho).
 *
 * As partes que só montam HTML (`htmlListaAvaliacoes`, `htmlResultados`,
 * `htmlComparacao`) são puras e testadas em `ui-tab-avaliacoes.test.js`.
 */
import * as db from './db.js?v=12';
import * as calc from '../../compartilhado/regras/calc.js?v=12';
import { exportarAvaliacao } from './pdf.js?v=12';
import { esc, hoje, fmtN, numf, fmtData, addDias } from './util/formato.js?v=12';
import { $, abrirModal, fecharModal } from './util/dom.js?v=12';
import { estado, on, EVENTOS } from './estado.js?v=12';
import { reg } from './registro.js?v=12';
import { escolherFoto, uploadFoto, avisoStorage, apagarFotosDaAvaliacao, apagarArquivo } from './ui-fotos.js?v=12';
import { confirmar, avisar } from '../../compartilhado/ui/dialogo.js?v=12';

const n2 = (/** @type {number} */ n) => String(n).padStart(2, '0');

/* ============================================================
   HTML (puro)
   ============================================================ */

/**
 * O histórico, da mais nova para a mais antiga.
 * @param {any} a @param {string} [hojeIso]
 */
export function htmlListaAvaliacoes(a, hojeIso = hoje()) {
  const avs = (a.avaliacoes || []).slice().sort((x, y) => (y.num || 0) - (x.num || 0));
  if (!avs.length) return `<div class="empty"><b>Nenhuma avaliação</b>Clique em “Nova avaliação” para registrar a primeira.</div>`;
  return avs.map((av) => {
    const atrasada = av.dataProxima && av.dataProxima < hojeIso;
    const r = calc.calcular(av, a);
    const resumo = [];
    if (av.peso) resumo.push(`${(+av.peso).toLocaleString('pt-BR')} kg`);
    if (r.perc != null) resumo.push(`${r.perc.toFixed(1)}% gordura`);
    return `
    <button class="aval-row" data-num="${av.num}" type="button">
      <span class="anum">Avaliação #${n2(av.num)}</span>
      <span class="adatas">
        <span class="adata">Realizada: ${fmtData(av.dataRealizada)}${resumo.length ? ' · ' + resumo.join(' · ') : ''}</span>
        <span class="aprox${atrasada ? ' atrasada' : ''}">Próxima: ${fmtData(av.dataProxima)}</span>
      </span>
      ${atrasada ? '<span class="badge-late">Atrasada</span>' : '<span class="badge-ok">Em dia</span>'}
    </button>`;
  }).join('');
}

/**
 * Os cards de resultado calculados de uma avaliação.
 * @param {any} av @param {any} aluno
 */
export function htmlResultados(av, aluno) {
  const r = calc.calcular(av, aluno);
  const rceVal = calc.rcest(av.perimetros?.cintura, av.estatura);
  const percSub = r.perc != null ? r.percClass
    : (r.faltaSexo ? 'Defina o sexo na aba Dados' : r.faltaIdade ? 'Informe a data de nascimento (aba Dados)' : 'Preencha as 3 dobras');
  const cards = [
    { t: '% Gordura corporal', v: r.perc != null ? fmtN(r.perc, 1) + '%' : '—', s: percSub, hi: true },
    { t: 'IMC', v: r.imc != null ? fmtN(r.imc, 1) : '—', s: r.imcClass },
    { t: 'Massa gorda', v: r.massaGorda != null ? fmtN(r.massaGorda, 1) + ' kg' : '—', s: '' },
    { t: 'Massa magra', v: r.massaMagra != null ? fmtN(r.massaMagra, 1) + ' kg' : '—', s: '' },
    { t: 'RCQ', v: r.rcq != null ? fmtN(r.rcq, 2) : '—', s: r.rcqClass },
    { t: 'Cintura/estatura', v: rceVal != null ? fmtN(rceVal, 2) : '—', s: calc.classifRcest(rceVal) },
    { t: 'Σ dobras', v: r.soma != null ? fmtN(r.soma, 0) + ' mm' : '—', s: r.protocolo || '' },
  ];
  if (av.pas && av.pad) cards.push({ t: 'Pressão arterial', v: `${av.pas}/${av.pad}`, s: 'mmHg · ' + calc.classifPressao(av.pas, av.pad) });
  if (av.fc) cards.push({ t: 'Freq. cardíaca', v: `${av.fc}`, s: 'bpm' });
  if (av.spo2) cards.push({ t: 'Saturação SpO₂', v: `${av.spo2}%`, s: calc.classifSpo2(av.spo2) });
  if (av.aguaCorporal) cards.push({ t: 'Água corporal', v: `${av.aguaCorporal}%`, s: calc.classifAgua(numf(av.aguaCorporal), r.cod) });
  if (av.gorduraVisceral) cards.push({ t: 'Gordura visceral', v: `Nível ${av.gorduraVisceral}`, s: calc.classifVisceral(numf(av.gorduraVisceral)) });
  if (av.massaOssea) cards.push({ t: 'Massa óssea', v: `${av.massaOssea} kg`, s: '' });
  return cards.map((c) => `<div class="res${c.hi ? ' hi' : ''}"><span class="rt">${c.t}</span><span class="rv">${c.v}</span>${c.s ? `<span class="rs">${esc(c.s)}</span>` : ''}</div>`).join('');
}

/**
 * A tabela "antes × depois" entre duas avaliações, com as fotos lado a lado.
 * '' se alguma das duas não existir.
 * @param {any} a @param {number} numA @param {number} numB
 */
export function htmlComparacao(a, numA, numB) {
  const avA = (a.avaliacoes || []).find((x) => x.num === numA);
  const avB = (a.avaliacoes || []).find((x) => x.num === numB);
  if (!avA || !avB) return '';
  const rA = calc.calcular(avA, a), rB = calc.calcular(avB, a);
  const nf = numf;
  const rows = [];
  const sec = (t) => rows.push(`<tr class="cmp-sec"><td colspan="4">${t}</td></tr>`);
  const lin = (label, va, vb, un, dec, melhorSe) => {
    if (va == null && vb == null) return;
    let d = '—', cls = '';
    if (va != null && vb != null) {
      const dd = vb - va;
      if (Math.abs(dd) < Math.pow(10, -dec) / 2) { d = '='; }
      else {
        const bom = melhorSe === 'down' ? dd < 0 : melhorSe === 'up' ? dd > 0 : null;
        cls = bom === true ? 'bom' : bom === false ? 'ruim' : '';
        d = `${dd > 0 ? '+' : '−'}${fmtN(Math.abs(dd), dec)}${un ? ' ' + un : ''}`;
      }
    }
    const cel = (v) => (v != null ? fmtN(v, dec) + (un ? ' ' + un : '') : '—');
    rows.push(`<tr><td>${label}</td><td>${cel(va)}</td><td>${cel(vb)}</td><td class="${cls}">${d}</td></tr>`);
  };

  sec('Composição corporal');
  lin('Peso', nf(avA.peso), nf(avB.peso), 'kg', 1, null);
  lin('IMC', rA.imc, rB.imc, '', 1, null);
  lin('% Gordura', rA.perc, rB.perc, '%', 1, 'down');
  lin('Massa gorda', rA.massaGorda, rB.massaGorda, 'kg', 1, 'down');
  lin('Massa magra', rA.massaMagra, rB.massaMagra, 'kg', 1, 'up');
  lin('RCQ', rA.rcq, rB.rcq, '', 2, 'down');
  lin('Cintura/estatura', calc.rcest(avA.perimetros?.cintura, avA.estatura), calc.rcest(avB.perimetros?.cintura, avB.estatura), '', 2, 'down');
  lin('Σ dobras', rA.soma, rB.soma, 'mm', 0, 'down');

  sec('Perímetros (cm)');
  const perimMelhor = { cintura: 'down', abdomen: 'down', quadril: null, bracoContraido: null, coxa: null, panturrilha: null };
  calc.PERIMETROS.forEach((p) => lin(p.label, nf(avA.perimetros?.[p.key]), nf(avB.perimetros?.[p.key]), 'cm', 1, perimMelhor[p.key]));

  if (avA.pas || avB.pas || avA.fc || avB.fc || avA.spo2 || avB.spo2) {
    sec('Sinais vitais');
    if (avA.pas || avB.pas) rows.push(`<tr><td>Pressão arterial</td><td>${avA.pas && avA.pad ? esc(avA.pas + '/' + avA.pad) : '—'}</td><td>${avB.pas && avB.pad ? esc(avB.pas + '/' + avB.pad) : '—'}</td><td></td></tr>`);
    lin('Freq. cardíaca', nf(avA.fc), nf(avB.fc), 'bpm', 0, 'down');
    lin('Saturação SpO₂', nf(avA.spo2), nf(avB.spo2), '%', 0, 'up');
  }

  if (avA.aguaCorporal || avB.aguaCorporal || avA.gorduraVisceral || avB.gorduraVisceral || avA.massaOssea || avB.massaOssea) {
    sec('Bioimpedância');
    lin('Água corporal', nf(avA.aguaCorporal), nf(avB.aguaCorporal), '%', 1, null);
    lin('Gordura visceral', nf(avA.gorduraVisceral), nf(avB.gorduraVisceral), '', 0, 'down');
    lin('Massa óssea', nf(avA.massaOssea), nf(avB.massaOssea), 'kg', 2, null);
  }

  sec('Testes físicos');
  lin('Flexões', nf(avA.testes?.flexoes), nf(avB.testes?.flexoes), '', 0, 'up');
  lin('Prancha', nf(avA.testes?.prancha), nf(avB.testes?.prancha), 's', 0, 'up');
  lin('Agachamentos', nf(avA.testes?.agachamentos), nf(avB.testes?.agachamentos), '', 0, 'up');
  lin('Abdominais', nf(avA.testes?.abdominais), nf(avB.testes?.abdominais), '', 0, 'up');

  sec('Mobilidade (cm)');
  lin('Tornozelo dir.', nf(avA.mobilidade?.tornozeloD), nf(avB.mobilidade?.tornozeloD), 'cm', 1, null);
  lin('Tornozelo esq.', nf(avA.mobilidade?.tornozeloE), nf(avB.mobilidade?.tornozeloE), 'cm', 1, null);
  lin('Ombro dir.', nf(avA.mobilidade?.ombroD), nf(avB.mobilidade?.ombroD), 'cm', 1, null);
  lin('Ombro esq.', nf(avA.mobilidade?.ombroE), nf(avB.mobilidade?.ombroE), 'cm', 1, null);
  lin('Sentar-e-alcançar', nf(avA.mobilidade?.sentarAlcancar), nf(avB.mobilidade?.sentarAlcancar), 'cm', 1, 'up');

  const fotos = [['frente', 'Frente'], ['lado', 'Lado'], ['costas', 'Costas']].map(([k, l]) => {
    const fa = avA.fotos?.[k], fb = avB.fotos?.[k];
    if (!fa && !fb) return '';
    const cel = (u) => (u ? `<img src="${esc(u)}" alt="${l}" />` : '<span class="cmp-foto-vazio">sem foto</span>');
    return `<div class="cmp-foto-row"><span class="cmp-foto-cap">${l}</span><div class="cmp-foto-par"><div>${cel(fa)}</div><div>${cel(fb)}</div></div></div>`;
  }).join('');

  return `
    <table class="cmp-table">
      <tr class="cmp-head"><th>Métrica</th><th>#${n2(numA)} · ${fmtData(avA.dataRealizada)}</th><th>#${n2(numB)} · ${fmtData(avB.dataRealizada)}</th><th>Δ</th></tr>
      ${rows.join('')}
    </table>
    ${fotos ? `<h4 class="cmp-fotos-titulo">Fotos de progresso</h4>${fotos}` : ''}`;
}

/* ============================================================
   DOM
   ============================================================ */

/** O aluno aberto, relido do banco (o estado pode estar uma gravação atrás). */
const alunoAberto = () => (estado.alunoAtual ? db.obter(estado.alunoAtual.id) || estado.alunoAtual : null);

/** Desenha o histórico do aluno aberto. */
export function renderAvaliacoes() {
  const a = alunoAberto(); const lista = $('#aval-list');
  if (!a || !lista) return;
  lista.innerHTML = htmlListaAvaliacoes(a);
}

/** Lê o formulário da avaliação. @param {HTMLFormElement} form */
function lerAval(form) {
  const fd = new FormData(form);
  const g = (k) => (fd.get(k) ?? '').toString().trim();
  /** @type {any} */ const av = {
    dataRealizada: g('dataRealizada'), dataProxima: g('dataProxima'),
    peso: g('peso'), estatura: g('estatura'), obs: g('obs'),
    pas: g('pas'), pad: g('pad'), fc: g('fc'), spo2: g('spo2'),
    aguaCorporal: g('aguaCorporal'), gorduraVisceral: g('gorduraVisceral'), massaOssea: g('massaOssea'),
    cond: { jejum: !!fd.get('cond_jejum'), semTreino: !!fd.get('cond_semTreino'), roupasLeves: !!fd.get('cond_roupasLeves'), bexiga: !!fd.get('cond_bexiga') },
    dobras: {}, perimetros: {},
  };
  for (const k of ['peitoral', 'axilarMedia', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa']) { const v = g('dobra_' + k); if (v !== '') av.dobras[k] = v; }
  for (const p of calc.PERIMETROS) { const v = g('perim_' + p.key); if (v !== '') av.perimetros[p.key] = v; }
  av.testes = {};
  for (const k of ['flexoes', 'prancha', 'agachamentos', 'abdominais']) { const v = g('teste_' + k); if (v !== '') av.testes[k] = v; }
  av.mobilidade = {};
  for (const k of ['tornozeloD', 'tornozeloE', 'ombroD', 'ombroE', 'sentarAlcancar']) { const v = g('mob_' + k); if (v !== '') av.mobilidade[k] = v; }
  return av;
}

/** Abre o modal da avaliação `num` (null = nova). @param {number|null} num */
function abrirFormAvaliacao(num) {
  const a = estado.alunoAtual; if (!a) return;
  const novo = num == null;
  let av;
  if (novo) av = { dataRealizada: hoje(), dataProxima: addDias(hoje(), 90), peso: a.peso || '', estatura: a.altura || '', cond: {}, dobras: {}, perimetros: {} };
  else { av = (a.avaliacoes || []).find((x) => x.num === num); if (!av) return; }
  estado.avalAberta = novo ? null : num;
  const cod = calc.sexoCod(a);
  const dobras = calc.DOBRAS_7;
  $('#modal-aval').querySelector('.modal').classList.add('lg');
  $('#modal-aval-titulo').textContent = novo ? 'Nova avaliação' : `Avaliação #${n2(/** @type {number} */ (num))}`;
  $('#btn-del-aval').style.display = novo ? 'none' : '';
  const cond = av.cond || {}, dz = av.dobras || {}, pz = av.perimetros || {}, tz = av.testes || {}, mz = av.mobilidade || {};
  const chk = (k, l) => `<label class="chk"><input type="checkbox" name="cond_${k}"${cond[k] ? ' checked' : ''}/> ${l}</label>`;
  const f = (name, val, ph = '') => `<input name="${name}" type="number" inputmode="decimal" min="0" step="any" value="${esc(val ?? '')}" placeholder="${ph}"/>`;
  const avisoSexo = cod ? '' : `<div class="note" style="margin-bottom:12px">⚠️ Defina o <b>sexo</b> do aluno na aba <b>Dados</b> para calcular o % de gordura.</div>`;
  const avisoIdade = (a.nascimento || a.idade) ? '' : `<div class="note" style="margin-bottom:12px">⚠️ Informe a <b>data de nascimento</b> na aba Dados (a fórmula usa a idade).</div>`;
  $('#modal-aval-body').innerHTML = `
    <form id="form-aval">
      <div class="form-sec"><h3>Datas</h3><div class="grid-form">
        <div class="field"><label>Data realizada</label><input name="dataRealizada" type="date" value="${esc(av.dataRealizada || '')}"/></div>
        <div class="field"><label>Próxima avaliação</label><input name="dataProxima" type="date" value="${esc(av.dataProxima || '')}"/></div>
      </div></div>
      <div class="form-sec"><h3>Condições do aluno</h3><div class="chks">${chk('jejum', 'Jejum 2–4h')}${chk('semTreino', 'Sem treino intenso 12h')}${chk('roupasLeves', 'Roupas leves')}${chk('bexiga', 'Bexiga vazia')}</div></div>
      <div class="form-sec"><h3>Medidas básicas</h3><div class="grid-form">
        <div class="field"><label>Peso (kg)</label>${f('peso', av.peso, '80')}</div>
        <div class="field"><label>Estatura (cm)</label>${f('estatura', av.estatura, '175')}</div>
      </div></div>
      <div class="form-sec"><h3>Sinais vitais</h3><div class="grid-form g3">
        <div class="field"><label>Pressão arterial (mmHg)</label><div class="pa-row"><input name="pas" type="number" inputmode="numeric" min="0" step="any" value="${esc(av.pas ?? '')}" placeholder="120" /><span>/</span><input name="pad" type="number" inputmode="numeric" min="0" step="any" value="${esc(av.pad ?? '')}" placeholder="80" /></div></div>
        <div class="field"><label>Freq. cardíaca (bpm)</label>${f('fc', av.fc, '70')}</div>
        <div class="field"><label>Saturação SpO₂ (%)</label>${f('spo2', av.spo2, '98')}</div>
      </div></div>
      <div class="form-sec"><h3>Bioimpedância (opcional)</h3><p class="hint" style="margin:0 0 10px">Preencha se tiver os dados de uma balança de bioimpedância. Sem ela, deixe em branco.</p><div class="grid-form g3">
        <div class="field"><label>Água corporal (%)</label>${f('aguaCorporal', av.aguaCorporal, '55')}</div>
        <div class="field"><label>Gordura visceral (nível)</label>${f('gorduraVisceral', av.gorduraVisceral, '4')}</div>
        <div class="field"><label>Massa óssea (kg)</label>${f('massaOssea', av.massaOssea, '2.5')}</div>
      </div></div>
      <div class="form-sec"><h3>Dobras cutâneas (mm) · Pollock 7</h3>${avisoSexo}${avisoIdade}
        <div class="grid-form g3">${dobras.map((d) => `<div class="field"><label>${d.label}</label>${f('dobra_' + d.key, dz[d.key])}</div>`).join('')}</div>
      </div>
      <div class="form-sec"><h3>Perímetros (cm)</h3>
        <div class="grid-form g3">${calc.PERIMETROS.map((p) => `<div class="field"><label>${p.label}</label>${f('perim_' + p.key, pz[p.key], '')}</div>`).join('')}</div>
      </div>
      <div class="form-sec"><h3>Testes físicos</h3><div class="grid-form g3">
        <div class="field"><label>Flexões (máx.)</label>${f('teste_flexoes', tz.flexoes)}</div>
        <div class="field"><label>Prancha (segundos)</label>${f('teste_prancha', tz.prancha)}</div>
        <div class="field"><label>Agachamentos (1 min)</label>${f('teste_agachamentos', tz.agachamentos)}</div>
        <div class="field"><label>Abdominais (1 min)</label>${f('teste_abdominais', tz.abdominais)}</div>
      </div></div>
      <div class="form-sec"><h3>Mobilidade (cm)</h3><div class="grid-form g3">
        <div class="field"><label>Tornozelo dir.</label>${f('mob_tornozeloD', mz.tornozeloD)}</div>
        <div class="field"><label>Tornozelo esq.</label>${f('mob_tornozeloE', mz.tornozeloE)}</div>
        <div class="field"><label>Ombro dir.</label>${f('mob_ombroD', mz.ombroD)}</div>
        <div class="field"><label>Ombro esq.</label>${f('mob_ombroE', mz.ombroE)}</div>
        <div class="field"><label>Sentar-e-alcançar</label>${f('mob_sentarAlcancar', mz.sentarAlcancar)}</div>
      </div></div>
      <div class="form-sec"><h3>Resultados</h3><div id="aval-resultados" class="resultados"></div></div>
      <div class="form-sec"><h3>Fotos de progresso</h3><div id="aval-fotos" class="fotos-grid"></div></div>
      <div class="field full"><label>Observações</label><textarea name="obs" placeholder="Observações desta avaliação…">${esc(av.obs || '')}</textarea></div>
      <div class="form-actions" style="margin-top:14px"><button class="btn" type="submit">${novo ? 'Salvar avaliação' : 'Salvar alterações'}</button><button class="btn ghost" type="button" id="btn-pdf">Exportar PDF</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    </form>`;
  const form = $('#form-aval');
  const recalc = () => { $('#aval-resultados').innerHTML = htmlResultados(lerAval(form), a); };
  form.addEventListener('input', recalc);
  recalc();
  renderFotosAval();
  $('#aval-fotos').addEventListener('click', onFotoAvalClick);
  $('#btn-pdf').addEventListener('click', () => {
    if (estado.avalAberta == null) { avisar({ texto: 'Salve a avaliação primeiro para exportar o PDF.' }); return; }
    const cur = (estado.alunoAtual.avaliacoes || []).find((x) => x.num === estado.avalAberta);
    if (cur) exportarAvaliacao(estado.alunoAtual, cur);
  });
  form.addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const dados = lerAval(form);
    if (estado.avalAberta == null) {
      const nv = db.addAvaliacao(a.id, dados);
      reg('avaliacao', a, `Avaliação física #${nv.num} registrada`, { chave: `avaliacao:${a.id}:${nv.num}` });
      estado.avalAberta = nv.num;
      $('#modal-aval-titulo').textContent = `Avaliação #${n2(nv.num)}`;
      $('#btn-del-aval').style.display = '';
    } else {
      const cur = (a.avaliacoes || []).find((x) => x.num === estado.avalAberta);
      if (cur) Object.assign(cur, dados);
      db.atualizar(a.id, { avaliacoes: a.avaliacoes });
      reg('avaliacao', a, `Avaliação física #${estado.avalAberta} editada`);
    }
    estado.alunoAtual = db.obter(a.id);
    renderAvaliacoes();
    renderFotosAval();
    const flag = $('#form-aval [data-saved]'); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1500);
  });
  abrirModal('modal-aval');
}

/* ---- Fotos de progresso da avaliação ---- */
const FOTO_SLOTS = [['frente', 'Frente'], ['lado', 'Lado'], ['costas', 'Costas']];
function avalAtual() { return estado.alunoAtual && estado.avalAberta != null ? (estado.alunoAtual.avaliacoes || []).find((x) => x.num === estado.avalAberta) : null; }
function renderFotosAval() {
  const cont = $('#aval-fotos'); if (!cont) return;
  if (estado.avalAberta == null) { cont.innerHTML = `<div class="note">Salve a avaliação para anexar fotos de progresso (frente, lado e costas).</div>`; return; }
  const av = avalAtual(); const fotos = (av && av.fotos) || {};
  cont.innerHTML = FOTO_SLOTS.map(([k, l]) => `
    <div class="foto-slot" data-slot="${k}">
      ${fotos[k] ? `<img src="${esc(fotos[k])}" alt="${l}" /><button class="foto-del" data-del="${k}" type="button" title="Remover">×</button>` : `<span class="foto-add">+ ${l}</span>`}
      <span class="foto-cap">${l}</span>
    </div>`).join('');
}
/** @param {any} e */
function onFotoAvalClick(e) {
  const del = e.target.closest('[data-del]');
  if (del) { removerFotoAval(del.dataset.del); return; }
  const slotEl = e.target.closest('.foto-slot');
  if (slotEl) escolherFoto((file) => adicionarFotoAval(slotEl.dataset.slot, file));
}
/** @param {string} slot @param {File} file */
async function adicionarFotoAval(slot, file) {
  const a = estado.alunoAtual, av = avalAtual(); if (!a || !av) return;
  const slotEl = $(`#aval-fotos .foto-slot[data-slot=${slot}]`); if (slotEl) slotEl.classList.add('loading');
  try {
    const url = await uploadFoto(`gestao/${estado.uid}/${a.id}/aval-${av.num}-${slot}.webp`, file, 1200);
    av.fotos = av.fotos || {}; av.fotos[slot] = url;
    db.atualizar(a.id, { avaliacoes: a.avaliacoes });
    estado.alunoAtual = db.obter(a.id);
    renderFotosAval();
  } catch (e) { avisoStorage(e); if (slotEl) slotEl.classList.remove('loading'); }
}
/** @param {string} slot */
async function removerFotoAval(slot) {
  const a = estado.alunoAtual, av = avalAtual(); if (!a || !av || !av.fotos) return;
  if (!(await confirmar({ titulo: 'Remover foto?', texto: 'A foto sai desta avaliação.', ok: 'Remover', perigo: true }))) return;
  delete av.fotos[slot];
  db.atualizar(a.id, { avaliacoes: a.avaliacoes });
  estado.alunoAtual = db.obter(a.id);
  renderFotosAval();
  apagarArquivo(`gestao/${estado.uid}/${a.id}/aval-${av.num}-${slot}.webp`);
}

/* ---- Comparar duas avaliações ---- */
function abrirComparar() {
  const a = estado.alunoAtual; if (!a) return;
  const avs = (a.avaliacoes || []).slice().sort((x, y) => (x.dataRealizada < y.dataRealizada ? -1 : 1));
  if (avs.length < 2) { avisar({ texto: 'Cadastre ao menos 2 avaliações para comparar.' }); return; }
  const opts = (sel) => avs.map((av) => `<option value="${av.num}"${av.num === sel ? ' selected' : ''}>#${n2(av.num)} · ${fmtData(av.dataRealizada)}</option>`).join('');
  const aNum = avs[0].num, bNum = avs[avs.length - 1].num;
  $('#modal-comparar').querySelector('.modal').classList.add('lg');
  $('#modal-comparar-body').innerHTML = `
    <div class="cmp-selects">
      <select id="cmp-a">${opts(aNum)}</select>
      <span class="cmp-x">→</span>
      <select id="cmp-b">${opts(bNum)}</select>
    </div>
    <div id="cmp-resultado"></div>`;
  const upd = () => { $('#cmp-resultado').innerHTML = htmlComparacao(estado.alunoAtual, Number($('#cmp-a').value), Number($('#cmp-b').value)); };
  $('#cmp-a').addEventListener('change', upd);
  $('#cmp-b').addEventListener('change', upd);
  upd();
  abrirModal('modal-comparar');
}

/** Liga a aba à página e ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabAvaliacoes() {
  $('#aval-list')?.addEventListener('click', (/** @type {any} */ e) => {
    const row = e.target.closest('.aval-row');
    if (row) abrirFormAvaliacao(Number(row.dataset.num));
  });
  $('#btn-nova-aval')?.addEventListener('click', () => abrirFormAvaliacao(null));
  $('#btn-comparar')?.addEventListener('click', abrirComparar);
  $('#btn-del-aval')?.addEventListener('click', async () => {
    const a = estado.alunoAtual; if (!a || estado.avalAberta == null) return;
    if (await confirmar({ titulo: 'Excluir avaliação?', texto: `Excluir a <b>Avaliação #${n2(estado.avalAberta)}</b>?`, ok: 'Excluir', perigo: true })) {
      apagarFotosDaAvaliacao(a.id, (a.avaliacoes || []).find((x) => x.num === estado.avalAberta));
      db.removerAvaliacao(a.id, estado.avalAberta);
      reg('avaliacao', a, `Avaliação física #${estado.avalAberta} excluída`);
      estado.alunoAtual = db.obter(a.id);
      renderAvaliacoes();
      fecharModal('modal-aval');
    }
  });
  on(EVENTOS.ABRIR_ABA, (nome) => { if (nome === 'avaliacoes') renderAvaliacoes(); });
  on(EVENTOS.PERFIL_ABERTO, () => renderAvaliacoes());
  on(EVENTOS.ALUNOS_MUDARAM, () => { if ($('#tab-avaliacoes')?.classList.contains('active')) renderAvaliacoes(); });
}
