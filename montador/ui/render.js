// @ts-check
import { MODALIDADES } from '../config/modalidades.js';
import { PADRAO_LABEL } from '../config/padroes.js';
import { EQUIP_POR_ID } from '../data/equipamentos.js';
import { alternativasViaveis, aplicarTroca } from '../core/gerador.js';

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
  const main = t.principal.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="ex-row">
          <div>
            <b>${p.exercicio.nome}</b><br>
            <small>${PADRAO_LABEL[p.exercicio.padrao]} · ${equipNomes(p.exercicio.equipamento)}</small>
          </div>
          <button class="btn ghost sm swap" data-card="${id}" data-idx="${i}">trocar</button>
        </div>
        <div class="alts" id="${id}-alts-${i}"></div>
      </td>
      <td>${p.series}× ${p.reps}</td>
      <td>${p.descansoSeg}s</td>
      <td>${mmss(p.tempoSeg)}</td>
    </tr>`).join('');
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
    ${fin}
    <h4>Volume por músculo (séries equivalentes)</h4>
    ${renderVolume(t.volume)}`;
}

/** @param {ReturnType<import('../core/planoSemanal.js').gerarPlanoSemanal>} plano */
export function renderAderencia(plano) {
  const linhas = Object.entries(plano.aderencia).map(([p, a]) => `
    <tr class="${a.ok ? '' : 'bad-row'}"><td>${PADRAO_LABEL[p] || p}</td><td>${a.realizado}</td><td>${a.meta}</td><td>${a.ok ? '✓' : '↓ abaixo'}</td></tr>`).join('');
  return `<article class="card">
    <h3>Volume semanal vs. meta — ${plano.combinacao.frequencia}× (${plano.combinacao.rotulo})</h3>
    <table><thead><tr><th>Padrão</th><th>Realizado</th><th>Meta</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
    <p><small>Total séries/semana: <b>${plano.volumeSemanal.totalSeries}</b> · projeção mensal: <b>${plano.volumeMensal.totalSeries}</b></small></p>
  </article>`;
}

/** @param {ReturnType<import('../core/mesociclo.js').gerarMesociclo>} meso */
export function renderMesociclo(meso) {
  const maxSeries = Math.max(1, ...meso.semanas.map((s) => s.totalSeries));
  const linhas = meso.semanas.map((s) => `
    <tr class="${s.deload ? 'bad-row' : ''}">
      <td><b>Semana ${s.semana}</b></td>
      <td>${s.intensidade.rotulo}${s.deload ? ' 💤' : ''}</td>
      <td>~${s.intensidade.pctRM}% 1RM</td>
      <td>${s.totalSeries}</td>
      <td><span class="bar" style="display:inline-block;width:140px;vertical-align:middle"><span style="width:${(s.totalSeries / maxSeries) * 100}%"></span></span></td>
    </tr>`).join('');
  return `<article class="card">
    <h3>Mesociclo · ${meso.nSemanas} semanas · ${meso.combinacao.frequencia}× (${meso.combinacao.rotulo})</h3>
    <div class="mut" style="margin-bottom:8px">Progressão de volume e intensidade com deload automático na semana 4 do ciclo.</div>
    <table><thead><tr><th>Semana</th><th>Fase</th><th>Intensidade</th><th>Séries</th><th>Volume</th></tr></thead><tbody>${linhas}</tbody></table>
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
