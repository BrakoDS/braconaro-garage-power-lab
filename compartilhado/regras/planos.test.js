// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TABELAS, chaveDoPlano, rotuloDoPlano, precoDaTabela, vezesDoPlano, semanasDesde, semanasDoMes,
  bonusDoMes, mensalidadeDoMes, pausaNoDia1, pausaAtual, foraDoTreino, estaPausado, explicacaoDoValor,
  ultimoDiaDoMes, mesAnterior, somarDiasIso,
} from './planos.js';

const fundador3x = { id: 'A', plano: { vezes: 3, prazo: 'mensal' }, fundador: true, mensalidade: '130', freqVezes: '3' };

/* ---------- a tabela ---------- */

test('as tabelas do PDF', () => {
  assert.deepEqual(TABELAS.fundador, { '2x-mensal': 150, '3x-mensal': 190, '3x-trimestral': 180, '3x-semestral': 170, '4x-mensal': 220, '4x-semestral': 195, 'ilimitado-mensal': 250 });
  assert.deepEqual(TABELAS.regular, { '3x-mensal': 260, '3x-trimestral': 240, '3x-semestral': 220, '4x-mensal': 310, '4x-trimestral': 290, '4x-semestral': 270, 'ilimitado-mensal': 350 });
});

test('chave e rótulo do plano', () => {
  assert.equal(chaveDoPlano({ vezes: 3 }), '3x-mensal');
  assert.equal(chaveDoPlano({ vezes: '4', prazo: 'semestral' }), '4x-semestral');
  assert.equal(chaveDoPlano({ vezes: 'ilimitado' }), 'ilimitado-mensal');
  assert.equal(chaveDoPlano({ vezes: 5 }), '');
  assert.equal(chaveDoPlano(null), '');
  assert.equal(rotuloDoPlano({ vezes: 2 }), '2x por semana');
  assert.equal(rotuloDoPlano({ vezes: 'ilimitado' }), 'Ilimitado');
  assert.equal(rotuloDoPlano({ vezes: 3, prazo: 'trimestral' }), '3x por semana · trimestral');
});

test('o preço da tabela só existe de jan/2027 em diante', () => {
  assert.equal(precoDaTabela(fundador3x, '2026-12'), null);
  assert.equal(precoDaTabela(fundador3x, '2027-01'), 190);
  assert.equal(precoDaTabela({ ...fundador3x, fundador: false }, '2027-01'), 260);
  assert.equal(precoDaTabela({ plano: { vezes: 2 }, fundador: true }, '2027-01'), 150, '2x Legado');
  assert.equal(precoDaTabela({ plano: { vezes: 2 } }, '2027-01'), null, 'o 2x não existe na regular');
  assert.equal(precoDaTabela({ plano: { vezes: 4, prazo: 'trimestral' }, fundador: true }, '2027-01'), 220, 'fora de contrato vale sempre o mensal (6.2)');
  assert.equal(precoDaTabela({ mensalidade: '150' }, '2027-01'), null, 'sem plano, sem tabela');
});

test('vezes do plano: o Ilimitado conta 5; sem plano, a frequência da ficha', () => {
  assert.equal(vezesDoPlano({ plano: { vezes: 'ilimitado' } }), 5);
  assert.equal(vezesDoPlano({ plano: { vezes: 3 } }), 3);
  assert.equal(vezesDoPlano({ freqVezes: '2' }), 2);
});

/* ---------- datas ---------- */

test('datas do mês', () => {
  assert.equal(ultimoDiaDoMes('2027-02'), '2027-02-28');
  assert.equal(ultimoDiaDoMes('2028-02'), '2028-02-29');
  assert.equal(ultimoDiaDoMes('2026-12'), '2026-12-31');
  assert.equal(mesAnterior('2027-01'), '2026-12');
  assert.equal(somarDiasIso('2026-12-31', 1), '2027-01-01');
});

/* ---------- as semanas (os exemplos do plano, jan/2027: segundas 4, 11, 18, 25) ---------- */

test('volta numa segunda: as segundas que faltam', () => {
  assert.deepEqual(semanasDesde('2027-01', '2027-01-11', 3), { semanas: 3, quebrada: false, segundas: 3 });
});

test('volta numa terça e treinou as 3 vezes até domingo: a semana quebrada conta', () => {
  const r = semanasDesde('2027-01', '2027-01-19', 3, ['2027-01-19', '2027-01-21', '2027-01-23']);
  assert.deepEqual(r, { semanas: 2, quebrada: true, segundas: 1 });
});

test('volta numa terça e treinou 1 vez: a conta começa na semana seguinte', () => {
  assert.deepEqual(semanasDesde('2027-01', '2027-01-19', 3, ['2027-01-19']), { semanas: 1, quebrada: false, segundas: 1 });
});

test('presença antes da volta ou depois do domingo não conta na semana quebrada', () => {
  assert.equal(semanasDesde('2027-01', '2027-01-19', 2, ['2027-01-18', '2027-01-25']).quebrada, false);
  assert.equal(semanasDesde('2027-01', '2027-01-19', 2, ['2027-01-19', '2027-01-19']).quebrada, false, 'o mesmo dia conta uma vez');
});

test('mês de 5 semanas: no máximo 4', () => {
  // Março/2027: segundas 1, 8, 15, 22, 29.
  assert.equal(semanasDesde('2027-03', '2027-03-01', 3).semanas, 4);
  // Voltou na 2ª semana de um mês de 5: ainda paga as 4.
  assert.equal(semanasDesde('2027-03', '2027-03-08', 3).semanas, 4);
  assert.equal(semanasDesde('2027-03', '2027-03-15', 3).semanas, 3);
});

test('a semana quebrada cuja segunda é do mês anterior não é deste mês', () => {
  // 01/01/2027 é sexta: a semana é a de 28/12, que é de dezembro.
  const r = semanasDesde('2027-01', '2027-01-01', 3, ['2027-01-01', '2027-01-02', '2027-01-03']);
  assert.deepEqual(r, { semanas: 4, quebrada: false, segundas: 4 });
});

/* ---------- pausa ---------- */

test('a pausa que cobre o dia 1', () => {
  const a = { pausas: [{ desde: '2027-01-20', ate: '2027-03-15' }] };
  assert.equal(pausaNoDia1(a, '2027-01'), null, 'janeiro começou ativo');
  assert.ok(pausaNoDia1(a, '2027-02'));
  assert.ok(pausaNoDia1(a, '2027-03'));
  assert.equal(pausaNoDia1(a, '2027-04'), null);
  assert.equal(pausaNoDia1({ pausas: [{ desde: '2027-02-01' }] }, '2027-02') !== null, true, 'pausa no dia 1 já cobre o mês');
  assert.equal(pausaNoDia1({ pausas: [{ desde: '2027-01-10', ate: '2027-02-01' }] }, '2027-02'), null, 'voltou no dia 1');
});

test('pausa atual, pausado e fora do treino', () => {
  assert.ok(pausaAtual({ pausas: [{ desde: '2026-10-01', ate: '2026-10-20' }, { desde: '2026-12-01' }] }));
  assert.equal(pausaAtual({ pausas: [{ desde: '2026-10-01', ate: '2026-10-20' }] }), null);
  assert.equal(estaPausado({ status: 'pausado' }), true);
  assert.equal(foraDoTreino({ status: 'pausado' }), true);
  assert.equal(foraDoTreino({ status: 'inativo' }), true);
  assert.equal(foraDoTreino({ status: 'pendente' }), false);
  assert.equal(foraDoTreino({}), false);
});

test('semanas do mês: pausa o mês inteiro, volta no meio, mês em que pausou', () => {
  const a = { ...fundador3x, pausas: [{ desde: '2027-01-20', ate: '2027-03-15' }] };
  assert.equal(semanasDoMes(a, '2027-01').semanas, 4, 'o mês em que pausa é cobrado inteiro');
  assert.deepEqual(semanasDoMes(a, '2027-02'), { semanas: 0, desde: '', porque: '', quebrada: false, ajuste: false, zero: 'pausado' });
  const mar = semanasDoMes(a, '2027-03');
  assert.equal(mar.porque, 'volta');
  assert.equal(mar.semanas, 3, 'segunda 15/03: 15, 22 e 29');
  assert.equal(semanasDoMes({ ...fundador3x, status: 'pausado', pausas: [{ desde: '2027-01-20' }] }, '2027-05').zero, 'pausado', 'sem volta: pausado');
});

test('semanas do mês: início no meio, antes do início, e o corte de dezembro/2026', () => {
  const novo = { plano: { vezes: 3 }, fundador: true, inicio: '2026-12-15' };
  assert.equal(semanasDoMes(novo, '2026-11').zero, '', 'antes do corte, nada muda');
  assert.equal(semanasDoMes(novo, '2026-11').semanas, 4);
  // Dezembro/2026: segundas 7, 14, 21, 28. Começou na terça 15: 21 e 28.
  assert.equal(semanasDoMes(novo, '2026-12').semanas, 2);
  assert.equal(semanasDoMes(novo, '2026-12').porque, 'inicio');
  assert.equal(semanasDoMes({ ...novo, inicio: '2027-02-01' }, '2027-01').zero, 'antes-do-inicio');
  assert.equal(semanasDoMes({ ...novo, inicio: '2026-12-01' }, '2026-12').semanas, 4, 'começou no dia 1');
});

test('o ajuste do coach manda nas semanas', () => {
  const a = { ...fundador3x, inicio: '2027-01-19', semanasAjuste: { '2027-01': 2 } };
  const s = semanasDoMes(a, '2027-01');
  assert.equal(s.semanas, 2);
  assert.equal(s.ajuste, true);
  assert.equal(semanasDoMes({ ...a, semanasAjuste: { '2027-01': 9 } }, '2027-01').ajuste, false, 'ajuste fora de 0–4 não vale');
  assert.equal(semanasDoMes({ ...a, semanasAjuste: { '2027-01': '' } }, '2027-01').ajuste, false);
});

/* ---------- bônus ---------- */

test('os bônus só valem de jan/2027 em diante', () => {
  const a = { dupla: { id: 'B', nome: 'Bia' } };
  assert.deepEqual(bonusDoMes(a, '2026-12'), []);
  assert.deepEqual(bonusDoMes(a, '2027-01'), [{ tipo: 'dupla', rotulo: 'Dupla com Bia', pct: 10 }]);
});

test('Instagram vale no mês seguinte; parceria 10% na 1ª e 5% depois; indicação', () => {
  const a = {
    instagram: ['2027-01'], parceriaLocal: { nome: 'Clínica', desde: '2027-02' },
    indicadoPor: { id: 'X', nome: 'Xavier', mes: '2027-02' }, indicacoes: [{ mes: '2027-03', id: 'Y', nome: 'Yara' }],
  };
  assert.deepEqual(bonusDoMes(a, '2027-01').map((b) => b.tipo), []);
  assert.deepEqual(bonusDoMes(a, '2027-02').map((b) => [b.tipo, b.pct]), [['instagram', 5], ['parceria', 10], ['indicado', 30]]);
  assert.deepEqual(bonusDoMes(a, '2027-03').map((b) => [b.tipo, b.pct]), [['parceria', 5], ['indicacao', 30]]);
});

/* ---------- o valor do mês ---------- */

test('até dez/2026 vale o valor da ficha; de jan/2027, a tabela', () => {
  assert.equal(mensalidadeDoMes(fundador3x, '2026-12').valor, 130);
  assert.equal(mensalidadeDoMes(fundador3x, '2026-12').origem, 'ficha');
  const jan = mensalidadeDoMes(fundador3x, '2027-01');
  assert.equal(jan.valor, 190);
  assert.equal(jan.origem, 'tabela');
  assert.equal(jan.tabela, 'fundador');
  assert.equal(mensalidadeDoMes({ ...fundador3x, fundador: false }, '2027-01').valor, 260);
  assert.equal(mensalidadeDoMes({ plano: { vezes: 2 }, fundador: true, mensalidade: '115' }, '2027-01').valor, 150, '2x Legado');
  assert.equal(mensalidadeDoMes({ plano: { vezes: 4 }, fundador: true, mensalidade: '130' }, '2027-01').valor, 220, 'a ficha 4x de 130 vai a 220');
});

test('sem plano, a ficha continua valendo, inclusive em 2027', () => {
  assert.equal(mensalidadeDoMes({ mensalidade: '150' }, '2027-01').valor, 150);
  assert.equal(mensalidadeDoMes({ mensalidade: '150' }, '2027-01').origem, 'ficha');
});

test('os exemplos do plano: 190, casal 171, casal + indicação no teto 133', () => {
  assert.equal(mensalidadeDoMes(fundador3x, '2027-01').valor, 190);
  const casal = { ...fundador3x, dupla: { id: 'B', nome: 'Bia' } };
  assert.equal(mensalidadeDoMes(casal, '2027-01').valor, 171);
  const tudo = { ...fundador3x, dupla: { id: 'B' }, indicadoPor: { id: 'C', nome: 'Caio', mes: '2027-01' } };
  const m = mensalidadeDoMes(tudo, '2027-01');
  assert.equal(m.valor, 133);
  assert.equal(m.pctBonus, 30);
  assert.equal(m.teto, true);
  assert.equal(m.desconto, 57);
  assert.equal(m.investimento, 57, 'o bônus é investimento do box');
});

test('investimento: cortesia é o preço todo; pausa e semanas não contam; bônus proporcional', () => {
  assert.equal(mensalidadeDoMes({ ...fundador3x, cortesia: {} }, '2027-01').investimento, 190);
  assert.equal(mensalidadeDoMes({ ...fundador3x, pausas: [{ desde: '2027-01-01' }] }, '2027-02').investimento, 0);
  const volta = { ...fundador3x, pausas: [{ desde: '2026-12-20', ate: '2027-01-11' }] };
  const m = mensalidadeDoMes(volta, '2027-01');
  assert.deepEqual([m.valor, m.desconto, m.investimento], [142.5, 47.5, 0], 'a volta no meio não é investimento');
  const casal = mensalidadeDoMes({ ...volta, dupla: { id: 'B' } }, '2027-01');
  assert.deepEqual([casal.valor, casal.investimento], [128.25, 14.25], '19 × 3/4');
  assert.equal(mensalidadeDoMes({ mensalidade: '150', parceria: { percentual: 25 } }, '2026-11').investimento, 37.5, 'a parceria antiga continua sendo investimento');
});

test('a regra das semanas no valor (jan/2027, 3x fundador)', () => {
  const volta = (ate, presencas = []) => ({ ...fundador3x, presencas, pausas: [{ desde: '2026-12-20', ate }] });
  assert.equal(mensalidadeDoMes(volta('2027-01-11'), '2027-01').valor, 142.5);
  assert.equal(mensalidadeDoMes(volta('2027-01-19', ['2027-01-19', '2027-01-21', '2027-01-23']), '2027-01').valor, 95);
  assert.equal(mensalidadeDoMes(volta('2027-01-19', ['2027-01-19']), '2027-01').valor, 47.5);
  // Os bônus entram antes das semanas: 171 × 3/4.
  const casal = { ...volta('2027-01-11'), dupla: { id: 'B' } };
  assert.equal(mensalidadeDoMes(casal, '2027-01').valor, 128.25);
});

test('pausado o mês inteiro, cortesia e antes do início: zero', () => {
  const pausado = mensalidadeDoMes({ ...fundador3x, status: 'pausado', pausas: [{ desde: '2027-01-01' }] }, '2027-02');
  assert.equal(pausado.valor, 0);
  assert.equal(pausado.zero, 'pausado');
  assert.equal(pausado.cheia, 190);
  const cortesia = mensalidadeDoMes({ ...fundador3x, cortesia: { motivo: 'Parceria' } }, '2027-01');
  assert.deepEqual([cortesia.valor, cortesia.zero, cortesia.cheia, cortesia.desconto], [0, 'cortesia', 190, 190]);
  assert.deepEqual(cortesia.bonus, [], 'cortesia fica fora dos bônus');
  const antiga = mensalidadeDoMes({ mensalidade: '150', parceria: { nome: 'X', percentual: 100 } }, '2027-01');
  assert.equal(antiga.valor, 0, 'a parceria antiga de 100% continua sendo cortesia');
  assert.equal(antiga.zero, 'cortesia');
  assert.equal(mensalidadeDoMes({ ...fundador3x, inicio: '2027-03-02' }, '2027-02').valor, 0);
});

test('a parceria antiga de 10/25/50% vale só antes de 2027 (ninguém usa hoje)', () => {
  const a = { mensalidade: '150', parceria: { nome: '', percentual: 25 } };
  const dez = mensalidadeDoMes(a, '2026-12');
  assert.deepEqual([dez.valor, dez.desconto], [112.5, 37.5]);
  assert.equal(mensalidadeDoMes(a, '2027-01').valor, 150);
});

test('ficha antiga sem nada novo: o mesmo valor de sempre', () => {
  for (const mes of ['2026-08', '2026-11', '2026-12', '2027-01']) {
    const m = mensalidadeDoMes({ mensalidade: '171' }, mes);
    assert.deepEqual([m.valor, m.desconto, m.semanas, m.zero], [171, 0, 4, ''], mes);
  }
  assert.equal(mensalidadeDoMes({}, '2026-10').valor, 0);
});

test('a explicação do valor', () => {
  assert.deepEqual(explicacaoDoValor(mensalidadeDoMes(fundador3x, '2027-01')), []);
  const tudo = { ...fundador3x, dupla: { id: 'B', nome: 'Bia' }, indicadoPor: { nome: 'Caio', mes: '2027-01' } };
  assert.deepEqual(explicacaoDoValor(mensalidadeDoMes(tudo, '2027-01')), ['Dupla com Bia: 10%', 'Indicado por Caio: 30%', 'Bônus limitados a 30%']);
  const volta = { ...fundador3x, pausas: [{ desde: '2026-12-20', ate: '2027-01-11' }] };
  assert.deepEqual(explicacaoDoValor(mensalidadeDoMes(volta, '2027-01')), ['3 de 4 semanas (volta em 11/01)']);
  assert.deepEqual(explicacaoDoValor(mensalidadeDoMes({ ...fundador3x, cortesia: {} }, '2027-01')), ['Cortesia: mensalidade zero']);
});

/* ---------- Etapa 6.2: o contrato e o Day Pass ---------- */

const { precoDoContrato, contratoNoMes, fimDoContrato, diasTrancados } = await import('./planos.js');
const tri = { id: 'c1', prazo: 'trimestral', vezes: 3, inicio: '2027-01', valorMensal: 180, pctBonus: 0, total: 540 };

test('o preço do contrato: tabela do prazo, bônus do dia (sem Instagram) e teto', () => {
  assert.deepEqual(precoDoContrato(fundador3x, 'trimestral', '2027-01'), { valorMensal: 180, pctBonus: 0, total: 540 });
  assert.deepEqual(precoDoContrato({ ...fundador3x, dupla: { id: 'B' }, instagram: ['2026-12'] }, 'trimestral', '2027-01'), { valorMensal: 180, pctBonus: 10, total: 486 });
  assert.deepEqual(precoDoContrato({ plano: { vezes: 4 }, fundador: false }, 'semestral', '2027-01'), { valorMensal: 270, pctBonus: 0, total: 1620 });
  assert.equal(precoDoContrato({ plano: { vezes: 4 }, fundador: true }, 'trimestral', '2027-01'), null, 'o fundador não tem 4x trimestral');
  assert.equal(precoDoContrato(fundador3x, 'trimestral', '2026-12'), null, 'contrato só a partir de jan/2027');
});

test('o contrato no valor: 1º mês o total, depois coberto, e o mês seguinte volta ao mensal', () => {
  const a = { ...fundador3x, contratos: [tri] };
  const jan = mensalidadeDoMes(a, '2027-01');
  assert.deepEqual([jan.valor, jan.cheia, jan.origem, jan.contrato.papel], [540, 540, 'contrato', 'inicio']);
  const fev = mensalidadeDoMes(a, '2027-02');
  assert.deepEqual([fev.valor, fev.zero, fev.investimento], [0, 'contrato', 0]);
  assert.equal(mensalidadeDoMes(a, '2027-03').zero, 'contrato');
  assert.equal(mensalidadeDoMes(a, '2027-04').valor, 190, 'até você decidir, o mês seguinte é o mensal');
  assert.equal(fimDoContrato(tri), '2027-03');
});

test('o contrato com bônus: o desconto é investimento do box', () => {
  const c = { ...tri, pctBonus: 10, total: 486 };
  const m = mensalidadeDoMes({ ...fundador3x, contratos: [c] }, '2027-01');
  assert.deepEqual([m.valor, m.desconto, m.investimento], [486, 54, 54]);
  assert.deepEqual(m.bonus, [{ tipo: 'contrato', rotulo: 'Bônus do contrato', pct: 10 }]);
});

test('trancamento: estica o contrato e o mês seguinte cobra só as semanas que sobram', () => {
  const a = { ...fundador3x, contratos: [tri], pausas: [{ desde: '2027-02-01', ate: '2027-02-16', contrato: 'c1' }] };
  assert.equal(diasTrancados(a, tri), 15);
  assert.deepEqual(contratoNoMes(a, '2027-04'), { c: tri, papel: 'extensao', voltaEm: '2027-04-16' });
  const abr = mensalidadeDoMes(a, '2027-04');
  // Abril/2027: depois de 16/04 (sexta), as segundas 19 e 26.
  assert.deepEqual([abr.valor, abr.semanas, abr.porque], [95, 2, 'contrato']);
  assert.deepEqual(explicacaoDoValor(abr), ['2 de 4 semanas (o contrato cobriu até 15/04)']);
});

test('trancamento: cada período vale até 15 dias, e o trimestral só tem 1', () => {
  const longo = { ...fundador3x, contratos: [tri], pausas: [{ desde: '2027-02-01', ate: '2027-02-21', contrato: 'c1' }] };
  assert.equal(diasTrancados(longo, tri), 15, '20 dias trancados: só 15 esticam');
  const dois = { ...fundador3x, contratos: [tri], pausas: [{ desde: '2027-02-01', ate: '2027-02-06', contrato: 'c1' }, { desde: '2027-03-01', ate: '2027-03-06', contrato: 'c1' }] };
  assert.equal(diasTrancados(dois, tri), 5, 'o trimestral só tem um período');
  const sem = { id: 's1', prazo: 'semestral', vezes: 3, inicio: '2027-03', valorMensal: 170, pctBonus: 0, total: 1020 };
  const a = { ...fundador3x, contratos: [sem], pausas: [{ desde: '2027-04-01', ate: '2027-04-16', contrato: 's1' }, { desde: '2027-06-01', ate: '2027-06-16', contrato: 's1' }] };
  assert.equal(diasTrancados(a, sem), 30);
  // Fim em ago/2027 + 30 dias: setembro inteiro coberto, outubro volta ao mensal.
  assert.equal(mensalidadeDoMes(a, '2027-09').zero, 'contrato');
  assert.equal(mensalidadeDoMes(a, '2027-10').valor, 190);
});

test('saída antes do fim: os meses depois do último não são cobertos', () => {
  const c = { ...tri, saida: { ultimoMes: '2027-01' } };
  const a = { ...fundador3x, contratos: [c] };
  assert.equal(fimDoContrato(c), '2027-01');
  assert.equal(mensalidadeDoMes(a, '2027-02').zero, '');
});

test('Day Pass: abate na 1ª mensalidade se o início foi até 7 dias depois', () => {
  const novo = { plano: { vezes: 3 }, fundador: false, inicio: '2027-01-11', dayPass: { dia: '2027-01-06', valor: 50 } };
  const jan = mensalidadeDoMes(novo, '2027-01');
  // 260 × 3/4 (começou na segunda 11) = 195, menos o Day Pass.
  assert.deepEqual([jan.valor, jan.dayPass, jan.investimento], [145, 50, 0]);
  assert.match(explicacaoDoValor(jan).join(' | '), /Day Pass abatido: R\$ 50,00/);
  assert.equal(mensalidadeDoMes(novo, '2027-02').dayPass, 0, 'só na 1ª');
  assert.equal(mensalidadeDoMes({ ...novo, dayPass: { dia: '2027-01-02', valor: 50 } }, '2027-01').dayPass, 0, '9 dias depois: não abate');
  const comContrato = { ...novo, inicio: '2027-02-01', dayPass: { dia: '2027-01-28', valor: 50 }, contratos: [{ ...tri, inicio: '2027-02', valorMensal: 240, total: 720 }] };
  assert.equal(mensalidadeDoMes(comContrato, '2027-02').valor, 670, 'abate também do contrato');
});

test('o contrato coberto explica o porquê', () => {
  const a = { ...fundador3x, contratos: [tri] };
  assert.deepEqual(explicacaoDoValor(mensalidadeDoMes(a, '2027-02')), ['Coberto pelo contrato trimestral (jan/2027 a mar/2027)']);
  assert.deepEqual(explicacaoDoValor(mensalidadeDoMes(a, '2027-01')), ['Contrato trimestral: jan/2027 a mar/2027, pago de uma vez']);
});
