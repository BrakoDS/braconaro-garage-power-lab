// @ts-check
/**
 * Os valores calculados da ficha: idade, peso e altura atuais, alerta médico,
 * situação financeira e os selos do cabeçalho.
 *
 * Rodar: node --test coach/gestao-de-alunos/perfil-derivados.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idadeDoAluno, biometriaAtual, alertaMedico, situacaoFinanceira, seloStatus, seloNivel } from './perfil-derivados.js?v=19';

const HOJE = '2026-10-11';

/* ---------- idade ---------- */

test('idade pelo nascimento, contando se já fez aniversário', () => {
  assert.equal(idadeDoAluno({ nascimento: '1990-10-11' }, HOJE), 36, 'aniversário hoje');
  assert.equal(idadeDoAluno({ nascimento: '1990-10-12' }, HOJE), 35, 'aniversário amanhã');
  assert.equal(idadeDoAluno({ nascimento: '1990-01-01' }, HOJE), 36);
});

test('o nascimento ganha do campo antigo `idade`, que envelhece parado', () => {
  assert.equal(idadeDoAluno({ nascimento: '1990-01-01', idade: '30' }, HOJE), 36);
});

test('sem nascimento, o campo antigo é a reserva; sem nada, null', () => {
  assert.equal(idadeDoAluno({ idade: '41' }, HOJE), 41);
  assert.equal(idadeDoAluno({}, HOJE), null);
  assert.equal(idadeDoAluno({ nascimento: 'lixo' }, HOJE), null);
  assert.equal(idadeDoAluno({ nascimento: '2030-01-01' }, HOJE), null, 'nascimento no futuro');
});

/* ---------- biometria ---------- */

test('peso e altura vêm da avaliação mais recente que tem a medida', () => {
  const a = {
    peso: '90', altura: '170',
    avaliacoes: [
      { num: 1, dataRealizada: '2026-01-10', peso: '88', estatura: '171' },
      { num: 2, dataRealizada: '2026-06-10', peso: '84,5', estatura: '' },
    ],
  };
  const b = biometriaAtual(a);
  assert.deepEqual(b.peso, { valor: 84.5, origem: 'avaliacao', num: 2, data: '2026-06-10' });
  assert.deepEqual(b.altura, { valor: 171, origem: 'avaliacao', num: 1, data: '2026-01-10' }, 'a nº 2 não mediu a altura');
});

test('a data manda na ordem, não o número da avaliação', () => {
  const b = biometriaAtual({ avaliacoes: [
    { num: 3, dataRealizada: '2026-01-10', peso: '88' },
    { num: 2, dataRealizada: '2026-05-10', peso: '85' },
  ] });
  assert.equal(b.peso.valor, 85);
});

test('sem avaliação com a medida, vale o cadastro', () => {
  const b = biometriaAtual({ peso: '80', altura: '175', avaliacoes: [{ num: 1, dataRealizada: '2026-01-10' }] });
  assert.deepEqual(b.peso, { valor: 80, origem: 'cadastro' });
  assert.deepEqual(b.altura, { valor: 175, origem: 'cadastro' });
});

test('sem dado nenhum (ou zero), vazio', () => {
  assert.deepEqual(biometriaAtual({}), { peso: { valor: null, origem: null }, altura: { valor: null, origem: null } });
  assert.equal(biometriaAtual({ peso: '0' }).peso.origem, null);
});

/* ---------- alerta médico ---------- */

const comLesoes = (lesoes, extra = {}) => ({ matrizIndividualizacao: { adaptacoes: { lesoes } }, ...extra });
const parqCom = (r) => ({ respostas: { q0: 'nao', q1: 'nao', q2: 'nao', q3: 'nao', q4: 'nao', q5: 'nao', q6: 'nao', ...r } });

test('sem lesão e PAR-Q todo "Não": sem alerta', () => {
  assert.deepEqual(alertaMedico({}), { nivel: null, motivos: [] });
  assert.equal(alertaMedico({ parq: parqCom({}) }).nivel, null);
});

test('lesão moderada ou severa: vermelho', () => {
  assert.equal(alertaMedico(comLesoes([{ regiao: 'joelho', gravidade: 'moderada' }])).nivel, 'vermelho');
  const r = alertaMedico(comLesoes([{ regiao: 'ombro', gravidade: 'leve' }, { regiao: 'lombar', gravidade: 'severa' }]));
  assert.equal(r.nivel, 'vermelho', 'uma grave basta');
  assert.deepEqual(r.motivos, ['Lesão leve · Ombro', 'Lesão severa · Lombar']);
});

test('lesão leve: âmbar', () => {
  assert.deepEqual(alertaMedico(comLesoes([{ regiao: 'punho', gravidade: 'leve' }])), { nivel: 'ambar', motivos: ['Lesão leve · Punho'] });
});

test('PAR-Q com "Sim": âmbar, mesmo com a triagem incompleta', () => {
  assert.deepEqual(alertaMedico({ parq: parqCom({ q4: 'sim' }) }), { nivel: 'ambar', motivos: ['PAR-Q com resposta "Sim"'] });
  assert.equal(alertaMedico({ parq: { respostas: { q0: 'sim' } } }).nivel, 'ambar');
});

test('PAR-Q com "Sim" não sobe para vermelho sozinho, mas soma ao motivo', () => {
  const r = alertaMedico(comLesoes([{ regiao: 'joelho', gravidade: 'severa' }], { parq: parqCom({ q1: 'sim' }) }));
  assert.equal(r.nivel, 'vermelho');
  assert.deepEqual(r.motivos, ['Lesão severa · Joelho', 'PAR-Q com resposta "Sim"']);
});

test('texto livre de dor ou observação não acende o selo', () => {
  assert.equal(alertaMedico({ obs: 'dor no joelho', anamnese: { doresLesoes: 'ombro' } }).nivel, null);
});

test('lesão sem região válida é ignorada (a mesma limpeza que o Motor faz)', () => {
  assert.equal(alertaMedico(comLesoes([{ regiao: 'xyz', gravidade: 'severa' }])).nivel, null);
});

/* ---------- situação financeira ---------- */

// Vence dia 10: em 11/10 a fatura de outubro já venceu.
const plano = { id: '001', nome: 'Ana', mensalidade: '150', vencimento: '10', criadoEm: Date.parse('2026-10-01T12:00:00') };

test('fatura vencida e não paga: atrasado', () => {
  const r = situacaoFinanceira(plano, [plano], HOJE);
  assert.equal(r.tipo, 'atrasado');
  assert.equal(r.rotulo, 'Atrasado');
  assert.ok(r.atrasado > 0);
});

test('fatura paga: em dia', () => {
  const a = { ...plano, pagamentos: { '2026-10': true } };
  assert.equal(situacaoFinanceira(a, [a], HOJE).tipo, 'em-dia');
});

test('fatura em aberto dentro do prazo: a vencer', () => {
  const a = { ...plano, vencimento: '20' };
  const r = situacaoFinanceira(a, [a], HOJE);
  assert.equal(r.tipo, 'a-vencer');
  assert.ok(r.emAberto > 0 && r.atrasado === 0);
});

test('sem mensalidade: sem plano', () => {
  const a = { id: '002', nome: 'Bia' };
  assert.equal(situacaoFinanceira(a, [a], HOJE).tipo, 'sem-plano');
});

test('conta acertada por outro aluno: coberto, com o nome dele', () => {
  const resp = { ...plano, pagamentos: { '2026-10': true } };
  const dep = { id: '003', nome: 'Caio', mensalidade: '150', vencimento: '10', criadoEm: plano.criadoEm, pagoPor: { id: '001', escopo: 'tudo' } };
  const r = situacaoFinanceira(dep, [resp, dep], HOJE);
  assert.equal(r.tipo, 'coberto');
  assert.equal(r.rotulo, 'Na conta de Ana');
});

/* ---------- selos ---------- */

test('selo de status: o da ficha, e ativo quando não tem', () => {
  assert.deepEqual(seloStatus({ status: 'inativo' }), { valor: 'inativo', rotulo: 'Inativo' });
  assert.deepEqual(seloStatus({ status: 'pendente' }), { valor: 'pendente', rotulo: 'Pendente' });
  assert.deepEqual(seloStatus({}), { valor: 'ativo', rotulo: 'Ativo' });
  assert.deepEqual(seloStatus({ status: 'lixo' }), { valor: 'ativo', rotulo: 'Ativo' });
});

test('selo de nível: os três níveis do Motor, e nada sem nível', () => {
  assert.deepEqual(seloNivel({ nivel: 'avancado' }), { valor: 'avancado', rotulo: 'Avançado' });
  assert.deepEqual(seloNivel({ nivel: 'iniciante' }), { valor: 'iniciante', rotulo: 'Iniciante' });
  assert.equal(seloNivel({}), null);
  assert.equal(seloNivel({ nivel: 'rx' }), null, 'nível que o Motor não conhece não vira selo');
});
