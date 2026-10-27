// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tab-geral.test.js
 *
 * A aba Geral em cards: o que cada card mostra em leitura, o formulário de
 * cada um em edição, e as regras do card Financeiro (qual fatura o atalho
 * paga, a situação). A fiação com o DOM é conferida na vitrine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resumoDosDias, htmlCardPerfil, htmlCardContato, htmlCardAcesso, htmlAcessoPortal, htmlCardFinanceiro,
  htmlFinanceiroDinamico, faturaParaPagar, htmlAbaGeral, CARDS_EDITAVEIS,
} from './ui-tab-geral.js?v=25';
import { botaoEditar, htmlLinhas } from './ui-card.js?v=25';
import { camposDados, CAMPOS } from './campos-aluno.js?v=25';

const HOJE = '2026-10-11';
const ana = {
  id: 'Ana01', nome: 'Ana Lima', telefone: '14999990000', email: 'ana@box.com', status: 'ativo',
  nascimento: '1995-03-10', objetivo: 'Hipertrofia', freqVezes: '3', diasTreino: ['seg', 'qua'], horarios: { seg: '07:00' }, freqHorario: '19h',
  mensalidade: '150', vencimento: '10', criadoEm: Date.parse('2026-09-01T12:00:00'),
};

/* ---------- moldura ---------- */

test('card: ✎ Editar em leitura, ✓ Pronto em edição; valor vazio aparece como —', () => {
  assert.match(botaoEditar('contato', 'contato', false), /data-card="contato" data-modo="editar"[^>]*>✎ Editar</);
  assert.match(botaoEditar('contato', 'contato', true), /data-modo="ver"[^>]*>✓ Pronto</);
  assert.match(htmlLinhas([['Endereço', '']]), /<dt>Endereço<\/dt><dd><span class="card-vazio">—<\/span><\/dd>/);
});

/* ---------- Perfil ---------- */

test('perfil: dias com a hora de cada um; dia sem hora própria usa a hora antiga', () => {
  assert.equal(resumoDosDias(ana), 'Seg 7h · Qua 19h');
  assert.equal(resumoDosDias({ diasTreino: ['sex'] }), 'Sex');
  assert.equal(resumoDosDias({}), '');
});

test('perfil: idade, objetivo, frequência e dias — só leitura; o ✎ abre o Perfil de treino da aba Treino', () => {
  const h = htmlCardPerfil(ana, HOJE);
  for (const t of ['31 anos', 'Hipertrofia', '3x por semana', 'Seg 7h · Qua 19h']) assert.ok(h.includes(t), t);
  assert.match(h, /data-ir-aba="treino" data-editar="perfil-treino"/);
  assert.doesNotMatch(h, /<form|data-modo/, 'o card Perfil não tem formulário próprio');
});

/* ---------- Contato ---------- */

test('contato: leitura mostra os dados; edição traz o formulário com os campos do grupo', () => {
  const ler = htmlCardContato(ana, false);
  for (const t of ['Ana Lima', '14999990000', 'ana@box.com', 'status ativo', '#Ana01']) assert.ok(ler.includes(t), t);
  assert.doesNotMatch(ler, /<form/);
  const ed = htmlCardContato(ana, true);
  assert.match(ed, /<form id="form-geral-contato"/);
  for (const n of ['nome', 'telefone', 'email', 'endereco', 'status']) assert.match(ed, new RegExp(`name="${n}"`), n);
  assert.match(ed, /value="Ana01" disabled/, 'o ID aparece, mas não muda');
  assert.doesNotMatch(ed, /name="mensalidade"|name="appLiberado"/, 'só os campos do card');
});

test('contato: texto da ficha é escapado', () => {
  assert.doesNotMatch(htmlCardContato({ id: 'x', nome: '<script>', endereco: '"><img>' }, false), /<script>|<img>/);
});

/* ---------- Financeiro ---------- */

test('financeiro: o atalho paga a fatura MAIS ANTIGA em aberto', () => {
  const f = (mesId, status, pagavel = true) => ({ mesId, status, pagavel, rotulo: mesId });
  // O histórico vem do mais novo para o mais antigo.
  assert.equal(faturaParaPagar({ faturas: [f('2026-10', 'pendente'), f('2026-09', 'vencido'), f('2026-08', 'vencido'), f('2026-07', 'pago')] })?.mesId, '2026-08');
  assert.equal(faturaParaPagar({ faturas: [f('2026-10', 'pendente'), f('2026-09', 'pago')] })?.mesId, '2026-10');
  assert.equal(faturaParaPagar({ faturas: [f('2026-10', 'pago'), f('2026-09', 'coberto', false)] }), null);
  assert.equal(faturaParaPagar({ faturas: [] }), null);
});

test('financeiro: situação, em aberto e Registrar pagamento da fatura certa', () => {
  // Vence dia 10: em 11/10 a fatura de outubro já venceu e não foi paga.
  const h = htmlFinanceiroDinamico(ana, [ana], HOJE, false);
  assert.match(h, /class="ac-chip fg-chip fg-bad">Atrasado</);
  assert.match(h, /em aberto · R\$/);
  assert.match(h, /data-fin="pagar" data-mes="2026-10">Registrar pagamento · Outubro \/ 2026</);
  assert.match(h, /data-fin="novo">\+ Lançamento</);
  assert.match(h, /data-geral="faturas" aria-expanded="false"[^>]*>Ver faturas ▾</);
  assert.match(h, /id="fg-faturas" hidden>/, 'faturas fechadas por padrão');
  const pago = { ...ana, pagamentos: { '2026-09': true, '2026-10': true } };
  const emDia = htmlFinanceiroDinamico(pago, [pago], HOJE, false);
  assert.match(emDia, /fg-ok">Em dia</);
  assert.doesNotMatch(emDia, /data-fin="pagar"/, 'nada a pagar, sem o atalho');
});

test('financeiro: Ver faturas abre a lista no próprio card, com as ações de cada fatura', () => {
  const h = htmlFinanceiroDinamico(ana, [ana], HOJE, true);
  assert.match(h, /aria-expanded="true"[^>]*>Ocultar faturas ▴</);
  assert.match(h, /<div class="fa-lista">/);
  assert.match(h, /Fatura de Outubro/);
  assert.doesNotMatch(h, /id="fg-faturas" hidden/);
});

test('financeiro: o plano mostra a ficha COM o rascunho; o dinheiro, a ficha SALVA', () => {
  const vista = { ...ana, mensalidade: '200' }; // mudou no ✎ e ainda não salvou
  const h = htmlCardFinanceiro(vista, ana, [ana], HOJE, { editando: false, faturasAbertas: false });
  assert.match(h, /R\$\s?200,00<small>\/mês/, 'o plano editado aparece');
  assert.match(h, /Registrar pagamento · Outubro/, "as faturas continuam as da ficha salva");
  assert.match(h, /class="card card-largo" id="card-financeiro"/);
  const ed = htmlCardFinanceiro(vista, ana, [ana], HOJE, { editando: true, faturasAbertas: false });
  assert.match(ed, /<form id="form-geral-plano"/);
  for (const n of ['mensalidade', 'vencimento', 'parceriaPct', 'parceriaNome', 'pagoPorId', 'pagoPorEscopo']) assert.match(ed, new RegExp(`name="${n}"`), n);
  assert.match(ed, /id="ger-fin-dinamico"/, 'em edição, a situação e os botões de dinheiro continuam ali');
});

test('financeiro: parceria, responsável e dependentes aparecem no plano', () => {
  const resp = { id: 'R1', nome: 'Rafa', mensalidade: '150', vencimento: '10' };
  const dep = { id: 'D1', nome: 'Duda', mensalidade: '100', vencimento: '10', pagoPor: { id: 'R1', escopo: 'plano' }, parceria: { nome: 'Clínica', percentual: 50 } };
  const hDep = htmlCardFinanceiro(dep, dep, [resp, dep], HOJE, { editando: false, faturasAbertas: false });
  assert.match(hDep, /Parceria 50% · Clínica/);
  assert.match(hDep, /Conta acertada por <b>Rafa<\/b> \(só o plano\)/);
  const hResp = htmlCardFinanceiro(resp, resp, [resp, dep], HOJE, { editando: false, faturasAbertas: false });
  assert.match(hResp, /Paga também a conta de <b>Duda<\/b>/);
});

/* ---------- Acesso ---------- */

test('acesso: app e Lite em leitura; o link do Portal e o LGPD', () => {
  const h = htmlCardAcesso({ ...ana, appLiberado: true }, ana, false);
  assert.match(h, /fg-ok">Liberado</);
  assert.match(h, /fg-neutro">Completa</);
  assert.match(h, /id="ger-lgpd"/);
  assert.match(h, /Ainda sem link de acesso[\s\S]*data-geral="acesso">Criar acesso</);
  const ed = htmlCardAcesso(ana, ana, true);
  assert.match(ed, /<form id="form-geral-acesso"/);
  assert.match(ed, /name="appLiberado"[\s\S]*name="modoLite"/);
});

test('acesso: sem e-mail, o botão fica desligado e diz onde preencher; com link enviado, oferece um novo', () => {
  assert.match(htmlAcessoPortal({ ...ana, email: '' }), /Sem e-mail na ficha — preencha no card Contato\.[\s\S]*data-geral="acesso" disabled/);
  assert.match(htmlAcessoPortal({ ...ana, acessoEnviadoEm: Date.UTC(2026, 9, 1, 15) }), /Link enviado em 01\/10\/2026[\s\S]*>Gerar novo link</);
});

/* ---------- a aba ---------- */

test('aba Geral: Financeiro primeiro (largo), depois Perfil, Contato e Acesso; os cards em edição abrem o formulário', () => {
  const h = htmlAbaGeral(ana, ana, { todos: [ana], hojeIso: HOJE, editando: new Set(['contato']), faturasAbertas: false });
  const ordem = ['card-financeiro', 'card-perfil', 'card-contato', 'card-acesso'].map((id) => h.indexOf(`id="${id}"`));
  assert.ok(ordem.every((p) => p >= 0));
  assert.deepEqual([...ordem].sort((x, y) => x - y), ordem);
  assert.match(h, /form-geral-contato/);
  assert.doesNotMatch(h, /form-geral-plano|form-geral-acesso/);
  assert.deepEqual([...CARDS_EDITAVEIS], ['contato', 'financeiro', 'acesso']);
});

test('os grupos de campos cobrem o cadastro inteiro, sem repetir', () => {
  const todos = [...CAMPOS.contato, ...CAMPOS.plano, ...CAMPOS.acesso, ...CAMPOS.treino];
  assert.equal(new Set(todos).size, todos.length, 'nenhum campo em dois grupos');
  // Todo campo do cadastro continua montado num lugar só (os cards e o cadastro curto compõem).
  const modal = Object.values(camposDados({}, { idEditavel: true, todos: [] })).join('');
  for (const n of ['id', 'nome', 'telefone', 'email', 'endereco', 'status', 'appLiberado', 'modoLite', 'nascimento', 'sexo', 'altura', 'peso',
    'objetivo', 'nivel', 'freqVezes', 'diasTreino', 'obs', 'mensalidade', 'vencimento', 'parceriaPct', 'pagoPorId']) {
    assert.match(modal, new RegExp(`name="${n}"`), n);
  }
});
