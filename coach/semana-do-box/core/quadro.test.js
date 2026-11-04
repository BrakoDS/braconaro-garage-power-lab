// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOCOS_CHIPPER, CAMINHOS, CAPACIDADE_SKIERG, EXERCICIOS_POR_BLOCO, FATOR_VOLUME, INVENTARIO_PADRAO, MINUTOS_POR_RODADA_AMRAP,
  MUSCULOS_CORRIDA, PADROES_H, PESO_PRINCIPAL, PESO_SECUNDARIO, RECURSO_DO_EQUIPAMENTO, REGRA_FORMATO, SERIES_POR_EXERCICIO,
  TETO_MINUTOS, conferirSemana, consumoDoMetabolico, lerColuna, lerNome, lerPrescricao, indiceDoCatalogo, metasDaSemana,
  volumeDoCaminho,
} from './quadro.js';

const CATALOGO = JSON.parse(readFileSync(new URL('./fixtures/catalogo.json', import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(`../../../functions/src/${p}`, import.meta.url), 'utf8');
const modelo = src('modelo-box.ts');

/* ── paridade com o servidor ── */

test('paridade: padrões, 7 × 3, pesos e fatores de volume são os da Semana do Box', () => {
  const ini = modelo.indexOf('export const INSTANCIAS = [');
  const instancias = [...modelo.slice(ini, modelo.indexOf(']', ini)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...PADROES_H].sort(), instancias.sort());
  assert.match(modelo, new RegExp(`EXERCICIOS_POR_BLOCO = ${EXERCICIOS_POR_BLOCO};`));
  assert.match(modelo, new RegExp(`series: ${SERIES_POR_EXERCICIO},\\s*repeticoes: '8-12'`));
  assert.match(modelo, new RegExp(`PESO_PRINCIPAL = ${PESO_PRINCIPAL.toFixed(1)};`));
  assert.match(modelo, new RegExp(`PESO_SECUNDARIO = ${PESO_SECUNDARIO};`));
  for (const [k, v] of Object.entries(FATOR_VOLUME)) assert.match(modelo, new RegExp(`\\b${k}: ${v},`), `FATOR_VOLUME.${k}`);
  assert.match(modelo, new RegExp(`MINUTOS_POR_RODADA_AMRAP = ${MINUTOS_POR_RODADA_AMRAP};`));
  assert.match(modelo, new RegExp(`CAPACIDADE_SKIERG = ${CAPACIDADE_SKIERG};`));
  assert.match(modelo, new RegExp(`MINUTOS_MAX_WOD = ${TETO_MINUTOS.AMRAP};`));
  assert.match(src('gerador-cross.ts'), new RegExp(`EMOM_MINUTOS = \\{ min: 12, max: ${TETO_MINUTOS.EMOM} \\}`));
  assert.match(src('volume-cross-hyrox.ts'), new RegExp(`Chipper: ${BLOCOS_CHIPPER} blocos por`));
  for (const [f, r] of Object.entries(REGRA_FORMATO)) {
    const re = new RegExp(`${f.includes(' ') ? `'${f}'` : f}: \\{\\s*movimentos: \\[${r.movimentos[0]}, ${r.movimentos[1]}\\], fator: [\\d.]+, escalonado: ${r.escalonado}`);
    assert.match(modelo, re, f);
  }
});

test('paridade: inventário de fábrica, recurso de cada equipamento e músculos da corrida', () => {
  for (const [r, n] of Object.entries(INVENTARIO_PADRAO)) assert.match(modelo, new RegExp(`\\b${r}: ${n},`), r);
  for (const [e, r] of Object.entries(RECURSO_DO_EQUIPAMENTO)) assert.match(modelo, new RegExp(`\\b${e}: '${r}',`), e);
  assert.match(src('catalogo-hyrox.ts'), new RegExp(`corrida: mus\\(\\['${MUSCULOS_CORRIDA.musculoPrincipal.join("', '")}'\\], \\['${MUSCULOS_CORRIDA.musculosSecundarios.join("', '")}'\\]\\)`));
});

/* ── leitura do texto ── */

test('prescrição: séries × reps, pausa em minutos ou segundos, tempo, rodadas e formato', () => {
  assert.deepEqual(lerPrescricao("Principal 3x 8-10 reps 1' pausa"), { series: 3, reps: '8-10', descansoSeg: 60 });
  assert.deepEqual(lerPrescricao('WOD-Metcon 18m AMRAP'), { minutos: 18, formato: 'AMRAP' });
  assert.deepEqual(lerPrescricao('5 rounds for time, cap 20'), { rodadas: 5, minutos: 20, formato: 'For Time' });
  assert.deepEqual(lerPrescricao('EMOM 16 min · descanso 45s'), { descansoSeg: 45, minutos: 16, formato: 'EMOM' });
});

test('coluna: cabeçalho com ":" vira linha, "+" junta, "/" e "ou" são opções, linha só de números vale para a seção', () => {
  const { secoes } = lerColuna('C) Força: Double shoulder press + Stiff/RDL\n5x 8-10 (60"-90")\nD) WOD\nAMRAP 18 min\n200m corrida/remo ou 1m air bike', 'wod');
  assert.equal(secoes.length, 2, 'o "AMRAP 18 min" embaixo do "D) WOD" é a mesma seção');
  const [forca, wod] = secoes;
  assert.equal(forca.tipo, 'forca');
  assert.deepEqual(forca.itens.map((i) => i.escrito), ['Double shoulder press', 'Stiff']);
  assert.deepEqual(forca.itens[1].alternativas, ['RDL']);
  assert.equal(forca.series, 5);
  assert.equal(forca.itens[0].grupoLinha, forca.itens[1].grupoLinha, 'a superssérie é uma linha');
  assert.deepEqual([wod.tipo, wod.formato, wod.minutos], ['wod', 'AMRAP', 18]);
  assert.deepEqual(wod.itens[0], { ...wod.itens[0], escrito: 'corrida', alternativas: ['remo', 'air bike'], qtd: { n: 200, unidade: 'm' } });
});

test('GAP: "1 música aquecimento, 3 perna, 4 glúteo, 3 abs; cada música 8 rounds"', () => {
  const { secoes } = lerColuna('GAP Tabata 20/10\n1 música aquecimento, 3 perna, 4 glúteo, 3 abs; cada música 8 rounds', 'gap');
  assert.deepEqual(secoes[0].musicas.map((m) => [m.grupo, m.n]), [['aquecimento', 1], ['perna', 3], ['gluteo', 4], ['abs', 3]]);
  assert.equal(secoes[0].roundsPorMusica, 8);
});

/* ── os nomes ── */

test('nomes: o do catálogo sem "no"/"com"/parênteses é reconhecido; o duvidoso volta com sugestões', () => {
  const ind = indiceDoCatalogo(CATALOGO);
  assert.equal(lerNome('Agachamento Smith', ind).id, 'agachamento_smith');
  assert.equal(lerNome('Supino reto Smith', ind).id, 'supino_smith');
  assert.equal(lerNome('hip thrust', ind).id, 'elevacao_pelvica', 'o nome entre parênteses também vale');
  assert.equal(lerNome('Kettlebell swings', ind).id, 'kb_swing', 'plural');
  const d = lerNome('Desenv. halter', ind);
  assert.equal(d.id, null, '"militar" falta: pergunta');
  assert.equal(d.sugestoes[0].id, 'desenvolvimento_halter');
  assert.equal(lerNome('Desenv. halter', ind, { 'desenv halter': 'desenvolvimento_halter' }).id, 'desenvolvimento_halter', 'apelido confirmado');
  assert.equal(lerNome('Alongamento do pato', ind, { 'alongamento do pato': '-' }).como, 'fora');
});

test('nomes do Hyrox só valem na seção de Hyrox', () => {
  const ind = indiceDoCatalogo(CATALOGO);
  assert.equal(lerNome('Wall balls', ind, {}, { hyrox: true }).id, 'hyrox:wall_ball');
  assert.equal(lerNome('Wall ball', ind).id, 'wall_ball_shot');
  assert.equal(lerNome('Sled Push', ind, {}, { hyrox: true }).id, 'hyrox:sled_push');
  assert.equal(lerNome('Remo', ind, {}, { hyrox: true }).id, 'hyrox:remo');
});

/* ── a conferência ── */

const H1 = `A) Mobilidade
B) Principal 3x 8-10 reps 1' pausa
Agachamento Smith
Supino reto Smith
Mesa flexora
Remada aberta neutra
Desenvolvimento militar com halteres
Puxada aberta pronada
Abs crunch`;
const CROSS = `B) Aquecimento
10x Abs crunch
8x Air squat
C) Força: Ground to overhead + Kettlebell swing
5x 5
D) WOD 18m AMRAP
12x Abdominal remador
8x Remada unilateral com halter
10x Thruster com halteres
200m corrida`;

test('H1 do quadro: 7 exercícios, 7 padrões, 21 séries — nada falta', () => {
  const conf = conferirSemana({ quadros: { q1: { h: H1, metabolico: CROSS } }, catalogo: CATALOGO });
  const h1 = metasDaSemana(conf)[0];
  assert.deepEqual([h1.exercicios, h1.padroes, h1.series], [7, 7, 21]);
  assert.equal(conf.problemas.filter((p) => p.onde === 'q1.h' && p.tipo === 'falta').length, 0);
  assert.equal(conf.colunas['q1.h'].volume.costas, 6, 'remada + puxada: 2 × 3 séries');
});

test('H incompleto: diz quantos faltam, que padrão falta e quantas séries', () => {
  const conf = conferirSemana({ quadros: { q1: { h: 'B) Principal 3x10\nAgachamento Smith\nMesa flexora 4x10' } }, catalogo: CATALOGO });
  const textos = conf.problemas.filter((p) => p.onde === 'q1.h').map((p) => p.texto);
  assert.ok(textos.includes('H1: 2 de 7 exercícios.'));
  assert.ok(textos.some((t) => t.startsWith('H1: falta estender quadril') === false && t.includes('falta empurrar horizontal')));
  assert.ok(textos.includes('H1: 7 de 21 séries.'));
});

test('Cross: volume do WOD em blocos (AMRAP 18 = 6 rodadas × 0,5; cardio × 0,25) e da força em séries', () => {
  const conf = conferirSemana({ quadros: { q1: { h: H1, metabolico: CROSS } }, catalogo: CATALOGO });
  const s = conf.colunas['q1.m'].seriesPorId;
  assert.equal(s.ground_to_overhead, 5);
  assert.equal(s.thruster_halteres, 6 * 0.5);
  assert.equal(s.corrida, 6 * 0.25);
  assert.equal(s.agachamento_livre, undefined, 'aquecimento não conta volume');
});

test('Terça: Smith ou monocross no Cross é erro; o banco que falta aparece por divisão da turma', () => {
  const conf = conferirSemana({
    quadros: { q1: { h: H1, metabolico: `${CROSS}\nE) Finisher AMRAP 5 min\nAbdominal no monocross` } }, catalogo: CATALOGO,
  });
  const erros = conf.problemas.filter((p) => p.tipo === 'erro').map((p) => p.texto);
  assert.ok(erros.some((t) => t.startsWith('Terça: Abdominal no monocross') && t.includes('ficam com o H1')));
  assert.ok(erros.some((t) => t.includes('não cabe nem com 1 aluno no Cross') && t.includes('banco')), 'H1 com 2 bancos + remada com halter no banco');
  assert.ok(!erros.some((t) => t.includes('monocross') && t.includes('cabe')), 'o monocross já foi cobrado pela regra da terça');
});

test('divisão da turma: escalonado divide os alunos pelos movimentos; força em duplas', () => {
  const conf = conferirSemana({ quadros: { q1: { metabolico: 'D) AMRAP 12 min\nKettlebell swing\nAgachamento goblet com kettlebell\nBurpee\nCorrida' } }, catalogo: CATALOGO });
  const c = conf.colunas['q1.m'];
  assert.equal(consumoDoMetabolico(c, 5).kettlebell, 4, '5 alunos em 4 movimentos: 2 por movimento × 2 movimentos de kettlebell');
  const forca = conferirSemana({ quadros: { q1: { metabolico: 'C) Força 5x5\nPower clean' } }, catalogo: CATALOGO }).colunas['q1.m'];
  assert.equal(consumoDoMetabolico(forca, 5).barraOlimpica, 3, 'duplas revezando: 5 ÷ 2 para cima');
});

test('cabe até N: o Cross cabe com poucos alunos e passa com mais', () => {
  const conf = conferirSemana({
    quadros: { q1: { h: 'B) 3x10\nMesa flexora', metabolico: 'D) EMOM 12 min\nPower clean\nBurpee\nCorrida' } },
    catalogo: CATALOGO, inventario: { limitesAtivos: { barraOlimpica: 2 } },
  });
  const terca = conf.equipamento.find((d) => d.dia === 'terca');
  assert.equal(terca?.cabeAte, 2, 'EMOM: a turma inteira na barra ao mesmo tempo; 2 barras');
  assert.ok(conf.problemas.some((p) => p.texto === 'Terça: cabe até 2 alunos no Cross ao lado do H1; com 3, falta 1 barra.'));
});

test('Quinta: H2 com 1 Smith só, sem monocross (o Hyrox fica com os 2), e a barra de 1,5 m', () => {
  const conf = conferirSemana({
    quadros: { q2: { h: 'B) 3x10\nAgachamento Smith\nSupino reto Smith\nPuxada aberta pronada\nGood morning barra', metabolico: 'Hyrox\n1000m SkiErg' } },
    catalogo: CATALOGO,
  });
  const t = conf.problemas.filter((p) => p.onde === 'q2.h').map((p) => p.texto);
  assert.ok(t.some((x) => x.startsWith('Quinta: o H2 tem 2 exercícios no Smith')));
  assert.ok(t.includes('Quinta: Puxada aberta pronada (monocross) usa monocross, e o Hyrox fica com os 2.'));
  assert.ok(t.some((x) => x.includes('barra de 1,5 m')));
});

test('Hyrox da quinta: as 8 estações, com a substituta valendo pela estação', () => {
  const todas = 'Hyrox\n1000m SkiErg\n50m Sled Push\n50m Sled Pull\n80m Burpee broad jump\n1000m Remo\n200m Farmers carry\n100m Sandbag lunges\n100 Wall balls';
  const conf = conferirSemana({ quadros: { q2: { metabolico: todas } }, catalogo: CATALOGO });
  assert.ok(!conf.problemas.some((p) => p.onde === 'q2.m' && p.tipo === 'falta'), conf.problemas.map((p) => p.texto).join('\n'));
  assert.equal(conf.colunas['q2.m'].seriesPorId['hyrox:skierg'], FATOR_VOLUME.estacaoHyrox);
  const sete = conferirSemana({ quadros: { q2: { metabolico: todas.replace('\n50m Sled Pull', '\n20 Remada no TRX') } }, catalogo: CATALOGO });
  assert.ok(!sete.problemas.some((p) => p.onde === 'q2.m' && p.tipo === 'falta'), 'Remada no TRX é a substituta do Sled Pull');
  const falta = conferirSemana({ quadros: { q2: { metabolico: 'Hyrox\n1000m SkiErg' } }, catalogo: CATALOGO });
  assert.ok(falta.problemas.some((p) => p.texto.startsWith('Hyrox da quinta: 1 de 8 estações; falta Sled Push')));
});

test('repetição: dois H, H e metabólico, a mesma coluna e a semana passada', () => {
  const conf = conferirSemana({
    quadros: { q1: { h: 'B) 3x10\nMesa flexora\nMesa flexora' }, q3: { h: 'B) 3x10\nMesa flexora\nRemada aberta neutra', metabolico: 'Tabata\n4x Burpee\n4x Russian twist' } },
    catalogo: CATALOGO, anterior: { quadros: { q3: { h: 'B) 3x10\nRemada aberta neutra' } } },
  });
  const t = conf.problemas.map((p) => p.texto);
  assert.ok(t.includes('H1: Mesa flexora aparece duas vezes.'));
  assert.ok(t.some((x) => x.startsWith('Mesa flexora está em H1 (segunda e terça) e H3 (sexta e sábado): o mesmo exercício não se repete')));
  assert.ok(t.includes('H3: Remada aberta neutra (monocross) repete a semana passada.'));
});

test('dúvida: nome que o catálogo não tem vira pergunta e não conta volume', () => {
  const conf = conferirSemana({ quadros: { q1: { h: 'B) 3x10\nRemada bailarina' } }, catalogo: CATALOGO });
  assert.ok(conf.problemas.some((p) => p.tipo === 'duvida' && p.texto.startsWith('"Remada bailarina"')));
  assert.deepEqual(conf.colunas['q1.h'].volume, {});
});

test('caminho do aluno: o 6× alternando soma H1, Cross, H2, Hyrox, H3 e HIIT; o extra entra se ele fizer', () => {
  const conf = conferirSemana({
    quadros: { q1: { h: H1, metabolico: CROSS } },
    extra: { tipo: 'GAP', dia: 'terca', texto: 'GAP\n4 glúteo' }, catalogo: CATALOGO,
  });
  const alterna = /** @type {any} */ (CAMINHOS.find((c) => c.id === 'alterna')).aulas;
  const v = volumeDoCaminho(conf, alterna);
  assert.equal(v.costas, (conf.colunas['q1.h'].volume.costas ?? 0) + (conf.colunas['q1.m'].volume.costas ?? 0));
  const comGap = volumeDoCaminho(conf, alterna, true);
  assert.equal(comGap.gluteo - (v.gluteo ?? 0), 4 * 8 * 0.5, '4 músicas × 8 rounds × 0,5');
});
