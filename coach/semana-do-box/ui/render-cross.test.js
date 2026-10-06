// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linhasDoInventario } from '../core/vista.js';
import { esc, renderSemana } from './render.js';
import { renderInventario } from './render-inventario.js';
import { renderAvisoCross, renderOpcoesCross, renderOpcoesFoco, renderOpcoesHyrox } from './render-troca.js';

/** Saída real do gerador do servidor (W44, variação 21) — ver `core/fixtures/semana-cross-hyrox.json`. */
const W44 = JSON.parse(readFileSync(new URL('../core/fixtures/semana-cross-hyrox.json', import.meta.url), 'utf8'));
const W42 = JSON.parse(readFileSync(new URL('../core/fixtures/semana-w42.json', import.meta.url), 'utf8'));
const BASE = { chave: '2026-W44', rotulo: '26/10 a 31/10', inicio: '2026-10-26' };
/** O pedaço do HTML de `ini` até `fim` (ou o fim). */
const fatia = (h, ini, fim) => h.slice(h.indexOf(ini), fim ? h.indexOf(fim, h.indexOf(ini)) : undefined);
const wodHtml = (doc, hoje) => fatia(renderSemana({ ...BASE, doc, hoje }), 'metabolico wod', '</ol>');
const hyroxHtml = (doc, hoje) => fatia(renderSemana({ ...BASE, doc, hoje }), 'metabolico hyrox', '</table>');

test('WOD no cartão da terça: formato, movimentos com RX/Scaled, carga e por lado', () => {
  const w = W44.dias.terca.cross;
  const h = wodHtml(W44, '2026-10-20');
  assert.ok(h.includes('Cross <span class="mut">· Técnica / Força + WOD</span>'));
  assert.ok(h.includes('<span class="cross-n">2</span> WOD <span class="mut">· Chipper · cap 15 min</span>'));
  assert.ok(h.includes(esc(w.descricao)));
  assert.equal((h.match(/class="wod-mov[ "]/g) || []).length, w.movimentos.length);
  for (const m of w.movimentos) assert.ok(h.includes(`<span class="ex-nome">${esc(m.nome)}</span>`), m.nome);
  const clean = w.movimentos.find((m) => m.exercicioId === 'power_clean');
  assert.ok(h.includes(`<b>RX</b> ${clean.rx} <span class="mut">·</span> <b>Scaled</b> ${clean.scaled}`));
  assert.ok(h.includes(`Carga ${esc(clean.carga.rx)} · Scaled ${esc(clean.carga.scaled)}`));
  assert.ok(h.includes(' por lado'), 'a remada unilateral é por lado');
  assert.equal((h.match(/data-trocar-cross=/g) || []).length, w.movimentos.length, 'um "trocar" por movimento');
  const tudo = renderSemana({ ...BASE, doc: W44, hoje: '2026-10-20' });
  assert.ok(tudo.includes('até 2 alunos por movimento'), 'rodapé com a conta da turma');
  assert.equal((tudo.match(/metabolico wod/g) || []).length, 1, 'só a terça tem WOD');
});

test('a aula principal vem primeiro no cartão: o WOD da terça antes do H1 de catch-up', () => {
  const tudo = renderSemana({ ...BASE, doc: W44, hoje: '2026-10-20' });
  const terca = fatia(tudo, '<h3>Terça', '<h3>Quarta');
  assert.ok(terca.indexOf('metabolico wod') < terca.indexOf('(catch-up)'), 'terça: WOD, depois o H1');
  const sabado = fatia(tudo, '<h3>Sábado');
  assert.ok(sabado.indexOf('data-ver-hiit') < sabado.indexOf('(catch-up)'), 'sábado: HIIT, depois o H3');
  const segunda = fatia(tudo, '<h3>Segunda', '<h3>Terça');
  assert.ok(segunda.includes('class="forca"'), 'segunda: o H1 é a aula');
});

test('Hyrox no cartão da quinta: formato, corrida, air bike e as estações nos 4 níveis', () => {
  const hy = W44.dias.quinta.hyrox;
  const h = hyroxHtml(W44, '2026-10-20');
  assert.ok(h.includes('Hyrox <span class="mut">· Compromised running · 2 rodadas</span>'));
  assert.ok(h.includes('<th scope="col" title="Iniciante">Ini</th>') && h.includes('<th scope="col" title="Competição">Comp</th>'));
  assert.ok(h.includes('<td class="hy-num">100</td><td class="hy-num">300</td><td class="hy-num">500</td><td class="hy-num">1000</td>'), 'corrida');
  assert.ok(h.includes('<td class="hy-num">50 s</td><td class="hy-num">1 min</td>'), 'air bike');
  assert.equal((h.match(/<tr class="hy-estacao/g) || []).length, hy.estacoes.length);
  const wb = hy.estacoes.find((e) => e.estacao === 'wall_ball');
  assert.ok(h.includes(`<td class="hy-num">${wb.prescricao.iniciante}</td><td class="hy-num">${wb.prescricao.intermediario}</td>`), 'a prescrição gravada, por nível');
  assert.equal((h.match(/data-trocar-hyrox=/g) || []).length, hy.estacoes.length, 'toda estação desta semana tem substituta');
});

test('Hyrox: estação na substituta tem o selo com a da prova; Burpee Broad Jump não tem "trocar"', () => {
  const hy = W44.dias.quinta.hyrox;
  const estacoes = hy.estacoes.map((e) => (e.estacao === 'sled_push'
    ? { ...e, nome: 'Plate push (anilha no turf)', substituta: true } : e));
  estacoes.push({ ...hy.estacoes[0], estacao: 'burpee_broad_jump', n: 4, nome: 'Burpee Broad Jump', base: 'Burpee Broad Jump' });
  const doc = { ...W44, dias: { ...W44.dias, quinta: { ...W44.dias.quinta, hyrox: { ...hy, estacoes } } } };
  const h = hyroxHtml(doc, '2026-10-20');
  assert.ok(h.includes('<tr class="hy-estacao substituta">'));
  assert.ok(h.includes('<span class="hy-sub">substituta de Sled Push</span>'));
  assert.ok(!h.includes('data-trocar-hyrox="burpee_broad_jump"'), 'sem substituta, sem trocar');
});

test('alertas do WOD e do Hyrox: caixa vermelha, itens marcados, dia estourado e contagem na lista', () => {
  const doc = {
    ...W44,
    alertasCross: [{ recurso: 'barraOlimpica', usado: 6, limite: 4, exercicios: ['power_clean'], dias: ['terca'] }],
    alertasHyrox: [{ estacao: 'sled_push', recurso: 'sled', precisa: 1, limite: 0, temSubstituta: true, dias: ['quinta'] }],
  };
  const tudo = renderSemana({ ...BASE, doc, hoje: '2026-10-20' });
  const wod = fatia(tudo, 'metabolico wod', '</ol>');
  assert.ok(wod.includes('Equipamento do WOD acima do limite'));
  assert.ok(wod.includes('Limite de Barras olímpicas atingido no WOD (terça): 6 em uso, 4 ativos — Power clean (barra).'));
  assert.equal((wod.match(/class="wod-mov em-alerta"/g) || []).length, 1);
  const hy = fatia(tudo, 'metabolico hyrox', '</table>');
  assert.ok(hy.includes('No Hyrox (quinta), Sled Push (empurrar trenó) precisa de 1 Sled (trenó), e o box tem 0 ativos — troque pela substituta.'));
  assert.ok(hy.includes('<tr class="hy-estacao em-alerta">'));
  assert.equal((tudo.match(/class="card dia dia-estourado"/g) || []).length, 2, 'terça e quinta');
  assert.ok(!wodHtml(W44, '2026-10-20').includes('metab-alerta'), 'sem alerta, sem caixa');
});

test('trava: semana publicada não mostra "trocar" no dia que passou; ocupado é só leitura', () => {
  const pub = { ...W44, status: 'publicado' };
  assert.ok(!wodHtml(pub, '2026-10-28').includes('data-trocar-cross'), 'quarta: a terça passou');
  assert.ok(hyroxHtml(pub, '2026-10-28').includes('data-trocar-hyrox'), 'quarta: a quinta não passou');
  const h = renderSemana({ ...BASE, doc: W44, hoje: '2026-10-20', ocupado: true });
  assert.ok(!h.includes('data-trocar-cross') && !h.includes('data-trocar-hyrox'));
});

test('semana de antes do Cross/Hyrox: o dia continua só sinalizando', () => {
  const h = renderSemana({ chave: '2026-W42', rotulo: '12/10 a 17/10', inicio: '2026-10-12', doc: W42, hoje: '2026-10-01' });
  assert.ok(!h.includes('metabolico wod') && !h.includes('metabolico hyrox'));
  assert.ok(h.includes('<h4>Cross <span class="mut">· WOD</span></h4>') && h.includes('<h4>Hyrox <span class="mut">· For Time</span></h4>'));
});

test('inventário: a seção Cross / Hyrox com barras e sled', () => {
  const doc = {
    equipamentos: {
      smith: { total: 2, emManutencao: 0, observacao: '' },
      barraOlimpica: { total: 4, emManutencao: 0, observacao: '2× 2,0 m · 2× 1,5 m, com anilhas' },
      sled: { total: 1, emManutencao: 1, observacao: '' },
    },
    limitesAtivos: { smith: 2, barraOlimpica: 4, sled: 0 },
  };
  const linhas = linhasDoInventario(doc);
  const h = renderInventario({ original: linhas, editado: linhas.map((l) => ({ ...l })), turmaOriginal: 6, turma: 6 });
  const secao = fatia(h, '<h3 class="inv-secao">Cross / Hyrox</h3>', 'inv-acoes');
  assert.ok(secao.includes('<h3>Barra olímpica</h3>') && secao.includes('<h3>Sled (trenó)</h3>'));
  assert.ok(secao.includes('0 ativos'), 'sled em manutenção');
  assert.ok(h.indexOf('Cross / Hyrox') > h.indexOf('<h3 class="inv-secao">HIIT</h3>'), 'depois do HIIT');
  assert.ok(h.includes('No WOD do Cross, o EMOM conta a turma inteira'), 'a turma explica o WOD');
});

/** Uma resposta de `opcoesTrocaCrossBox` no formato do servidor (`edicao-cross.ts`). */
const sem = { noWod: false, padraoRepetido: null, tiraOCardio: false, equipamento: [], semanaAnterior: false };
const R = {
  vaga: { posicao: 3, formato: 'Chipper', dias: ['terca'], atual: { exercicioId: 'flexao', nome: 'Flexão de braço', padrao: 'empurrar' } },
  opcoes: [
    { exercicioId: 'flexao_pike', nome: 'Flexão pike', padrao: 'empurrar', conflitos: sem, bloqueada: false },
    { exercicioId: 'burpee', nome: 'Burpee', padrao: 'corpo_todo', conflitos: { ...sem, semanaAnterior: true }, bloqueada: false },
    { exercicioId: 'kb_swing', nome: 'Kettlebell swing', padrao: 'quadril', conflitos: { ...sem, noWod: true }, bloqueada: true },
    { exercicioId: 'push_press', nome: 'Push press', padrao: 'empurrar', conflitos: { ...sem, equipamento: ['barraOlimpica'] }, bloqueada: true },
  ],
};

test('troca no WOD: lista com o padrão, bloqueadas desabilitadas e o aviso do rodízio', () => {
  const h = renderOpcoesCross(R);
  assert.ok(h.includes('WOD · movimento 3') && h.includes('Chipper · terça') && h.includes('Hoje: Flexão de braço'));
  assert.match(h, /data-acao="escolher:flexao_pike"/);
  assert.match(h, /data-acao="escolher:burpee"/);
  assert.doesNotMatch(h, /escolher:kb_swing/);
  assert.doesNotMatch(h, /escolher:push_press/);
  assert.ok(h.includes('já no WOD') && h.includes('🔧 Barras olímpicas') && h.includes('↺ semana passada'));
  assert.ok(h.includes('<span class="troca-inst">Corpo todo</span>'));
  const aviso = renderAvisoCross(R, R.opcoes[1]);
  assert.equal(aviso.titulo, 'Trocar por Burpee?');
  assert.ok(aviso.corpoHTML.includes('quebra o rodízio'));
  assert.deepEqual(aviso.acoes.map((a) => a.id), ['manter', 'outro']);
  const nada = renderOpcoesCross({ ...R, opcoes: R.opcoes.filter((o) => o.bloqueada) });
  assert.ok(nada.includes('Nenhuma opção cabe agora'));
});

test('troca no Hyrox: a outra variante, com a prescrição de prova; sem equipamento fica desabilitada', () => {
  const r = {
    vaga: { estacao: 'sled_push', n: 2, base: 'Sled Push', dias: ['quinta'], atual: { nome: 'Sled Push (empurrar trenó)', substituta: false } },
    opcoes: [{
      substituta: true, nome: 'Plate push (anilha no turf)', tipo: 'metros', carga: 'anilha de 15–20 kg',
      prescricao: { iniciante: 20, intermediario: 30, avancado: 40, competicao: 100 }, equipamento: [], bloqueada: false,
    }],
  };
  const h = renderOpcoesHyrox(r);
  assert.ok(h.includes('Hyrox · estação 2') && h.includes('Hoje: Sled Push (empurrar trenó)'));
  assert.match(h, /data-acao="substituta"/);
  assert.ok(h.includes('Usar a substituta: Plate push (anilha no turf)') && h.includes('20 · 30 · 40 · 100 m'));
  const volta = renderOpcoesHyrox({
    vaga: { ...r.vaga, atual: { nome: 'Plate push', substituta: true } },
    opcoes: [{ ...r.opcoes[0], substituta: false, nome: 'Sled Push (empurrar trenó)', equipamento: ['sled'], bloqueada: true }],
  });
  assert.ok(volta.includes('Voltar à estação da prova: Sled Push') && volta.includes('🔧 sem Sled (trenó) ativo'));
  assert.doesNotMatch(volta, /data-acao="original"/, 'sem sled ativo: desabilitada');
  assert.ok(renderOpcoesHyrox({ vaga: r.vaga, opcoes: [] }).includes('Esta estação não tem substituta.'));
});

/* ───────────── Técnica / Força ───────────── */

const crossHtml = (doc, hoje) => fatia(renderSemana({ ...BASE, doc, hoje }), 'metabolico wod', '</ol>');

test('a aula de Cross em dois blocos: 1 · Técnica / Força antes de 2 · WOD', () => {
  const t = W44.dias.terca.cross.tecnica;
  const h = crossHtml(W44, '2026-10-20');
  const i1 = h.indexOf('<span class="cross-n">1</span> Técnica / Força');
  const i2 = h.indexOf('<span class="cross-n">2</span> WOD');
  assert.ok(i1 > 0 && i2 > i1, 'técnica antes do WOD');
  assert.ok(h.includes('<p class="tecnica-foco">Power clean (barra) · Técnica · 10 min</p>'));
  assert.ok(h.includes(`<p class="tecnica-dinamica">${esc(t.dinamica)}</p>`));
  assert.ok(h.includes(`<b>Objetivo:</b> ${esc(t.objetivo)}`) && h.includes(`<b>Carga:</b> ${esc(t.carga)}`));
  assert.ok(h.includes('Duplas revezando: até 3 ao mesmo tempo (turma de 6).'));
  assert.ok(h.includes('data-trocar-foco'), 'tem alternativa (a flexão): "trocar foco"');
  assert.equal((h.match(/★ foco da técnica/g) || []).length, 1, 'o selo de foco no power clean do WOD');
  assert.ok(fatia(h, 'Power clean (barra)</span>', '</li>').length > 0);
});

test('Técnica / Força: alerta próprio, sem foco e WOD de antes do bloco', () => {
  const alerta = { recurso: 'barraOlimpica', usado: 5, limite: 4, exercicios: ['power_clean'], dias: ['terca'], bloco: 'tecnica' };
  const h = crossHtml({ ...W44, alertasCross: [alerta] }, '2026-10-20');
  assert.ok(h.includes('class="cross-bloco tecnica em-alerta"') && h.includes('Equipamento da Técnica / Força acima do limite'));
  assert.ok(!h.includes('Equipamento do WOD acima do limite'), 'o WOD não ganha a caixa da técnica');
  assert.ok(!h.includes('class="wod-mov em-alerta"'));

  const semFoco = { ...W44, dias: { ...W44.dias, terca: { ...W44.dias.terca, cross: { ...W44.dias.terca.cross, tecnica: null } } } };
  assert.ok(crossHtml(semFoco, '2026-10-20').includes('Nenhum movimento do WOD serve de foco'));

  const { tecnica: _t, ...semChave } = W44.dias.terca.cross;
  const antigo = crossHtml({ ...W44, dias: { ...W44.dias, terca: { ...W44.dias.terca, cross: semChave } } }, '2026-10-20');
  assert.ok(!antigo.includes('cross-n') && antigo.includes('Cross <span class="mut">· Chipper · cap 15 min</span>'), 'WOD de antes do bloco: como era');

  const travado = crossHtml({ ...W44, status: 'publicado' }, '2026-10-28');
  assert.ok(!travado.includes('data-trocar-foco'), 'terça passou: sem "trocar foco"');
});

test('trocar foco: as alternativas na ordem das categorias', () => {
  const h = renderOpcoesFoco({
    nome: 'Power clean (barra)',
    alternativas: [
      { exercicioId: 'flexao', nome: 'Flexão de braço', categoria: 'ginastica' },
      { exercicioId: 'kb_swing', nome: 'Kettlebell swing', categoria: 'kettlebell' },
    ],
  });
  assert.ok(h.includes('hoje o foco é <b>Power clean (barra)</b>'));
  assert.ok(h.indexOf('foco:kb_swing') < h.indexOf('foco:flexao'), 'kettlebell antes de ginástica');
  assert.ok(h.includes('<span class="troca-inst">Kettlebell</span>'));
  assert.ok(renderOpcoesFoco({ nome: 'X', alternativas: [] }).includes('Nenhum outro movimento do WOD serve de foco.'));
});
