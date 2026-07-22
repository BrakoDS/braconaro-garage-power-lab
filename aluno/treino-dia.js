// @ts-check
/**
 * Render do "Treino do dia" no Portal (lado aluno). Auto-contido: não importa o
 * render.js do Montador (que é do app do coach). Mostra o treino de hoje no NÍVEL
 * do aluno (força/hipertrofia); Hyrox/HIIT/GAP têm prescrição única.
 */

const MOD_NOME = { forca: 'Força', hipertrofia: 'Hipertrofia', hiit: 'HIIT', hyrox: 'Hyrox', hibrido: 'Híbrido', gap: 'GAP' };
const PADRAO_LABEL = {
  empurrar: 'Empurrar', puxar: 'Puxar', quadriceps: 'Quadríceps',
  posterior_gluteo: 'Posterior/Glúteo', core: 'Core', estabilizadores: 'Estabilizadores',
};
const DIA_LABEL = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
const NIVEL_LABEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
const NIV_OK = { iniciante: 1, intermediario: 1, avancado: 1 };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Nível efetivo do aluno (fallback intermediário). @param {string} nivel */
function nivelEfetivo(nivel) {
  const n = String(nivel || '').toLowerCase();
  return NIV_OK[n] ? n : 'intermediario';
}

/** Força/Hipertrofia (e Treino Manual): exercícios no nível do aluno. */
function corpoExercicios(d, nivel) {
  // Aquecimento persistido no snapshot (Treino Manual do coach)
  const aquec = (d.aquecimento || []).length
    ? `<div class="td-parte-h">Aquecimento / Mobilidade</div><ul class="td-lista">${d.aquecimento.map((a) => `<li>${esc(a.nome)}</li>`).join('')}</ul>`
    : '';
  const linhas = (d.exercicios || []).map((e, i) => {
    const v = e.niveis && e.niveis[nivel];
    const prescricao = v ? `<b>${v.series}×</b> ${esc(e.reps || '')}${v.carga ? ` · ${esc(v.carga)}` : ''}` : esc(e.reps || '');
    const tec = e.tecnica ? ` · <i>${esc(TECNICA_LABEL[e.tecnica.tipo] || e.tecnica.tipo)}</i>` : '';
    return `<li class="td-ex">
      <span class="td-ex-nome">${i + 1}. ${esc(e.nome)}</span>
      <span class="td-ex-sub">${PADRAO_LABEL[e.padrao] || esc(e.padrao || '')}${tec}</span>
      <span class="td-ex-presc">${prescricao}</span>
    </li>`;
  }).join('');
  const fin = d.finalizador ? `<div class="td-fin"><b>${esc(d.finalizador.tipo)}</b> — ${esc(d.finalizador.descricao)}</div>` : '';
  return `${aquec}<ul class="td-lista">${linhas}</ul>${fin}`;
}

/** Hyrox no nível do aluno. */
function corpoHyrox(h, nivel) {
  const c = h.corrida?.[nivel];
  const corrida = c ? `<div class="td-nota">🏃 Corrida por rodada: <b>${c.metros} m</b> (${c.voltas}×50 m)</div>` : '';
  const est = (h.estacoes || []).map((e) => {
    const q = e.prescricao?.[nivel];
    const un = q != null ? (e.tipo === 'distancia' ? `${q} m` : `${q} reps`) : '';
    return `<li class="td-ex"><span class="td-ex-nome">${e.n}. ${esc(e.nome)}</span><span class="td-ex-sub">${esc(e.base || '')}</span><span class="td-ex-presc"><b>${un}</b></span></li>`;
  }).join('');
  return `<div class="td-nota">8 rodadas de corrida + estação (formato da prova).</div>${corrida}<ul class="td-lista">${est}</ul>`;
}

/** HIIT — 4 estações TABATA (prescrição única). */
function corpoHiit(h) {
  const p = h.protocolo || {};
  const estacoes = (h.estacoes || []).map((est) => {
    const slots = (est.slots || []).map((s, j) => `<li>${j + 1}. ${esc(s.nome)}${s.lado ? ` <i>(lado ${esc(s.lado)})</i>` : ''}</li>`).join('');
    return `<div class="td-bloco"><div class="td-bloco-h">${esc(est.titulo)} <span class="td-mut">· ${est.rounds} rounds</span></div><ol class="td-slots">${slots}</ol></div>`;
  }).join('');
  return `<div class="td-nota">TABATA ${p.trabalhoSeg || 20}s on / ${p.descansoSeg || 10}s off — 4 estações.</div><div class="td-blocos">${estacoes}</div>`;
}

/** GAP — aula em partes/músicas (prescrição única). */
function corpoGap(g) {
  const p = g.protocolo || {};
  const partes = (g.partes || []).map((parte) => {
    const musicas = (parte.musicas || []).map((m, i) => {
      const rounds = (m.rounds || []).map((r) => `<li>${r.n} — ${esc(r.nome)}</li>`).join('');
      return `<div class="td-bloco"><div class="td-bloco-h">🎵 ${esc(parte.nome)}${parte.musicas.length > 1 ? ' ' + (i + 1) : ''}</div><ol class="td-slots">${rounds}</ol></div>`;
    }).join('');
    return `<div class="td-parte"><div class="td-parte-h">${esc(parte.nome)}</div>${musicas}</div>`;
  }).join('');
  return `<div class="td-nota">TABATA ${p.trabalhoSeg || 20}s/${p.descansoSeg || 10}s — Siga o Mestre.</div>${partes}`;
}

const TECNICA_LABEL = { biset: 'Bi-set', dropset: 'Drop-set', isometria: 'Isometria', tempo: 'Tempo 2-1-2' };

/** Híbrido: Mobilidade + Hipertrofia (nível do aluno) + WOD. */
function corpoHibrido(h, nivel) {
  const mob = (h.mobilidade || []).map((m) => `<li>${esc(m.nome)}</li>`).join('');
  const linhas = (h.hipertrofia || []).map((e, i) => {
    const v = e.niveis && e.niveis[nivel];
    const prescricao = v ? `<b>${v.series}×</b> ${esc(e.reps || '')}${v.carga ? ` · ${esc(v.carga)}` : ''}` : esc(e.reps || '');
    const tec = e.tecnica ? ` · <i>${esc(TECNICA_LABEL[e.tecnica.tipo] || e.tecnica.tipo)}</i>` : '';
    return `<li class="td-ex">
      <span class="td-ex-nome">${i + 1}. ${esc(e.nome)}</span>
      <span class="td-ex-sub">${PADRAO_LABEL[e.padrao] || esc(e.padrao || '')}${tec}</span>
      <span class="td-ex-presc">${prescricao}</span>
    </li>`;
  }).join('');
  const wod = h.wod || {};
  const movs = (wod.movimentos || []).map((m) => `<li>${esc(m.nome)} — ${esc(m.prescricao)}</li>`).join('');
  return `<div class="td-nota">Split de hoje: <b>${esc(h.splitLabel || '')}</b>.</div>
    <div class="td-parte-h">Mobilidade — 6 min</div>
    <ul class="td-lista">${mob}</ul>
    <div class="td-parte-h">Hipertrofia — 10–12 reps</div>
    <ul class="td-lista">${linhas}</ul>
    <div class="td-parte-h">WOD — ${esc(wod.formato || '')} · ${wod.duracaoMin || ''} min</div>
    <ul class="td-lista">${movs}</ul>`;
}

/**
 * Card do treino de hoje.
 * @param {any} treino  dia (exercicios/hyrox/hiit/gap/hibrido)
 * @param {string} nivel  nível do aluno
 */
export function renderTreinoDia(treino, nivel) {
  const n = nivelEfetivo(nivel);
  const mod = MOD_NOME[treino.modalidade] || treino.modalidade;
  const diaTxt = DIA_LABEL[treino.dia] || '';
  let corpo, porNivel;
  if (treino.hyrox) { corpo = corpoHyrox(treino.hyrox, n); porNivel = true; }
  else if (treino.hiit) { corpo = corpoHiit(treino.hiit); porNivel = false; }
  else if (treino.gap) { corpo = corpoGap(treino.gap); porNivel = false; }
  else if (treino.hibrido) { corpo = corpoHibrido(treino.hibrido, n); porNivel = true; }
  else { corpo = corpoExercicios(treino, n); porNivel = true; }
  // só mostra o "seu nível" nos formatos que variam por nível (força/hyrox)
  const badgeNivel = porNivel ? `<span class="td-nivel">seu nível: ${esc(NIVEL_LABEL[n] || n)}</span>` : '';
  return `<div class="td-card">
    <div class="td-head"><span class="td-dia">${esc(diaTxt)}</span><h3>${esc(mod)}</h3>${badgeNivel}</div>
    ${corpo}
  </div>`;
}

/** Faixa compacta da semana: modalidade por dia, hoje destacado. */
export function renderFaixaSemana(grade, diaHoje) {
  const dias = ['seg', 'ter', 'qua', 'qui', 'sex'];
  const cels = dias.map((d) => {
    const m = grade && grade[d];
    const on = d === diaHoje;
    return `<div class="td-fx-cel${on ? ' on' : ''}">
      <span class="td-fx-dia">${d.toUpperCase()}</span>
      <span class="td-fx-mod">${m ? esc(MOD_NOME[m] || m) : '—'}</span>
    </div>`;
  }).join('');
  return `<div class="td-faixa">${cels}</div>`;
}
