// @ts-check
/**
 * Etapa 7 (decisão 13): as permissões por time, as consultas, a validação das
 * propostas, a decisão do coach e a mensagem aprovada na Fila.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMES, CONSULTAS, TIPOS_DE_PROPOSTA, consultar, consultasDoTime, validarProposta, descricaoDaProposta, efeitoDaAprovacao,
  planoDaAprovacao, decidirProposta, pendentes, eventoDaProposta, validarRegistro, statusDoAluno, MAX_REGISTROS,
} from './agentes-regras.js?v=40';
import { sugestaoDaProposta, comSugestao, filaVazia, marcar, visiveis, textoDa } from './automacao-regras.js?v=40';
import { htmlProposta, htmlLog } from './aprovacoes-html.js?v=40';

const ana = { id: '001', nome: 'Ana', mensalidade: '130', vencimento: '10', pagamentos: {}, consumos: [], telefone: '11999990000', email: 'ana@x.com', plano: { vezes: 3 }, inicio: '2026-10-01' };
const ctx = (extra = {}) => ({ fichas: [ana], hojeIso: '2026-11-20', fechamentos: {}, meta: {}, ocupacao: [], consentimentos: ['ana@x.com'], ...extra });

test('os dois times e as listas fechadas', () => {
  assert.deepEqual([...TIMES], ['administrativo', 'alunos']);
  assert.deepEqual(consultasDoTime('administrativo'), ['alunos', 'lotacao', 'cobrancas', 'pagamentos', 'consumo', 'fechamento']);
  assert.deepEqual(consultasDoTime('alunos'), ['alunos', 'lotacao', 'frequencia', 'creditos', 'avaliacoes', 'metas', 'ficha-pendencias', 'em-atraso']);
  assert.ok(!CONSULTAS.avaliacoes.times.includes('administrativo'), 'avaliação é só do Time de Alunos');
  assert.deepEqual([...TIPOS_DE_PROPOSTA.administrativo], ['mensagem', 'baixa', 'divergencia']);
  assert.deepEqual([...TIPOS_DE_PROPOSTA.alunos], ['mensagem', 'meta', 'pendencia-ficha']);
});

test('consulta de outro time: 403; desconhecida: 400; time inventado: 403', () => {
  assert.equal(/** @type {any} */ (consultar('administrativo', 'avaliacoes', { aluno: '001' }, ctx())).status, 403);
  assert.equal(/** @type {any} */ (consultar('alunos', 'cobrancas', {}, ctx())).status, 403);
  assert.equal(/** @type {any} */ (consultar('alunos', 'tudo', {}, ctx())).status, 400);
  assert.equal(/** @type {any} */ (consultar('marketing', 'alunos', {}, ctx())).status, 403);
});

test('a consulta usa o mês pedido, ou o de hoje; e corta no máximo de registros', () => {
  const r = /** @type {any} */ (consultar('administrativo', 'cobrancas', { mes: '2026-10' }, ctx()));
  assert.equal(r.mes, '2026-10');
  assert.equal(/** @type {any} */ (consultar('administrativo', 'cobrancas', { mes: 'outubro' }, ctx())).mes, '2026-11');
  const muitos = Array.from({ length: MAX_REGISTROS + 5 }, (_, i) => ({ ...ana, id: String(i), nome: `A${i}` }));
  const c = /** @type {any} */ (consultar('administrativo', 'alunos', {}, ctx({ fichas: muitos })));
  assert.equal(c.registros, MAX_REGISTROS);
  assert.equal(c.cortado, true);
});

test('status do aluno: ativo, pausado, cortesia, inativo', () => {
  assert.equal(statusDoAluno(ana), 'ativo');
  assert.equal(statusDoAluno({ ...ana, status: 'pausado' }), 'pausado');
  assert.equal(statusDoAluno({ ...ana, cortesia: { motivo: 'x' } }), 'cortesia');
  assert.equal(statusDoAluno({ ...ana, status: 'inativo' }), 'inativo');
});

test('cobranças do Administrativo: a conta separada em mensalidade e consumo, sem a ficha', () => {
  const a = { ...ana, consumos: [{ id: 'c', nome: 'Gel', preco: 20, qtd: 2, unitario: 10, data: '2026-11-03', mesId: '2026-11' }], restricoes: ['ombro'] };
  const r = /** @type {any} */ (consultar('administrativo', 'cobrancas', { mes: '2026-11' }, ctx({ fichas: [a] })));
  assert.deepEqual(r.dados[0], {
    alunoId: '001', nome: 'Ana', mensalidade: 130, consumo: 20, dependentes: 0, total: 150, vencimento: '2026-11-10', situacao: 'vencido', pagavel: true, fechado: false,
  });
});

test('validar proposta: cada tipo no formato dele, só os campos conhecidos', () => {
  const ok = (/** @type {string} */ time, /** @type {any} */ corpo) => /** @type {any} */ (validarProposta(time, { alunoId: '001', motivo: 'motivo ok', ...corpo }, [ana], '2026-11-20'));
  assert.deepEqual(ok('alunos', { tipo: 'mensagem', dados: { texto: '  Oi, Ana!  ', extra: 'x' } }).proposta.dados, { texto: 'Oi, Ana!' });
  assert.deepEqual(ok('administrativo', { tipo: 'baixa', dados: { mesId: '2026-11', valor: '130', data: '2026-11-19', meio: 'pix-chave' } }).proposta.dados,
    { mesId: '2026-11', valor: 130, data: '2026-11-19', meio: 'pix-chave' });
  assert.equal(ok('administrativo', { tipo: 'baixa', dados: { mesId: '2026-11', valor: 130, data: '2026-11-21', meio: 'pix-chave' } }).status, 400, 'data no futuro');
  assert.equal(ok('administrativo', { tipo: 'baixa', dados: { mesId: '2026-11', valor: 130, data: '2026-11-19', meio: 'fiado' } }).status, 400, 'meio inventado');
  assert.deepEqual(ok('alunos', { tipo: 'meta', dados: { tipo: 'peso', alvo: 65, prazo: '2027-03-01' } }).proposta.dados, { tipo: 'peso', alvo: 65, prazo: '2027-03-01' });
  assert.equal(ok('alunos', { tipo: 'meta', dados: { tipo: 'supino', alvo: 100 } }).status, 400, 'tipo de meta que não existe');
  assert.equal(ok('alunos', { tipo: 'baixa', dados: {} }).status, 403, 'o Time de Alunos não propõe baixa');
  assert.equal(ok('administrativo', { tipo: 'mensagem', alunoId: '999', dados: { texto: 'x' } }).status, 400, 'aluno que não existe');
  assert.equal(/** @type {any} */ (validarProposta('alunos', { tipo: 'mensagem', alunoId: '001', motivo: '', dados: { texto: 'x' } }, [ana], '2026-11-20')).status, 400, 'sem motivo');
});

test('a proposta nos Registros: autor agente, situação proposta', () => {
  const v = /** @type {any} */ (validarProposta('alunos', { tipo: 'meta', alunoId: '001', motivo: 'quer emagrecer', dados: { tipo: 'peso', alvo: 65 } }, [ana], '2026-11-20')).proposta;
  const ev = eventoDaProposta(v, 'alunos', 5);
  assert.equal(ev.situacao, 'proposta');
  assert.deepEqual(ev.autor, { tipo: 'agente', nome: 'Time de Alunos' });
  assert.match(ev.resumo, /Time de Alunos propôs · Meta: Peso 65 kg/);
  assert.equal(/** @type {any} */ (validarRegistro('alunos', { resumo: 'ok' })).status, 400, 'resumo curto demais');
});

test('o que aprovar faz, por tipo', () => {
  const p = (/** @type {string} */ tipo, /** @type {any} */ dados) => ({ id: 'p1', time: 'alunos', tipo, alunoId: '001', dados });
  assert.deepEqual(planoDaAprovacao(p('mensagem', { texto: 'Oi' })), { acao: 'fila', alunoId: '001', texto: 'Oi' });
  assert.deepEqual(planoDaAprovacao(p('meta', { tipo: 'peso', alvo: 65 })), { acao: 'meta', alunoId: '001', tipo: 'peso', alvo: 65, prazo: null });
  assert.deepEqual(planoDaAprovacao(p('baixa', { mesId: '2026-11', valor: 130, data: '2026-11-19', meio: 'cartao' })),
    { acao: 'baixa', alunoId: '001', mesId: '2026-11', valor: 130, data: '2026-11-19', meio: 'cartao' });
  assert.deepEqual(planoDaAprovacao(p('divergencia', {})), { acao: 'ciente', alunoId: '001' });
  assert.match(efeitoDaAprovacao({ tipo: 'baixa' }), /janela de baixa/);
});

test('a decisão do coach: aprovar; recusar só com motivo; decidida não muda', () => {
  const p = { id: 'p1', time: 'administrativo', tipo: 'divergencia', alunoId: '001', alunoNome: 'Ana', situacao: 'proposta', em: 3, dados: { mesId: '2026-11', descricao: 'pagou 120' } };
  const a = decidirProposta(p, 'aprovada', { em: 10 });
  assert.ok(a);
  assert.deepEqual(a.patch, { situacao: 'aprovada', decisao: { por: 'coach', em: 10 } });
  assert.deepEqual(a.log.aprovacao, { por: { tipo: 'coach' }, em: 10, decisao: 'aprovada' });
  assert.deepEqual(a.log.proposta, { por: { tipo: 'agente', nome: 'Time Administrativo' }, via: 'funcao', em: 3 });
  assert.equal(a.log.situacao, 'executada');
  assert.equal(decidirProposta(p, 'recusada', { em: 10 }), null, 'recusar sem motivo');
  const r = decidirProposta(p, 'recusada', { em: 10, motivo: ' já resolvido ' });
  assert.deepEqual(r && r.patch, { situacao: 'recusada', decisao: { por: 'coach', em: 10, motivo: 'já resolvido' } });
  assert.equal(r && r.log.situacao, 'recusada');
  assert.equal(decidirProposta({ ...p, situacao: 'aprovada' }, 'recusada', { em: 10, motivo: 'x' }), null, 'já decidida');
});

test('pendentes: só as que esperam, da mais antiga para a mais nova', () => {
  const lista = pendentes({ a: { id: 'a', situacao: 'proposta', em: 5 }, b: { id: 'b', situacao: 'aprovada', em: 1 }, c: { id: 'c', situacao: 'proposta', em: 2 } });
  assert.deepEqual(lista.map((p) => p.id), ['c', 'a']);
});

test('a descrição de cada tipo', () => {
  assert.equal(descricaoDaProposta({ tipo: 'baixa', dados: { mesId: '2026-11', valor: 130, meio: 'cartao' } }).replace(/\s/g, ' '), 'Baixa de Novembro / 2026 · R$ 130,00 · cartao');
  assert.equal(descricaoDaProposta({ tipo: 'pendencia-ficha', dados: { campo: 'telefone', descricao: 'sem número' } }), 'Pendência na ficha: telefone — sem número');
});

test('a mensagem aprovada entra na Fila, uma vez só, com o texto do agente', () => {
  const p = { id: 'p9', alunoId: '001', time: 'alunos', dados: { texto: 'Oi, Ana! Seu crédito vence sexta.' } };
  const s = sugestaoDaProposta(p, 100);
  assert.ok(s);
  assert.equal(s.chave, 'agente:001:p9');
  const f1 = comSugestao(filaVazia(), s);
  assert.equal(f1.pendentes.length, 1);
  assert.equal(comSugestao(f1, s), f1, 'a mesma proposta não entra duas vezes');
  assert.equal(comSugestao(marcar(f1, s.chave, 'enviada', 200), s).pendentes.length, 0, 'enviada não volta');
  assert.equal(textoDa(s, ana), 'Oi, Ana! Seu crédito vence sexta.');
  const vistas = visiveis(f1, [], [ana]);
  assert.equal(vistas.length, 1);
  assert.equal(vistas[0].rotulo, 'Proposta de agente');
  assert.equal(sugestaoDaProposta({ ...p, dados: { texto: '  ' } }, 1), null, 'sem texto, nada');
});

test('o painel: a proposta escapa o texto do agente e o log não mostra dados', () => {
  const html = htmlProposta({ id: 'p1', time: 'alunos', tipo: 'mensagem', alunoId: '001', alunoNome: 'Ana', em: 1, motivo: '<b>x</b>', dados: { texto: '<script>alert(1)</script>' } });
  assert.ok(!html.includes('<script>'), 'o texto do agente vai escapado');
  assert.ok(html.includes('&lt;script&gt;'));
  const log = htmlLog([{ time: 'alunos', funcao: 'consultar', consulta: 'frequencia', registros: 12, ok: true, status: 200, em: 1000 }], 2000);
  assert.match(log, /Time de Alunos<\/b>: 1 chamada nas últimas 24h/);
  assert.match(log, /frequencia/);
});
