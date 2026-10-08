// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tela-checkin.test.js
 *
 * A tela Check-in ligada ao roteador e às regras puras: abre em hoje, cada
 * botão aplica a regra certa (grava, registra, redesenha), a recusa aparece no
 * quadrado com o painel ainda aberto — e o app.js não tem mais nada disso.
 *
 * DOM de mentira (só o que a tela toca) e o db.js de verdade sobre um
 * localStorage em memória, instalado ANTES dos imports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/** @param {string} sel */
function elemento(sel) {
  return {
    sel, innerHTML: '', textContent: '', ouvintes: /** @type {Record<string, Function>} */ ({}),
    addEventListener(t, f) { this.ouvintes[t] = f; },
    querySelector: (/** @type {string} */ s) => campos[s] || null,
  };
}
/** @type {Record<string, any>} */ const tela = {};
/** Os campos do painel aberto (data e hora digitadas). @type {Record<string, any>} */ const campos = {};
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({ querySelector: (s) => el(s), querySelectorAll: () => [] });

const db = await import('./db.js');
const { emit, EVENTOS } = await import('./estado.js');
const eventos = await import('./eventos.js');
const { iniciarTelaCheckin } = await import('./ui-tela-checkin.js');
const { hoje, addDias, fmtData } = await import('./util/formato.js');
const { datasDaSemana } = await import('../../compartilhado/regras/semana.js');
iniciarTelaCheckin();

/** Um clique num botão da lista, como o navegador entrega. @param {Record<string, string>} dataset @param {string} classe */
const clicar = (classe, dataset) => {
  const btn = { dataset, classList: { contains: (c) => c === classe } };
  el('#chk-list').ouvintes.click({ target: { closest: () => btn } });
};
const ultimoLog = () => eventos.pendentes().at(-1);

// O aluno treina todos os dias úteis, às 07:00 — a semana de hoje sempre tem aula.
const semana = datasDaSemana(new Date(hoje() + 'T00:00:00'));
db.criar({ id: 'Grade01', nome: 'Gil', diasTreino: ['seg', 'ter', 'qua', 'qui', 'sex'], horarios: { seg: '07:00', ter: '07:00', qua: '07:00', qui: '07:00', sex: '07:00' } });
db.criar({ id: 'Livre02', nome: 'Lia' });
db.criar({ id: 'Fora03', nome: 'Fora', status: 'inativo' });

test('tela: abrir pelo roteador desenha hoje, com resumo, grade e sumidos', () => {
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  assert.match(el('#chk-data-lbl').textContent, new RegExp(fmtData(hoje()).replace(/\//g, '\\/')));
  assert.match(el('#chk-resumo').innerHTML, /Alunos ativos<\/span><span class="fin-card-v">2</, 'inativo fora da conta');
  assert.match(el('#chk-list').innerHTML, /chk-grade/, 'aluno com dias de treino: a grade');
  assert.match(el('#chk-list').innerHTML, /chk-toggle" data-id="Livre02"/, 'aluno sem dias: o botão simples');
  assert.match(el('#chk-sumidos').innerHTML, /Quem sumiu \(7\+ dias sem vir\)[^]*nunca veio/);
});

test('tela: o dia anterior e o próximo; abrir de novo volta para hoje', () => {
  el('#chk-prev').ouvintes.click();
  assert.match(el('#chk-data-lbl').textContent, new RegExp(fmtData(addDias(hoje(), -1)).replace(/\//g, '\\/')));
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  assert.match(el('#chk-data-lbl').textContent, new RegExp(fmtData(hoje()).replace(/\//g, '\\/')));
});

test('tela: check-in na grade grava pela regra, registra e redesenha', () => {
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  clicar('chk-checkin', { id: 'Grade01', dia: semana.seg });
  assert.ok(db.obter('Grade01').presencas.includes(semana.seg));
  assert.equal(ultimoLog().tipo, 'presenca');
  assert.equal(ultimoLog().alunoId, 'Grade01');
  assert.match(el('#chk-list').innerHTML, /data-dia="[^"]+"[^>]*>Desfazer|chk-desfazer/, 'o quadrado resolvido oferece desfazer');
  clicar('chk-desfazer', { id: 'Grade01', dia: semana.seg });
  assert.ok(!db.obter('Grade01').presencas.includes(semana.seg));
  assert.equal(ultimoLog().tipo, 'presenca-removida');
});

test('tela: trocar para um dia ocupado é recusado — o recado aparece e o painel fica aberto', () => {
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  clicar('chk-trocar', { id: 'Grade01', dia: semana.seg }); // abre o painel
  assert.match(el('#chk-list').innerHTML, /Esta aula passa para:/);
  campos['[data-hora-sel]'] = { value: '18:00' };
  clicar('chk-ficha', { diaSel: semana.qua }); // escolhe a quarta, que já tem aula
  const antes = JSON.stringify(db.obter('Grade01').remarcacoes || {});
  clicar('chk-confirma-troca', { id: 'Grade01', dia: semana.seg });
  assert.equal(JSON.stringify(db.obter('Grade01').remarcacoes || {}), antes, 'nada gravado');
  assert.match(el('#chk-list').innerHTML, /Quarta já usa esse dia/);
  assert.match(el('#chk-list').innerHTML, /Esta aula passa para:/, 'o painel continua aberto para escolher outra data');
  // Escolhe o sábado, livre: grava a troca com a hora digitada.
  clicar('chk-ficha', { diaSel: semana.sab });
  clicar('chk-confirma-troca', { id: 'Grade01', dia: semana.seg });
  assert.deepEqual(db.obter('Grade01').remarcacoes[semana.seg], { data: semana.sab, hora: '18:00' });
  assert.equal(ultimoLog().tipo, 'troca-aula');
  assert.doesNotMatch(el('#chk-list').innerHTML, /Esta aula passa para:/, 'feito: o painel fecha');
  delete campos['[data-hora-sel]'];
});

test('tela: atestado, agendar e desmarcar a reposição', () => {
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  clicar('chk-atestado', { id: 'Grade01', dia: semana.ter });
  assert.equal(db.obter('Grade01').atestados[semana.ter].reposicao, null);
  assert.match(el('#chk-list').innerHTML, /1 reposição a agendar/);
  clicar('chk-chip', { id: 'Grade01', origem: semana.ter }); // abre o painel de reposição
  const sabSeguinte = addDias(semana.sab, 7);
  campos['[data-data-sel]'] = { value: sabSeguinte };
  campos['[data-hora-sel]'] = { value: '09:00' };
  clicar('chk-confirma-rep', { id: 'Grade01', origem: semana.ter });
  assert.deepEqual(db.obter('Grade01').atestados[semana.ter].reposicao, { data: sabSeguinte, hora: '09:00' });
  assert.equal(ultimoLog().tipo, 'reposicao');
  clicar('chk-desmarcar', { id: 'Grade01', origem: semana.ter });
  assert.equal(db.obter('Grade01').atestados[semana.ter].reposicao, null);
  delete campos['[data-data-sel]']; delete campos['[data-hora-sel]'];
});

test('tela: presença simples marca e desmarca o dia da tela', () => {
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  clicar('chk-toggle', { id: 'Livre02' });
  assert.deepEqual(db.obter('Livre02').presencas, [hoje()]);
  assert.match(el('#chk-resumo').innerHTML, /Presentes no dia<\/span><span class="fin-card-v ok">1</);
  clicar('chk-toggle', { id: 'Livre02' });
  assert.deepEqual(db.obter('Livre02').presencas, []);
});

/* ---------- fatiamento ---------- */

test('fatiamento: o Check-in mora em ui-tela-checkin.js + checkin-regras.js', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const app = ler('./app.js');
  for (const resto of ['renderCheckin', 'chkPainel', 'chkData', 'fazerCheckin', 'trocarAula', 'lancarAtestado', 'desfazerAula',
    'agendarReposicao', 'desmarcarReposicao', 'toggleCheckin', 'diasReivindicados', '#chk-', 'linhaGrade']) {
    assert.ok(!app.includes(resto), `app.js ainda tem ${resto}`);
  }
  // A publicação do Portal é agendada num lugar só: na gravação (db.aoGravar).
  assert.deepEqual(app.match(/agendarPublicarPortal\(\);/g), ['agendarPublicarPortal();'], 'uma chamada só');
  assert.match(app, /db\.aoGravar\(\(\) => \{ agendarPublicarPortal\(\); emit\(EVENTOS\.ALUNOS_MUDARAM\); \}\);/);
  const uiTela = ler('./ui-tela-checkin.js');
  assert.ok(!/db\.atualizar\([^)]*\{\s*presencas/.test(uiTela), 'a tela não monta a ficha: quem monta é a regra');
  assert.equal((uiTela.match(/db\.atualizar\(/g) || []).length, 1, 'uma gravação só, no aplicar()');
  const regras = ler('./checkin-regras.js');
  assert.ok(!/from '\.\/db\.js'|document\.|localStorage|Date\.now\(\)|new Date\(\)\.toTimeString/.test(regras), 'as regras não tocam banco, DOM nem relógio');
  const main = ler('./main.js');
  assert.ok(main.indexOf('iniciarNavegacao();') < main.indexOf('iniciarTelaCheckin();'));
  assert.ok(main.indexOf('iniciarTelaCheckin();') < main.indexOf("await import('./app.js')"));
});
