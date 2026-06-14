// @ts-check
import { MODALIDADES } from '../config/modalidades.js';
import { PADRAO_LABEL } from '../config/padroes.js';
import { EQUIP_POR_ID } from '../data/equipamentos.js';
import { alternativasViaveis, aplicarTroca } from '../core/gerador.js';
import { sugerirCarga } from '../core/cargas.js';

const mmss = (s) => `${Math.round(s / 60)}min`;
const equipNomes = (ids) => ids.map((i) => (EQUIP_POR_ID[i]?.nome || i)).join(', ');
let _uid = 0;

/** registro de treinos vivos p/ permitir troca de exercício */
const vivos = new Map();

function badgeViab(v) {
  return v.ok
    ? `<span class="ok">✓ viável p/ 8 (grupos de ${v.tamanhoGrupo})</span>`
    : `<span class="bad">⚠ ${v.conflitos.join(' ')}</span>`;
}

function renderVolume(vol) {
  const max = Math.max(1, ...Object.values(vol.porMusculo));
  return `<div class="vol">${Object.entries(vol.porMusculo).sort((a, b) => b[1] - a[1]).map(([m, v]) => `
    <div class="bar-row"><span class="bar-lbl">${m.replace('_', ' ')}</span>
      <span class="bar"><span style="width:${(v / max) * 100}%"></span></span>
      <span class="bar-val">${v}</span></div>`).join('')}</div>`;
}

/** @param {import('../core/tipos.js').Treino} t */
export function renderTreino(t, { comTroca = true } = {}) {
  const id = 'tr' + (_uid++);
  vivos.set(id, t);
  return `<article class="card" id="${id}">${corpoTreino(id)}</article>`;
}

function corpoTreino(id) {
  const t = vivos.get(id);
  const mod = MODALIDADES[t.modalidade];
  const aquec = t.aquecimento.map((a) => `<li>${a.exercicio.nome} — ${mmss(a.duracaoSeg)}</li>`).join('');
  const main = t.principal.map((p, i) => {
    const carga = sugerirCarga(p.exercicio, t.nivel, t.modalidade);
    return `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="ex-row">
          <div>
            <b>${p.exercicio.nome}</b><br>
            <small>${PADRAO_LABEL[p.exercicio.padrao]} · ${equipNomes(p.exercicio.equipamento)}</small>
            <div><span class="chip acc">🏋 ${carga.texto}</span></div>
          </div>
          <button class="btn ghost sm swap" data-card="${id}" data-idx="${i}">trocar</button>
        </div>
        <div class="alts" id="${id}-alts-${i}"></div>
      </td>
      <td>${p.series}× ${p.reps}</td>
      <td>${p.descansoSeg}s</td>
      <td>${mmss(p.tempoSeg)}</td>
    </tr>`;
  }).join('');
  const fin = t.finalizador ? `<div class="fin"><b>Finalizador — ${t.finalizador.tipo}</b><br>${t.finalizador.descricao}</div>` : '';
  return `
    <h3>${mod.nome} · ${t.dia.toUpperCase()} · semana ${t.semana}</h3>
    <div>${badgeViab(t.viabilidade)}
      ${t.deload ? '<span class="chip warn">DELOAD</span>' : ''}
      <span class="chip acc">${t.principal.length} exercícios</span>
    </div>
    <div class="tempos">🔥 aquec ${mmss(t.tempoAquecimentoSeg)} · 🏋️ principal ${mmss(t.tempoPrincipalSeg)}${t.finalizador ? ` · 🎯 final ${mmss(t.tempoFinalizadorSeg)}` : ''} · ⏱ total ~${mmss(t.tempoTotalSeg)}</div>
    <h4>Aquecimento / Mobilidade</h4>
    <ul class="aquec">${aquec}</ul>
    <h4>Bloco principal</h4>
    <table><thead><tr><th>#</th><th>Exercício</th><th>Séries</th><th>Desc.</th><th>Tempo</th></tr></thead><tbody>${main}</tbody></table>
    <small class="mut">🏋 Cargas são um <b>ponto de partida</b> (nível + modalidade + pesos do box) — ajuste pelo aluno.</small>
    ${fin}
    <h4>Volume por músculo (séries equivalentes)</h4>
    ${renderVolume(t.volume)}`;
}

/**
 * Cenários de frequência: prova que 3 dias batem o mínimo e 4–5 rendem mais,
 * a partir do MESMO programa da semana.
 * @param {ReturnType<import('../core/programaSemanal.js').gerarProgramaSemanal>} prog
 * @param {number} [freqDestaque]  Frequência do aluno selecionado (para destacar)
 */
export function renderCenarios(prog, freqDestaque) {
  const padroes = Object.keys(prog.minimo);
  const freqs = [3, 4, 5].filter((f) => prog.cenarios[f]);

  const linhasPadrao = padroes.map((p) => {
    const cels = freqs.map((f) => {
      const a = prog.cenarios[f].aderencia[p];
      const min = prog.minimo[p];
      const cls = min > 0 ? (a.ok ? 'ok' : 'bad') : 'mut';
      return `<td class="${cls}">${a.volume}${min > 0 ? '' : ' '}</td>`;
    }).join('');
    return `<tr><td>${PADRAO_LABEL[p] || p}</td><td class="mut">${prog.minimo[p] || '—'}</td>${cels}</tr>`;
  }).join('');

  const cabFreq = freqs.map((f) => {
    const c = prog.cenarios[f];
    const destaque = f === freqDestaque ? ' style="color:var(--acc)"' : '';
    return `<th${destaque}>${f}×${c.atingeMinimo ? ' ✓' : ''}</th>`;
  }).join('');

  const total = freqs.map((f) => `<td><b>${prog.cenarios[f].totalPior}</b></td>`).join('');
  const min3 = prog.cenarios[3];
  const g5 = prog.cenarios[5]?.totalPior, g3 = min3?.totalPior;
  const ganho = g3 && g5 ? Math.round(((g5 - g3) / g3) * 100) : null;

  return `<article class="card">
    <h3>Cenários de frequência — mesmo programa para todos</h3>
    <div class="mut" style="margin-bottom:10px">Volume semanal de séries (pior combinação de dias) que cada aluno recebe conforme quantos dias treina.</div>
    <table>
      <thead><tr><th>Padrão</th><th>Mínimo</th>${cabFreq}</tr></thead>
      <tbody>${linhasPadrao}<tr><td><b>Total</b></td><td class="mut">—</td>${total}</tr></tbody>
    </table>
    <p style="margin-top:10px">
      ${min3?.atingeMinimo
        ? '<span class="chip" style="color:var(--ok);border-color:var(--ok)">✓ 3 dias já garante o mínimo para bons resultados</span>'
        : '<span class="chip warn">⚠ 3 dias ainda não bate o mínimo — ajuste a grade ou os mínimos</span>'}
      ${ganho != null ? `<span class="chip acc">5 dias = +${ganho}% de volume</span>` : ''}
    </p>
  </article>`;
}

/** @param {ReturnType<import('../core/mesociclo.js').gerarMesociclo>} meso */
export function renderMesociclo(meso) {
  const maxSeries = Math.max(1, ...meso.semanas.map((s) => s.totalSeries));
  const linhas = meso.semanas.map((s) => `
    <tr class="${s.deload ? 'bad-row' : ''}">
      <td><b>Semana ${s.semana}</b></td>
      <td>${s.intensidade.rotulo}${s.deload ? ' 💤' : ''}${s.gap ? ' · HIIT→GAP' : ''}</td>
      <td>~${s.intensidade.pctRM}% 1RM</td>
      <td>${s.totalSeries}</td>
      <td><span class="bar" style="display:inline-block;width:140px;vertical-align:middle"><span style="width:${(s.totalSeries / maxSeries) * 100}%"></span></span></td>
    </tr>`).join('');
  const gradeTxt = Object.entries(meso.grade)
    .map(([d, m]) => `${d.toUpperCase()} ${MODALIDADES[m]?.nome || m}`).join(' · ');
  return `<article class="card">
    <h3>Mesociclo · ${meso.nSemanas} semanas</h3>
    <div class="mut" style="margin-bottom:8px">Grade: ${gradeTxt}. Progressão de volume e intensidade com deload automático na semana 4 do ciclo.</div>
    <table><thead><tr><th>Semana</th><th>Fase</th><th>Intensidade</th><th>Séries (5 dias)</th><th>Volume</th></tr></thead><tbody>${linhas}</tbody></table>
  </article>`;
}

/** Delegação de cliques para os botões "trocar" e as alternativas. */
export function ativarTrocas(raiz) {
  raiz.addEventListener('click', (ev) => {
    const swap = ev.target.closest('.swap');
    if (swap) {
      const { card, idx } = swap.dataset;
      const t = vivos.get(card);
      const box = document.getElementById(`${card}-alts-${idx}`);
      if (box.childElementCount) { box.innerHTML = ''; return; } // toggle
      const alts = alternativasViaveis(t, Number(idx));
      box.innerHTML = alts.length
        ? alts.map((e) => `<button class="btn ghost sm alt" data-card="${card}" data-idx="${idx}" data-ex="${e.id}">${e.nome}</button>`).join('')
        : '<small>sem alternativas viáveis</small>';
      return;
    }
    const alt = ev.target.closest('.alt');
    if (alt) {
      const { card, idx, ex } = alt.dataset;
      const t = vivos.get(card);
      const novo = alternativasViaveis(t, Number(idx)).find((e) => e.id === ex);
      if (!novo) return;
      const atualizado = aplicarTroca(t, Number(idx), novo);
      vivos.set(card, atualizado);
      document.getElementById(card).innerHTML = corpoTreino(card);
    }
  });
}
