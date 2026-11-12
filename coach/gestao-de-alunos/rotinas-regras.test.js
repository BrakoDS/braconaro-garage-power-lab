// @ts-check
/**
 * Etapa 8 (decisões 4 e 14): a régua de pagamento nos dias certos, quem entra
 * nela, a validade de cada mensagem, as pendências, a 2ª falta seguida, o
 * crédito vencendo, o mês a fechar e os textos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  itensDoDia, itemDaRegua, diaDoMeio, itemDeFalta, creditosVencendo, sugestoesDaRotina, avisosDaRotina, textoDoItem,
  ultimoDiaDoMes, somarDias,
} from './rotinas-regras.js?v=40';

/** O `brl` separa "R$" do número com espaço sem quebra (U+00A0): os textos comparam com espaço comum. */
const NB = (/** @type {string} */ s) => s.replace(/ /g, ' ');
const aluno = (/** @type {any} */ x = {}) => ({ id: 'A', nome: 'Ana Lima', telefone: '14999990000', mensalidade: '130', vencimento: '10', pagamentos: {}, consumos: [], ...x });
const tipos = (/** @type {any[]} */ fichas, /** @type {string} */ hoje, ctx = {}) => itensDoDia(fichas, hoje, { fechamentos: { [somarMeses1(hoje)]: { situacao: 'aprovado' } }, ...ctx }).map((i) => `${i.tipo}:${i.alunoId || i.mesId}`);
/** O mês anterior (fechado, para o aviso de fechamento não entrar nas contas). @param {string} hoje */
function somarMeses1(hoje) { const [a, m] = hoje.split('-').map(Number); return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7); }

test('o meio do caminho: dia 5 para quem vence no 10, dia 8 para o 15 (decisão 14)', () => {
  assert.equal(diaDoMeio(10), 5);
  assert.equal(diaDoMeio(15), 8);
  assert.equal(diaDoMeio(5), 3);
});

test('a régua: dia 1, meio, vencimento e o dia seguinte — e só isso', () => {
  const a = aluno();
  const dias = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
  const comItem = dias.map((d) => [d.slice(8), itemDaRegua(a, [a], d)?.tipo]).filter(([, t]) => t);
  assert.deepEqual(comItem, [['01', 'regua-dia1'], ['05', 'regua-meio'], ['10', 'regua-vencimento'], ['11', 'regua-pos']]);
});

test('a validade: dia 1 até o 4, meio até a véspera, vencimento só no dia, o seguinte por 2 dias', () => {
  const a = aluno();
  assert.equal(itemDaRegua(a, [a], '2026-12-01')?.validoAte, '2026-12-04');
  assert.equal(itemDaRegua(a, [a], '2026-12-05')?.validoAte, '2026-12-09');
  assert.equal(itemDaRegua(a, [a], '2026-12-10')?.validoAte, '2026-12-10');
  assert.equal(itemDaRegua(a, [a], '2026-12-11')?.validoAte, '2026-12-12');
});

test('vencimento no fim do mês e em fevereiro: o dia que existe no mês', () => {
  const a = aluno({ vencimento: '31' });
  assert.equal(itemDaRegua(a, [a], '2027-02-28')?.tipo, 'regua-vencimento', 'fevereiro: vence no 28');
  assert.equal(itemDaRegua(a, [a], '2027-03-01')?.tipo, 'regua-dia1');
  assert.equal(ultimoDiaDoMes('2028-02'), '2028-02-29');
});

test('quem entra: paga, pausado, inativo e conta zero ficam de fora; cortesia só com consumo (decisão 14)', () => {
  assert.equal(itemDaRegua(aluno({ pagamentos: { '2026-12': true } }), [], '2026-12-05'), null, 'pago');
  assert.equal(itemDaRegua(aluno({ status: 'pausado' }), [], '2026-12-05'), null, 'pausado');
  assert.equal(itemDaRegua(aluno({ status: 'inativo' }), [], '2026-12-05'), null, 'inativo');
  const cortesia = aluno({ parceria: { nome: 'Atleta', percentual: 100 } });
  assert.equal(itemDaRegua(cortesia, [cortesia], '2026-12-05'), null, 'cortesia sem consumo: nada');
  const comConsumo = aluno({ parceria: { nome: 'Atleta', percentual: 100 }, consumos: [{ id: 'c', nome: 'Gel', preco: 10, data: '2026-11-20', mesId: '2026-12' }] });
  assert.equal(itemDaRegua(comConsumo, [comConsumo], '2026-12-05')?.tipo, 'regua-meio', 'cortesia com consumo: entra');
});

test('dependente: só o responsável recebe (decisão 14)', () => {
  const pai = aluno({ id: 'P', nome: 'Paulo' });
  const filho = aluno({ id: 'F', nome: 'Fil', pagoPor: { id: 'P', escopo: 'tudo' } });
  assert.deepEqual(tipos([pai, filho], '2026-12-01'), ['regua-dia1:P']);
  const t = textoDoItem(/** @type {any} */ (itemDaRegua(pai, [pai, filho], '2026-12-01')), pai, [pai, filho], '2026-12-01');
  assert.match(NB(String(t)), /- Conta de Fil: R\$ 130,00\nTotal: R\$ 260,00, vence dia 10\./);
});

test('pendências: depois do vencimento + 1, o aluno sai da régua e vira aviso (com o mês passado também)', () => {
  const a = aluno({ vencimento: '5' });
  assert.deepEqual(tipos([a], '2026-12-07'), ['pendencia:A']);
  const r = itensDoDia([a], '2026-12-08', { fechamentos: { '2026-11': { situacao: 'aprovado' } } }).find((i) => i.tipo === 'pendencia');
  assert.ok(r && !('dados' in r), 'o documento não leva valor: a Gestão lê da ficha de agora');
  // O histórico de contas começa no primeiro mês com pagamento ou consumo: outubro pago, novembro em aberto.
  const devendoNov = aluno({ inicio: '2026-10-01', vencimento: '5', pagamentos: { '2026-10': true } });
  assert.ok(itensDoDia([devendoNov], '2026-12-02', {}).some((i) => i.tipo === 'pendencia' && i.mesId === '2026-11'), 'novembro em aberto em dezembro');
});

test('a 2ª falta sem aviso seguida, com a mais nova ontem (decisão 14)', () => {
  // Segunda e quarta 10:00; as duas últimas aulas (09/11 e 11/11) foram falta, 11/11 foi ontem.
  const base = { diasTreino: ['seg', 'qua'], horarios: { seg: '10:00', qua: '10:00' }, presencas: [], atestados: {} };
  const duas = aluno({ ...base, faltas: { '2026-11-09': { tipo: 'no-show' }, '2026-11-11': { tipo: 'no-show' } } });
  assert.equal(itemDeFalta(duas, '2026-11-12')?.chave, 'falta-seguida:A:2026-11-11');
  const uma = aluno({ ...base, presencas: ['2026-11-09'], faltas: { '2026-11-11': { tipo: 'no-show' } } });
  assert.equal(itemDeFalta(uma, '2026-11-12'), null, 'uma falta isolada: nada');
  const avisou = aluno({ ...base, faltas: { '2026-11-09': { tipo: 'no-show' }, '2026-11-11': { tipo: 'fora-do-prazo' } } });
  assert.equal(itemDeFalta(avisou, '2026-11-12'), null, 'avisou fora do prazo não é "sem aviso"');
  assert.equal(itemDeFalta(duas, '2026-11-13'), null, 'a mais nova não foi ontem: já passou');
  const semChamada = aluno({ ...base, faltas: { '2026-11-11': { tipo: 'no-show' } } });
  assert.equal(itemDeFalta(semChamada, '2026-11-12'), null, 'aula sem chamada fechada não é falta');
});

test('crédito vencendo: no primeiro dia da última semana, com até 3 turmas com vaga', () => {
  const a = aluno({ diasTreino: ['seg'], horarios: { seg: '10:00' }, atestados: { '2026-11-02': { tipo: 'desmarcacao', expira: '2026-11-30', reposicao: null } } });
  const ocupacao = [
    { dia: '2026-11-24', hora: '10:00', vagas: 0 }, { dia: '2026-11-25', hora: '18:10', vagas: 2 }, { dia: '2026-11-26', hora: '07:00', vagas: 1 },
    { dia: '2026-11-27', hora: '18:10', vagas: 3 }, { dia: '2026-11-28', hora: '08:00', vagas: 4 },
  ];
  assert.deepEqual(creditosVencendo(a, '2026-11-23', ocupacao), [], 'antes da última semana: nada');
  const [c] = creditosVencendo(a, '2026-11-24', ocupacao);
  assert.equal(c.chave, 'credito-vencendo:A:2026-11-02');
  assert.deepEqual(c.dados?.turmas, [{ dia: '2026-11-25', hora: '18:10' }, { dia: '2026-11-26', hora: '07:00' }, { dia: '2026-11-27', hora: '18:10' }]);
  assert.equal(NB(String(textoDoItem(c, a, [a], '2026-11-24'))),
    'Oi, Ana! 😊 Seu crédito de reposição vence dia 30/11. Ainda tem vaga em: Qua 25/11 18h10, Qui 26/11 7h, Sex 27/11 18h10. Dá pra marcar pelo Portal do Aluno, ou me chama aqui. 💪');
});

test('o mês a fechar: o aviso aparece enquanto o mês anterior não foi fechado', () => {
  assert.ok(itensDoDia([], '2026-11-12', {}).some((i) => i.tipo === 'fechamento' && i.mesId === '2026-10'));
  assert.ok(!itensDoDia([], '2026-11-12', { fechamentos: { '2026-10': { situacao: 'aprovado' } } }).some((i) => i.tipo === 'fechamento'));
  assert.ok(!itensDoDia([], '2026-10-12', {}).some((i) => i.tipo === 'fechamento'), 'setembro ficou de fora do fechamento (decisão 7)');
});

test('os textos da régua (os do plano aprovado)', () => {
  const a = aluno({ consumos: [{ id: 'c', nome: 'Gel', preco: 20, data: '2026-11-20', mesId: '2026-12' }] });
  const texto = (/** @type {string} */ dia) => NB(String(textoDoItem(/** @type {any} */ (itemDaRegua(a, [a], dia)), a, [a], dia)));
  assert.equal(texto('2026-12-01').split('\n').slice(0, 5).join('\n'),
    'Olá, Ana! 😊 Encerramos mais um ciclo e começamos outro! Sua conta de dezembro:\n- Consumo de novembro: R$ 20,00\n- Mensalidade de dezembro: R$ 130,00\nTotal: R$ 150,00, vence dia 10.\nSe você não for continuar em dezembro, é só acertar o consumo de novembro (R$ 20,00).');
  assert.match(texto('2026-12-05'), /^Olá, Ana! 😊 Passando pra lembrar da sua conta de dezembro \(R\$ 150,00\), que vence dia 10\. Pra facilitar, o Pix/);
  assert.match(texto('2026-12-10'), /^Olá, Ana! 😊 Hoje é o dia do vencimento da sua conta de dezembro \(R\$ 150,00\)\./);
  assert.match(texto('2026-12-11'), /^Olá, Ana! Sua conta de dezembro \(R\$ 150,00\) venceu ontem\. Se já pagou, me manda o comprovante que eu dou baixa\./);
});

test('na Fila: a lista mais nova vence; vencida, paga ou pausada some; o texto vai junto', () => {
  const a = aluno();
  const dia1 = { dia: '2026-12-01', itens: itensDoDia([a], '2026-12-01', { fechamentos: { '2026-11': { situacao: 'aprovado' } } }) };
  const s = sugestoesDaRotina([dia1], [a], '2026-12-02');
  assert.deepEqual(s.map((x) => [x.chave, x.gatilho, x.criadaEm]), [['regua-dia1:A:2026-12', 'regua-dia1', 0]]);
  assert.match(s[0].dados.texto, /Encerramos mais um ciclo/);
  assert.deepEqual(sugestoesDaRotina([dia1], [a], '2026-12-05'), [], 'passou da validade (dia 4)');
  assert.deepEqual(sugestoesDaRotina([dia1], [{ ...a, pagamentos: { '2026-12': true } }], '2026-12-02'), [], 'pagou: some');
  assert.deepEqual(sugestoesDaRotina([dia1], [{ ...a, status: 'pausado' }], '2026-12-02'), [], 'pausou: some');
  assert.deepEqual(sugestoesDaRotina([dia1], [], '2026-12-02'), [], 'aluno apagado: some');
});

test('os avisos para o coach: o mês a fechar e as pendências ainda em aberto, da lista mais nova', () => {
  const a = aluno({ vencimento: '5' });
  const lista = { dia: '2026-12-08', itens: itensDoDia([a], '2026-12-08', {}) };
  const av = avisosDaRotina([lista], [a], '2026-12-08');
  assert.deepEqual(av.fechar, ['2026-11']);
  assert.deepEqual(av.pendencias, [{ alunoId: 'A', nome: 'Ana Lima', mesId: '2026-12', valor: 130, diasAtraso: 3 }]);
  assert.deepEqual(avisosDaRotina([lista], [{ ...a, pagamentos: { '2026-12': true } }], '2026-12-08', { '2026-11': { situacao: 'aprovado' } }), { fechar: [], pendencias: [] },
    'pagou e fechou: nenhum aviso');
});
