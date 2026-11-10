// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/recebimentos-historico.test.js
 *
 * A migração dos meses pagos antes da etapa 3: de onde sai cada registro, e
 * o que ela nunca faz (sobrescrever, inventar dado, pegar a linha errada).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recebimentosDoHistorico } from './recebimentos-historico.js?v=31';

const NB = ' ';
// 10/11/2026 às 11:07 no box (14:07 UTC); 09/11 às 20:01 no box (23:01 UTC).
const EM_1007 = Date.UTC(2026, 10, 10, 14, 7);
const EM_0911 = Date.UTC(2026, 10, 9, 23, 1);
const pagou = (alunoId, mes, rotulo, valor, em, extra = {}) => ({ tipo: 'pagamento', alunoId, em, resumo: `Pagamento registrado · ${rotulo} · R$${NB}${valor}`, ...extra });

test('Pix do Portal: valor pago, o dia da aprovação no box, o paymentId e o Mercado Pago como quem conferiu', () => {
  const ficha = { id: 'A', pagamentos: { '2026-11': true }, pixPagos: { '2026-11': '188381857228' } };
  const cobrancas = { '188381857228': { status: 'aprovado', valor: 1.5, valorPago: 1.5, aprovadoEm: Date.UTC(2026, 10, 7, 20, 3, 59) } };
  assert.deepEqual(recebimentosDoHistorico(ficha, { eventos: [], cobrancas }), [{
    mes: '2026-11', fonte: 'pix',
    rec: { valor: 1.5, data: '2026-11-07', meio: 'pix-portal', comprovante: null, conferidoPor: 'mercado-pago', paymentId: '188381857228', registradoEm: Date.UTC(2026, 10, 7, 20, 3, 59), origem: 'historico' },
  }]);
});

test('Registro de pagamento: o valor do texto e o dia da BAIXA no box, meio não informado, conferido pelo coach', () => {
  const ficha = { id: 'B', pagamentos: { '2026-11': true } };
  const eventos = [pagou('B', '2026-11', 'Novembro / 2026', '1.161,50', EM_1007)];
  assert.deepEqual(recebimentosDoHistorico(ficha, { eventos, cobrancas: {} }), [{
    mes: '2026-11', fonte: 'registro',
    rec: { valor: 1161.5, data: '2026-11-10', meio: 'nao-informado', comprovante: null, conferidoPor: 'coach', paymentId: null, registradoEm: EM_1007, origem: 'historico' },
  }]);
});

test('Registro: o campo dados.valor/mesId vale mais que o texto; a hora perto da meia-noite cai no dia do box', () => {
  const ficha = { id: 'B', pagamentos: { '2026-11': true } };
  const eventos = [{ tipo: 'pagamento', alunoId: 'B', em: EM_0911, resumo: 'Pagamento registrado', dados: { mesId: '2026-11', valor: 130 } }];
  const [p] = recebimentosDoHistorico(ficha, { eventos, cobrancas: {} });
  assert.equal(p.rec.valor, 130);
  assert.equal(p.rec.data, '2026-11-09', '20:01 de 09/11 no box (23:01 UTC)');
});

test('Registro: pega a baixa MAIS RECENTE do mês; desfeita depois, não pega nada', () => {
  const ficha = { id: 'C', pagamentos: { '2026-10': true, '2026-11': true } };
  const eventos = [
    pagou('C', '2026-10', 'Outubro / 2026', '130,00', 1000),
    { tipo: 'pagamento-desfeito', alunoId: 'C', em: 2000, resumo: 'Pagamento desfeito · Outubro / 2026', dados: { mesId: '2026-10' } },
    pagou('C', '2026-10', 'Outubro / 2026', '150,00', 3000),
    pagou('C', '2026-11', 'Novembro / 2026', '130,00', 4000),
    { tipo: 'pagamento-desfeito', alunoId: 'C', em: 5000, resumo: 'Pagamento desfeito · Novembro / 2026', dados: { mesId: '2026-11' } },
  ];
  const r = recebimentosDoHistorico(ficha, { eventos, cobrancas: {} });
  assert.deepEqual(r.map((p) => [p.mes, p.rec.valor]), [['2026-10', 150]], 'novembro foi desfeito por último: sem registro');
});

test('nunca sobrescreve, nem inventa: mês com registro, mês sem fonte, mês não pago e linha de outro aluno ficam de fora', () => {
  const rec = { valor: 99, data: '2026-10-05', meio: 'dinheiro', comprovante: null, conferidoPor: 'coach', paymentId: null, registradoEm: 1, origem: 'gestao' };
  const ficha = { id: 'D', pagamentos: { '2026-08': true, '2026-10': true, '2026-11': false }, recebimentos: { '2026-10': rec } };
  const eventos = [
    pagou('D', '2026-10', 'Outubro / 2026', '130,00', 1000),
    pagou('D', '2026-11', 'Novembro / 2026', '130,00', 2000),
    pagou('OUTRO', '2026-08', 'Agosto / 2026', '130,00', 3000),
    { tipo: 'mensagem-enviada', alunoId: 'D', em: 4000, resumo: 'WhatsApp · Recibo · Agosto / 2026 · R$ 130,00' },
  ];
  assert.deepEqual(recebimentosDoHistorico(ficha, { eventos, cobrancas: {} }), []);
});

test('Pix que não está aprovado no livro (ou sumiu dele) cai para o Registro, se houver', () => {
  const ficha = { id: 'E', pagamentos: { '2026-11': true }, pixPagos: { '2026-11': 'p9' } };
  const eventos = [{ tipo: 'pagamento', alunoId: 'E', em: EM_1007, resumo: `Pagamento via Pix (Mercado Pago) · Novembro / 2026 · R$${NB}130,00 · a conta agora é R$${NB}131,50` }];
  const [p] = recebimentosDoHistorico(ficha, { eventos, cobrancas: { p9: { status: 'estornado', valor: 130 } } });
  assert.equal(p.fonte, 'registro');
  assert.equal(p.rec.valor, 130, 'o primeiro valor do texto é o que entrou');
});
