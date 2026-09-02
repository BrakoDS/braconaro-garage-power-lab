// @ts-check
/**
 * Testes do nível de atividade automático.
 * Rodar: node --test aluno/atividade.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NIVEIS, FATOR_PADRAO, nivelDoFator, mediaSemanal, nivelPorVezes, nivelAutomatico, modoDoDoc,
} from './atividade.js';

/** Quarta-feira, 02/09/2026 — meio de semana, para a semana corrente estar aberta. */
const HOJE = new Date(2026, 8, 2);

/** Os dias de uma semana (segunda ISO) — `n` treinos a partir da segunda. */
function semana(segIso, n) {
  const out = [];
  const d = new Date(segIso + 'T00:00:00');
  for (let i = 0; i < n; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/* ---------- a tabela de níveis ---------- */

test('as faixas automáticas cobrem de 0 a 7 sem buraco e sem sobreposição', () => {
  const cobertura = new Map();
  for (let v = 0; v <= 7; v++) {
    const achados = NIVEIS.filter((n) => n.min != null && v >= n.min && v <= n.max);
    assert.equal(achados.length, 1, `${v}x deveria bater em exatamente um nível`);
    cobertura.set(v, achados[0].fator);
  }
  assert.equal(cobertura.get(0), '1.2');
  assert.equal(cobertura.get(2), '1.375');
  assert.equal(cobertura.get(5), '1.55');
  assert.equal(cobertura.get(6), '1.725');
});

test('o "Muito intenso" nunca é automático — depende de trabalho físico', () => {
  const muito = NIVEIS.find((n) => n.fator === '1.9');
  assert.equal(muito.min, null);
  for (let v = 0; v <= 20; v++) assert.notEqual(nivelPorVezes(v).fator, '1.9');
});

test('acima de 7x na semana o automático para no Intenso', () => {
  assert.equal(nivelPorVezes(8).fator, '1.725');
  assert.equal(nivelPorVezes(14).fator, '1.725');
});

test('a média arredonda antes de escolher a faixa', () => {
  assert.equal(nivelPorVezes(2.4).fator, '1.375'); // 2
  assert.equal(nivelPorVezes(2.5).fator, '1.55');  // 3
});

test('nivelDoFator devolve o padrão para valor desconhecido', () => {
  assert.equal(nivelDoFator('1.725').rotulo, 'Intenso');
  assert.equal(nivelDoFator('banana').fator, FATOR_PADRAO);
  assert.equal(nivelDoFator(undefined).fator, FATOR_PADRAO);
});

/* ---------- a média semanal ---------- */

test('sem nenhum treino não há média', () => {
  const r = mediaSemanal({ dias: [], hoje: HOJE });
  assert.equal(r.media, null);
  assert.equal(r.semanasContadas, 0);
});

test('a semana corrente fica de fora — senão o TDEE despencaria toda segunda', () => {
  // 31/08 e 01/09 são desta semana (segunda 31/08). Só há treino nela.
  const r = mediaSemanal({ dias: ['2026-08-31', '2026-09-01'], hoje: HOJE });
  assert.equal(r.media, null, 'sem semana fechada, não dá para calcular');
});

test('quatro semanas fechadas viram a média', () => {
  const dias = [
    ...semana('2026-08-03', 3), ...semana('2026-08-10', 3),
    ...semana('2026-08-17', 4), ...semana('2026-08-24', 2),
  ];
  const r = mediaSemanal({ dias, hoje: HOJE });
  assert.equal(r.semanasContadas, 4);
  assert.deepEqual(r.porSemana, [3, 3, 4, 2]);
  assert.equal(r.media, 3);
});

test('semanas anteriores ao primeiro treino não contam — aluno novo não é sedentário', () => {
  // Só treinou na semana passada (24/08), 4 vezes. As três anteriores ele nem
  // era aluno: se contassem zero, a média cairia para 1 e ele viraria "Leve".
  const r = mediaSemanal({ dias: semana('2026-08-24', 4), hoje: HOJE });
  assert.equal(r.semanasContadas, 1);
  assert.equal(r.media, 4);
});

test('semana em branco DEPOIS de já ser aluno conta como zero', () => {
  const dias = [...semana('2026-08-10', 4), ...semana('2026-08-24', 4)]; // pulou 17/08
  const r = mediaSemanal({ dias, hoje: HOJE });
  assert.deepEqual(r.porSemana, [4, 0, 4]);
  assert.equal(r.media, 8 / 3);
});

test('dia repetido conta uma vez só', () => {
  const r = mediaSemanal({ dias: ['2026-08-24', '2026-08-24', '2026-08-25'], hoje: HOJE });
  assert.equal(r.media, 2);
});

test('a janela olha para trás só o número de semanas pedido', () => {
  const dias = [
    ...semana('2026-07-06', 6), // fora da janela de 4
    ...semana('2026-08-03', 2), ...semana('2026-08-10', 2),
    ...semana('2026-08-17', 2), ...semana('2026-08-24', 2),
  ];
  const r = mediaSemanal({ dias, hoje: HOJE });
  assert.equal(r.semanasContadas, 4);
  assert.equal(r.media, 2, 'a semana de julho não pode inflar a média');
});

test('domingo pertence à semana que começou na segunda', () => {
  // 30/08/2026 é domingo, fim da semana de 24/08.
  const r = mediaSemanal({ dias: ['2026-08-30'], hoje: HOJE });
  assert.deepEqual(r.porSemana, [1]);
});

/* ---------- o nível automático ---------- */

test('quem treina 4x por semana fica Moderado, com a frase da presença', () => {
  const dias = [...semana('2026-08-17', 4), ...semana('2026-08-24', 4)];
  const r = nivelAutomatico({ dias, hoje: HOJE });
  assert.equal(r.nivel.fator, '1.55');
  assert.equal(r.fonte, 'presenca');
  assert.equal(r.vezes, 4);
  assert.match(r.explicacao, /histórico: 4 treinos por semana nas últimas 2 semanas/);
  assert.match(r.sugestao, /o automático colocaria você em Moderado/);
});

test('a sugestão do modo manual sempre nomeia o nível automático', () => {
  const casos = [
    nivelAutomatico({ dias: semana('2026-08-24', 6), hoje: HOJE }),
    nivelAutomatico({ dias: [], planoVezes: '2', hoje: HOJE }),
    nivelAutomatico({ dias: [], hoje: HOJE }),
  ];
  for (const c of casos) {
    assert.match(c.sugestao, /automático/);
    assert.ok(c.sugestao.includes(c.nivel.rotulo) || c.fonte === 'nenhuma', c.sugestao);
  }
});

test('média quebrada aparece com vírgula na explicação', () => {
  const dias = [...semana('2026-08-17', 3), ...semana('2026-08-24', 4)];
  const r = nivelAutomatico({ dias, hoje: HOJE });
  assert.match(r.explicacao, /3,5 treinos/);
  assert.equal(r.vezes, 4, 'arredonda para cima na hora de escolher o nível');
});

test('sem histórico, cai no plano contratado', () => {
  const r = nivelAutomatico({ dias: [], planoVezes: '3', hoje: HOJE });
  assert.equal(r.fonte, 'plano');
  assert.equal(r.nivel.fator, '1.55');
  assert.match(r.explicacao, /plano de 3x/);
});

test('sem freqVezes, o plano sai da quantidade de dias cadastrados', () => {
  const r = nivelAutomatico({ dias: [], planoDias: ['seg', 'ter', 'qua', 'qui'], hoje: HOJE });
  assert.equal(r.fonte, 'plano');
  assert.equal(r.vezes, 4);
});

test('a presença real manda mais que o plano', () => {
  // Contratou 5x, mas apareceu 1x por semana. O gasto é o real.
  const dias = [...semana('2026-08-17', 1), ...semana('2026-08-24', 1)];
  const r = nivelAutomatico({ dias, planoVezes: '5', hoje: HOJE });
  assert.equal(r.fonte, 'presenca');
  assert.equal(r.nivel.fator, '1.375');
});

test('sem presença e sem plano, o padrão moderado com aviso honesto', () => {
  const r = nivelAutomatico({ dias: [], hoje: HOJE });
  assert.equal(r.fonte, 'nenhuma');
  assert.equal(r.nivel.fator, FATOR_PADRAO);
  assert.match(r.explicacao, /Ainda não temos treinos registrados/);
});

test('aluno que sumiu de vez vira sedentário — o TDEE segue a realidade', () => {
  // Treinou em julho e parou. As quatro semanas fechadas estão zeradas.
  const r = nivelAutomatico({ dias: semana('2026-07-06', 5), planoVezes: '5', hoje: HOJE });
  assert.equal(r.fonte, 'presenca');
  assert.equal(r.nivel.fator, '1.2');
});

/* ---------- a migração de quem já tinha um valor salvo ---------- */

test('quem escolheu um nível diferente do padrão continua no manual', () => {
  assert.equal(modoDoDoc({ nivelAtividade: '1.725' }), 'manual');
  assert.equal(modoDoDoc({ nivelAtividade: '1.2' }), 'manual');
});

test('valor igual ao padrão é indistinguível de intocado — vai para automático', () => {
  assert.equal(modoDoDoc({ nivelAtividade: FATOR_PADRAO }), 'auto');
  assert.equal(modoDoDoc({}), 'auto');
});

test('quando o modo está gravado, ele manda', () => {
  assert.equal(modoDoDoc({ nivelModo: 'manual', nivelAtividade: FATOR_PADRAO }), 'manual');
  assert.equal(modoDoDoc({ nivelModo: 'auto', nivelAtividade: '1.9' }), 'auto');
  assert.equal(modoDoDoc({ nivelModo: 'qualquer', nivelAtividade: '1.9' }), 'manual');
});
