// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVISO_CATALOGO, renderCatalogo, renderFormExercicio, renderListaCatalogo } from './render-catalogo.js';

/** A resposta REAL do `listarCatalogoBox` (gerada e conferida pelo `checar-catalogo` das functions). */
const CATALOGO = JSON.parse(readFileSync(new URL('../core/fixtures/catalogo.json', import.meta.url), 'utf8'));
const estado = (extra = {}) => ({ carregado: true, dados: CATALOGO, modalidade: 'forca', busca: '', mostrarInativos: true, ocupado: false, ...extra });
const porId = (id) => CATALOGO.exercicios.find((e) => e.id === id);

test('sem dados: carregando, sem quebrar', () => {
  assert.match(renderCatalogo({ ...estado(), dados: null }), /Carregando o catálogo/);
});

test('a barra: abas com contagem, busca, desativados, novo e o aviso de quando vale', () => {
  const h = renderCatalogo(estado());
  for (const nome of ['Força · H1–H3', 'HIIT', 'Cross', 'Hyrox', 'Todos']) assert.ok(h.includes(nome), nome);
  assert.match(h, /data-cat-modalidade="forca"\s+aria-pressed="true"/);
  assert.match(h, /cat-conta">\d+\/\d+</, 'força com uma desativada mostra ativos/total');
  assert.ok(h.includes('id="cat-busca"') && h.includes('id="cat-inativos" checked') && h.includes('data-cat-novo'));
  assert.ok(h.includes(AVISO_CATALOGO.slice(0, 40)));
  assert.ok(h.includes('id="catalogo-lista"'));
});

test('cartão: nome, músculos, equipamento, adaptações, onde entra e selos', () => {
  const h = renderListaCatalogo(estado());
  const smith = h.split('data-cat-id="agachamento_smith"')[1].split('</article>')[0];
  assert.ok(smith.includes('Agachamento no Smith (barra guiada)'));
  assert.ok(smith.includes('<b>Quadríceps'), 'principal em negrito, com rótulo');
  assert.ok(smith.includes('Glúteo, Core'), 'secundários editados');
  assert.ok(smith.includes('cat-selo-editado') && smith.includes('No catálogo base: Agachamento no Smith<'), 'editado mostra o original');
  assert.ok(smith.includes('Joelho → '), 'adaptação com o nome do alvo');
  assert.ok(smith.includes('Força: Agachar (H1, H2, H3)'));
  assert.ok(smith.includes('data-cat-ativar="agachamento_smith" data-ativo="false"'), 'ativo: botão Desativar');

  const remada = h.split('data-cat-id="remada_curvada_barra"')[1].split('</article>')[0];
  assert.ok(h.includes('cat-ex inativo" data-cat-id="remada_curvada_barra"') && remada.includes('Desativado') && remada.includes('data-ativo="true"'),
    'desativado: selo e botão Ativar');
  const criado = h.split('data-cat-id="coach_remada_landmine"')[1].split('</article>')[0];
  assert.ok(criado.includes('Criado pelo coach'));
});

test('filtro de desativados, busca vazia e ocupado', () => {
  assert.ok(!renderListaCatalogo(estado({ mostrarInativos: false })).includes('remada_curvada_barra'));
  assert.match(renderListaCatalogo(estado({ busca: 'zzzz' })), /Nenhum exercício com essa busca/);
  assert.match(renderListaCatalogo(estado({ ocupado: true })), /data-cat-editar="[^"]+" disabled/);
});

test('Hyrox: as 8 estações da prova, só leitura, com a substituta', () => {
  const h = renderListaCatalogo(estado({ modalidade: 'hyrox' }));
  assert.equal((h.match(/<tr>/g) ?? []).length, 1 + 8, 'cabeçalho + 8 estações');
  assert.ok(h.includes('não se editam aqui'));
  assert.ok(!h.includes('data-cat-editar'), 'sem botão de editar');
  assert.ok(h.includes('Sem substituta'), 'Burpee Broad Jump e Rowing não têm');
});

test('formulário de criar: pede onde entra; o de editar mostra e não deixa mudar a vaga', () => {
  const novo = renderFormExercicio({ exercicio: null, vocabulario: CATALOGO.vocabulario, exercicios: CATALOGO.exercicios });
  assert.ok(novo.includes('name="instancia"') && novo.includes('name="estacao"') && novo.includes('name="cross"'));
  assert.ok(novo.includes('name="id" value=""'));
  assert.equal((novo.match(/name="principal"/g) ?? []).length, CATALOGO.vocabulario.musculos.length);
  assert.equal((novo.match(/name="equip"/g) ?? []).length, CATALOGO.vocabulario.equipamentos.length);

  const ed = renderFormExercicio({ exercicio: porId('agachamento_smith'), vocabulario: CATALOGO.vocabulario, exercicios: CATALOGO.exercicios, erro: 'Já existe "X".' });
  assert.ok(!ed.includes('name="instancia"'), 'editar não troca a vaga');
  assert.ok(ed.includes('Força: Agachar (H1, H2, H3)'));
  assert.ok(ed.includes('name="id" value="agachamento_smith"'));
  assert.match(ed, /name="principal" value="quadriceps" checked/);
  assert.match(ed, /name="secundario" value="core" checked/);
  assert.ok(ed.includes('role="alert">Já existe &quot;X&quot;.'), 'o erro do servidor no topo, escapado');
  assert.ok(!ed.includes('<option value="agachamento_smith"'), 'adaptação não oferece o próprio exercício');
  assert.ok(ed.includes('(desativado)'), 'alvo desativado marcado');
});
