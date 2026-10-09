// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-telas-comunicacao.test.js
 *
 * As quatro telas de comunicação ligadas ao roteador — publicar, editar,
 * cancelar, ocultar, excluir (confirmando ou não), enviar aviso, status e
 * exclusão de lead. O armazenamento, a nuvem e os diálogos entram por
 * parâmetro (`iniciarTela…(deps)`), então nada aqui sai da memória.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ---------- DOM de mentira ---------- */
/** @param {string} sel */
function elemento(sel) {
  return {
    sel, innerHTML: '', textContent: '', value: '', hidden: false, filhos: /** @type {any[]} */ ([]), ouvintes: /** @type {Record<string, Function>} */ ({}),
    addEventListener(t, f) { this.ouvintes[t] = f; }, focus() { foco = sel; },
    querySelector(q) { return q === '.btn-badge' ? this.filhos.find((f) => f.className === 'btn-badge') || null : null; },
    appendChild(f) { this.filhos.push(f); f.pai = this; },
  };
}
/** @type {Record<string, any>} */ const tela = {};
let foco = '';
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({
  querySelector: (s) => el(s), querySelectorAll: () => [],
  createElement: () => ({ className: '', textContent: '', title: '', remove() { this.pai.filhos = this.pai.filhos.filter((x) => x !== this); } }),
});
const mem = new Map();
globalThis.localStorage = /** @type {any} */ ({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });

const { emit, EVENTOS } = await import('./estado.js?v=13');
const { iniciarTelaAvisos } = await import('./ui-tela-avisos.js?v=13');
const { iniciarTelaMural } = await import('./ui-tela-mural.js?v=13');
const { iniciarTelaDesafios } = await import('./ui-tela-desafios.js?v=13');
const { iniciarTelaLeads, carregarBadgeLeads } = await import('./ui-tela-leads.js?v=13');

/* ---------- o que vem de fora, em memória ---------- */
const DIA = 86400000, AGORA = Date.UTC(2026, 9, 8, 12);
const fora = {
  alunos: /** @type {any[]} */ ([]), avisos: /** @type {any[]} */ ([]), desafios: /** @type {any[]} */ ([]), leads: /** @type {any[]} */ ([]),
  resposta: true, falha: false, chamadas: /** @type {any[]} */ ([]), ids: 0,
};
const copia = (x) => JSON.parse(JSON.stringify(x));
const registra = (...c) => fora.chamadas.push(c);
const comum = { confirmar: async (/** @type {any} */ o) => { registra('confirmar', o.titulo); return fora.resposta; }, agora: () => AGORA };
iniciarTelaAvisos({ listar: () => copia(fora.alunos), avisar: (o) => registra('avisar', o.texto), abrir: (u) => registra('abrir', u), copiar: async (t) => { registra('copiar', t); } });
iniciarTelaMural({ ...comum, listar: () => copia(fora.avisos), salvar: async (a) => { fora.avisos = copia(a); }, novoId: () => `av${++fora.ids}` });
iniciarTelaDesafios({ ...comum, listar: () => copia(fora.desafios), salvar: async (a) => { fora.desafios = copia(a); }, novoId: () => `d${++fora.ids}` });
iniciarTelaLeads({
  ...comum,
  carregar: async () => { if (fora.falha) throw new Error('rede'); return copia(fora.leads); },
  atualizarStatus: async (id, st) => { registra('status', id, st); if (fora.falha) throw new Error('rede'); },
  excluir: async (id) => { registra('excluir', id); if (fora.falha) throw new Error('rede'); },
});
const esperar = () => new Promise((r) => setTimeout(r, 0));
/** Um clique num item desenhado: o alvo responde a `closest` como no DOM. */
const alvo = (classe, dataset = {}) => {
  const t = { dataset, classList: { contains: (c) => c === classe } };
  return { ...t, closest: (/** @type {string} */ s) => (s === '[data-id]' ? (dataset.id ? t : null) : s === '.' + classe ? t : null) };
};

/* ---------- Mural ---------- */

test('mural: publicar, editar e cancelar a edição', async () => {
  fora.avisos = [];
  emit(EVENTOS.ABRIR_TELA, 'mural');
  assert.match(el('#mural-list').innerHTML, /Nenhum aviso/);
  el('#mural-titulo').value = ' Feriado '; el('#mural-texto').value = 'Sem aula'; el('#mural-tipo').value = 'importante';
  await el('#mural-form').ouvintes.submit({ preventDefault() {} });
  assert.deepEqual(fora.avisos, [{ id: 'av1', titulo: 'Feriado', texto: 'Sem aula', tipo: 'importante', ativo: true, criadoEm: AGORA }]);
  assert.equal(el('#mural-titulo').value, '', 'o formulário limpa depois de publicar');
  // Editar: o formulário recebe o aviso, e salvar troca só os campos.
  await el('#mural-list').ouvintes.click({ target: alvo('mural-editar', { id: 'av1' }) });
  assert.deepEqual([el('#mural-titulo').value, el('#mural-add').textContent, el('#mural-cancelar').hidden, foco], ['Feriado', 'Salvar alteração', false, '#mural-titulo']);
  el('#mural-texto').value = 'Volta segunda';
  await el('#mural-form').ouvintes.submit({ preventDefault() {} });
  assert.equal(fora.avisos.length, 1, 'editar não cria outro');
  assert.deepEqual(fora.avisos[0], { id: 'av1', titulo: 'Feriado', texto: 'Volta segunda', tipo: 'importante', ativo: true, criadoEm: AGORA });
  // Cancelar a edição volta ao "publicar".
  await el('#mural-list').ouvintes.click({ target: alvo('mural-editar', { id: 'av1' }) });
  el('#mural-cancelar').ouvintes.click();
  assert.deepEqual([el('#mural-titulo').value, el('#mural-add').textContent, el('#mural-cancelar').hidden], ['', 'Publicar aviso', true]);
  // Sem título ou texto, nada é gravado.
  el('#mural-titulo').value = 'Só título'; el('#mural-texto').value = '  ';
  await el('#mural-form').ouvintes.submit({ preventDefault() {} });
  assert.equal(fora.avisos.length, 1);
});

test('mural: ocultar/reativar e excluir — só com a confirmação; excluir o que está em edição limpa o formulário', async () => {
  fora.avisos = [{ id: 'x', titulo: 'A', texto: 'a', tipo: 'info', ativo: true, criadoEm: 1 }];
  emit(EVENTOS.ABRIR_TELA, 'mural');
  await el('#mural-list').ouvintes.click({ target: alvo('mural-toggle', { id: 'x' }) });
  assert.equal(fora.avisos[0].ativo, false);
  assert.match(el('#mural-list').innerHTML, /Oculto[^]*Reativar/);
  await el('#mural-list').ouvintes.click({ target: alvo('mural-toggle', { id: 'x' }) });
  assert.equal(fora.avisos[0].ativo, true);
  // Excluir, mas o coach desiste no diálogo: nada sai.
  fora.resposta = false;
  await el('#mural-list').ouvintes.click({ target: alvo('mural-excluir', { id: 'x' }) });
  assert.equal(fora.avisos.length, 1);
  // Editando, e então exclui o mesmo: sai, e o formulário não fica preso na edição.
  fora.resposta = true;
  await el('#mural-list').ouvintes.click({ target: alvo('mural-editar', { id: 'x' }) });
  await el('#mural-list').ouvintes.click({ target: alvo('mural-excluir', { id: 'x' }) });
  assert.deepEqual(fora.avisos, []);
  assert.deepEqual([el('#mural-titulo').value, el('#mural-add').textContent], ['', 'Publicar aviso']);
});

/* ---------- Desafios ---------- */

test('desafios: publicar com ícone, meta (1 a 7) e categoria; editar; excluir', async () => {
  fora.desafios = [];
  emit(EVENTOS.ABRIR_TELA, 'desafios');
  assert.match(el('#des-emojis').innerHTML, /des-emoji on" data-e="💧"/, 'abre com o ícone padrão');
  el('#des-emojis').ouvintes.click({ target: { closest: () => ({ dataset: { e: '🔥' } }) } });
  el('#des-titulo').value = 'Água'; el('#des-texto').value = '2L por dia'; el('#des-meta').value = '9'; el('#des-categoria').value = '';
  await el('#des-form').ouvintes.submit({ preventDefault() {} });
  const id = fora.desafios[0].id;
  assert.deepEqual(fora.desafios, [{ id, icone: '🔥', titulo: 'Água', descricao: '2L por dia', metaDias: 7, categoria: 'geral', ativo: true, criadoEm: AGORA }]);
  assert.deepEqual([el('#des-meta').value, el('#des-categoria').value], ['5', 'geral'], 'o formulário volta ao padrão');
  await el('#des-list').ouvintes.click({ target: alvo('des-editar', { id }) });
  assert.deepEqual([el('#des-titulo').value, el('#des-meta').value, el('#des-add').textContent], ['Água', '7', 'Salvar alteração']);
  assert.match(el('#des-emojis').innerHTML, /des-emoji on" data-e="🔥"/, 'a edição traz o ícone do desafio');
  el('#des-meta').value = '3'; el('#des-categoria').value = 'agua';
  await el('#des-form').ouvintes.submit({ preventDefault() {} });
  assert.deepEqual([fora.desafios.length, fora.desafios[0].metaDias, fora.desafios[0].categoria], [1, 3, 'agua']);
  await el('#des-list').ouvintes.click({ target: alvo('des-toggle', { id }) });
  assert.equal(fora.desafios[0].ativo, false);
  await el('#des-list').ouvintes.click({ target: alvo('des-excluir', { id }) });
  assert.deepEqual(fora.desafios, []);
});

/* ---------- Aviso em massa ---------- */

test('aviso: sem mensagem, avisa e não abre nada; com mensagem, abre o WhatsApp e marca "Enviado"', () => {
  fora.alunos = [{ id: 'a', nome: 'Ana', telefone: '(14) 99999-0000' }, { id: 'b', nome: 'Bia', telefone: '123' }];
  fora.chamadas = [];
  emit(EVENTOS.ABRIR_TELA, 'aviso');
  assert.equal(el('#aviso-count').textContent, '0 de 1 enviados', 'telefone incompleto fica de fora');
  el('#aviso-msg').value = '  ';
  el('#aviso-list').ouvintes.click({ target: { closest: () => ({ dataset: { id: 'a', tel: '(14) 99999-0000' } }) } });
  assert.deepEqual(fora.chamadas, [['avisar', 'Escreva a mensagem primeiro.']]);
  el('#aviso-tpls').ouvintes.click({ target: { closest: () => ({ dataset: { t: 'Bom treino a todos! 💪' } }) } });
  el('#aviso-list').ouvintes.click({ target: { closest: () => ({ dataset: { id: 'a', tel: '(14) 99999-0000' } }) } });
  assert.deepEqual(fora.chamadas[1], ['abrir', 'https://api.whatsapp.com/send?phone=5514999990000&text=Bom%20treino%20a%20todos!%20%F0%9F%92%AA']);
  assert.equal(el('#aviso-count').textContent, '1 de 1 enviados');
  assert.match(el('#aviso-list').innerHTML, /Enviado ✓[^]*Reenviar/);
});

/* ---------- Leads ---------- */

test('leads: abre da nuvem, ordena por follow-up, troca status e exclui com confirmação', async () => {
  fora.falha = false; fora.chamadas = [];
  fora.leads = [
    { id: 'L1', nome: 'Bia Lima', status: 'novo', criadoEm: AGORA - 5 * DIA },
    { id: 'L2', nome: 'Caio', status: 'convertido', criadoEm: AGORA - 1 * DIA },
    { id: 'L3', nome: 'Lixo', status: 'descartado', criadoEm: AGORA - 9 * DIA },
  ];
  emit(EVENTOS.ABRIR_TELA, 'leads'); await esperar();
  assert.match(el('#leads-tot').innerHTML, /Novos<\/span><span class="fin-card-v bad">1</);
  assert.ok(el('#leads-list').innerHTML.indexOf('Bia Lima') < el('#leads-list').innerHTML.indexOf('Caio'), 'o parado vem primeiro');
  assert.ok(!el('#leads-list').innerHTML.includes('Lixo'), 'descartado não aparece');
  assert.equal(el('#btn-leads').filhos[0]?.textContent, '1', 'o selo do botão "Leads"');
  await el('#leads-list').ouvintes.change({ target: { closest: () => ({ dataset: { id: 'L1' }, value: 'convertido' }) } });
  assert.deepEqual(fora.chamadas.at(-1), ['status', 'L1', 'convertido']);
  assert.match(el('#leads-tot').innerHTML, /Convertidos em aluno<\/span><span class="fin-card-v ok">2</);
  assert.equal(el('#btn-leads').filhos.length, 0, 'ninguém parado: o selo some');
  fora.resposta = false;
  await el('#leads-list').ouvintes.click({ target: alvo('lead-excluir', { id: 'L2' }) });
  assert.ok(!fora.chamadas.some((c) => c[0] === 'excluir'), 'desistiu no diálogo: nada é excluído');
  fora.resposta = true;
  await el('#leads-list').ouvintes.click({ target: alvo('lead-excluir', { id: 'L2' }) });
  assert.deepEqual(fora.chamadas.at(-1), ['excluir', 'L2']);
  assert.ok(!el('#leads-list').innerHTML.includes('Caio'));
});

test('leads: sem rede, a tela diz que não deu; o selo do login falha em silêncio', async () => {
  fora.falha = true;
  emit(EVENTOS.ABRIR_TELA, 'leads'); await esperar();
  assert.match(el('#leads-list').innerHTML, /Não foi possível carregar agora/);
  const w = console.warn; console.warn = () => {};
  try { await carregarBadgeLeads(); } finally { console.warn = w; }
  fora.falha = false;
});

/* ---------- fatiamento ---------- */

test('fatiamento: as quatro telas moram nos módulos delas; o app.js só carrega o selo no login', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const app = ler('./boot.js');
  for (const resto of ['renderAviso', 'renderMural', 'muralEdit', 'renderDesafios', 'desEdit', 'desenharLeads', 'LEADS_CACHE', 'followUpLead',
    '#aviso-', '#mural-', '#des-', '#leads-', 'avisos_listar', 'des_salvar', 'atualizarStatusLead', 'excluirLead']) {
    assert.ok(!app.includes(resto), `app.js ainda tem ${resto}`);
  }
  assert.match(app, /import \{ carregarBadgeLeads \} from '\.\/ui-tela-leads\.js(\?v=\d+)?';/);
  const main = ler('./telas.js');
  for (const f of ['iniciarTelaAvisos(', 'iniciarTelaMural();', 'iniciarTelaDesafios();', 'iniciarTelaLeads();']) {
    assert.ok(main.indexOf(f) > main.indexOf('iniciarNavegacao();') && main.indexOf(f) < main.length, f);
  }
  // Mural e Desafios usam a mesma lógica de lista (comunicacao-regras.js), não cópias.
  for (const f of ['./ui-tela-mural.js', './ui-tela-desafios.js']) {
    const fonte = ler(f);
    assert.match(fonte, /publicarItem\(/); assert.match(fonte, /alternarAtivo\(/); assert.match(fonte, /removerItem\(/);
    assert.ok(!/\.ativo = |arr\.push\(/.test(fonte), `${f}: sem lógica de lista própria`);
  }
});
