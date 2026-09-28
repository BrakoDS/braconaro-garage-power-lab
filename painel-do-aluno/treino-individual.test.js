// @ts-check
/**
 * O treino que o ALUNO vê. O mesmo dia publicado, três perfis, três leituras —
 * e o total de séries igual ao da turma em todas.
 *
 * Rodar: node --test painel-do-aluno/treino-individual.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehIndividual, baseDoPublicado, perfilDoPortal, volumeDaSemana, renderVersaoDoAluno } from './treino-individual.js';

/** Um dia como o montador individual publica. */
const ex = (id, nome, grupo, padrao, series = 3) => ({
  id, nome, grupoMuscular: grupo, padrao, series, reps: '8–12', descansoSeg: 75,
  niveis: { iniciante: { series }, intermediario: { series }, avancado: { series } },
  tecnica: null, grupo: null,
});
const DIA = {
  dia: 'qua', modalidade: 'Musculação', individual: true, estrutura: 'musculacao',
  aquecimento: [{ nome: 'Mobilidade de quadril', duracaoSeg: 90 }],
  livre: { blocos: [{ tipo: 'series', nome: 'Principal', porNivel: false, exercicios: [
    ex('supino', 'Supino reto halter', 'peito', 'empurrar'),
    ex('remada', 'Remada baixa', 'costas', 'puxar'),
    ex('agacho', 'Agachamento smith', 'perna', 'quadriceps'),
    ex('rosca', 'Rosca martelo', 'braco', 'puxar'),
  ] }] },
};

test('reconhece o dia do montador individual, e nao confunde com o antigo', () => {
  assert.equal(ehIndividual(DIA), true);
  assert.equal(ehIndividual({ dia: 'qua', exercicios: [] }), false, 'dia do montador antigo');
  assert.equal(ehIndividual({ individual: true, livre: { blocos: [] } }), false, 'dia sem exercicio nao da versao nenhuma');
});

test('a base sai do publicado com grupo, serie e id', () => {
  const b = baseDoPublicado({ ...DIA, dateId: '2026-09-16' });
  const l = b.blocos[0].exercicios[0];
  assert.equal(l.id, 'supino');
  assert.equal(l.grupo, 'peito', 'grupoMuscular vira grupo — no Portal, `grupo` e o indice de bi-set');
  assert.equal(l.series, 3);
  assert.equal(l.travado, false, 'o cadeado e do coach; para o aluno ja virou numero');
});

test('o perfil vem do documento que o aluno ja le', () => {
  const p = perfilDoPortal({ objetivo: 'Hipertrofia', foco: ['perna'], metasGrupo: { perna: 20 }, restricoes: [] });
  assert.equal(p.objetivo, 'Hipertrofia');
  assert.deepEqual(p.foco, ['perna']);
  assert.deepEqual(p.metas, { perna: 20 });
  assert.deepEqual(perfilDoPortal(null), { objetivo: '', foco: [], restricoes: [], metas: {} });
});

test('tres perfis, o mesmo dia, o mesmo total de series', () => {
  const html = (portal) => renderVersaoDoAluno({ dia: DIA, dateId: '2026-09-16', portal, diasDoMes: { '2026-09-16': DIA } });
  const total = (h) => h.match(/Total do dia: <b>(\d+)/)[1];
  const semPerfil = html({ objetivo: '' });
  const focoPerna = html({ objetivo: 'Hipertrofia', foco: ['perna'] });
  const focoBraco = html({ objetivo: 'Emagrecimento', foco: ['braco'] });
  assert.equal(total(semPerfil), '12');
  assert.equal(total(focoPerna), '12');
  assert.equal(total(focoBraco), '12');
  assert.match(focoPerna, /seu foco: perna/);
  assert.match(focoBraco, /seu foco: braço/);
  assert.match(focoPerna, /Agachamento smith/);
});

test('o aluno ve quantas series sao dele, e o que a turma faz', () => {
  const h = renderVersaoDoAluno({ dia: DIA, dateId: '2026-09-16', portal: { objetivo: 'Hipertrofia', foco: ['braco'] } });
  assert.match(h, /<b>4×<\/b>/, 'a linha de foco ganhou serie');
  assert.match(h, /turma: 3/, 'e o aluno ve o numero da turma ao lado');
  assert.match(h, /Foco: \+1 série/);
});

test('a excecao do coach aparece com o motivo dele', () => {
  const h = renderVersaoDoAluno({
    dia: DIA, dateId: '2026-09-16', portal: { objetivo: 'Hipertrofia' },
    ajustes: { '2026-09-16': { linhas: { agacho: { series: 1 } }, observacao: 'Joelho sensível hoje.' } },
  });
  assert.match(h, /Ajuste do dia: 1 série/);
  assert.match(h, /Joelho sensível hoje\./);
});

test('a semana soma so os dias anteriores, e so os dias dele', () => {
  const dias = { '2026-09-14': DIA, '2026-09-15': DIA, '2026-09-16': DIA };
  const perfil = { objetivo: 'Hipertrofia', foco: [] };
  const todos = volumeDaSemana(dias, '2026-09-16', perfil, {}, []);
  assert.equal(todos.peito, 6, 'segunda e terca, 3 series cada');
  const so2a = volumeDaSemana(dias, '2026-09-16', perfil, {}, ['seg']);
  assert.equal(so2a.peito, 3, 'quem so treina segunda nao soma a terca');
  assert.equal(volumeDaSemana(dias, '2026-09-14', perfil, {}, []).peito, undefined, 'o primeiro dia da semana nao tem nada antes');
});

test('dia do montador antigo na semana nao derruba a conta', () => {
  const dias = { '2026-09-14': { dia: 'seg', exercicios: [{ nome: 'x' }] }, '2026-09-15': DIA };
  const vol = volumeDaSemana(dias, '2026-09-16', { objetivo: 'Hipertrofia' }, {}, []);
  assert.equal(vol.peito, 3, 'conta o que da para contar, e ignora o resto');
});

test('sem foco, a tela nao promete barra de meta nenhuma', () => {
  const h = renderVersaoDoAluno({ dia: DIA, dateId: '2026-09-16', portal: { objetivo: 'Hipertrofia' } });
  assert.ok(!h.includes('tdi-metas'));
  assert.ok(!h.includes('seu foco'));
});
