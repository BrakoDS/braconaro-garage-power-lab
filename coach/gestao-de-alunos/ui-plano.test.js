// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-plano.test.js
 *
 * O plano no card Financeiro (etapa 6.1): o resumo, o valor deste mês e o de
 * jan/2027, os botões certos para cada situação e as tabelas de preço.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

const { htmlPlanoResumo, htmlTabelas } = await import('./ui-plano.js?v=36');

const HOJE = '2026-11-20';
const ana = { id: 'Ana01', nome: 'Ana', status: 'ativo', mensalidade: '130', vencimento: '10', plano: { vezes: 3, prazo: 'mensal' }, fundador: true, inicio: '2026-07-01' };

test('resumo: plano, tabela, início, o valor de hoje e o de jan/2027', () => {
  const h = htmlPlanoResumo(ana, [ana], HOJE);
  assert.match(h, /3x por semana <span class="ac-chip fg-ok">Fundador<\/span>/);
  assert.match(h, /01\/07\/2026/);
  assert.match(h, /Mensalidade de nov\/2026<\/dt><dd><b>R\$\s?130,00<\/b>/);
  assert.match(h, /A partir de jan\/2027<\/dt><dd><b>R\$\s?190,00<\/b>/);
  assert.match(h, /data-plano="pausar"/);
  assert.match(h, /data-plano="dupla"/);
  assert.match(h, /data-plano="instagram" aria-pressed="false">Instagram de nov\/2026/);
  assert.doesNotMatch(h, /data-plano="voltar"|data-plano="indicacoes"|data-plano="semanas"/);
  assert.match(h, /data-plano="tabelas"/);
});

test('resumo: sem plano, vale o valor da ficha e não mostra jan/2027', () => {
  const h = htmlPlanoResumo({ id: 'X', mensalidade: '150' }, [], HOJE);
  assert.match(h, /Sem plano: vale o valor da ficha/);
  assert.doesNotMatch(h, /A partir de jan\/2027/);
});

test('resumo: pausado mostra a pausa e o botão de voltar', () => {
  const p = { ...ana, status: 'pausado', pausas: [{ desde: '2026-11-05', motivo: 'Viagem' }] };
  const h = htmlPlanoResumo(p, [p], '2026-12-02');
  assert.match(h, /Pausa<\/dt><dd>desde 05\/11\/2026 · Viagem/);
  assert.match(h, /Plano pausado: mensalidade zero/);
  assert.match(h, /data-plano="voltar"/);
  assert.doesNotMatch(h, /data-plano="pausar"/);
});

test('resumo: bônus, cortesia, indicações e o botão das semanas', () => {
  const novo = { id: 'N1', nome: 'Nina', indicadoPor: { id: 'Ana01', nome: 'Ana', mes: '2026-12' }, pagamentos: {}, recebimentos: {} };
  const a = { ...ana, dupla: { id: 'B', nome: 'Bia' }, instagram: ['2026-11'], cortesia: { motivo: 'Parceria Clínica' } };
  const h = htmlPlanoResumo(a, [a, novo], HOJE);
  assert.match(h, /Dupla com Bia · 10%/);
  assert.match(h, /Instagram: nov\/2026/);
  assert.match(h, /Cortesia<\/dt><dd>Parceria Clínica/);
  assert.match(h, /data-plano="indicacoes">Indicações \(1\)/);
  assert.match(h, /aria-pressed="true">✓ Instagram/);
  const volta = { ...ana, status: 'ativo', pausas: [{ desde: '2026-11-03', ate: '2026-12-15' }] };
  assert.match(htmlPlanoResumo(volta, [volta], '2026-12-16'), /data-plano="semanas"/, 'voltou no meio do mês: dá para corrigir as semanas');
});

test('resumo: o texto da ficha é escapado', () => {
  const h = htmlPlanoResumo({ ...ana, cortesia: { motivo: '<script>x</script>' } }, [], HOJE);
  assert.doesNotMatch(h, /<script>/);
});

test('as tabelas de preço', () => {
  const h = htmlTabelas();
  assert.match(h, /3x mensal<\/th><td>R\$\s?190,00<\/td><td>R\$\s?260,00/);
  assert.match(h, /2x mensal \(Legado\)<\/th><td>R\$\s?150,00<\/td><td><span class="card-vazio">—/);
  assert.match(h, /Ilimitado \(5–6x\)<\/th><td>R\$\s?250,00<\/td><td>R\$\s?350,00/);
  assert.match(h, /somados até 30%/);
});

/* ---------- Etapa 6.2: o contrato no card ---------- */

const tri = { id: 'c1', prazo: 'trimestral', vezes: 3, inicio: '2027-01', valorMensal: 180, pctBonus: 0, total: 540 };

test('contrato em curso: a linha, Trancar no lugar de Pausar, e Encerrar antes', () => {
  const a = { ...ana, plano: { vezes: 3, prazo: 'trimestral' }, contratos: [tri] };
  const h = htmlPlanoResumo(a, [a], '2027-02-10');
  assert.match(h, /Contrato<\/dt><dd>trimestral, jan\/2027 a mar\/2027 · R\$\s?540,00 de uma vez · trancamento: 0 de 1/);
  assert.match(h, /data-plano="trancar"/);
  assert.doesNotMatch(h, /data-plano="pausar"|data-plano="fechar-contrato"/);
  assert.match(h, /data-plano="encerrar"/);
  assert.match(h, /Coberto pelo contrato trimestral/);
});

test('sem contrato: Fechar contrato; perto do fim: o aviso com Renovar e Passar para mensal', () => {
  assert.match(htmlPlanoResumo(ana, [ana], '2026-12-10'), /data-plano="fechar-contrato"/);
  const a = { ...ana, contratos: [tri] };
  const h = htmlPlanoResumo(a, [a], '2027-03-10');
  assert.match(h, /Fim do contrato<\/dt><dd><b>termina em 31\/03\/2027<\/b>/);
  assert.match(h, /data-plano="renovar"/);
  assert.match(h, /data-plano="mensal"/);
});

test('contrato encerrado sem devolução: o botão Registrar devolução', () => {
  const a = { ...ana, contratos: [{ ...tri, saida: { ultimoMes: '2027-01', mesesQueFaltam: 2, valorQueFalta: 360, multa: 72, devolucao: 288 } }] };
  const h = htmlPlanoResumo(a, [a], '2027-02-10');
  assert.match(h, /encerrado em jan\/2027 · devolver R\$\s?288,00/);
  assert.match(h, /data-plano="devolucao"/);
  const devolvido = { ...a, contratos: [{ ...a.contratos[0], devolucao: { valor: 288, data: '2027-02-05', meio: 'pix-chave' } }] };
  assert.doesNotMatch(htmlPlanoResumo(devolvido, [devolvido], '2027-02-10'), /data-plano="devolucao"/);
});
