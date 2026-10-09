// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/saude.test.js
 *
 * Anamnese e PAR-Q fora do app.js: as regras (saude.js), a trilha na aba
 * Registros com nomes legíveis, e a "regra do rascunho" — trocar de aba e
 * voltar não apaga o que foi digitado e não salvo.
 *
 * A fiação é testada com um DOM de mentira (só o que as abas tocam) e o db.js
 * de verdade sobre um localStorage em memória, instalado ANTES dos imports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/* ---------- um DOM mínimo ---------- */

/** Um elemento de mentira: guarda innerHTML, ouvintes e os campos "digitados". */
function elemento() {
  return {
    desenhos: 0, _html: '', ouvintes: /** @type {Record<string, Function>} */ ({}), campos: /** @type {Record<string, string>} */ ({}),
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; this.desenhos++; },
    addEventListener(t, f) { this.ouvintes[t] = f; },
    querySelector() { return { classList: { add() {}, remove() {} } }; },
  };
}
/** @type {Record<string, ReturnType<typeof elemento>>} */
let tela = {};
const novoDom = () => { tela = {}; };
globalThis.document = /** @type {any} */ ({ querySelector: (s) => (tela[s] ||= elemento()) });
// O FormData lê os campos "digitados" no elemento do formulário.
globalThis.FormData = /** @type {any} */ (class { constructor(f) { this.m = f.campos; } entries() { return Object.entries(this.m); } get(k) { return this.m[k] ?? null; } });

const saude = await import('./saude.js?v=13');
const { ANAMNESE_CAMPOS, PARQ_PERGUNTAS, triagemParq, parqRaso, resumoAnamnese, resumoParq } = saude;
const { regAnamnese, regParq } = await import('./registro.js?v=13');
const eventos = await import('./eventos.js?v=13');
const db = await import('./db.js?v=13');
const { estado, emit, EVENTOS } = await import('./estado.js?v=13');
const { iniciarTabAnamnese, htmlAnamnese } = await import('./ui-tab-anamnese.js?v=13');
const { iniciarTabParq, htmlParq, bannerParq } = await import('./ui-tab-par-q.js?v=13');
iniciarTabAnamnese();
iniciarTabParq();

const pendentes = () => eventos.pendentes().filter((e) => e.tipo === 'ficha-editada');
const limpar = () => { for (const k of [...memoria.keys()]) if (k.includes('eventos')) memoria.delete(k); };

/* ---------- saude.js ---------- */

test('saúde: 14 campos de anamnese com nome curto, 7 perguntas de PAR-Q', () => {
  assert.equal(ANAMNESE_CAMPOS.length, 14);
  assert.ok(ANAMNESE_CAMPOS.every((c) => c.k && c.rotulo && c.curto));
  assert.equal(new Set(ANAMNESE_CAMPOS.map((c) => c.k)).size, 14, 'chaves únicas');
  assert.equal(PARQ_PERGUNTAS.length, 7);
});

test('saúde: a triagem do PAR-Q', () => {
  assert.equal(triagemParq({}), 'vazio');
  assert.equal(triagemParq({ q2: 'sim' }), 'alerta', 'um "Sim" já alerta, mesmo incompleto');
  assert.equal(triagemParq({ q0: 'nao' }), 'incompleto');
  const nao = Object.fromEntries(PARQ_PERGUNTAS.map((_, i) => ['q' + i, 'nao']));
  assert.equal(triagemParq(nao), 'ok');
  assert.equal(triagemParq({ ...nao, q6: 'sim' }), 'alerta');
  assert.match(bannerParq({ q2: 'sim' }), /parq-banner alerta/);
  assert.match(bannerParq(nao), /parq-banner ok/);
  assert.equal(bannerParq({}), '');
});

test('saúde: o log fala a língua da tela, na ordem da tela', () => {
  assert.equal(resumoAnamnese(['medicamentos', 'sono']), 'Anamnese editada · Sono (h/noite), Medicamentos');
  assert.equal(resumoParq(['obs', 'q2', 'data']), 'PAR-Q editado · Pergunta 3, Data da triagem, Observações');
  assert.deepEqual(parqRaso({ respostas: { q1: 'sim' } }), { q0: '', q1: 'sim', q2: '', q3: '', q4: '', q5: '', q6: '', data: '', obs: '' });
});

/* ---------- a trilha ---------- */

test('auditoria: anamnese registra só os campos que mudaram — nomes, nunca valores', () => {
  limpar();
  const antes = { id: 'Ana', nome: 'Ana Lima', anamnese: { sono: '7', medicamentos: '', rotina: 'Dev' } };
  regAnamnese(antes, { sono: '6', medicamentos: 'Losartana', rotina: 'Dev', alcool: '' });
  const [ev] = pendentes();
  assert.equal(ev.resumo, 'Anamnese editada · Sono (h/noite), Medicamentos');
  assert.deepEqual(ev.campos, ['anamnese.medicamentos', 'anamnese.sono']);
  assert.ok(!JSON.stringify(ev).includes('Losartana'), 'dado de saúde não vai para o log');
  assert.equal(ev.alunoNome, 'Ana Lima');
});

test('auditoria: salvar sem mudar nada não registra — nem com as chaves em outra ordem', () => {
  limpar();
  // A nuvem devolve os mapas em outra ordem: comparar o objeto como texto
  // acusaria "editado" sem ninguém ter mexido.
  regAnamnese({ id: 'A', anamnese: { sono: '7', rotina: 'Dev' } }, { rotina: 'Dev', sono: '7', alcool: '' });
  regParq({ id: 'A', parq: { obs: '', data: '2026-09-01', respostas: { q3: 'sim', q0: 'nao' } } },
    { respostas: { q0: 'nao', q3: 'sim' }, data: '2026-09-01', obs: '' });
  assert.equal(pendentes().length, 0);
});

test('auditoria: PAR-Q diz qual pergunta mudou', () => {
  limpar();
  regParq({ id: 'A', nome: 'A', parq: { respostas: { q0: 'nao' }, data: '', obs: '' } },
    { respostas: { q0: 'nao', q2: 'sim' }, data: '2026-10-01', obs: '' });
  const [ev] = pendentes();
  assert.equal(ev.resumo, 'PAR-Q editado · Pergunta 3, Data da triagem');
  assert.deepEqual(ev.campos, ['parq.data', 'parq.q2']);
  assert.ok(!/"sim"|nao/.test(JSON.stringify(ev)), 'a resposta não vai para o log');
});

/* ---------- a aba de verdade: rascunho, salvar, log ---------- */

test('anamnese: o rascunho sobrevive à troca de aba; salvar grava e deixa a trilha', () => {
  novoDom(); limpar();
  db.criar({ id: 'Rascunho01', nome: 'Rafa', anamnese: { rotina: 'Dev', sono: '7' } });
  estado.alunoAtual = db.obter('Rascunho01');
  emit(EVENTOS.PERFIL_ABERTO, 'Rascunho01');
  emit(EVENTOS.ABRIR_ABA, 'anamnese');
  const painel = tela['#tab-anamnese'], form = tela['#form-anamnese'];
  assert.equal(painel.desenhos, 1);
  assert.match(painel.innerHTML, /name="rotina" value="Dev"/);
  // O coach digita e, sem salvar, vai para outra aba e volta.
  Object.assign(form.campos, { rotina: 'Dev', sono: '5 ', medicamentos: 'Losartana' });
  emit(EVENTOS.ABRIR_ABA, 'dados');
  emit(EVENTOS.ABRIR_ABA, 'anamnese');
  assert.equal(painel.desenhos, 1, 'voltar à aba não redesenha — o rascunho continua lá');
  form.ouvintes.submit({ preventDefault() {} });
  assert.deepEqual(db.obter('Rascunho01').anamnese, { rotina: 'Dev', sono: '5', medicamentos: 'Losartana' });
  assert.equal(estado.alunoAtual.anamnese.sono, '5');
  assert.deepEqual(pendentes().map((e) => e.resumo), ['Anamnese editada · Sono (h/noite), Medicamentos']);
  // Segundo "Salvar" sem sair da aba: compara com o que acabou de ser salvo,
  // não com a ficha de quando a aba foi desenhada.
  form.campos.rotina = 'Professora';
  form.ouvintes.submit({ preventDefault() {} });
  assert.equal(pendentes().at(-1).resumo, 'Anamnese editada · Profissão / rotina');
  // Outro aluno: a aba redesenha com a ficha dele.
  db.criar({ id: 'Outro02', nome: 'Outro' });
  estado.alunoAtual = db.obter('Outro02');
  emit(EVENTOS.PERFIL_ABERTO, 'Outro02');
  emit(EVENTOS.ABRIR_ABA, 'anamnese');
  assert.equal(painel.desenhos, 2);
  assert.doesNotMatch(painel.innerHTML, /Losartana/);
});

test('PAR-Q: respostas marcadas sobrevivem à troca de aba; o aviso acompanha; salvar deixa a trilha', () => {
  novoDom(); limpar();
  db.criar({ id: 'Parq01', nome: 'Pri', parq: { respostas: { q0: 'nao' }, data: '', obs: '' } });
  estado.alunoAtual = db.obter('Parq01');
  emit(EVENTOS.PERFIL_ABERTO, 'Parq01');
  emit(EVENTOS.ABRIR_ABA, 'parq');
  const painel = tela['#tab-parq'], form = tela['#form-parq'];
  assert.match(painel.innerHTML, /name="q0" value="nao" checked/);
  assert.match(painel.innerHTML, /<div id="parq-result"><div class="parq-banner">Responda todas/, 'o aviso já vem no primeiro desenho');
  Object.assign(form.campos, { q0: 'nao', q3: 'sim', data: '2026-10-07', obs: '' });
  form.ouvintes.change();
  assert.match(tela['#parq-result'].innerHTML, /parq-banner alerta/);
  emit(EVENTOS.ABRIR_ABA, 'matriz');
  emit(EVENTOS.ABRIR_ABA, 'parq');
  assert.equal(painel.desenhos, 1, 'as marcações não salvas continuam');
  form.ouvintes.submit({ preventDefault() {} });
  assert.deepEqual(db.obter('Parq01').parq, { respostas: { q0: 'nao', q3: 'sim' }, data: '2026-10-07', obs: '' });
  assert.deepEqual(pendentes().map((e) => e.resumo), ['PAR-Q editado · Pergunta 4, Data da triagem']);
  form.campos.obs = 'Liberado pelo cardiologista';
  form.ouvintes.submit({ preventDefault() {} });
  assert.equal(pendentes().at(-1).resumo, 'PAR-Q editado · Observações', 'segundo salvar: só o que mudou desde o primeiro');
});

test('anamnese e PAR-Q: texto da ficha é escapado no formulário', () => {
  const h = htmlAnamnese({ anamnese: { rotina: '"><script>', doencas: '</textarea><b>' } });
  assert.ok(!h.includes('<script>') && !h.includes('</textarea><b>'));
  assert.ok(!htmlParq({ parq: { obs: '</textarea><img>' } }).includes('<img>'));
});

/* ---------- fatiamento ---------- */

test('fatiamento: Anamnese e PAR-Q moram nos módulos delas, ligadas no main.js', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const app = ler('./boot.js');
  for (const resto of ['renderAnamnese', 'renderParq', 'form-anamnese', 'form-parq', '#tab-anamnese', '#tab-parq',
    'PARQ', 'optsSelect', 'parq-banner', "'anamnese'", "'parq'", 'regFicha']) {
    assert.ok(!app.includes(resto), `app.js ainda tem ${resto}`);
  }
  const main = ler('./telas.js');
  for (const f of ['iniciarTabAnamnese();', 'iniciarTabParq();']) {
    assert.ok(main.includes(f), f);
    assert.ok(main.indexOf(f) < main.length, `${f} liga antes do app`);
  }
  // Uma lista só de perguntas: o PDF lê a mesma do formulário.
  const pdf = ler('./pdf.js');
  assert.match(pdf, /import \{ PARQ_PERGUNTAS as PARQ_Q, ANAMNESE_LABELS \} from '\.\/saude\.js(\?v=\d+)?';/);
  assert.ok(!pdf.includes('Você sente dor no peito'), 'pdf.js não tem cópia própria das perguntas');
});
