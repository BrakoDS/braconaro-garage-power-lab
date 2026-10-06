// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diaEditavel, diasComAviso, semanaEmBranco, tituloAviso } from '../core/vista.js';
import { esc, renderLista, renderSemana } from './render.js';
import { renderFormAviso } from './render-aviso.js';

/**
 * Saída real do servidor (W45): semana em branco (recesso) com a terça
 * programada depois (`programarDia`) e o sábado de evento (o Murph) — ver
 * `core/fixtures/semana-em-branco.json`.
 */
const W45 = JSON.parse(readFileSync(new URL('../core/fixtures/semana-em-branco.json', import.meta.url), 'utf8'));
const W44 = JSON.parse(readFileSync(new URL('../core/fixtures/semana-cross-hyrox.json', import.meta.url), 'utf8'));
const BASE = { chave: '2026-W45', rotulo: '02/11 a 07/11', inicio: '2026-11-02' };
/** O cartão de um dia: do título dele até o próximo cartão. */
const cartao = (h, nome) => {
  const i = h.indexOf(`<h3>${nome} `);
  const j = h.indexOf('<article class="card dia', i + 1);
  return h.slice(i, j < 0 ? undefined : j);
};

test('semana ainda não gerada: "Semana em branco" ao lado do gerador', () => {
  const h = renderSemana({ ...BASE, doc: null, hoje: '2026-10-20' });
  assert.ok(h.includes('data-acao="gerar"') && h.includes('data-acao="em-branco"'));
  assert.ok(h.includes('feriado, recesso ou evento'));
  assert.ok(renderSemana({ ...BASE, doc: null, ocupado: true, hoje: '2026-10-20' }).includes('data-acao="em-branco" type="button" disabled'),
    'ocupado: desabilitado');
});

test('dia sem aula: o aviso no lugar das aulas, com "Programar este dia" e "Editar aviso"', () => {
  const h = renderSemana({ ...BASE, doc: W45, hoje: '2026-10-20' });
  const seg = cartao(h, 'Segunda');
  assert.ok(seg.includes('<p class="sem-aula-titulo">🌴 Recesso</p>'));
  assert.ok(seg.includes(esc(W45.dias.segunda.aviso.texto)));
  assert.ok(seg.includes('data-acao="programar-dia" data-dia="segunda"') && seg.includes('data-acao="editar-aviso" data-dia="segunda">Editar aviso'));
  assert.ok(!seg.includes('Sem aula.'), 'nada de "Sem aula." genérico');
  const sab = cartao(h, 'Sábado');
  assert.ok(sab.includes('🏁 Evento') && sab.includes('Murph no sábado, 8h na praça.'));
});

test('dia com aula ganha "Marcar sem aula"; a terça programada mostra o WOD', () => {
  const h = renderSemana({ ...BASE, doc: W45, hoje: '2026-10-20' });
  const ter = cartao(h, 'Terça');
  assert.ok(ter.includes('data-acao="sem-aula" data-dia="terca">Marcar sem aula'));
  assert.ok(ter.includes('metabolico wod') && !ter.includes('sem-aula-titulo'));
  const w44 = renderSemana({ chave: '2026-W44', rotulo: '26/10 a 31/10', inicio: '2026-10-26', doc: W44, hoje: '2026-10-20' });
  assert.equal((w44.match(/data-acao="sem-aula"/g) || []).length, 6, 'semana normal: os 6 dias podem virar feriado');
});

test('dia vazio SEM motivo: borda vermelha, "Definir motivo"', () => {
  const doc = { ...W45, dias: { ...W45.dias, quarta: { ...W45.dias.quarta, aviso: null } } };
  const qua = cartao(renderSemana({ ...BASE, doc, hoje: '2026-10-20' }), 'Quarta');
  assert.ok(qua.includes('class="sem-aula sem-motivo"') && qua.includes('Falta o motivo') && qua.includes('>Definir motivo<'));
  assert.ok(qua.includes('<p class="sem-aula-titulo">Sem aula</p>'));
});

test('semana publicada: dia que passou não tem botão; hoje e os próximos têm', () => {
  const pub = { ...W45, status: 'publicado' };
  const h = renderSemana({ ...BASE, doc: pub, hoje: '2026-11-04' });
  assert.ok(!cartao(h, 'Segunda').includes('dia-acao') && !cartao(h, 'Terça').includes('dia-acao'), 'segunda e terça passaram');
  assert.ok(cartao(h, 'Quarta').includes('data-acao="programar-dia" data-dia="quarta"'), 'quarta é hoje: ainda dá');
  assert.ok(!renderSemana({ ...BASE, doc: pub, ocupado: true, hoje: '2026-11-04' }).includes('dia-acao'), 'ocupado: nenhum botão de dia');
});

test('lista do mês: semana toda em branco ganha o selo do motivo', () => {
  const branca = { ...W45, dias: { ...W45.dias, terca: { ...W45.dias.segunda } } };
  const sabadoTambem = { ...branca, dias: { ...branca.dias, sabado: { ...W45.dias.segunda } } };
  assert.ok(renderLista([{ chave: '2026-W45', rotulo: '02/11 a 07/11' }], { '2026-W45': sabadoTambem }, '').includes('<span class="semana-branco">🌴 Recesso</span>'));
  assert.ok(!renderLista([{ chave: '2026-W45', rotulo: '02/11 a 07/11' }], { '2026-W45': W45 }, '').includes('semana-branco'),
    'com um dia programado, deixou de ser em branco');
});

test('a janela do aviso: tipo marcado, texto escapado, contador', () => {
  const f = renderFormAviso({ tipo: 'evento', texto: 'Murph <8h>' }, 'Explicação.');
  assert.ok(f.includes('value="evento" checked') && !f.includes('value="feriado" checked'));
  assert.ok(f.includes('Murph &lt;8h&gt;</textarea>') && f.includes('maxlength="500"') && f.includes('10/500'));
  assert.ok(renderFormAviso(null, 'x').includes('value="feriado" checked') && renderFormAviso(null, 'x').includes('0/500'), 'novo: Feriado marcado');
});

test('vista: título do aviso, dia editável, pedido de salvar e semana em branco', () => {
  assert.equal(tituloAviso({ tipo: 'feriado' }), '🏖️ Feriado');
  assert.equal(tituloAviso(null), 'Sem aula');
  assert.ok(diaEditavel(W45, 'segunda', '2026-11-30'), 'rascunho: sempre');
  const pub = { ...W45, status: 'publicado' };
  assert.ok(!diaEditavel(pub, 'segunda', '2026-11-03') && diaEditavel(pub, 'terca', '2026-11-03') && diaEditavel(pub, 'sabado', '2026-11-03'));
  const dias = diasComAviso(W44, 'quinta', { tipo: 'feriado', texto: 'Feriado municipal' });
  assert.deepEqual(dias.quinta, { treinos: [], blocoPrincipal: [], aviso: { tipo: 'feriado', texto: 'Feriado municipal' } });
  assert.deepEqual(dias.terca.treinos, ['Cross', 'H1'], 'os outros dias vão como estão');
  assert.ok(!('aviso' in dias.terca) && !('cross' in dias.terca), 'sem conteúdo: o servidor devolve o gravado');
  assert.ok(!semanaEmBranco(W45) && !semanaEmBranco(W44) && !semanaEmBranco(null));
});
