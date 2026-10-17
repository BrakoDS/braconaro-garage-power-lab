// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/saude.test.js
 *
 * Anamnese e PAR-Q fora do app.js: as regras (saude.js), a trilha na aba
 * Registros com nomes legíveis, e o salvar global — trocar de aba e voltar não
 * apaga o que foi digitado e não salvo, e o Salvar da barra grava e registra.
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
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    contains: () => false,
  };
}
/** @type {Record<string, ReturnType<typeof elemento>>} */
let tela = {};
// Os painéis das abas ficam (como no navegador, onde o index.html os cria uma vez
// e o salvar global escuta neles); o resto é desenhado de novo.
const novoDom = () => {
  tela = Object.fromEntries(Object.entries(tela).filter(([k]) => k.startsWith('#tab-')));
  for (const el of Object.values(tela)) { el.desenhos = 0; el._html = ''; }
};
globalThis.document = /** @type {any} */ ({ querySelector: (s) => (tela[s] ||= elemento()) });
// O FormData lê os campos "digitados" no elemento do formulário.
globalThis.FormData = /** @type {any} */ (class { constructor(f) { this.m = f.campos; } entries() { return Object.entries(this.m); } get(k) { return this.m[k] ?? null; } });

const saude = await import('./saude.js?v=23');
const { ANAMNESE_CAMPOS, PARQ_PERGUNTAS, triagemParq, parqRaso, resumoAnamnese, resumoParq } = saude;
const { regAnamnese, regParq } = await import('./registro.js?v=23');
const eventos = await import('./eventos.js?v=23');
const db = await import('./db.js?v=23');
const { estado, emit, EVENTOS } = await import('./estado.js?v=23');
const { iniciarSalvarGlobal, salvar } = await import('./ui-salvar-global.js?v=23');
const { htmlAnamnese } = await import('./form-anamnese.js?v=23');
const { htmlParq, bannerParq } = await import('./form-par-q.js?v=23');
const { iniciarTabSaude, editarSecao } = await import('./ui-tab-saude.js?v=23');
iniciarSalvarGlobal();
iniciarTabSaude();

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

/* ---------- a aba Saúde de verdade: salvar global, log ---------- */

test('anamnese (aba Saúde): resumo em leitura; o ✎ abre o formulário; o rascunho sobrevive à troca de aba; o Salvar grava e deixa a trilha', async () => {
  novoDom(); limpar();
  db.criar({ id: 'Rascunho01', nome: 'Rafa', anamnese: { rotina: 'Dev', sono: '7' } });
  estado.alunoAtual = db.obter('Rascunho01');
  emit(EVENTOS.PERFIL_ABERTO, 'Rascunho01');
  emit(EVENTOS.ABRIR_ABA, 'saude');
  const painel = tela['#tab-saude'];
  assert.match(painel.innerHTML, /<span class="sf-titulo">Anamnese<\/span><span class="sf-resumo">2 de 14 respondidas/);
  assert.doesNotMatch(painel.innerHTML, /id="form-anamnese"/, 'abre em leitura');
  editarSecao('anamnese');
  const form = tela['#form-anamnese'], barra = tela['#barra-salvar'];
  assert.match(painel.innerHTML, /name="rotina" value="Dev"/);
  assert.doesNotMatch(painel.innerHTML, /type="submit"/, 'sem Salvar próprio');
  // O coach digita: o que mudou vai para o rascunho, e a barra aparece.
  Object.assign(form.campos, { rotina: 'Dev', sono: '5 ', medicamentos: 'Losartana' });
  painel.ouvintes.input();
  assert.match(barra.innerHTML, /Alterações não salvas[\s\S]*2 campos/);
  // Vai para outra aba e volta: a seção continua em edição, COM o rascunho.
  emit(EVENTOS.ABRIR_ABA, 'geral');
  emit(EVENTOS.ABRIR_ABA, 'saude');
  assert.match(painel.innerHTML, /name="sono" type="number" step="any" value="5"/);
  assert.match(painel.innerHTML, /Losartana/);
  assert.equal(await salvar(), true);
  assert.deepEqual(db.obter('Rascunho01').anamnese, { rotina: 'Dev', sono: '5', medicamentos: 'Losartana' });
  assert.equal(estado.alunoAtual.anamnese.sono, '5');
  assert.deepEqual(pendentes().map((e) => e.resumo), ['Anamnese editada · Sono (h/noite), Medicamentos']);
  assert.match(barra.innerHTML, /Alterações salvas/);
  assert.doesNotMatch(painel.innerHTML, /id="form-anamnese"/, 'depois de salvar, volta à leitura');
  assert.match(painel.innerHTML, /Medicamentos em uso<\/dt><dd>Losartana/);
  // Segunda edição: compara com o que acabou de ser salvo.
  editarSecao('anamnese');
  form.campos.rotina = 'Professora';
  painel.ouvintes.input();
  await salvar();
  assert.equal(pendentes().at(-1).resumo, 'Anamnese editada · Profissão / rotina');
  // Outro aluno: a aba redesenha com a ficha dele, em leitura.
  db.criar({ id: 'Outro02', nome: 'Outro' });
  estado.alunoAtual = db.obter('Outro02');
  emit(EVENTOS.PERFIL_ABERTO, 'Outro02');
  emit(EVENTOS.ABRIR_ABA, 'saude');
  assert.doesNotMatch(painel.innerHTML, /Losartana/);
  assert.doesNotMatch(painel.innerHTML, /id="form-anamnese"/);
});

test('PAR-Q (aba Saúde): respostas marcadas sobrevivem à troca de aba; o aviso acompanha; o Salvar deixa a trilha', async () => {
  novoDom(); limpar();
  db.criar({ id: 'Parq01', nome: 'Pri', parq: { respostas: { q0: 'nao' }, data: '', obs: '' } });
  estado.alunoAtual = db.obter('Parq01');
  emit(EVENTOS.PERFIL_ABERTO, 'Parq01');
  emit(EVENTOS.ABRIR_ABA, 'saude');
  const painel = tela['#tab-saude'];
  assert.match(painel.innerHTML, /<span class="sf-titulo">PAR-Q<\/span><span class="sf-resumo">incompleto/);
  editarSecao('parq');
  const form = tela['#form-parq'];
  assert.match(painel.innerHTML, /name="q0" value="nao" checked/);
  assert.match(painel.innerHTML, /<div id="parq-result"><div class="parq-banner">Responda todas/, 'o aviso já vem no primeiro desenho');
  Object.assign(form.campos, { q0: 'nao', q3: 'sim', data: '2026-10-07', obs: '' });
  form.ouvintes.change(); // o aviso da triagem (ouvinte do formulário)
  painel.ouvintes.change(); // o salvar global (o evento sobe até o painel)
  assert.match(tela['#parq-result'].innerHTML, /parq-banner alerta/);
  emit(EVENTOS.ABRIR_ABA, 'treino');
  emit(EVENTOS.ABRIR_ABA, 'saude');
  assert.match(painel.innerHTML, /name="q3" value="sim" checked/, 'a marcação não salva volta com a aba');
  await salvar();
  assert.deepEqual(db.obter('Parq01').parq, { respostas: { q0: 'nao', q3: 'sim' }, data: '2026-10-07', obs: '' });
  assert.deepEqual(pendentes().map((e) => e.resumo), ['PAR-Q editado · Pergunta 4, Data da triagem']);
  assert.match(painel.innerHTML, /Há resposta &quot;Sim&quot;|Há resposta "Sim"/, 'o card Alerta já mostra a triagem nova');
  editarSecao('parq');
  form.campos.obs = 'Liberado pelo cardiologista';
  painel.ouvintes.input();
  await salvar();
  assert.equal(pendentes().at(-1).resumo, 'PAR-Q editado · Observações', 'segundo salvar: só o que mudou desde o primeiro');
});

test('salvar global: campo não tocado não entra — o que chegou da nuvem no meio não é desfeito', async () => {
  novoDom(); limpar();
  db.criar({ id: 'Nuvem01', nome: 'Nina', anamnese: { rotina: 'Dev', medicamentos: '' } });
  emit(EVENTOS.PERFIL_ABERTO, 'Nuvem01');
  emit(EVENTOS.ABRIR_ABA, 'saude');
  editarSecao('anamnese');
  const painel = tela['#tab-saude'], form = tela['#form-anamnese'];
  Object.assign(form.campos, { rotina: 'Dev', medicamentos: '' });
  painel.ouvintes.input(); // o formulário inteiro lido: nada mudou
  // Outro aparelho grava os medicamentos enquanto o coach edita só a rotina.
  db.atualizar('Nuvem01', { anamnese: { rotina: 'Dev', medicamentos: 'Losartana' } });
  form.campos.rotina = 'Professora';
  painel.ouvintes.input();
  await salvar();
  assert.deepEqual(db.obter('Nuvem01').anamnese, { rotina: 'Professora', medicamentos: 'Losartana' },
    'o formulário velho na tela não apaga o que chegou');
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
  for (const f of ['iniciarTabSaude();']) {
    assert.ok(main.includes(f), f);
    assert.ok(main.indexOf(f) < main.length, `${f} liga antes do app`);
  }
  // Uma lista só de perguntas: o PDF lê a mesma do formulário.
  const pdf = ler('./pdf.js');
  assert.match(pdf, /import \{ PARQ_PERGUNTAS as PARQ_Q, ANAMNESE_LABELS \} from '\.\/saude\.js(\?v=\d+)?';/);
  assert.ok(!pdf.includes('Você sente dor no peito'), 'pdf.js não tem cópia própria das perguntas');
});
