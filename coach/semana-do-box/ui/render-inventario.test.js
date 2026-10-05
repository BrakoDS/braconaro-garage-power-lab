// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhasDoInventario } from '../core/vista.js';
import { AVISO_ACADEMIA, renderInventario } from './render-inventario.js';

/** A forma que `salvarInventarioBox` devolve e que `inventario/atual` guarda. */
const DOC = {
  equipamentos: {
    smith: { total: 2, emManutencao: 1, observacao: 'cabo rompido' },
    banco: { total: 2, emManutencao: 0, observacao: '' },
    monocross: { total: 3, emManutencao: 0, observacao: '' },
    maquinaLegs: { total: 1, emManutencao: 0, observacao: '' },
    cavalinho: { total: 2, emManutencao: 0, observacao: '' },
  },
  limitesAtivos: { smith: 1, banco: 2, monocross: 3, maquinaLegs: 1, cavalinho: 2 },
};
const original = linhasDoInventario(DOC);
const copia = () => original.map((l) => ({ ...l }));

test('as 5 linhas, os ativos do servidor e o aviso da Academia', () => {
  const h = renderInventario({ original, editado: copia() });
  for (const nome of ['Smith', 'Banco', 'Monocross', 'Máquina de pernas', 'Cavalinho']) assert.ok(h.includes(`<h3>${nome}</h3>`), nome);
  assert.ok(h.includes(AVISO_ACADEMIA));
  assert.match(h, /<span class="inv-ativos">1 ativo<\/span>/, 'smith com 1 em manutenção: 1 ativo');
  assert.match(h, /inv-linha em-manutencao/);
  assert.match(h, /data-inv-salvar disabled/, 'sem alteração, salvar fica travado');
});

test('linha alterada: selo "Não salvo" no lugar dos ativos, salvar liberado', () => {
  const editado = copia();
  editado[0].emManutencao = 2;
  const h = renderInventario({ original, editado });
  assert.match(h, /inv-linha alterado em-manutencao/);
  assert.ok(h.includes('Não salvo'));
  assert.match(h, /data-inv-salvar>/);
});

test('os seletores respeitam os limites: manutenção nunca passa do total', () => {
  const editado = copia();
  editado[3].emManutencao = 1; // maquinaLegs: total 1
  const h = renderInventario({ original, editado });
  assert.match(h, /data-inv="emManutencao" data-recurso="maquinaLegs" data-passo="1"\s+aria-label="Em manutenção: mais um" disabled/);
  assert.match(h, /data-inv="total" data-recurso="banco" data-passo="-1"\s+aria-label="Total no box: menos um">/);
});

test('resultado: semanas afetadas com o alerta, a ação e o atalho', () => {
  const h = renderInventario({
    original, editado: copia(),
    ultimo: { reconferidas: 2, semanasAfetadas: [{ semanaId: '2026-W42', status: 'publicado', alertas: [{ dia: 'segunda', recurso: 'smith', usado: 2, limite: 1 }] }] },
  });
  assert.match(h, /role="alert"/);
  assert.ok(h.includes('1 semana passa do limite'));
  assert.ok(h.includes('Semana 2026-W42 · publicada'));
  assert.ok(h.includes('Limite de Smiths atingido na segunda: 2 em uso, 1 ativo.'));
  assert.match(h, /data-abrir-semana="2026-W42"/);
});

test('resultado: tudo certo, ou reconferência que falhou', () => {
  assert.ok(renderInventario({ original, editado: copia(), ultimo: { reconferidas: 2, semanasAfetadas: [] } })
    .includes('2 semanas em aberto foram reconferidas: nenhuma passa do limite.'));
  assert.ok(renderInventario({ original, editado: copia(), ultimo: { reconferidas: 0, semanasAfetadas: null } })
    .includes('as semanas não foram reconferidas'));
});

test('ocupado trava tudo; observação é escapada', () => {
  const editado = copia();
  editado[0].observacao = '<b>x</b>';
  const h = renderInventario({ original, editado, ocupado: true });
  assert.match(h, /data-inv-salvar disabled/);
  assert.ok(!h.includes('<b>x</b>') && h.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.equal(renderInventario({ original: [], editado: [] }).includes('Carregando'), true);
});
