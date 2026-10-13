// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tab-treino.test.js
 *
 * A aba Treino: o que cada card mostra em leitura e em edição, onde cada campo
 * grava (o topo da ficha ou a matriz, campo a campo — sem passar por cima das
 * lesões da aba Saúde) e a fiação com o salvar global: o ✎ redesenha só os
 * cards editáveis; os de leitura (metas, gráficos, força, feedbacks) se
 * atualizam quando a aba abre.
 *
 * A fiação é testada com um DOM de mentira (só o que a aba toca) e o db.js de
 * verdade sobre um localStorage em memória, instalado ANTES dos imports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/* ---------- um DOM mínimo ---------- */

/**
 * Um bloco de levantamento do card Cargas, com os campos "digitados".
 * @param {string} id @param {Record<string, string>} [v]
 */
const bloco = (id, v = {}) => {
  const saida = { textContent: '', innerHTML: '', className: '' };
  return { v, saida, getAttribute: () => id, querySelector: (/** @type {string} */ s) => (s === '[data-saida]' ? saida : { value: v[(/data-campo=(\w+)/.exec(s) || [])[1]] ?? '' }) };
};

/** @param {string} sel */
function elemento(sel) {
  const classes = new Set();
  return {
    sel, desenhos: 0, _html: '', value: '', dataset: /** @type {Record<string, string>} */ ({}),
    options: sel === '#meta-tipo' ? ['peso', 'gordura', 'cintura'].map((value) => ({ value })) : [],
    /** Os campos "digitados" (o FormData e os `[name=…]` leem daqui). @type {Record<string, any>} */ campos: {},
    /** As caixas de mobilidade marcadas. @type {string[]} */ checados: [],
    /** Os blocos de levantamento. @type {any[]} */ blocos: [],
    ouvintes: /** @type {Record<string, Function[]>} */ ({}),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v; this.desenhos++;
      // Como no DOM de verdade: redesenhar troca os campos de dentro.
      if (sel === '#prog-metas' || sel === '#tab-treino') { delete tela['#meta-tipo']; delete tela['#meta-alvo']; }
    },
    addEventListener(t, f) { (this.ouvintes[t] ||= []).push(f); },
    disparar(t) { for (const f of this.ouvintes[t] || []) f({ target: { closest: () => null } }); },
    querySelector(s) {
      const nome = /^\[name="(\w+)"\]$/.exec(s);
      if (nome) return { value: this.campos[nome[1]] ?? '' };
      return null;
    },
    querySelectorAll(s) {
      if (s === '[data-lev]') return this.blocos;
      if (s.startsWith('input[name=mobilidade]')) return this.checados.map((value) => ({ value }));
      return [];
    },
    contains: () => false,
    focus() {},
  };
}
/** @type {Record<string, ReturnType<typeof elemento>>} */
let tela = {};
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({ querySelector: (s) => el(s), querySelectorAll: () => [] });
// O FormData lê os campos "digitados" no elemento do formulário.
globalThis.FormData = /** @type {any} */ (class {
  constructor(f) { this.m = f.campos; }
  entries() { return Object.entries(this.m); }
  get(k) { return this.m[k] ?? null; }
  getAll(k) { const v = this.m[k]; return Array.isArray(v) ? v : v == null ? [] : [v]; }
});

const db = await import('./db.js?v=20');
const eventos = await import('./eventos.js?v=20');
const { estado, emit, EVENTOS } = await import('./estado.js?v=20');
const { iniciarSalvarGlobal, salvar } = await import('./ui-salvar-global.js?v=20');
const treino = await import('./ui-tab-treino.js?v=20');
const {
  iniciarTabTreino, editarCard, editarNaAbaTreino, htmlCardPerfilTreino, htmlCardCargas, htmlCardAdaptacoes, htmlTrocas,
  htmlResumoMotor, htmlAbaTreino, htmlFixos, textoDoLevantamento, nomeDoExercicio, vistaCom, resumoDosDias, CARDS_EDITAVEIS,
} = treino;
const { matrizDe } = await import('../../compartilhado/regras/matriz-individualizacao.js?v=20');
iniciarSalvarGlobal();
iniciarTabTreino();

const pendentes = () => eventos.pendentes().filter((e) => e.tipo === 'ficha-editada');
const semAviso = async (fn) => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };

/** Abre o perfil e a aba Treino, como o app faz. @param {string} id */
function abrirTreino(id) {
  estado.alunoAtual = db.obter(id);
  el('#tela-perfil').classList.add('active');
  emit(EVENTOS.PERFIL_ABERTO, id);
  el('#tab-treino').classList.add('active');
  emit(EVENTOS.ABRIR_ABA, 'treino');
  return el('#tab-treino');
}

const LESAO = { regiao: 'joelho', gravidade: 'moderada', desde: '', obs: 'menisco' };
const tati = {
  id: 'Tr01', nome: 'Tati', nivel: 'iniciante', objetivo: 'Hipertrofia', freqVezes: '3', foco: ['peito'],
  diasTreino: ['seg', 'qua'], horarios: { seg: '07:00', qua: '19:00' },
  matrizIndividualizacao: { versao: 1, adaptacoes: { lesoes: [LESAO] } },
};

/* ---------- puro ---------- */

test('perfil de treino: leitura com nível, objetivo, fase, frequência, foco e dias', () => {
  const h = htmlCardPerfilTreino({ ...tati, foco: ['peito', 'costas'], matrizIndividualizacao: { perfil: { fase: 'forca' } } }, false);
  for (const t of ['Iniciante', 'Hipertrofia', 'Força', '3x por semana', 'Seg 7h · Qua 19h']) assert.ok(h.includes(t), t);
  assert.match(h, /Peito <span class="tr-sub">\(primário\)<\/span> · Costas <span class="tr-sub">\(secundário\)<\/span>/);
  assert.match(h, /data-card="perfil-treino" data-modo="editar"/);
  assert.doesNotMatch(h, /<form/);
  assert.equal(resumoDosDias(tati), 'Seg 7h · Qua 19h');
});

test('perfil de treino: a edição tem os campos de antes (Dados e Matriz) num formulário só', () => {
  const h = htmlCardPerfilTreino(tati, true);
  assert.match(h, /<form id="form-treino-perfil"/);
  for (const n of ['nivel', 'objetivo', 'fase', 'freqVezes', 'focoPrimario', 'focoSecundario', 'diasTreino', 'hora_seg']) assert.match(h, new RegExp(`name="${n}"`), n);
  assert.match(h, /<option value="peito" selected>Peito</, 'o foco primário vem da ficha');
  assert.match(h, /data-erro-foco hidden/);
  assert.doesNotMatch(h, /name="foco"/, 'o foco é primário e secundário, não as caixas do cadastro');
});

test('cargas: 1RM medido ganha da estimativa; estimado mostra peso × reps; prévia de 70%', () => {
  const ref = matrizDe({ matrizIndividualizacao: { cargas: { referencia: {
    agachamento: { kg: 100, reps: 5 }, supino: { kg: 60, reps: 3, rm: 70, medidoEm: '2026-09-01' }, terra: { kg: 80, reps: 15 },
  } } } }).cargas.referencia;
  assert.match(textoDoLevantamento(ref.agachamento), /<b class="tr-rm">116,5 kg<\/b> <span class="tr-sub">estimado · 100 kg × 5 · 70% ≈ 82,5 kg/);
  assert.match(textoDoLevantamento(ref.supino), /70 kg<\/b> <span class="tr-sub">1RM medido · 01\/09\/2026 · 70% ≈ 50 kg/);
  assert.match(textoDoLevantamento(ref.terra), /acima de 12 reps a estimativa perde a validade/);
  const leitura = htmlCardCargas({ matrizIndividualizacao: { cargas: { referencia: { supino: { rm: 70 } }, rir: '2-3', airbike: { rpm: 60, calPorMin: 12 } } } }, false);
  assert.match(leitura, /<dt>Agachamento<\/dt><dd><span class="card-vazio">—/, 'sem 1RM, o traço');
  assert.match(leitura, /2–3 · padrão/);
  assert.match(leitura, /60 RPM · 12 cal\/min/);
  const ed = htmlCardCargas({}, true);
  assert.match(ed, /<form id="form-treino-cargas"/);
  assert.equal((ed.match(/data-lev=/g) || []).length, 3);
  assert.match(ed, /placeholder="ex\.: 90"/);
});

test('adaptações: regras, lesões só leitura (com o caminho para a Saúde) e as trocas do Montador', () => {
  const v = { ...tati, restricoes: [{ evitarId: 'supino_smith', substitutoId: 'supino_halter', motivo: 'definido no montador' }, { substitutoId: 'x' }] };
  const h = htmlCardAdaptacoes(v, false, { supino_smith: 'Supino reto no Smith', supino_halter: 'Supino reto com halteres' });
  assert.match(h, /Faz impacto normalmente/);
  assert.match(h, /sa-lesao g-moderada">Joelho · moderada/);
  assert.match(h, /data-ir-aba="saude">Editar na aba Saúde/);
  assert.match(h, /<s><span data-ex="supino_smith">Supino reto no Smith<\/span><\/s> → <b><span data-ex="supino_halter">Supino reto com halteres<\/span><\/b>/);
  assert.equal((h.match(/<li><s>/g) || []).length, 1, 'troca sem o exercício evitado não aparece');
  const ed = htmlCardAdaptacoes(v, true);
  assert.match(ed, /<form id="form-treino-adapt"/);
  assert.doesNotMatch(ed, /data-remover-lesao|linhaLesao|data-lista-lesoes/, 'as lesões não se editam aqui');
  assert.match(htmlTrocas({}, null), /Nenhuma troca fixa/);
  assert.equal(nomeDoExercicio('supino_smith', null), 'Supino smith', 'sem o catálogo, o id legível');
});

test('resumo do Motor: o que muda para este aluno, ou "sem individualização"', () => {
  assert.match(htmlResumoMotor(matrizDe({})), /Sem individualização/);
  const m = matrizDe({ foco: ['perna'], matrizIndividualizacao: { perfil: { fase: 'forca' }, cargas: { rir: '1-2' }, adaptacoes: { impacto: 'reduzir', lesoes: [LESAO] } } });
  assert.match(htmlResumoMotor(m), /O Motor vai aplicar<\/span> Fase: <b>Força<\/b> · Foco: <b>Perna<\/b> · RIR <b>1-2<\/b> · Reduzir impacto/);
  // O resumo ao vivo: a ficha com o que está nos formulários por cima.
  const v = vistaCom(tati, { 'matrizIndividualizacao.perfil.fase': 'hipertrofia' });
  assert.equal(v.matrizIndividualizacao.perfil.fase, 'hipertrofia');
  assert.deepEqual(v.matrizIndividualizacao.adaptacoes.lesoes, [LESAO], 'o resto da matriz continua');
});

test('a aba: resumo no topo; Perfil, Cargas, Adaptações (editáveis), depois Metas, Força e Feedbacks', () => {
  const h = htmlAbaTreino(tati, { editando: new Set() }) .replace('<div class="tr-zona" id="treino-fixos"></div>', htmlFixos(tati));
  const ordem = ['tr-motor', 'card-perfil-treino', 'card-cargas', 'card-adaptacoes', 'card-metas', 'card-forca', 'card-feedbacks'].map((id) => h.indexOf(`id="${id}"`));
  assert.ok(ordem.every((p) => p >= 0), String(ordem));
  assert.deepEqual([...ordem].sort((x, y) => x - y), ordem);
  assert.deepEqual([...CARDS_EDITAVEIS], ['perfil-treino', 'cargas', 'adaptacoes']);
  const fixos = htmlFixos(tati);
  assert.match(fixos, /id="prog-metas"/);
  assert.match(fixos, /Nenhuma avaliação cadastrada ainda/);
  assert.match(fixos, /id="prog-cargas"[\s\S]*id="prog-nutri"/);
  assert.match(fixos, /Nenhum feedback ainda/);
  assert.doesNotMatch(fixos, /Adesão|Medalhas/, 'adesão e medalhas não são da aba Treino');
});

test('a aba Treino substitui Perfil de treino, Matriz e Progresso', async () => {
  const { ABAS } = await import('./ui-perfil.js?v=20');
  assert.ok(ABAS.some((a) => a.id === 'treino'));
  assert.ok(!ABAS.some((a) => ['dados', 'matriz', 'progresso'].includes(a.id)));
  const fonte = readFileSync(new URL('./ui-tab-treino.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /db\.atualizar\(|type="submit"/, 'quem grava é o salvar global');
  assert.doesNotMatch(fonte, /`\$\{CAMPO\}\.adaptacoes`\]/, 'nunca o bloco de adaptações inteiro');
});

/* ---------- fiação ---------- */

test('perfil de treino: o ✎ abre o formulário; o que mudou vai para o rascunho; Salvar grava no topo e na matriz, sem tocar nas lesões', async () => {
  await semAviso(async () => {
    db.criar(structuredClone(tati));
    const painel = abrirTreino('Tr01');
    assert.match(painel.innerHTML, /id="card-perfil-treino"/);
    assert.doesNotMatch(painel.innerHTML, /form-treino-perfil/, 'abre em leitura');
    // O formulário "mostra" a ficha ao abrir (no navegador, os campos vêm do HTML).
    const form = el('#form-treino-perfil');
    Object.assign(form.campos, { nivel: 'iniciante', objetivo: 'Hipertrofia', fase: '', freqVezes: '3', focoPrimario: 'peito', focoSecundario: '', diasTreino: ['seg', 'qua'], hora_seg: '07:00', hora_qua: '19:00' });
    editarCard('perfil-treino');
    assert.match(el('#treino-editaveis').innerHTML, /<form id="form-treino-perfil"/);
    // O coach muda nível, fase e o foco secundário.
    Object.assign(form.campos, { nivel: 'intermediario', fase: 'forca', focoSecundario: 'costas' });
    painel.disparar('input');
    assert.match(el('#barra-salvar').innerHTML, /Alterações não salvas[\s\S]*3 campos/);
    assert.match(el('#tr-motor').innerHTML, /Fase: <b>Força<\/b>/, 'o resumo do Motor acompanha antes de salvar');
    assert.equal(await salvar(), true);
    const a = db.obter('Tr01');
    assert.equal(a.nivel, 'intermediario');
    assert.deepEqual(a.foco, ['peito', 'costas']);
    assert.equal(a.matrizIndividualizacao.perfil.fase, 'forca');
    assert.deepEqual(a.matrizIndividualizacao.adaptacoes.lesoes, [LESAO], 'as lesões da aba Saúde continuam');
    assert.equal(a.matrizIndividualizacao.versao, 1);
    assert.ok(a.matrizIndividualizacao.atualizadoEm > 0);
    assert.deepEqual(a.diasTreino, ['seg', 'qua'], 'campo não mexido continua');
    assert.match(pendentes().at(-1).resumo, /Nível/);
    assert.doesNotMatch(el('#treino-editaveis').innerHTML, /form-treino-perfil/, 'depois de salvar, volta à leitura');
  });
});

test('adaptações e cargas: gravam campo a campo na matriz — as lesões ficam como estavam', async () => {
  await semAviso(async () => {
    db.criar({ ...structuredClone(tati), id: 'Tr02' });
    const painel = abrirTreino('Tr02');
    const adapt = el('#form-treino-adapt');
    Object.assign(adapt.campos, { impacto: 'livre', tracao: 'barra', adaptacoesObs: '' }); adapt.checados = [];
    const cargas = el('#form-treino-cargas');
    cargas.campos = { rir: '', rpm: '', calPorMin: '', airbikeObs: '' };
    cargas.blocos = [bloco('agachamento'), bloco('supino'), bloco('terra')];
    editarCard('adaptacoes');
    editarCard('cargas');
    Object.assign(adapt.campos, { impacto: 'converter_airbike', adaptacoesObs: 'sem carga axial' }); adapt.checados = ['ombro_overhead'];
    cargas.blocos[0].v.kg = '100'; cargas.blocos[0].v.reps = '5'; cargas.campos.rir = '2-3';
    painel.disparar('input');
    assert.match(cargas.blocos[0].saida.innerHTML, /116,5 kg/, 'o 1RM sai ao vivo');
    assert.match(cargas.blocos[1].saida.textContent, /Sem 1RM/);
    assert.match(el('#barra-salvar').innerHTML, /4 campos/, 'impacto, mobilidade, observação e cargas');
    await salvar();
    const m = db.obter('Tr02').matrizIndividualizacao;
    assert.equal(m.adaptacoes.impacto, 'converter_airbike');
    assert.deepEqual(m.adaptacoes.mobilidade, ['ombro_overhead']);
    assert.equal(m.adaptacoes.obs, 'sem carga axial');
    assert.deepEqual(m.adaptacoes.lesoes, [LESAO]);
    assert.deepEqual(m.cargas.referencia.agachamento, { kg: 100, reps: 5, rm: null, medidoEm: '' });
    assert.equal(m.cargas.rir, '2-3');
    assert.match(el('#treino-editaveis').innerHTML, /116,5 kg<\/b> <span class="tr-sub">estimado · 100 kg × 5/);
  });
});

test('cards de leitura: o ✎ não os redesenha; reabrir a aba, sim — com a meta digitada e a avaliação nova', async () => {
  await semAviso(async () => {
    db.criar({ id: 'Tr03', nome: 'Téo' });
    db.addAvaliacao('Tr03', { dataRealizada: '2026-01-10', peso: '80' });
    abrirTreino('Tr03');
    const fixos = el('#treino-fixos');
    const antes = fixos.desenhos;
    assert.match(fixos.innerHTML, /Cadastre ao menos 2 avaliações/);
    editarCard('cargas');
    editarCard('cargas', false);
    assert.equal(fixos.desenhos, antes, 'editar um card não recarrega os gráficos');
    // O coach começa uma meta, lança a 2ª avaliação na outra aba e volta.
    el('#meta-tipo').value = 'cintura';
    el('#meta-alvo').value = '72';
    emit(EVENTOS.ABRIR_ABA, 'avaliacoes');
    db.addAvaliacao('Tr03', { dataRealizada: '2026-04-10', peso: '76' });
    emit(EVENTOS.ABRIR_ABA, 'treino');
    assert.equal(fixos.desenhos, antes + 1, 'abrir a aba atualiza os cards de leitura uma vez');
    assert.match(fixos.innerHTML, /Peso: −4,0 kg/, 'a evolução já entra');
    assert.match(fixos.innerHTML, /class="tr-graf"/);
    assert.deepEqual([el('#meta-tipo').value, el('#meta-alvo').value], ['cintura', '72'], 'a meta não salva volta aos campos');
    // Perfil reaberto: começa limpo.
    abrirTreino('Tr03');
    assert.deepEqual([el('#meta-tipo').value, el('#meta-alvo').value], ['', '']);
  });
});

test('feedback que chega pelo merge aparece com a aba aberta; de outro aluno, não', async () => {
  await semAviso(async () => {
    abrirTreino('Tr03');
    const fixos = el('#treino-fixos'), antes = fixos.desenhos;
    db.atualizar('Tr03', { feedbacks: [{ id: 'f1', data: '2026-10-06', esforco: 8, dor: 'leve', obs: 'pesado', criadoEm: 1 }] });
    emit(EVENTOS.REGISTROS_MUDARAM, 'Tr03');
    assert.equal(fixos.desenhos, antes + 1);
    assert.match(fixos.innerHTML, /Esforço <b>8<\/b>\/10/);
    emit(EVENTOS.REGISTROS_MUDARAM, 'Outro');
    assert.equal(fixos.desenhos, antes + 1);
  });
});

test('o ✎ do card Perfil da aba Geral abre a aba Treino com o Perfil de treino já em edição', async () => {
  await semAviso(async () => {
    abrirTreino('Tr03');
    emit(EVENTOS.ABRIR_ABA, 'geral');
    editarNaAbaTreino('perfil-treino');
    assert.match(el('#treino-editaveis').innerHTML, /<form id="form-treino-perfil"/);
    const geral = readFileSync(new URL('./ui-tab-geral.js', import.meta.url), 'utf8');
    assert.match(geral, /data-ir-aba="treino" data-editar="perfil-treino"/);
  });
});
