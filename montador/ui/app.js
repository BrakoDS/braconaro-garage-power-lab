// @ts-check
import { gerarTreino } from '../core/gerador.js';
import { gerarPlanoSemanal } from '../core/planoSemanal.js';
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import { COMBINACOES, COMBINACAO_POR_ID } from '../config/frequencias.js';
import * as store from './store.js';
import { renderTreino, renderAderencia, ativarTrocas } from './render.js';

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const $$ = (s) => Array.from(document.querySelectorAll(s));
const NIVEIS = ['iniciante', 'intermediario', 'avancado'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

// ---------- abas ----------
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  tab.classList.add('active');
  $('#view-' + tab.dataset.view).classList.add('active');
}));

// ---------- popular selects ----------
function popularSelects() {
  MODALIDADE_IDS.forEach((id) => $('#d-modalidade').appendChild(opt(id, MODALIDADES[id].nome)));
  DIAS.forEach((d) => $('#d-dia').appendChild(opt(d, d.toUpperCase())));
  COMBINACOES.forEach((c) => $('#s-combinacao').appendChild(opt(c.id, `${c.frequencia}× — ${c.rotulo}`)));
  COMBINACOES.forEach((c) => $('#al-combinacao').appendChild(opt(c.id, `${c.frequencia}× — ${c.rotulo}`)));
  ['#d-nivel', '#s-nivel', '#al-nivel'].forEach((sel) => NIVEIS.forEach((n) => $(sel).appendChild(opt(n, n))));
}

// ---------- AULA DO DIA ----------
function gerarDia() {
  const t = gerarTreino({
    modalidade: $('#d-modalidade').value,
    nivel: $('#d-nivel').value,
    dia: $('#d-dia').value,
    semana: Number($('#d-semana').value) || 1,
    seed: Math.floor(Math.random() * 1e9),
  });
  $('#d-saida').innerHTML = renderTreino(t);
}

// ---------- SEMANA DO ALUNO ----------
function atualizarSelectAlunos() {
  const sel = $('#s-aluno');
  sel.innerHTML = '';
  sel.appendChild(opt('', '— frequência avulsa —'));
  store.listarAlunos().forEach((a) => sel.appendChild(opt(a.id, `${a.nome} (${a.nivel})`)));
}

function gerarSemana() {
  const alunoId = $('#s-aluno').value;
  const aluno = store.listarAlunos().find((a) => a.id === alunoId);
  const combinacao = aluno ? COMBINACAO_POR_ID[aluno.combinacaoId] : COMBINACAO_POR_ID[$('#s-combinacao').value];
  const nivel = aluno ? aluno.nivel : $('#s-nivel').value;
  const plano = gerarPlanoSemanal({
    combinacao, nivel,
    semana: Number($('#s-semana').value) || 1,
    modalidadesPorDia: aluno?.modalidadesPorDia || {},
    seed: Math.floor(Math.random() * 1e6),
  });
  $('#s-saida').innerHTML = renderAderencia(plano) + plano.treinos.map((t) => renderTreino(t)).join('');
}

// ---------- ALUNOS ----------
function renderAlunos() {
  const lista = store.listarAlunos();
  const el = $('#al-lista');
  if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum aluno cadastrado ainda.</div>'; return; }
  el.innerHTML = lista.map((a) => {
    const c = COMBINACAO_POR_ID[a.combinacaoId];
    return `<div class="card aluno-card">
      <div>
        <div class="nome">${a.nome}</div>
        <div class="meta">${a.nivel} · ${c ? c.frequencia + '× ' + c.rotulo : '—'}</div>
      </div>
      <div class="acoes">
        <button class="btn ghost sm" data-gerar="${a.id}">Gerar semana</button>
        <button class="btn danger sm" data-del="${a.id}">Remover</button>
      </div>
    </div>`;
  }).join('');
}

function bindAlunos() {
  $('#al-add').addEventListener('click', () => {
    const nome = $('#al-nome').value.trim();
    if (!nome) { $('#al-nome').focus(); return; }
    store.adicionarAluno({
      nome, nivel: $('#al-nivel').value, combinacaoId: $('#al-combinacao').value, modalidadesPorDia: {},
    });
    $('#al-nome').value = '';
    renderAlunos();
    atualizarSelectAlunos();
  });
  $('#al-lista').addEventListener('click', (ev) => {
    const del = ev.target.closest('[data-del]');
    if (del) { store.removerAluno(del.dataset.del); renderAlunos(); atualizarSelectAlunos(); return; }
    const ger = ev.target.closest('[data-gerar]');
    if (ger) {
      $('#s-aluno').value = ger.dataset.gerar;
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.view').forEach((v) => v.classList.remove('active'));
      document.querySelector('.tab[data-view="semana"]').classList.add('active');
      $('#view-semana').classList.add('active');
      gerarSemana();
    }
  });
}

// ---------- init ----------
popularSelects();
atualizarSelectAlunos();
renderAlunos();
bindAlunos();
$('#d-gerar').addEventListener('click', gerarDia);
$('#s-gerar').addEventListener('click', gerarSemana);
$('#d-imprimir').addEventListener('click', () => window.print());
$('#s-imprimir').addEventListener('click', () => window.print());
ativarTrocas($('main'));
gerarDia();
