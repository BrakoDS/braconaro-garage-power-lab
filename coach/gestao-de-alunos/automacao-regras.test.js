// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/automacao-regras.test.js
 *
 * O motor de automação, puro: as duas fontes (a cobrança vencida varrida do
 * box, o recibo de um pagamento), o texto, e — o que importa mais — o
 * ANTI-SPAM: a mesma mensagem nunca aparece duas vezes, nem depois de enviada
 * ou descartada, nem vinda de outro aparelho. Além dos casos à mão, sequências
 * aleatórias (semente fixa) de ações, cliques, varreduras e sincronizações
 * entre dois aparelhos conferem as invariantes a cada passo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATILHOS, PRAZO_PENDENTE, GUARDA_FEITAS, chaveDe, filaVazia, foiFeita,
  sugestoesDaVarredura, sugestaoDaAcao, aoAgir, marcar, podar, normalizarFila,
  msgRecibo, textoDa, visiveis, mesclarFeitas, planoDeSync,
} from './automacao-regras.js?v=12';
import { darBaixa, desfazerBaixa, msgCobranca, cobrancasDoMes, itensFecham } from './financeiro-regras.js?v=12';

const NB = (s) => s.replace(/ /g, ' ');
const DIA = 86400000;
const HOJE = '2026-10-08', OUT = '2026-10', SET = '2026-09';
const T0 = Date.UTC(2026, 9, 8, 12);

/** O box de teste, em 08/10/2026. */
function box() {
  return {
    // Vencida há 3 dias, e paga a conta da Bia: a cobrança é a CONTA (150 + 120).
    ana: { id: 'Ana', nome: 'Ana Lima', telefone: '(14) 99999-0000', mensalidade: '150', vencimento: '5' },
    bia: { id: 'Bia', nome: 'Bia Souza', telefone: '14988887777', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana', escopo: 'tudo' } },
    // Inativo: fora de tudo.
    caio: { id: 'Caio', nome: 'Caio', telefone: '14977776666', mensalidade: '150', vencimento: '5', status: 'inativo' },
    // Cortesia de 100%: nada a cobrar.
    duda: { id: 'Duda', nome: 'Duda Reis', telefone: '14966665555', mensalidade: '150', vencimento: '5', parceria: { nome: 'Atleta', percentual: 100 } },
    // Vence dia 20: ainda não venceu.
    edu: { id: 'Edu', nome: 'Edu', telefone: '14955554444', mensalidade: '200', vencimento: '20' },
    // Já pagou outubro.
    fab: { id: 'Fab', nome: 'Fab', telefone: '14944443333', mensalidade: '90', vencimento: '2', pagamentos: { [OUT]: true } },
    // Vencida há 7 dias, sem telefone.
    gil: { id: 'Gil', nome: 'Gil Neto', mensalidade: '100', vencimento: '1' },
  };
}
const todos = (b) => Object.values(b);
/** O que 'acao-registrada' entrega para um pagamento. */
const pagou = (aluno, mesId, valor, soMensalidade = true) => ({ tipo: 'pagamento', aluno, dados: { mesId, valor, soMensalidade } });
const desfez = (aluno, mesId) => ({ tipo: 'pagamento-desfeito', aluno, dados: { mesId } });
/** Congela fundo: uma função que altere o que recebe lança. */
const gelo = (x) => { if (x && typeof x === 'object') { Object.values(x).forEach(gelo); Object.freeze(x); } return x; };

/* ---------- condição: a conta do mês em aberto (vencida ou a vencer) ---------- */

test('varredura: toda conta do mês em aberto — vencida vira cobrança, a vencer vira lembrete; a mesma lista das Cobranças (sem cortesia, dependente, inativo ou pago)', () => {
  const s = sugestoesDaVarredura(todos(box()), HOJE);
  assert.deepEqual(s.map((x) => [x.chave, x.gatilho, x.alunoId, x.dados.valor, x.dados.dias, x.dados.soMensalidade]), [
    ['cobranca-vencida:Gil:2026-10', 'cobranca-vencida', 'Gil', 100, -7, true],
    ['cobranca-vencida:Ana:2026-10', 'cobranca-vencida', 'Ana', 270, -3, false],
    ['cobranca-a-vencer:Edu:2026-10', 'cobranca-a-vencer', 'Edu', 200, 12, true],
  ]);
  assert.ok(s.every((x) => x.criadaEm === 0 && x.dados.mesId === OUT));
});

test('varredura: até o dia do vencimento é LEMBRETE; no dia seguinte vira COBRANÇA VENCIDA (outra chave)', () => {
  const b = { ana: { id: 'Ana', nome: 'Ana', mensalidade: '150', vencimento: '8' } };
  const no = (dia) => sugestoesDaVarredura(todos(b), dia).map((x) => [x.chave, x.dados.dias]);
  assert.deepEqual(no('2026-10-01'), [['cobranca-a-vencer:Ana:2026-10', 7]], 'no começo do mês já é lembrete');
  assert.deepEqual(no('2026-10-07'), [['cobranca-a-vencer:Ana:2026-10', 1]]);
  assert.deepEqual(no('2026-10-08'), [['cobranca-a-vencer:Ana:2026-10', 0]], 'no dia: "vence hoje"');
  assert.deepEqual(no('2026-10-09'), [['cobranca-vencida:Ana:2026-10', -1]]);
});

test('varredura: a baixa tira a cobrança E o lembrete da fila — a condição deixou de valer', () => {
  const b = box();
  for (const k of ['ana', 'edu']) {
    const r = darBaixa(b[k], OUT, todos(b));
    assert.ok(r);
    b[k] = { ...b[k], ...r.patch };
  }
  assert.deepEqual(sugestoesDaVarredura(todos(b), HOJE).map((x) => x.alunoId), ['Gil']);
});

/* ---------- ação: o recibo ---------- */

test('ação: o pagamento com valor vira recibo; cortesia (R$ 0) e outros tipos não', () => {
  const b = box();
  assert.deepEqual(sugestaoDaAcao(pagou(b.ana, OUT, 270, false), T0), {
    chave: 'recibo:Ana:2026-10', gatilho: 'recibo', alunoId: 'Ana', criadaEm: T0, dados: { mesId: OUT, valor: 270, soMensalidade: false },
  });
  assert.equal(sugestaoDaAcao(pagou(b.duda, OUT, 0), T0), null, 'cortesia: nada a agradecer');
  assert.equal(sugestaoDaAcao({ tipo: 'atestado', aluno: b.ana }, T0), null);
  assert.equal(sugestaoDaAcao({ tipo: 'pagamento', aluno: b.ana }, T0), null, 'sem dados (log antigo): nada');
  assert.equal(sugestaoDaAcao(/** @type {any} */ (null), T0), null);
});

test('ação: a baixa de verdade (darBaixa) entrega o mês, o valor da fatura e se é só a mensalidade', () => {
  const b = box();
  const ana = darBaixa(b.ana, OUT, todos(b))?.log;
  const edu = darBaixa(b.edu, OUT, todos(b))?.log;
  assert.deepEqual(ana?.dados, { mesId: OUT, valor: 270, soMensalidade: false }, 'com a Bia junto: conta');
  assert.deepEqual(edu?.dados, { mesId: OUT, valor: 200, soMensalidade: true });
  assert.deepEqual(desfazerBaixa({ ...b.fab }, OUT)?.log?.dados, { mesId: OUT });
});

/* ---------- o texto ---------- */

test('texto: o recibo diz mensalidade ou conta, o mês e o valor; a cobrança é o mesmo lembrete das Cobranças', () => {
  const b = box();
  assert.equal(NB(msgRecibo(b.ana, OUT, 150)), 'Olá, Ana! ✅ Recebi o pagamento da mensalidade de Outubro (R$ 150,00). Obrigado pela confiança — bons treinos! 💪');
  assert.match(NB(msgRecibo(b.ana, OUT, 270, false)), /pagamento da conta de Outubro \(R\$ 270,00\)/);
  const [gil] = sugestoesDaVarredura(todos(b), HOJE);
  assert.equal(textoDa(gil, b.gil), msgCobranca(b.gil, OUT, 100, -7, true));
});

/* ---------- o detalhamento da conta (quando há consumo) ---------- */

const PIX_TXT = 'Pra facilitar, o Pix é a chave CNPJ 66.567.011/0001-66 (Guilherme Braconaro) — dá pra pagar direto pelo Portal do Aluno também. Qualquer dúvida é só chamar! 💪';
const cons = (id, nome, preco, mesId = OUT) => ({ id, nome, preco, data: `${mesId}-03`, mesId });
const cobrancaDe = (a, todosAl, hojeIso = HOJE) => sugestoesDaVarredura(todosAl, hojeIso).find((s) => s.alunoId === a.id);

test('detalhe: a conta com consumo lista a mensalidade e os itens (o mesmo produto agrupado) antes do Pix', () => {
  const rui = { id: 'Rui', nome: 'Rui Costa', telefone: '14999990000', mensalidade: '150', vencimento: '5',
    consumos: [cons('c1', 'Bebida/Suplemento', 20), cons('c2', 'Bebida/Suplemento', 20)] };
  const s = cobrancaDe(rui, [rui]);
  assert.ok(s);
  assert.equal(NB(textoDa(s, rui, [rui])),
    'Olá, Rui! 😊 Passando pra lembrar da sua conta de Outubro (R$ 190,00), que venceu dia 5:\n'
    + '- Mensalidade: R$ 150,00\n'
    + '- 2x Bebida/Suplemento: R$ 40,00\n'
    + PIX_TXT);
  const recibo = sugestaoDaAcao(pagou(rui, OUT, 190, false), T0);
  assert.ok(recibo);
  assert.equal(NB(textoDa(recibo, rui, [rui])),
    'Olá, Rui! ✅ Recebi o pagamento da sua conta de Outubro (R$ 190,00):\n'
    + '- Mensalidade: R$ 150,00\n'
    + '- 2x Bebida/Suplemento: R$ 40,00\n'
    + 'Obrigado pela confiança — bons treinos! 💪');
});

test('detalhe: o dependente entra com o nome; a parceria já vem descontada; só o consumo do mês', () => {
  const ana = { id: 'Ana', nome: 'Ana Lima', mensalidade: '200', vencimento: '5', parceria: { nome: 'Clínica', percentual: 50 },
    consumos: [cons('c1', 'Água', 5), cons('c9', 'Camiseta', 60, '2026-11')] };
  const bia = { id: 'Bia', nome: 'Bia Souza', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana', escopo: 'tudo' }, consumos: [cons('c2', 'Barra', 8)] };
  const s = cobrancaDe(ana, [ana, bia]);
  assert.equal(s?.dados.valor, 233);
  assert.equal(NB(textoDa(/** @type {any} */ (s), ana, [ana, bia])).split('\n').slice(1, -1).join('\n'),
    '- Mensalidade: R$ 100,00\n- 1x Água: R$ 5,00\n- Mensalidade (Bia): R$ 120,00\n- 1x Barra (Bia): R$ 8,00');
});

test('detalhe: centavos fecham (3 × 9,99 = 29,97) e a soma dos itens é o total cobrado', () => {
  const eva = { id: 'Eva', nome: 'Eva', mensalidade: '89.91', vencimento: '5', consumos: [cons('a', 'Gel', 9.99), cons('b', 'Gel', 9.99), cons('c', 'Gel', 9.99)] };
  const s = cobrancaDe(eva, [eva]);
  const txt = NB(textoDa(/** @type {any} */ (s), eva, [eva]));
  assert.match(txt, /conta de Outubro \(R\$ 119,88\)/);
  assert.match(txt, /- Mensalidade: R\$ 89,91\n- 3x Gel: R\$ 29,97\n/);
});

test('detalhe: sem consumo, o texto curto de sempre — também com dependente só de mensalidade', () => {
  const b = box();
  const ana = cobrancaDe(b.ana, todos(b));
  assert.equal(textoDa(/** @type {any} */ (ana), b.ana, todos(b)), msgCobranca(b.ana, OUT, 270, -3, false));
  const r = sugestaoDaAcao(pagou(b.edu, OUT, 200), T0);
  assert.equal(textoDa(/** @type {any} */ (r), b.edu, todos(b)), msgRecibo(b.edu, OUT, 200, true));
});

test('detalhe: dependente de "só o plano" — o consumo dele é dele, não entra na conta do responsável', () => {
  const ana = { id: 'Ana', nome: 'Ana', mensalidade: '150', vencimento: '5' };
  const bia = { id: 'Bia', nome: 'Bia', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana', escopo: 'plano' }, consumos: [cons('c', 'Barra', 8)] };
  const all = [ana, bia];
  assert.equal(textoDa(/** @type {any} */ (cobrancaDe(ana, all)), ana, all), msgCobranca(ana, OUT, 270, -3, false), 'Ana: sem consumo, texto curto');
  assert.match(NB(textoDa(/** @type {any} */ (cobrancaDe(bia, all)), bia, all)), /conta de Outubro \(R\$ 8,00\), que venceu dia 5:\n- 1x Barra: R\$ 8,00\n/);
});

test('detalhe: recibo de uma conta que MUDOU depois da baixa não detalha — itens que não fecham com o total confundiriam', () => {
  const rui = { id: 'Rui', nome: 'Rui', mensalidade: '150', vencimento: '5', consumos: [cons('c1', 'Água', 5)] };
  const r = sugestaoDaAcao(pagou(rui, OUT, 150, true), T0); // pago antes de a água entrar
  assert.equal(textoDa(/** @type {any} */ (r), rui, [rui]), msgRecibo(rui, OUT, 150, true));
});

test('detalhe: a fila (visiveis) usa o box inteiro — o dependente aparece no texto do responsável', () => {
  const ana = { id: 'Ana', nome: 'Ana', telefone: '14999990000', mensalidade: '150', vencimento: '5' };
  const bia = { id: 'Bia', nome: 'Bia Souza', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana', escopo: 'tudo' }, consumos: [cons('c', 'Barra', 8)] };
  const [m] = visiveis(filaVazia(), sugestoesDaVarredura([ana, bia], HOJE), [ana, bia]);
  assert.match(NB(m.texto), /\(R\$ 278,00\)[^\n]*:\n- Mensalidade: R\$ 150,00\n- Mensalidade \(Bia\): R\$ 120,00\n- 1x Barra \(Bia\): R\$ 8,00\n/);
});

/* ---------- o lembrete (a vencer) ---------- */

test('lembrete: o texto é o lembrete "vence dia X" das Cobranças — com o extrato quando há consumo', () => {
  const b = box();
  const edu = sugestoesDaVarredura(todos(b), HOJE).find((x) => x.alunoId === 'Edu');
  assert.ok(edu);
  assert.equal(NB(textoDa(edu, b.edu, todos(b))), `Olá, Edu! 😊 Passando pra lembrar da sua mensalidade de Outubro (R$ 200,00), que vence dia 20. ${PIX_TXT}`);
  const rui = { id: 'Rui', nome: 'Rui', telefone: '14999990000', mensalidade: '150', vencimento: '15',
    consumos: [cons('c1', 'Energético', 10), cons('c2', 'Energético', 10)] };
  const s = sugestoesDaVarredura([rui], HOJE)[0];
  assert.equal(s.gatilho, 'cobranca-a-vencer');
  assert.equal(NB(textoDa(s, rui, [rui])), `Olá, Rui! 😊 Passando pra lembrar da sua conta de Outubro (R$ 170,00), que vence dia 15:\n- Mensalidade: R$ 150,00\n- 2x Energético: R$ 20,00\n${PIX_TXT}`);
  const noDia = { ...rui, vencimento: '8' };
  assert.match(NB(textoDa(sugestoesDaVarredura([noDia], HOJE)[0], noDia, [noDia])), /, que vence hoje:\n/);
});

test('anti-spam: o lembrete vai UMA vez no mês — enviado, não volta nos dias seguintes; a cobrança vencida, se vier, é outra mensagem', () => {
  const b = { ana: { id: 'Ana', nome: 'Ana', telefone: '14999990000', mensalidade: '150', vencimento: '20' } };
  let f = filaVazia();
  const ver = (dia) => visiveis(f, sugestoesDaVarredura(todos(b), dia), todos(b)).map((m) => m.chave);
  assert.deepEqual(ver('2026-10-01'), ['cobranca-a-vencer:Ana:2026-10']);
  f = marcar(f, 'cobranca-a-vencer:Ana:2026-10', 'enviada', T0);
  for (const dia of ['2026-10-02', '2026-10-15', '2026-10-19', '2026-10-20']) assert.deepEqual(ver(dia), [], dia);
  assert.deepEqual(ver('2026-10-21'), ['cobranca-vencida:Ana:2026-10'], 'venceu sem pagar: a cobrança é outra chave');
  f = marcar(f, 'cobranca-vencida:Ana:2026-10', 'enviada', T0);
  assert.deepEqual(ver('2026-10-31'), []);
  assert.deepEqual(ver('2026-11-01'), ['cobranca-a-vencer:Ana:2026-11'], 'mês novo, lembrete novo');
});

test('anti-spam: lembrete DESCARTADO também não volta no mês', () => {
  const b = { ana: { id: 'Ana', nome: 'Ana', telefone: '14999990000', mensalidade: '150', vencimento: '20' } };
  const f = marcar(filaVazia(), 'cobranca-a-vencer:Ana:2026-10', 'descartada', T0);
  assert.deepEqual(visiveis(f, sugestoesDaVarredura(todos(b), '2026-10-12'), todos(b)), []);
});

/* ---------- a fila ---------- */

test('fila: o mesmo pagamento duas vezes é UM recibo — e o segundo troca o valor do primeiro', () => {
  const b = box();
  let f = aoAgir(filaVazia(), pagou(b.ana, OUT, 150), T0);
  f = aoAgir(f, pagou(b.ana, OUT, 270, false), T0 + 1);
  assert.deepEqual(f.pendentes.map((s) => [s.chave, s.dados.valor]), [['recibo:Ana:2026-10', 270]]);
});

test('fila: desfazer a baixa tira o recibo que esperava; outro mês fica', () => {
  const b = box();
  let f = aoAgir(filaVazia(), pagou(b.ana, OUT, 150), T0);
  f = aoAgir(f, pagou(b.ana, SET, 150), T0);
  f = aoAgir(f, desfez(b.ana, OUT), T0);
  assert.deepEqual(f.pendentes.map((s) => s.chave), ['recibo:Ana:2026-09']);
  assert.equal(aoAgir(f, desfez(b.ana, OUT), T0), f, 'nada esperando: a mesma fila');
});

test('anti-spam: recibo ENVIADO não volta — nem desfazendo e refazendo a baixa do mês', () => {
  const b = box();
  let f = aoAgir(filaVazia(), pagou(b.ana, OUT, 150), T0);
  f = marcar(f, 'recibo:Ana:2026-10', 'enviada', T0);
  f = aoAgir(f, desfez(b.ana, OUT), T0);
  const depois = aoAgir(f, pagou(b.ana, OUT, 150), T0);
  assert.equal(depois, f, 'a fila nem muda');
  assert.deepEqual(visiveis(depois, [], todos(b)), []);
});

test('anti-spam: DESCARTADA também não volta, nem pela varredura seguinte', () => {
  const b = box();
  const f = marcar(filaVazia(), 'cobranca-vencida:Gil:2026-10', 'descartada', T0);
  const vis = visiveis(f, sugestoesDaVarredura(todos(b), HOJE), todos(b));
  assert.deepEqual(vis.map((m) => m.chave), ['cobranca-vencida:Ana:2026-10', 'cobranca-a-vencer:Edu:2026-10']);
  // Uma semana depois, o Gil continua devendo — e continua fora.
  assert.ok(!visiveis(f, sugestoesDaVarredura(todos(b), '2026-10-15'), todos(b)).some((m) => m.alunoId === 'Gil'));
});

test('anti-spam: a cobrança é UMA por mês — novembro é outra chave', () => {
  const b = box();
  const f = marcar(filaVazia(), 'cobranca-vencida:Gil:2026-10', 'enviada', T0);
  assert.ok(visiveis(f, sugestoesDaVarredura(todos(b), '2026-11-08'), todos(b)).some((m) => m.chave === 'cobranca-vencida:Gil:2026-11'));
});

test('marcar: o primeiro clique vale; o segundo devolve a MESMA fila (duplo toque não envia duas vezes)', () => {
  let f = aoAgir(filaVazia(), pagou(box().ana, OUT, 150), T0);
  f = marcar(f, 'recibo:Ana:2026-10', 'enviada', T0);
  assert.deepEqual(f, { pendentes: [], feitas: { 'recibo:Ana:2026-10': { status: 'enviada', em: T0 } } });
  assert.equal(marcar(f, 'recibo:Ana:2026-10', 'enviada', T0 + 5), f);
  assert.equal(marcar(f, 'recibo:Ana:2026-10', 'descartada', T0 + 5), f, 'enviada não vira descartada');
  assert.equal(marcar(f, 'x', /** @type {any} */ ('lida'), T0), f, 'status desconhecido: nada');
  assert.equal(marcar(f, '', 'enviada', T0), f, 'sem chave: nada');
});

test('visíveis: varredura + ações, sem repetir chave, sem aluno apagado, com nome/telefone/texto da ficha ATUAL e em ordem', () => {
  const b = box();
  let f = aoAgir(filaVazia(), pagou(b.edu, OUT, 200), T0);
  f = aoAgir(f, pagou(b.fab, OUT, 90), T0 + 10);
  f = aoAgir(f, pagou({ id: 'Saiu', nome: 'Saiu' }, OUT, 50), T0 + 20); // aluno apagado depois
  const varr = sugestoesDaVarredura(todos(b), HOJE);
  const vis = visiveis(gelo(f), gelo([...varr, ...varr]), gelo(todos(b)));
  assert.deepEqual(vis.map((m) => m.chave), [
    'cobranca-vencida:Gil:2026-10', 'cobranca-vencida:Ana:2026-10', // a mais atrasada primeiro
    'cobranca-a-vencer:Edu:2026-10', // depois os lembretes, o que vence antes primeiro
    'recibo:Fab:2026-10', 'recibo:Edu:2026-10', // o recibo mais novo primeiro
  ]);
  const ana = vis[1];
  assert.deepEqual([ana.nome, ana.telefone, ana.temTelefone, ana.rotulo], ['Ana Lima', '14999990000', true, GATILHOS['cobranca-vencida'].rotulo]);
  assert.equal(vis[0].temTelefone, false, 'Gil sem telefone');
  // Telefone trocado na ficha vale na hora.
  const novo = visiveis(f, [], todos({ ...b, edu: { ...b.edu, telefone: '11 91234-5678' } }));
  assert.equal(novo.find((m) => m.alunoId === 'Edu')?.telefone, '11912345678');
});

test('podar: ação esperando há mais de 7 dias sai; chave feita é lembrada por 120 dias', () => {
  let f = aoAgir(filaVazia(), pagou(box().ana, OUT, 150), T0);
  f = marcar(f, 'k-velha', 'enviada', T0);
  assert.equal(podar(f, T0 + PRAZO_PENDENTE).pendentes.length, 1);
  assert.equal(podar(f, T0 + PRAZO_PENDENTE + 1).pendentes.length, 0);
  assert.ok(foiFeita(podar(f, T0 + GUARDA_FEITAS), 'k-velha'));
  assert.ok(!foiFeita(podar(f, T0 + GUARDA_FEITAS + 1), 'k-velha'));
});

test('podar: a guarda cobre o mês inteiro — a cobrança enviada no dia 1 não volta no dia 31', () => {
  assert.ok(GUARDA_FEITAS > 31 * DIA);
  const b = { gil: { id: 'Gil', nome: 'Gil', telefone: '14999990000', mensalidade: '100', vencimento: '1' } };
  const dia2 = Date.UTC(2026, 9, 2, 12), dia31 = Date.UTC(2026, 9, 31, 12);
  const f = podar(marcar(filaVazia(), 'cobranca-vencida:Gil:2026-10', 'enviada', dia2), dia31);
  assert.deepEqual(visiveis(f, sugestoesDaVarredura(todos(b), '2026-10-31'), todos(b)), []);
});

test('normalizar: lixo do armazenamento vira fila vazia; o que é válido passa; ida e volta por JSON não muda nada', () => {
  for (const lixo of [null, undefined, 42, 'x', [], { pendentes: 'x', feitas: 3 }]) assert.deepEqual(normalizarFila(lixo), filaVazia());
  const b = box();
  let f = aoAgir(filaVazia(), pagou(b.ana, OUT, 150), T0);
  f = aoAgir(f, pagou(b.edu, OUT, 200), T0);
  f = marcar(f, 'recibo:Edu:2026-10', 'descartada', T0);
  assert.deepEqual(normalizarFila(JSON.parse(JSON.stringify(f))), f);
  const sujo = {
    pendentes: [...f.pendentes, f.pendentes[0], { chave: 'recibo:Edu:2026-10', gatilho: 'recibo', alunoId: 'Edu', criadaEm: 1, dados: {} },
      { chave: 'z', gatilho: 'inventado', alunoId: 'A', criadaEm: 1, dados: {} }, { chave: 'y' }],
    feitas: { ...f.feitas, ruim: { status: 'lida', em: 1 }, semEm: { status: 'enviada' } },
  };
  assert.deepEqual(normalizarFila(sujo), f, 'repetida, já feita, gatilho inventado e feita inválida saem');
});

/* ---------- mais de um aparelho ---------- */

test('mesclar: união das chaves; "enviada" vence "descartada"; empate fica com a mais antiga', () => {
  const a = { k1: { status: 'descartada', em: 5 }, k2: { status: 'enviada', em: 9 }, k3: { status: 'enviada', em: 1 } };
  const b = { k1: { status: 'enviada', em: 7 }, k2: { status: 'enviada', em: 3 }, k4: { status: 'descartada', em: 2 }, lixo: { status: 'x', em: 1 } };
  assert.deepEqual(mesclarFeitas(/** @type {any} */ (a), /** @type {any} */ (b)), {
    k1: { status: 'enviada', em: 7 }, k2: { status: 'enviada', em: 3 }, k3: { status: 'enviada', em: 1 }, k4: { status: 'descartada', em: 2 },
  });
});

test('sync: sobe o que a nuvem não tem, apaga lá o que passou do prazo, e a pendente já feita em outro aparelho sai', () => {
  const b = box();
  let f = aoAgir(filaVazia(), pagou(b.ana, OUT, 150), T0);
  f = marcar(f, 'aqui', 'enviada', T0);
  const nuvem = { 'recibo:Ana:2026-10': { status: 'enviada', em: T0 - 5 }, velha: { status: 'enviada', em: T0 - GUARDA_FEITAS - 1 } };
  const p = planoDeSync(f, /** @type {any} */ (nuvem), T0);
  assert.deepEqual(p.fila.pendentes, [], 'o recibo já foi enviado no outro aparelho');
  assert.deepEqual(Object.keys(p.fila.feitas).sort(), ['aqui', 'recibo:Ana:2026-10']);
  assert.deepEqual(p.subir, ['aqui']);
  assert.deepEqual(p.apagar, ['velha']);
  assert.deepEqual(planoDeSync(f, null, T0).subir, ['aqui'], 'nuvem vazia: sobe tudo');
});

/* ---------- sequências aleatórias ---------- */

/** Gerador com semente (mulberry32): a mesma semente, a mesma sequência. @param {number} a */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('aleatório: mesclar é comutativa, idempotente e associativa', () => {
  const r = mulberry32(7);
  const gera = () => {
    const o = /** @type {Record<string, any>} */ ({});
    for (let i = 0; i < 6; i++) if (r() < 0.6) o['k' + i] = { status: r() < 0.5 ? 'enviada' : 'descartada', em: Math.floor(r() * 5) };
    return o;
  };
  for (let i = 0; i < 2000; i++) {
    const a = gera(), b = gera(), c = gera();
    assert.deepEqual(mesclarFeitas(a, b), mesclarFeitas(b, a));
    assert.deepEqual(mesclarFeitas(a, a), mesclarFeitas(a, {}));
    assert.deepEqual(mesclarFeitas(mesclarFeitas(a, b), c), mesclarFeitas(a, mesclarFeitas(b, c)));
  }
});

test('aleatório: dois aparelhos e a nuvem — nenhuma chave aparece duas vezes, nem depois de feita, nem depois de sincronizada', () => {
  const r = mulberry32(2026);
  const pick = (/** @type {any[]} */ l) => l[Math.floor(r() * l.length)];
  const alunos = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, nome: 'Aluno ' + id, telefone: '1499999000' + i, mensalidade: String(100 + i * 10), vencimento: String(1 + i * 3) }));
  const meses = ['2026-09', '2026-10', '2026-11'];
  /** @type {Record<string, any>} */ let nuvem = {};
  const aparelhos = [{ fila: filaVazia() }, { fila: filaVazia() }];
  /** Cada envio de cada chave: por qual aparelho e quando. */
  const envios = /** @type {Map<string, { ix: number, em: number }[]>} */ (new Map());
  let agora = T0, passos = 0;
  const cobertura = { acao: 0, desfez: 0, enviou: 0, descartou: 0, duploClique: 0, sync: 0, podou: 0, recarregou: 0, viuVarredura: 0 };

  for (let i = 0; i < 6000; i++) {
    agora += Math.floor(r() * 6 * 3600 * 1000);
    const hojeIso = new Date(agora).toISOString().slice(0, 10);
    const ix = r() < 0.5 ? 0 : 1, ap = aparelhos[ix];
    const varr = sugestoesDaVarredura(alunos, hojeIso);
    const vis = visiveis(ap.fila, varr, alunos);
    if (varr.length) cobertura.viuVarredura++;
    const op = r();
    if (op < 0.25) { ap.fila = aoAgir(ap.fila, pagou(pick(alunos), pick(meses), 100), agora); cobertura.acao++; }
    else if (op < 0.32) { ap.fila = aoAgir(ap.fila, desfez(pick(alunos), pick(meses)), agora); cobertura.desfez++; }
    else if (op < 0.55 && vis.length) {
      const m = pick(vis);
      const st = r() < 0.7 ? 'enviada' : 'descartada';
      const nova = marcar(ap.fila, m.chave, st, agora);
      assert.notEqual(nova, ap.fila, 'o que está visível pode ser marcado');
      ap.fila = nova;
      if (st === 'enviada') { envios.set(m.chave, [...(envios.get(m.chave) || []), { ix, em: agora }]); cobertura.enviou++; } else cobertura.descartou++;
      // O duplo toque: o mesmo clique de novo não faz nada.
      assert.equal(marcar(ap.fila, m.chave, 'enviada', agora + 1), ap.fila); cobertura.duploClique++;
    } else if (op < 0.8) {
      const p = planoDeSync(ap.fila, nuvem, agora);
      ap.fila = p.fila;
      nuvem = { ...nuvem };
      for (const k of p.subir) nuvem[k] = p.fila.feitas[k];
      for (const k of p.apagar) delete nuvem[k];
      // Depois do sync, nada do que a nuvem conhece aparece aqui.
      const depois = visiveis(ap.fila, sugestoesDaVarredura(alunos, hojeIso), alunos);
      for (const m of depois) assert.ok(!(m.chave in nuvem), `${m.chave} feita na nuvem e ainda visível`);
      // E o plano converge: rodar de novo não tem mais nada a fazer.
      const p2 = planoDeSync(ap.fila, nuvem, agora);
      assert.deepEqual([p2.subir, p2.apagar], [[], []]);
      cobertura.sync++;
    } else if (op < 0.9) { ap.fila = podar(ap.fila, agora); cobertura.podou++; }
    else { ap.fila = normalizarFila(JSON.parse(JSON.stringify(ap.fila))); cobertura.recarregou++; }

    // As invariantes, nos dois aparelhos.
    for (const { fila } of aparelhos) {
      const v = visiveis(fila, sugestoesDaVarredura(alunos, hojeIso), alunos);
      const chaves = v.map((m) => m.chave);
      assert.equal(new Set(chaves).size, chaves.length, 'chave repetida na fila');
      assert.ok(chaves.every((k) => !foiFeita(fila, k)), 'mensagem feita ainda visível');
      const pend = fila.pendentes.map((s) => s.chave);
      assert.equal(new Set(pend).size, pend.length, 'pendente repetida');
      assert.ok(pend.every((k) => !foiFeita(fila, k)), 'pendente já feita');
      assert.deepEqual(normalizarFila(JSON.parse(JSON.stringify(fila))), fila, 'a fila sobrevive ao armazenamento');
    }
    passos++;
  }
  // Um aparelho nunca envia a mesma chave duas vezes enquanto ela é lembrada
  // (GUARDA_FEITAS); dois aparelhos, só se nenhum sincronizou entre um envio e
  // outro (o caso sem rede).
  let repetidasDepoisDaGuarda = 0;
  for (const [k, lista] of envios) {
    for (const x of [0, 1]) {
      const t = lista.filter((e) => e.ix === x).map((e) => e.em);
      for (let j = 1; j < t.length; j++) { assert.ok(t[j] - t[j - 1] > GUARDA_FEITAS, `${k} enviada duas vezes pelo mesmo aparelho em ${(t[j] - t[j - 1]) / DIA} dias`); repetidasDepoisDaGuarda++; }
    }
  }
  assert.ok(envios.size > 50, `chaves enviadas: ${envios.size} (repetidas só depois da guarda: ${repetidasDepoisDaGuarda})`);
  for (const [nome, n] of Object.entries(cobertura)) assert.ok(n > 50, `cobertura fraca: ${nome} = ${n}`);
  assert.equal(passos, 6000);
});

test('aleatório: o lembrete da Fila é IDÊNTICO ao do botão da tela Cobranças — com e sem consumo, dependente, parceria', () => {
  const r = mulberry32(99);
  const pick = (/** @type {any[]} */ l) => l[Math.floor(r() * l.length)];
  const produtos = [['Energético', 10], ['Água', 5], ['Gel', 9.99], ['Camiseta', 60], ['Barra', 8.5]];
  let comExtrato = 0, curtos = 0, aVencer = 0;
  for (let i = 0; i < 400; i++) {
    const n = 1 + Math.floor(r() * 6);
    const box = Array.from({ length: n }, (_, k) => {
      const a = /** @type {any} */ ({ id: 'A' + k, nome: 'Aluno ' + k, telefone: '1499999000' + k, mensalidade: String(pick([0, 90, 120, 150.5])), vencimento: String(1 + Math.floor(r() * 28)) });
      if (r() < 0.3) a.parceria = { nome: 'P', percentual: pick([10, 25, 50, 100]) };
      a.consumos = Array.from({ length: Math.floor(r() * 4) }, (_, j) => { const [nome, preco] = pick(produtos); return cons(`c${j}`, nome, preco, r() < 0.85 ? OUT : '2026-11'); });
      if (r() < 0.2) a.status = 'inativo';
      return a;
    });
    for (const a of box) if (r() < 0.3 && box.length > 1) { const resp = pick(box); if (resp !== a && !resp.pagoPor) a.pagoPor = { id: resp.id, escopo: pick(['tudo', 'plano']) }; }
    const tela = cobrancasDoMes(box, OUT, HOJE);
    // A Fila mostra as vencidas e depois as a vencer, cada grupo do vencimento mais cedo ao mais tarde.
    const porDias = (/** @type {any[]} */ l) => l.slice().sort((x, y) => x.dias - y.dias || (String(x.a.id) < String(y.a.id) ? -1 : 1));
    const naTela = [...porDias(tela.vencidas), ...porDias([...tela.emBreve, ...tela.aVencer])];
    const naFila = visiveis(filaVazia(), sugestoesDaVarredura(box, HOJE), box);
    assert.deepEqual(naFila.map((m) => m.alunoId), naTela.map((c) => String(c.a.id)));
    naTela.forEach((c, k) => {
      assert.equal(naFila[k].texto, msgCobranca(c.a, OUT, c.valor, c.dias, c.soMensalidade, c.itens));
      assert.equal(naFila[k].gatilho, c.dias < 0 ? 'cobranca-vencida' : 'cobranca-a-vencer');
      if (c.dias >= 0) aVencer++;
      if (c.itens) { comExtrato++; assert.ok(itensFecham(c.itens, c.valor), 'o extrato soma o total'); } else curtos++;
    });
  }
  assert.ok(comExtrato > 100 && curtos > 50 && aVencer > 100, `cobertura: ${comExtrato} com extrato, ${curtos} curtos, ${aVencer} a vencer`);
});
