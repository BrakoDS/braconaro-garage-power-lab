// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/fechamento-regras.test.js
 *
 * O fechamento do mês (etapa 4): quem entra no retrato, o que cada linha
 * guarda, os totais, as divergências, aprovar e reabrir, e o mês fechado que
 * não muda quando a ficha muda. "Hoje" é 10/11/2026; o mês fechado é outubro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FECHAMENTO_DESDE, podeFechar, estaFechado, entraNoRetrato, retratoDoMes, aprovarFechamento, reabrirFechamento,
  faturaFechada, faturaComFechamento, historicoComFechamentos, pagamentosParaLancar, totalDoMesFechado,
} from './fechamento-regras.js?v=37';
import { mesIdParaLancar } from '../../compartilhado/regras/consumo.js';

const OUT = '2026-10', NOV = '2026-11';
const HOJE = '2026-11-10';
const AGORA = Date.UTC(2026, 10, 10, 15, 0);
const NB = (/** @type {string} */ s) => s.replace(/ /g, ' ');
const rec = (valor, extra = {}) => ({ valor, data: '2026-10-09', meio: 'pix-chave', comprovante: null, conferidoPor: 'coach', paymentId: null, registradoEm: 1, origem: 'gestao', ...extra });

/** O box de outubro, novo a cada teste. */
function box() {
  return {
    ana: { id: 'Ana', nome: 'Ana', mensalidade: '130', vencimento: '10', pagamentos: { [OUT]: true }, recebimentos: { [OUT]: rec(258) } },
    bia: { id: 'Bia', nome: 'Bia', mensalidade: '120', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' },
      consumos: [{ id: 'b1', nome: 'Barra', preco: 8, data: '2026-10-03', mesId: OUT }] },
    caio: { id: 'Caio', nome: 'Caio', mensalidade: '150', vencimento: '5' },
    duda: { id: 'Duda', nome: 'Duda', mensalidade: '150', vencimento: '10', parceria: { nome: 'Atleta', percentual: 100 },
      consumos: [{ id: 'd1', nome: 'Energético', preco: 5, data: '2026-10-02', mesId: OUT }] },
    eva: { id: 'Eva', nome: 'Eva', mensalidade: '150', vencimento: '10', parceria: { nome: 'Atleta', percentual: 100 } },
    fabio: { id: 'Fabio', nome: 'Fabio', status: 'inativo', mensalidade: '130', vencimento: '10', pagamentos: { [OUT]: true }, recebimentos: { [OUT]: rec(130) } },
    gil: { id: 'Gil', nome: 'Gil', status: 'inativo', mensalidade: '130', vencimento: '10' },
    hugo: { id: 'Hugo', nome: 'Hugo', mensalidade: '130', vencimento: '10', pagamentos: { [OUT]: true }, recebimentos: { [OUT]: rec(120, { meio: 'dinheiro' }) } },
    iris: { id: 'Iris', nome: 'Iris', mensalidade: '115', vencimento: '15', pagamentos: { [OUT]: true } },
  };
}
const todos = (b) => Object.values(b);

test('quando fechar: de outubro de 2026 em diante, e só mês que já acabou', () => {
  assert.equal(FECHAMENTO_DESDE, '2026-10');
  assert.equal(podeFechar('2026-09', HOJE), false, 'julho a setembro ficam de fora');
  assert.equal(podeFechar(OUT, HOJE), true);
  assert.equal(podeFechar(NOV, HOJE), false, 'o mês corrente ainda não acabou');
  assert.equal(podeFechar(NOV, '2026-12-01'), true);
});

test('quem entra: o ativo com conta; quem saiu só se teve movimento no mês', () => {
  const b = box();
  assert.equal(entraNoRetrato(b.fabio, OUT), true, 'saiu, mas pagou outubro');
  assert.equal(entraNoRetrato(b.gil, OUT), false, 'saiu sem movimento');
  const r = retratoDoMes(todos(b), OUT, HOJE);
  assert.deepEqual(Object.keys(r.linhas).sort(), ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabio', 'Hugo', 'Iris']);
});

test('a linha guarda os itens da fatura, o total, o vencimento, a situação ao fechar e o registro do pagamento', () => {
  const r = retratoDoMes(todos(box()), OUT, HOJE);
  const ana = r.linhas.Ana;
  assert.equal(ana.total, 258, '130 da Ana + a conta da Bia (120 + 8 de barra)');
  assert.equal(ana.situacao, 'pago');
  assert.equal(ana.vencimento, '2026-10-10');
  assert.deepEqual(ana.dependentes, [{ alunoId: 'Bia', nome: 'Bia', total: 128 }]);
  assert.deepEqual(ana.itens.map((i) => [i.tipo, i.valor]), [['mensalidade', 130], ['dependente', 128]]);
  assert.equal(ana.recebimento?.valor, 258);
  const bia = r.linhas.Bia;
  assert.equal(bia.situacao, 'coberto');
  assert.deepEqual(bia.responsavel, { alunoId: 'Ana', nome: 'Ana' });
  assert.equal(bia.total, 0, 'o dinheiro dela está na linha da Ana, nunca duas vezes');
  assert.equal(bia.consumo, 8, 'mas o consumo é dela');
  const duda = r.linhas.Duda;
  assert.equal(duda.total, 5, 'cortesia paga o consumo (decisão 7)');
  assert.equal(duda.desconto, 150);
  assert.equal(duda.situacao, 'vencido');
  assert.equal(r.linhas.Eva.situacao, 'cortesia');
  assert.equal(r.linhas.Caio.situacao, 'vencido');
  assert.equal(r.linhas.Caio.recebimento, null);
});

test('os totais: previsto, recebido, em aberto, consumo e o que o box bancou', () => {
  const { totais } = retratoDoMes(todos(box()), OUT, HOJE);
  // previsto = Ana 258 + Caio 150 + Duda 5 + Fabio 130 + Hugo 130 + Iris 115 = 788
  assert.deepEqual(totais, { previsto: 788, recebido: 633, emAberto: 155, consumo: 13, bancadoPeloBox: 300 });
});

test('as divergências: em aberto primeiro, depois valor diferente, depois pago sem registro', () => {
  const { divergencias } = retratoDoMes(todos(box()), OUT, HOJE);
  assert.deepEqual(divergencias, [
    { tipo: 'em-aberto', alunoId: 'Caio', nome: 'Caio', total: 150 },
    { tipo: 'em-aberto', alunoId: 'Duda', nome: 'Duda', total: 5 },
    { tipo: 'valor-diferente', alunoId: 'Hugo', nome: 'Hugo', total: 130, valor: 120 },
    { tipo: 'sem-registro', alunoId: 'Iris', nome: 'Iris', total: 115 },
  ]);
});

test('aprovar: o documento e a linha dos Registros com os totais', () => {
  const r = retratoDoMes(todos(box()), OUT, HOJE);
  const { doc, log } = aprovarFechamento(r, null, AGORA);
  assert.equal(doc.situacao, 'aprovado');
  assert.equal(doc.aprovadoEm, AGORA);
  assert.equal(doc.aprovadoPor, 'coach');
  assert.deepEqual(doc.versoes, []);
  assert.equal(estaFechado(doc), true);
  assert.equal(log.tipo, 'fechamento');
  assert.equal(NB(log.resumo), 'Fechamento de Outubro / 2026 aprovado · previsto R$ 788,00 · recebido R$ 633,00 · em aberto R$ 155,00');
});

test('reabrir: pede motivo, guarda a versão anterior e deixa o mês aberto; aprovar de novo mantém as versões', () => {
  const r = retratoDoMes(todos(box()), OUT, HOJE);
  const { doc } = aprovarFechamento(r, null, AGORA);
  assert.equal(reabrirFechamento(doc, '   ', AGORA + 1), null, 'sem motivo, não reabre');
  const re = reabrirFechamento(doc, 'consumo lançado no mês errado', AGORA + 1);
  assert.ok(re);
  assert.equal(re.doc.situacao, 'reaberto');
  assert.equal(estaFechado(re.doc), false);
  assert.equal(re.doc.versoes.length, 1);
  assert.deepEqual({ ...re.doc.versoes[0], linhas: undefined }, { aprovadoEm: AGORA, reabertoEm: AGORA + 1, motivo: 'consumo lançado no mês errado', totais: doc.totais, linhas: undefined });
  assert.equal(NB(re.log.resumo), 'Fechamento de Outubro / 2026 reaberto · consumo lançado no mês errado');
  assert.equal(reabrirFechamento(re.doc, 'de novo', AGORA + 2), null, 'mês já reaberto não reabre de novo');
  const de_novo = aprovarFechamento(retratoDoMes(todos(box()), OUT, HOJE), re.doc, AGORA + 3);
  assert.equal(de_novo.doc.versoes.length, 1, 'a versão guardada segue junto');
});

test('mês fechado não muda: mudar a mensalidade depois não mexe na fatura fechada', () => {
  const b = box();
  const { doc } = aprovarFechamento(retratoDoMes(todos(b), OUT, HOJE), null, AGORA);
  const caioReajustado = { ...b.caio, mensalidade: '170' };
  const f = faturaFechada(doc, caioReajustado);
  assert.ok(f);
  assert.equal(f.total, 150, 'o valor de outubro é o do retrato');
  assert.equal(f.status, 'vencido');
  assert.equal(f.fechadoEm, AGORA);
  assert.equal(f.pagoDepois, false);
  const fechamentos = { [OUT]: doc };
  assert.equal(faturaComFechamento(caioReajustado, OUT, todos(b), HOJE, fechamentos)?.total, 150);
  assert.equal(faturaComFechamento(caioReajustado, NOV, todos(b), HOJE, fechamentos)?.total, 170, 'novembro, aberto, segue a ficha');
});

test('pagamento depois do fechamento: a fatura fechada mostra pago, com "pago depois"; desfeito depois, volta a vencido', () => {
  const b = box();
  const { doc } = aprovarFechamento(retratoDoMes(todos(b), OUT, HOJE), null, AGORA);
  const pagou = faturaFechada(doc, { ...b.caio, pagamentos: { [OUT]: true }, recebimentos: { [OUT]: rec(150, { data: '2026-11-12' }) } });
  assert.equal(pagou?.status, 'pago');
  assert.equal(pagou?.pagoDepois, true);
  assert.equal(pagou?.recebimento?.data, '2026-11-12');
  const desfez = faturaFechada(doc, { ...b.ana, pagamentos: {} });
  assert.equal(desfez?.status, 'vencido');
  assert.equal(faturaFechada(doc, b.gil), null, 'fora do retrato: nada');
  assert.equal(faturaFechada({ ...doc, situacao: 'reaberto' }, b.caio), null, 'reaberto: volta a ser calculado');
});

test('o histórico do card usa o retrato no mês fechado', () => {
  const b = box();
  const { doc } = aprovarFechamento(retratoDoMes(todos(b), OUT, HOJE), null, AGORA);
  const caio = { ...b.caio, mensalidade: '170', consumos: [{ id: 'c1', nome: 'Água', preco: 4, data: '2026-10-01', mesId: OUT }] };
  const h = historicoComFechamentos(caio, todos(b), HOJE, { [OUT]: doc });
  const out = h.faturas.find((f) => f.mesId === OUT);
  assert.equal(out?.total, 150, 'nem a mensalidade nova nem o consumo lançado depois entram em outubro');
  assert.equal(h.faturas.find((f) => f.mesId === NOV)?.total, 170, 'novembro, aberto, já com a mensalidade nova');
  assert.equal(h.atrasado, 320, 'outubro pelo retrato (150) + novembro pela ficha (170, venceu dia 5)');
});

test('consumo com data em mês fechado vai para a próxima fatura aberta', () => {
  const b = box();
  const { doc } = aprovarFechamento(retratoDoMes(todos(b), OUT, HOJE), null, AGORA);
  const mapa = pagamentosParaLancar(b.caio, { [OUT]: doc });
  assert.equal(mesIdParaLancar('2026-10-03', '5', b.caio.pagamentos || {}), OUT, 'sem o fechamento, cairia em outubro');
  assert.equal(mesIdParaLancar('2026-10-03', '5', mapa), NOV);
  assert.deepEqual(pagamentosParaLancar(b.caio, { [OUT]: { ...doc, situacao: 'reaberto' } }), {}, 'reaberto não pula');
});

test('o Pix de um mês fechado cobra o total do retrato; fora dele, nada muda', () => {
  const b = box();
  const { doc } = aprovarFechamento(retratoDoMes(todos(b), OUT, HOJE), null, AGORA);
  assert.equal(totalDoMesFechado(doc, 'Caio'), 150);
  assert.equal(totalDoMesFechado(doc, 'Eva'), null, 'cortesia sem conta não é pagável');
  assert.equal(totalDoMesFechado(doc, 'Gil'), null);
  assert.equal(totalDoMesFechado({ ...doc, situacao: 'reaberto' }, 'Caio'), null);
});

test('puro: nada do que recebe é alterado', () => {
  /** @param {any} o */
  const congelar = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
  const b = congelar(box());
  const copia = JSON.stringify(b);
  const r = retratoDoMes(todos(b), OUT, HOJE);
  const { doc } = aprovarFechamento(congelar(r), null, AGORA);
  reabrirFechamento(congelar(doc), 'x', AGORA);
  faturaFechada(doc, b.caio); historicoComFechamentos(b.caio, todos(b), HOJE, { [OUT]: doc }); pagamentosParaLancar(b.caio, { [OUT]: doc });
  assert.equal(JSON.stringify(b), copia);
});
