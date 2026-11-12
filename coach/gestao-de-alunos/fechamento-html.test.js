// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/fechamento-html.test.js
 *
 * O desenho do fechamento na tela Financeiro (etapa 4): a barra, o retrato e a
 * linha do mês fechado. "Hoje" é 10/11/2026; o mês fechado é outubro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlBarraFechamento, htmlRetrato, linhaFechadaHTML, htmlTotaisFechados } from './fechamento-html.js?v=38';
import { retratoDoMes, aprovarFechamento, reabrirFechamento } from './fechamento-regras.js?v=38';

const OUT = '2026-10', HOJE = '2026-11-10';
const AGORA = new Date(2026, 10, 10, 12, 0).getTime(); // 10/11 no relógio local
const txt = (/** @type {string} */ h) => h.replace(/ /g, ' ').replace(/\s+/g, ' ');
const rec = (valor) => ({ valor, data: '2026-10-09', meio: 'pix-chave', comprovante: null, conferidoPor: 'coach', paymentId: null, registradoEm: 1, origem: 'gestao' });
const box = () => ({
  ana: { id: 'Ana', nome: 'Ana', mensalidade: '130', vencimento: '10', pagamentos: { [OUT]: true }, recebimentos: { [OUT]: rec(130) } },
  caio: { id: 'Caio', nome: '<i>Caio</i>', mensalidade: '150', vencimento: '5' },
  bia: { id: 'Bia', nome: 'Bia', mensalidade: '120', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'plano' } },
});
const todos = (b) => Object.values(b);
const fechado = () => aprovarFechamento(retratoDoMes(todos(box()), OUT, HOJE), null, AGORA).doc;

test('barra: mês que acabou e não foi fechado oferece "Fechar o mês"; mês corrente e antes de outubro, nada', () => {
  assert.match(txt(htmlBarraFechamento(null, OUT, HOJE)), /Este mês já acabou e ainda não foi fechado\..*data-fech="fechar".*Fechar o mês/);
  assert.equal(htmlBarraFechamento(null, '2026-11', HOJE), '');
  assert.equal(htmlBarraFechamento(null, '2026-09', HOJE), '');
});

test('barra: mês fechado diz quando, quantos e o em aberto, com "Ver o retrato" e "Reabrir"', () => {
  const h = txt(htmlBarraFechamento(fechado(), OUT, HOJE));
  assert.match(h, /🔒 <b>Mês fechado<\/b> em 10\/11 · 3 alunos no retrato · em aberto ao fechar R\$ 150,00/);
  assert.match(h, /data-fech="ver"/);
  assert.match(h, /data-fech="reabrir"/);
});

test('barra: mês reaberto mostra o motivo e oferece fechar de novo', () => {
  const re = reabrirFechamento(fechado(), 'consumo <errado>', AGORA);
  assert.ok(re);
  const h = txt(htmlBarraFechamento(re.doc, OUT, HOJE));
  assert.match(h, /Reaberto em 10\/11 · consumo &lt;errado&gt;\./);
  assert.match(h, /data-fech="fechar"/);
});

test('retrato: os totais, o que conferir e a lista em ordem de nome, com o nome escapado', () => {
  const h = txt(htmlRetrato(retratoDoMes(todos(box()), OUT, HOJE)));
  assert.match(h, /Outubro \/ 2026 · 3 alunos/);
  assert.match(h, /<span>Previsto<\/span><b>R\$ 400,00<\/b>/, 'Ana 130 + a mensalidade da Bia 120 + Caio 150');
  assert.match(h, /<span>Em aberto<\/span><b>R\$ 150,00<\/b>/);
  assert.match(h, /&lt;i&gt;Caio&lt;\/i&gt; — em aberto, R\$ 150,00/);
  const nomes = [...h.matchAll(/<span class="ret-nome">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['&lt;i&gt;Caio&lt;/i&gt;', 'Ana', 'Bia']);
  assert.match(h, /Bia<\/span><span class="ret-sit ret-sit-coberto">na conta de Ana<\/span><span class="ret-v">—<\/span>/);
});

test('retrato sem nada a conferir diz isso', () => {
  const b = box();
  const so = { ana: b.ana };
  assert.match(txt(htmlRetrato(retratoDoMes(todos(so), OUT, HOJE))), /Nada a conferir/);
});

test('linha fechada: os números do retrato e o pagamento de agora ("Pago depois"), com o botão certo', () => {
  const doc = fechado();
  const b = box();
  const aberto = txt(linhaFechadaHTML('Caio', doc.linhas.Caio, { ...b.caio, mensalidade: '999' }, doc));
  assert.match(aberto, /vence 05\/10 · R\$ 150,00/, 'o valor do retrato, não a mensalidade nova');
  assert.match(aberto, /fin-badge vencido">Em aberto</);
  assert.match(aberto, /fin-toggle" data-id="Caio" data-op="1"/);
  const pagou = txt(linhaFechadaHTML('Caio', doc.linhas.Caio, { ...b.caio, pagamentos: { [OUT]: true }, recebimentos: { [OUT]: rec(150) } }, doc));
  assert.match(pagou, /fin-badge pago">Pago depois</);
  assert.match(pagou, /Pago em 09\/10 · Pix por chave · R\$ 150,00/);
  assert.match(pagou, /data-op="0"/);
  const coberta = txt(linhaFechadaHTML('Bia', doc.linhas.Bia, b.bia, doc));
  assert.match(coberta, /conta de Ana/);
  assert.ok(!coberta.includes('fin-toggle'), 'quem está na conta de outro não tem baixa própria');
  assert.ok(!txt(linhaFechadaHTML('Caio', doc.linhas.Caio, null, doc)).includes('fin-toggle'), 'aluno apagado: só o retrato');
});

test('totais de mês fechado dizem "ao fechar"', () => {
  const h = txt(htmlTotaisFechados(fechado().totais));
  assert.match(h, /Recebido ao fechar.*R\$ 250,00/);
  assert.match(h, /Em aberto ao fechar.*R\$ 150,00/);
});
