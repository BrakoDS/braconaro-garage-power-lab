// @ts-check
import { gerarTreino } from './core/gerador.js';
import { gerarPlanoSemanal } from './core/planoSemanal.js';
import { MODALIDADES, MODALIDADE_IDS } from './config/modalidades.js';
import { COMBINACOES, COMBINACAO_POR_ID } from './config/frequencias.js';
import { PADRAO_LABEL } from './config/padroes.js';

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const mmss = (s) => `${Math.floor(s / 60)}min`;

// -------- popular selects --------
function opt(v, t) { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }
MODALIDADE_IDS.forEach((id) => $('#modalidade').appendChild(opt(id, MODALIDADES[id].nome)));
COMBINACOES.forEach((c) => $('#combinacao').appendChild(opt(c.id, `${c.frequencia}x — ${c.rotulo}`)));
['iniciante', 'intermediario', 'avancado'].forEach((n) => $('#nivel').appendChild(opt(n, n)));

function badgeViab(v) {
  return v.ok
    ? `<span class="ok">✓ viável p/ 8 alunos (grupos de ${v.tamanhoGrupo})</span>`
    : `<span class="bad">⚠ ${v.conflitos.join(' ')}</span>`;
}

function renderVolume(vol) {
  const max = Math.max(1, ...Object.values(vol.porMusculo));
  const linhas = Object.entries(vol.porMusculo)
    .sort((a, b) => b[1] - a[1])
    .map(([m, v]) => `
      <div class="bar-row">
        <span class="bar-lbl">${m}</span>
        <span class="bar"><span style="width:${(v / max) * 100}%"></span></span>
        <span class="bar-val">${v}</span>
      </div>`).join('');
  return `<div class="vol">${linhas}</div>`;
}

function renderTreino(t) {
  const aquec = t.aquecimento.map((a) => `<li>${a.exercicio.nome} — ${mmss(a.duracaoSeg)}</li>`).join('');
  const main = t.principal.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><b>${p.exercicio.nome}</b><br><small>${PADRAO_LABEL[p.exercicio.padrao]} · ${p.exercicio.equipamento.join(', ')}</small></td>
      <td>${p.series}× ${p.reps}</td>
      <td>${p.descansoSeg}s</td>
      <td>${mmss(p.tempoSeg)}</td>
    </tr>`).join('');
  const fin = t.finalizador
    ? `<div class="fin"><b>Finalizador — ${t.finalizador.tipo}</b><br>${t.finalizador.descricao}</div>` : '';
  return `
    <article class="card">
      <header>
        <h3>${MODALIDADES[t.modalidade].nome} · ${t.dia.toUpperCase()} · semana ${t.semana}${t.deload ? ' (DELOAD)' : ''}</h3>
        <div>${badgeViab(t.viabilidade)}</div>
        <div class="tempos">🔥 aquec ${mmss(t.tempoAquecimentoSeg)} · 🏋️ principal ${mmss(t.tempoPrincipalSeg)}${t.finalizador ? ` · 🎯 final ${mmss(t.tempoFinalizadorSeg)}` : ''} · ⏱ total ~${mmss(t.tempoTotalSeg)}</div>
      </header>
      <h4>Aquecimento / Mobilidade</h4>
      <ul class="aquec">${aquec}</ul>
      <h4>Bloco principal</h4>
      <table><thead><tr><th>#</th><th>Exercício</th><th>Séries</th><th>Desc.</th><th>Tempo</th></tr></thead><tbody>${main}</tbody></table>
      ${fin}
      <h4>Volume por músculo (séries equivalentes)</h4>
      ${renderVolume(t.volume)}
    </article>`;
}

function renderAderencia(plano) {
  const linhas = Object.entries(plano.aderencia).map(([p, a]) => `
    <tr class="${a.ok ? '' : 'bad-row'}">
      <td>${PADRAO_LABEL[p] || p}</td><td>${a.realizado}</td><td>${a.meta}</td>
      <td>${a.ok ? '✓' : '↓ abaixo'}</td>
    </tr>`).join('');
  return `
    <article class="card">
      <h3>Volume semanal vs. meta (${plano.combinacao.frequencia}x/semana)</h3>
      <table><thead><tr><th>Padrão</th><th>Realizado</th><th>Meta</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
      <p><small>Total séries/semana: <b>${plano.volumeSemanal.totalSeries}</b> · projeção mensal: <b>${plano.volumeMensal.totalSeries}</b></small></p>
    </article>`;
}

// -------- ações --------
function gerarUm() {
  const t = gerarTreino({
    modalidade: $('#modalidade').value,
    nivel: $('#nivel').value,
    dia: 'seg',
    semana: Number($('#semana').value) || 1,
    seed: Math.floor(Math.random() * 1e9),
  });
  $('#saida').innerHTML = renderTreino(t);
}

function gerarSemana() {
  const combinacao = COMBINACAO_POR_ID[$('#combinacao').value];
  const plano = gerarPlanoSemanal({
    combinacao,
    nivel: $('#nivel').value,
    semana: Number($('#semana').value) || 1,
    seed: Math.floor(Math.random() * 1e6),
  });
  $('#saida').innerHTML = renderAderencia(plano) + plano.treinos.map(renderTreino).join('');
}

$('#btn-um').addEventListener('click', gerarUm);
$('#btn-semana').addEventListener('click', gerarSemana);

// gera algo ao abrir
gerarSemana();
