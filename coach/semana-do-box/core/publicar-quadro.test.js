// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conferirSemana } from './quadro.js';
import { PRESCRICAO_H, pedidoDoQuadro, quantidadeDoWod } from './publicar-quadro.js';

const CATALOGO = JSON.parse(readFileSync(new URL('./fixtures/catalogo.json', import.meta.url), 'utf8'));
const modelo = readFileSync(new URL('../../../functions/src/modelo-box.ts', import.meta.url), 'utf8');
const publicar = readFileSync(new URL('../../../functions/src/quadro-publicar.ts', import.meta.url), 'utf8');

// A semana 45 do coach (07/11/2026), com os nomes que ele já confirmou.
const W45 = {
  q1: {
    h: 'A)Mobilidade\n5 Min\nB)Hipertrofia 1\n3 x 8-12\nAgachamento Smith\nSupino reto smith\nMesa Flexora\nRemada aberta neutra\nDesenvolvimento halter\nPuxada aberta pronada\nAbs crunch \n',
    metabolico: 'A)Mobilidade \n5 Min\nB)Aquecimento\n10 x Abs Crunch\n8 x Air squat\n6 x Push up\nC) Força\n5 x 8-12\nDumbbell Shoulder Press\nStiff / RDL\nD)WOD - Metcon (AMRAP) 18 min\n12 x Abs Remador\n8 x Remada serrote\n10 x Thruster halteres\n200m Corrida / Remo / 1m airbike',
  },
  q2: {
    h: 'A)Mobilidade\n5 Min\nB)Hipertrofia 2\n3 x 8-12\nAfundo halteres\nSupino inclinado halteres\nRemada curvada barra\nElevação Lateral Halteres\nAbs Remador',
    metabolico: 'Skyerg\nSled Push\nSled Pull\nBurpee Broad jump\nRowing\nFarmer´s Carry\nSandbag\nWall Ball\n',
  },
  q3: {
    h: 'B)Hipertrofia 3\n4 x 10\nAgachamento Smith\nSupino reto smith\nPuxada aberta pronada',
    metabolico: 'A)Estação 1 - Pernas\nAfundo reverso\nAfundo reverso\nAgachamento Livre\n\nB)Estação 2 - Superior\nRemada trx\nFlexão de braço\n\nC)Estação 3 - Cardio\nAir Bike\nPolichinelo\nMountain CLimber',
  },
};
const APELIDOS = {
  'abs crunch': 'abdominal_supra', 'remada serrote': 'remada_halter_unilateral', 'skyerg': 'hyrox:skierg', 'sandbag': 'hyrox:sandbag_lunges',
  'agachamento livre': 'agachamento_livre', 'afundo reverso': 'afundo_reverso', 'thruster halteres': 'thruster_halteres', 'air bike': 'air_bike_sprint',
  'abs remador': 'abdominal_remador', 'afundo halteres': 'afundo_halter', 'supino inclinado halteres': 'supino_inclinado_halter',
  'remada curvada barra': 'remada_curvada_barra', 'elevacao lateral halteres': 'elevacao_lateral_halter', 'supino inclinado smith': 'supino_inclinado_smith',
  'desenvolvimento halter': 'desenvolvimento_halter', 'corrida': 'corrida', 'flexao de braco': 'flexao', 'remada trx': 'remada_trx',
  'mountain climber': 'mountain_climber', 'polichinelo': 'polichinelo', 'rowing': 'hyrox:remo', 'wall ball': 'hyrox:wall_ball',
  'farmer s carry': 'hyrox:farmers_carry', 'farmer´s carry': 'hyrox:farmers_carry',
};
const conf = (quadros = W45, extra = null) => conferirSemana({ quadros, extra, catalogo: CATALOGO, apelidos: APELIDOS });
const FERIADO = { segunda: { tipo: 'feriado', texto: 'Finados' } };

test('paridade: a prescrição padrão do H, as unidades e os limites são os do servidor', () => {
  assert.match(modelo, new RegExp(`series: ${PRESCRICAO_H.series},\\s*repeticoes: '${PRESCRICAO_H.repeticoes}',\\s*rir: '${PRESCRICAO_H.rir}'`));
  assert.match(modelo, /UNIDADES_CROSS = \['reps', 'metros', 'calorias', 'segundos'\]/);
  assert.match(publicar, /MAX_ALTERNATIVAS = 3;/);
});

test('quantidade do WOD: a unidade escrita vira a do servidor', () => {
  assert.deepEqual(quantidadeDoWod({ n: 200, unidade: 'm' }), { quantidade: 200, unidade: 'metros' });
  assert.deepEqual(quantidadeDoWod({ n: 1.2, unidade: 'km' }), { quantidade: 1200, unidade: 'metros' });
  assert.deepEqual(quantidadeDoWod({ n: 1, unidade: 'min' }), { quantidade: 60, unidade: 'segundos' });
  assert.deepEqual(quantidadeDoWod({ n: 10, unidade: 'cal' }), { quantidade: 10, unidade: 'calorias' });
  assert.deepEqual(quantidadeDoWod({ n: 12, unidade: 'reps' }), { quantidade: 12, unidade: 'reps' });
});

test('semana 45: cada aula no dia certo, com o que o coach escreveu', () => {
  const { dias, impedimentos, resumo } = pedidoDoQuadro(conf(), FERIADO);
  assert.deepEqual(impedimentos, []);
  assert.deepEqual(resumo, { segunda: ['Feriado'], terca: ['Cross', 'H1'], quarta: ['H2'], quinta: ['Hyrox', 'H2'], sexta: ['H3'], sabado: ['HIIT', 'H3'] });
  assert.deepEqual(dias.segunda, { treinos: [], blocosTexto: [], aviso: { tipo: 'feriado', texto: 'Finados' } });

  // O H1: 7 exercícios, 3 × 8-12 do cabeçalho, RIR 0-3; a Mobilidade vira texto.
  assert.equal(dias.terca.forca.exercicios.length, 7);
  assert.deepEqual(dias.terca.forca.exercicios[0], { exercicioId: 'agachamento_smith', series: 3, repeticoes: '8-12', rir: '0-3' });
  // O H3 com 4 × 10 escrito no cabeçalho.
  assert.deepEqual(dias.sexta.forca.exercicios.map((e) => `${e.series}x${e.repeticoes}`), ['4x10', '4x10', '4x10']);

  // O WOD: AMRAP 18, as quantidades escritas, as opções da linha.
  const wod = dias.terca.cross;
  assert.deepEqual([wod.formato, wod.minutos, wod.rodadas], ['AMRAP', 18, null]);
  assert.deepEqual(wod.movimentos.map((m) => [m.exercicioId, m.quantidade, m.unidade]), [
    ['abdominal_remador', 12, 'reps'], ['remada_halter_unilateral', 8, 'reps'], ['thruster_halteres', 10, 'reps'], ['corrida', 200, 'metros'],
  ]);
  assert.deepEqual(wod.movimentos[3].alternativas, ['Remo', 'airbike']);

  // Os blocos de texto da terça: Mobilidade do H1, e Mobilidade, Aquecimento e Força do Cross.
  assert.deepEqual(dias.terca.blocosTexto.map((b) => `${b.aula}: ${b.titulo}`), ['H1: Mobilidade', 'Cross: Mobilidade', 'Cross: Aquecimento', 'Cross: Força']);
  assert.deepEqual(dias.terca.blocosTexto[3].linhas, ['5 x 8-12', 'Dumbbell Shoulder Press', 'Stiff / RDL']);
  assert.deepEqual(dias.segunda, { treinos: [], blocosTexto: [], aviso: { tipo: 'feriado', texto: 'Finados' } }, 'segunda feriado não leva o H1');

  // Hyrox: as 8 estações, na ordem.
  assert.deepEqual(dias.quinta.hyrox.estacoes.map((e) => e.estacao),
    ['skierg', 'sled_push', 'sled_pull', 'burpee_broad_jump', 'remo', 'farmers_carry', 'sandbag_lunges', 'wall_ball']);
  assert.deepEqual(dias.quinta.forca, dias.quarta.forca, 'o H2 é o mesmo na quarta e na quinta');

  // HIIT: as 3 estações escritas, o afundo nas duas vagas.
  assert.deepEqual(dias.sabado.hiit.estacoes.map((e) => [e.estacao, e.slots.map((s) => s.exercicioId)]), [
    ['pernas', ['afundo_reverso', 'afundo_reverso', 'agachamento_livre']],
    ['superiores', ['remada_trx', 'flexao']],
    ['cardio', ['air_bike_sprint', 'polichinelo', 'mountain_climber']],
  ]);
  assert.equal(dias.sexta.hiit, undefined, 'o HIIT é só no sábado');
});

test('o que impede publicar', () => {
  const sem = (q, campo, texto) => ({ ...W45, [q]: { ...W45[q], [campo]: texto } });
  const imp = (quadros, semAula = FERIADO) => pedidoDoQuadro(conf(quadros), semAula).impedimentos.map((i) => i.texto);

  assert.deepEqual(imp(W45, {}), [], 'sem feriado, a segunda tem o H1: não falta nada');
  assert.ok(imp(sem('q1', 'h', W45.q1.h + '\nExercicio Inventado Xyz')).some((t) => t.includes('confirme qual exercício do catálogo é "Exercicio Inventado Xyz"')));
  assert.ok(imp(sem('q1', 'metabolico', 'D) WOD 18 min\n12x Abs Remador')).some((t) => t.includes('formato do WOD')));
  assert.ok(imp(sem('q1', 'metabolico', 'D) WOD AMRAP\n12x Abs Remador')).some((t) => t.includes('minutos do WOD')));
  assert.ok(imp(sem('q1', 'metabolico', 'D) WOD AMRAP 18 min\nAbs Remador')).some((t) => t.includes('quantidade de Abdominal')));
  assert.ok(imp(sem('q2', 'metabolico', 'Skyerg\nSled Push')).some((t) => t.includes('8 estações') && t.includes('veio 2')));
  assert.ok(imp(sem('q3', 'metabolico', 'A)Estação 1 - Pernas\nAfundo reverso\nAgachamento Livre\nAfundo halteres')).some((t) => t.includes('5 vagas')));
  // Dia sem treino nenhum (o quadro 3 em branco) e sem o motivo.
  const branco = { ...W45, q3: { h: '', metabolico: '' } };
  assert.deepEqual(imp(branco).filter((t) => t.includes('sem treino escrito')), [
    'Sexta: sem treino escrito. Escreva o treino ou marque o dia sem aula (feriado, recesso ou evento).',
    'Sábado: sem treino escrito. Escreva o treino ou marque o dia sem aula (feriado, recesso ou evento).',
  ]);
  // Marcado sem aula, o dia não cobra nada — nem o nome por confirmar daquele quadro.
  assert.deepEqual(imp(branco, { ...FERIADO, sexta: { tipo: 'recesso', texto: '' }, sabado: { tipo: 'evento', texto: 'Murph na praça' } }), []);
});

test('aviso de equipamento não impede; "fora do catálogo" no H impede, na Mobilidade não', () => {
  const ap = { ...APELIDOS, 'gato camelo': '-', 'abs crunch': '-' };
  const c = conferirSemana({ quadros: { ...W45, q1: { ...W45.q1, h: W45.q1.h.replace('5 Min', 'Gato camelo') } }, catalogo: CATALOGO, apelidos: ap, inventario: { limitesAtivos: { smith: 0 } } });
  assert.ok(c.problemas.some((p) => p.tipo === 'erro' && /smith/i.test(p.texto)), 'a conferência mostra a falta de smith');
  const r = pedidoDoQuadro(c, FERIADO);
  assert.deepEqual(r.impedimentos.map((i) => i.texto), ['H1: "Abs crunch" está como "fora do catálogo". Cadastre no catálogo para o aluno ver e registrar.']);
  assert.deepEqual(r.dias.terca.blocosTexto[0], { aula: 'H1', titulo: 'Mobilidade', linhas: ['Gato camelo'] });
});

test('a aula do mês vai como texto no dia dela', () => {
  const r = pedidoDoQuadro(conf(W45, /** @type {any} */ ({ tipo: 'Murph', dia: 'sabado', texto: '1,6 km corrida\n100 barras\n200 flexões' })), FERIADO);
  assert.deepEqual(r.dias.sabado.blocosTexto.at(-1), { aula: 'Murph', titulo: 'Murph', linhas: ['1,6 km corrida', '100 barras', '200 flexões'] });
});
