// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-perfil.test.js
 *
 * O cabeçalho da ficha e a barra de abas. A guarda mais importante é a última:
 * aba sem painel (ou painel sem aba) é tela que não abre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABAS, htmlCabecalho, htmlAbas, linkWhatsAppDoAluno, abaDoAlerta, proximoCompacto, COMPACTA_EM, EXPANDE_EM } from './ui-perfil.js?v=26';

const HOJE = '2026-10-07';
const ana = {
  id: 'Ana0101', nome: 'Ana Lima', objetivo: 'Hipertrofia', status: 'ativo', telefone: '(14) 99999-0000',
  avaliacoes: [{ num: 1, dataRealizada: '2026-07-01', dataProxima: '2026-10-01' }],
};
const lesao = (gravidade) => ({ matrizIndividualizacao: { adaptacoes: { lesoes: [{ regiao: 'joelho', gravidade }] } } });

test('cabeçalho: nome (h1), número, situação, objetivo e as ações', () => {
  const h = htmlCabecalho(ana, HOJE);
  assert.match(h, /<h1 class="pc-nome">Ana Lima<\/h1>/);
  assert.match(h, /<span class="pc-num">#Ana0101<\/span>/);
  assert.match(h, /<span class="status ativo">Ativo<\/span>/);
  assert.match(h, /<div class="pc-obj">Hipertrofia<\/div>/);
  for (const acao of ['voltar', 'pdf', 'foto', 'acesso', 'excluir']) assert.match(h, new RegExp(`data-acao="${acao}"`));
  assert.match(h, /id="p-avatar"/, 'o upload da foto ainda acha o botão por esse id');
});

test('cabeçalho: selo de nível com os três níveis do Motor, e nenhum sem nível', () => {
  assert.match(htmlCabecalho({ ...ana, nivel: 'avancado' }, HOJE), /<span class="pc-selo nivel">Avançado<\/span>/);
  assert.doesNotMatch(htmlCabecalho(ana, HOJE), /pc-selo nivel/);
});

test('cabeçalho: alerta médico — vermelho na lesão moderada/severa, âmbar na leve e no PAR-Q', () => {
  assert.doesNotMatch(htmlCabecalho(ana, HOJE), /pc-selo alerta/, 'sem motivo, sem selo');
  const severa = htmlCabecalho({ ...ana, ...lesao('severa') }, HOJE);
  assert.match(severa, /class="pc-selo alerta vermelho" data-acao="alerta" data-aba="saude"/);
  assert.match(severa, /title="Lesão severa · Joelho"/, 'o motivo aparece ao passar o dedo/mouse');
  assert.match(htmlCabecalho({ ...ana, ...lesao('moderada') }, HOJE), /pc-selo alerta vermelho/);
  assert.match(htmlCabecalho({ ...ana, ...lesao('leve') }, HOJE), /pc-selo alerta ambar/);
  const parq = htmlCabecalho({ ...ana, parq: { respostas: { q2: 'sim' } } }, HOJE);
  assert.match(parq, /class="pc-selo alerta ambar" data-acao="alerta" data-aba="saude"/, 'o PAR-Q também mora na Saúde');
});

test('alerta: abre a aba Saúde, onde moram as lesões e o PAR-Q', () => {
  assert.equal(abaDoAlerta(lesao('leve')), 'saude');
  assert.equal(abaDoAlerta({ parq: { respostas: { q0: 'sim' } } }), 'saude');
});

test('ações: WhatsApp com o telefone salvo; sem telefone, botão desabilitado e explicado', () => {
  const h = htmlCabecalho(ana, HOJE);
  assert.match(h, /<a class="pc-btn wa" href="https:\/\/api\.whatsapp\.com\/send\?phone=5514999990000" target="_blank" rel="noopener"/);
  const sem = htmlCabecalho({ ...ana, telefone: '' }, HOJE);
  assert.match(sem, /<button class="pc-btn wa" type="button" disabled title="Sem telefone na ficha"/);
  assert.equal(linkWhatsAppDoAluno('1234'), '', 'número que não dá para discar não vira link');
  assert.equal(linkWhatsAppDoAluno('14 99999-0000'), 'https://api.whatsapp.com/send?phone=5514999990000');
});

test('ações: menu ⋯ fechado, com acesso, foto e excluir (em vermelho, depois de um separador)', () => {
  const h = htmlCabecalho(ana, HOJE);
  assert.match(h, /data-menu-botao type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="pc-menu-lista"/);
  assert.match(h, /id="pc-menu-lista" role="menu" aria-label="Mais ações" hidden/);
  const itens = [...h.matchAll(/role="menuitem"[^>]*data-acao="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(itens, ['pdf', 'acesso', 'foto', 'excluir']);
  assert.match(h, /role="separator"><\/div>\s*<button role="menuitem" class="perigo" data-acao="excluir"/);
  assert.match(h, /class="so-compacto" data-acao="pdf"/, 'o PDF do menu só aparece no celular compacto');
});

test('compacto: encolhe passando de COMPACTA_EM e só volta abaixo de EXPANDE_EM (sem piscar no limite)', () => {
  assert.ok(EXPANDE_EM < COMPACTA_EM);
  assert.equal(proximoCompacto(false, 0), false);
  assert.equal(proximoCompacto(false, COMPACTA_EM), false);
  assert.equal(proximoCompacto(false, COMPACTA_EM + 1), true);
  assert.equal(proximoCompacto(true, 50), true, 'no meio da folga, fica como está');
  assert.equal(proximoCompacto(false, 50), false, 'no meio da folga, fica como está');
  assert.equal(proximoCompacto(true, EXPANDE_EM - 1), false);
});

test('cabeçalho: o mesmo anel de reavaliação da lista', () => {
  assert.match(htmlCabecalho(ana, HOJE), /class="pc-id st-ativo reav-atrasada"/);
  assert.match(htmlCabecalho(ana, HOJE), /Reavaliação atrasada · 6 dias/);
  const inativa = htmlCabecalho({ ...ana, status: 'inativo' }, HOJE);
  assert.match(inativa, /class="pc-id st-inativo reav-inativo"/);
  assert.doesNotMatch(inativa, /Reavaliação atrasada/, 'inativo não deve reavaliação, como na lista');
  assert.match(inativa, /<span class="status inativo">Inativo<\/span>/);
});

test('cabeçalho: foto quando tem, iniciais quando não; sem objetivo, sem a linha', () => {
  assert.match(htmlCabecalho({ ...ana, fotoUrl: 'https://x/f.webp' }, HOJE), /<img src="https:\/\/x\/f\.webp" alt="" \/>/);
  const sem = htmlCabecalho({ id: '9', nome: 'Bia Souza' }, HOJE);
  assert.match(sem, /<span class="pc-ini">BS<\/span>/);
  assert.doesNotMatch(sem, /pc-obj/);
  assert.match(htmlCabecalho({ id: '9' }, HOJE), /Sem nome/);
});

test('cabeçalho: texto digitado é escapado', () => {
  const h = htmlCabecalho({ id: '<i>', nome: '<script>x</script>', objetivo: 'a & b' }, HOJE);
  assert.doesNotMatch(h, /<script>|<i>/);
  assert.match(h, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(h, /a &amp; b/);
});

test('abas: tablist com uma só selecionada e só ela no Tab do teclado', () => {
  const h = htmlAbas('treino');
  assert.equal((h.match(/role="tab"/g) || []).length, ABAS.length);
  assert.equal((h.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(h, /id="aba-treino" aria-controls="tab-treino" aria-selected="true" tabindex="0" data-tab="treino"/);
  assert.equal((h.match(/tabindex="0"/g) || []).length, 1);
  assert.match(htmlAbas('geral', [{ id: 'financeiro', rotulo: 'Financeiro' }]), /data-tab="financeiro" type="button">Financeiro</, 'aba nova = uma linha a mais');
});

test('abas: cada aba tem o seu painel no index.html, e cada painel tem aba', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const paineis = [...html.matchAll(/class="tab-panel[^"]*" id="tab-([a-z]+)" role="tabpanel" aria-labelledby="aba-([a-z]+)"/g)];
  assert.deepEqual(paineis.map((m) => m[1]).sort(), ABAS.map((a) => a.id).sort());
  for (const m of paineis) assert.equal(m[1], m[2], `painel tab-${m[1]} rotulado pela aba certa`);
  assert.match(html, /<nav class="perfil-abas" id="perfil-abas" role="tablist"/);
  assert.match(html, /<header class="perfil-cab" id="perfil-cab">/);
});
