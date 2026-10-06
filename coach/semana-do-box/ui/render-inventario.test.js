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

/** Inventário depois do HIIT: os 9 recursos novos e a turma. A forma do servidor (`lerInventario`). */
const DOC_HIIT = {
  equipamentos: {
    ...DOC.equipamentos,
    kettlebell: { total: 10, emManutencao: 0, observacao: '8 kg · 2× 10 kg · 2× 12 kg · 2× 16 kg · 18 kg · 20 kg · 22 kg' },
    wallBall: { total: 4, emManutencao: 0, observacao: '2× 10 lb · 2× 14 lb' },
    caixote: { total: 4, emManutencao: 0, observacao: '' },
    cordaNaval: { total: 2, emManutencao: 0, observacao: '4 m' },
    cordaPular: { total: 2, emManutencao: 0, observacao: '' },
    sandbag: { total: 1, emManutencao: 0, observacao: '20 kg' },
    airbike: { total: 2, emManutencao: 1, observacao: 'corrente' },
    trx: { total: 2, emManutencao: 0, observacao: 'instalados' },
    halteres: { total: 4, emManutencao: 0, observacao: 'pares, torres de 1 a 10 kg' },
  },
  limitesAtivos: {
    ...DOC.limitesAtivos, kettlebell: 10, wallBall: 4, caixote: 4, cordaNaval: 2, cordaPular: 2, sandbag: 1, airbike: 1, trx: 2, halteres: 4,
  },
  alunosPorAula: 6,
};
const originalHiit = linhasDoInventario(DOC_HIIT);
const copiaHiit = () => originalHiit.map((l) => ({ ...l }));

test('HIIT: seção própria, depois da força, com a turma no topo', () => {
  const h = renderInventario({ original: originalHiit, editado: copiaHiit(), turmaOriginal: 6, turma: 6 });
  const forca = h.indexOf('<h3 class="inv-secao">Força (bloco H)</h3>');
  const hiit = h.indexOf('<h3 class="inv-secao">HIIT</h3>');
  assert.ok(forca >= 0 && hiit > forca, 'força primeiro, HIIT depois');
  assert.ok(h.indexOf('<h3>Smith</h3>') < hiit && h.indexOf('<h3>Kettlebell</h3>') > hiit, 'cada recurso na sua seção');
  for (const nome of ['Kettlebell', 'Wall ball', 'Caixote', 'Corda naval', 'Corda de pular', 'Sandbag', 'Air bike', 'TRX', 'Par de halteres']) {
    assert.ok(h.includes(`<h3>${nome}</h3>`), nome);
  }
  assert.ok(h.indexOf('<h3>Alunos por aula</h3>') > hiit && h.indexOf('<h3>Alunos por aula</h3>') < h.indexOf('<h3>Kettlebell</h3>'),
    'a turma abre a seção do HIIT');
  assert.ok(h.includes('→ até 2 alunos por estação'), 'turma de 6: 2 por estação');
  assert.ok(h.includes('2× 14 lb'), 'os pesos aparecem na observação');
  assert.match(h, /data-inv-salvar disabled/, 'nada mudou');
});

test('HIIT: a turma muda, o cartão marca "Não salvo" e o salvar libera', () => {
  const h = renderInventario({ original: originalHiit, editado: copiaHiit(), turmaOriginal: 6, turma: 9 });
  assert.match(h, /inv-turma alterado/);
  assert.ok(h.includes('→ até 3 alunos por estação'));
  assert.match(h, /data-inv-salvar>/);
  assert.match(renderInventario({ original: originalHiit, editado: copiaHiit(), turmaOriginal: 1, turma: 1 }),
    /data-inv="turma" data-recurso="turma" data-passo="-1"\s+aria-label="Turma máxima: menos um" disabled/, 'turma não desce de 1');
  assert.match(renderInventario({ original: originalHiit, editado: copiaHiit(), turmaOriginal: 40, turma: 40 }),
    /data-passo="1"\s+aria-label="Turma máxima: mais um" disabled/, 'nem passa de 40');
  assert.ok(!renderInventario({ original, editado: copia() }).includes('Alunos por aula'),
    'sem turma (inventário ainda não normalizado): sem cartão, em vez de inventar 6');
});

test('HIIT: semana afetada só pelo HIIT mostra o texto do alerta', () => {
  const h = renderInventario({
    original: originalHiit, editado: copiaHiit(), turmaOriginal: 6, turma: 6,
    ultimo: {
      reconferidas: 1,
      semanasAfetadas: [{
        semanaId: '2026-W43', status: 'rascunho', alertas: [],
        alertasHiit: [{ recurso: 'trx', usado: 4, limite: 2, slot: 2, exercicios: ['flexao_trx', 'fallout_trx'], dias: ['sexta', 'sabado'] }],
      }],
    },
  });
  assert.ok(h.includes('Semana 2026-W43 · rascunho'));
  assert.ok(h.includes('Limite de TRX atingido no slot 2 do HIIT (sexta e sábado): 4 em uso, 2 ativos.'));
});
