// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODALIDADES_CATALOGO, ROTULO_EQUIPAMENTO, ROTULO_ESTACAO_HIIT, ROTULO_INSTANCIA, ROTULO_MUSCULO, ROTULO_PADRAO_CROSS,
  bateComBusca, contagemPorModalidade, exercicioDoPedido, gruposDoCatalogo, ondeEntra, pedidoDoFormulario, rotulo,
} from './catalogo.js';

/** A resposta REAL do `listarCatalogoBox` (gerada e conferida pelo `checar-catalogo` das functions). */
const CATALOGO = JSON.parse(readFileSync(new URL('./fixtures/catalogo.json', import.meta.url), 'utf8'));
const { exercicios, vocabulario } = CATALOGO;
const porId = (id) => exercicios.find((e) => e.id === id);

test('todo valor do vocabulário do servidor tem rótulo em português', () => {
  for (const m of vocabulario.musculos) assert.ok(ROTULO_MUSCULO[m], `músculo ${m}`);
  for (const q of vocabulario.equipamentos) assert.ok(ROTULO_EQUIPAMENTO[q], `equipamento ${q}`);
  for (const i of vocabulario.instancias) assert.ok(ROTULO_INSTANCIA[i], `vaga ${i}`);
  for (const s of vocabulario.estacoesHiit) assert.ok(ROTULO_ESTACAO_HIIT[s], `estação ${s}`);
  for (const p of vocabulario.padroesCross) assert.ok(ROTULO_PADRAO_CROSS[p], `padrão ${p}`);
  assert.equal(rotulo(ROTULO_MUSCULO, 'asa_delta'), 'asa delta', 'chave nova aparece crua, sem sumir');
});

test('Força agrupa pela vaga, na ordem do servidor, com as sessões H', () => {
  const grupos = gruposDoCatalogo(exercicios, { modalidade: 'forca', vocabulario });
  assert.deepEqual(grupos.map((g) => g.chave), vocabulario.instancias.filter((i) => exercicios.some((e) => e.instancia === i)));
  const agachar = grupos.find((g) => g.chave === 'agachar');
  assert.equal(agachar?.subtitulo, 'Vaga do H1 · H2 · H3');
  assert.ok(agachar?.itens.every((e) => e.instancia === 'agachar'));
  assert.ok(grupos.find((g) => g.chave === 'estabilizar_tronco')?.subtitulo.includes('H2'), 'estabilizar tronco só no H2');
  assert.ok(grupos.find((g) => g.chave === 'puxar_horizontal')?.itens.some((e) => e.id === 'coach_remada_landmine'), 'o criado pelo coach aparece na vaga dele');
});

test('HIIT agrupa por estação (um exercício pode estar em duas); Cross pelo padrão', () => {
  const hiit = gruposDoCatalogo(exercicios, { modalidade: 'hiit', vocabulario });
  assert.deepEqual(hiit.map((g) => g.chave), vocabulario.estacoesHiit);
  const duasEstacoes = exercicios.find((e) => (e.hiit?.length ?? 0) > 1);
  if (duasEstacoes) assert.equal(hiit.filter((g) => g.itens.includes(duasEstacoes)).length, duasEstacoes.hiit.length);
  const cross = gruposDoCatalogo(exercicios, { modalidade: 'cross', vocabulario });
  assert.ok(cross.length > 3 && cross.every((g) => g.itens.every((e) => e.cross.padrao === g.chave)));
  const todos = gruposDoCatalogo(exercicios, { modalidade: 'todos' });
  assert.equal(todos[0].itens.length, exercicios.length);
});

test('desativados: aparecem por padrão e somem com o filtro', () => {
  const comTodos = gruposDoCatalogo(exercicios, { modalidade: 'todos' })[0].itens;
  const soAtivos = gruposDoCatalogo(exercicios, { modalidade: 'todos', mostrarInativos: false })[0].itens;
  assert.ok(comTodos.some((e) => e.id === 'remada_curvada_barra'));
  assert.ok(!soAtivos.some((e) => e.id === 'remada_curvada_barra'));
  const conta = contagemPorModalidade(exercicios, CATALOGO.hyrox.length);
  assert.deepEqual(Object.keys(conta), MODALIDADES_CATALOGO.map((m) => m.id));
  assert.equal(conta.forca.total - conta.forca.ativos, 1, 'uma remada desativada na força');
  assert.deepEqual(conta.hyrox, { ativos: 8, total: 8 });
});

test('busca: nome, músculo e equipamento, sem acento nem caixa', () => {
  assert.ok(bateComBusca(porId('agachamento_smith'), 'SMITH'));
  assert.ok(bateComBusca(porId('agachamento_smith'), 'gluteo'), 'pelo rótulo do músculo, sem acento');
  assert.ok(bateComBusca(porId('agachamento_smith'), 'agach guiada'), 'várias palavras: todas precisam bater');
  assert.ok(!bateComBusca(porId('agachamento_smith'), 'remada'));
  assert.equal(gruposDoCatalogo(exercicios, { modalidade: 'forca', busca: 'landmine', vocabulario }).flatMap((g) => g.itens).length,
    exercicios.filter((e) => e.instancia && bateComBusca(e, 'landmine')).length);
});

test('onde entra: vaga com sessões, estações e Cross com RX, carga e foco', () => {
  assert.deepEqual(ondeEntra(porId('agachamento_smith')).slice(0, 1), ['Força: Agachar (H1, H2, H3)']);
  const comFoco = exercicios.find((e) => e.cross?.foco && e.cross.carga);
  assert.match(ondeEntra(comFoco).join(' | '), /Cross: .* · \d+ .* · .*foco da técnica/);
});

test('pedido do formulário: editar manda só os campos editáveis', () => {
  const p = pedidoDoFormulario({
    id: 'agachamento_smith', nome: '  Agachamento no Smith  ', principal: ['quadriceps'], secundario: ['gluteo', 'core'],
    equip: ['smith'], adapt_joelho: 'elevacao_pelvica', adapt_ombro: '', instancia: 'agachar', estacao: ['pernas'],
  });
  assert.deepEqual(p, {
    id: 'agachamento_smith', nome: 'Agachamento no Smith', musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    equipamentos: ['smith'], adaptacoes: { joelho: 'elevacao_pelvica' }, unilateral: false,
  });
});

test('pedido do formulário: criar leva a modalidade (força, HIIT e Cross com carga)', () => {
  const p = pedidoDoFormulario({
    nome: 'Thruster com KB', principal: 'quadriceps', secundario: undefined, equip: 'kettlebell', unilateral: 'on',
    instancia: '', estacao: ['pernas', 'superiores'],
    cross: 'on', cross_padrao: 'agachar', cross_unidade: 'reps', cross_rx: '12', cross_carga_rx: '16/12 kg', cross_carga_scaled: '12/8 kg',
  });
  assert.deepEqual(p.musculoPrincipal, ['quadriceps'], 'um checkbox só vira lista');
  assert.deepEqual(p.musculosSecundarios, []);
  assert.equal(p.unilateral, true);
  assert.equal(p.instancia, undefined, 'vaga vazia não vai');
  assert.deepEqual(p.hiit, { estacoes: ['pernas', 'superiores'] });
  assert.deepEqual(p.cross, { padrao: 'agachar', unidade: 'reps', rx: 12, carga: { rx: '16/12 kg', scaled: '12/8 kg' } });
  assert.equal(pedidoDoFormulario({ nome: 'X', cross_padrao: 'agachar' }).cross, undefined, 'Cross desmarcado: não vai');
});

test('pedido recusado volta ao formulário com o que o coach digitou', () => {
  const pedido = pedidoDoFormulario({ id: 'agachamento_smith', nome: 'Novo nome', principal: ['quadriceps'], equip: ['smith'], adapt_lombar: 'afundo_trx' });
  const e = exercicioDoPedido(pedido, porId('agachamento_smith'));
  assert.equal(e.nome, 'Novo nome');
  assert.equal(e.instancia, 'agachar', 'a vaga continua a do exercício');
  assert.deepEqual(e.adaptacoes, [{ adaptacao: 'lombar', exercicioId: 'afundo_trx' }]);
});
