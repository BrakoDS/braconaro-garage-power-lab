// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-salvar-global.test.js
 *
 * O salvar global da ficha: as regras puras (o que entra no rascunho, a barra,
 * o patch da matriz), o PAR-Q por caminho e a guarda de saída. O fluxo inteiro
 * (digitar, trocar de aba, Salvar, trilha) está em saude.test.js; a conta do
 * rascunho, em perfil-rascunho.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comPrefixo, caminhosMudados, acaoDoCampo, htmlBarra, nomesDosCampos, completarPatch } from './ui-salvar-global.js?v=22';
import { caminhosDoParq } from './form-par-q.js?v=22';
import { definirGuardaDeSaida, sairComCuidado } from './estado.js?v=22';

test('comPrefixo: um objeto como caminhos', () => {
  assert.deepEqual(comPrefixo('anamnese', { sono: '7', rotina: 'Dev' }), { 'anamnese.sono': '7', 'anamnese.rotina': 'Dev' });
  assert.deepEqual(comPrefixo('x', {}), {});
});

test('caminhosMudados: só o que difere do que o formulário mostrava, mais o que já foi mexido', () => {
  const antes = { nome: 'Ana', telefone: '149', obs: '' };
  assert.deepEqual(caminhosMudados({ nome: 'Ana', telefone: '149', obs: '' }, antes, new Set()), [], 'nada mudou');
  assert.deepEqual(caminhosMudados({ nome: 'Ana Paula', telefone: '149', obs: '' }, antes, new Set()), ['nome']);
  assert.deepEqual(caminhosMudados({ nome: 'Ana', telefone: '149', obs: '' }, antes, new Set(['nome'])), ['nome'],
    'mexido e voltado ao original: passa de novo, para sair do rascunho');
  assert.deepEqual(caminhosMudados({ obs: '' }, { obs: undefined }, new Set()), [], 'vazio = ausente');
  assert.deepEqual(caminhosMudados({ foco: ['perna'] }, { foco: ['perna'] }, new Set()), [], 'listas pelo conteúdo');
});

test('acaoDoCampo: voltar ao que o formulário mostrava desfaz a pendência — mesmo quando ele mostrava um padrão', () => {
  // A Matriz mostra impacto "livre" para quem não tem matriz: adicionar e
  // remover uma lesão volta ao que estava na tela, não ao "nada" da ficha.
  const padrao = { lesoes: [], impacto: 'livre', tracao: 'barra', mobilidade: [], obs: '' };
  assert.equal(acaoDoCampo({ ...padrao }, padrao, false), 'descartar');
  assert.equal(acaoDoCampo({ ...padrao, lesoes: [{ regiao: 'joelho', gravidade: 'severa' }] }, padrao, false), 'definir');
  // O campo já vinha do rascunho (editado em outra aba): voltar ao que a tela
  // mostrava é voltar à edição de antes, que continua valendo.
  assert.equal(acaoDoCampo('avancado', 'avancado', true), 'definir');
  assert.equal(acaoDoCampo('Ana', 'Ana', false), 'descartar');
});

test('barra: some sem pendência; diz quantos campos; avisa que salvou', () => {
  assert.equal(htmlBarra({ pendentes: 0 }), '');
  const h = htmlBarra({ pendentes: 3 });
  assert.match(h, /Alterações não salvas/);
  assert.match(h, /3 campos/);
  assert.match(h, /data-salvar="descartar">Descartar</);
  assert.match(h, /data-salvar="salvar">Salvar</);
  assert.match(htmlBarra({ pendentes: 1 }), /1 campo</);
  assert.match(htmlBarra({ pendentes: 0, salvo: true }), /Alterações salvas ✓/);
});

test('nomes dos campos: pelo campo do topo, sem repetir', () => {
  assert.equal(nomesDosCampos(['telefone', 'anamnese.sono', 'anamnese.medicamentos']), 'Telefone, Anamnese');
  assert.equal(nomesDosCampos(['matrizIndividualizacao.cargas', 'nivel']), 'Matriz, Nível');
});

test('patch: a matriz editada ganha a versão do formato e a hora da edição; o resto passa igual', () => {
  const p = completarPatch({ nome: 'X', matrizIndividualizacao: { cargas: { rir: '2-3' }, historico: { perna: 2 } } }, 123);
  assert.equal(p.nome, 'X');
  assert.deepEqual(p.matrizIndividualizacao, { cargas: { rir: '2-3' }, historico: { perna: 2 }, versao: 1, atualizadoEm: 123 });
  const semMatriz = { telefone: '1' };
  assert.equal(completarPatch(semMatriz, 1), semMatriz);
});

test('PAR-Q por caminho: cada resposta no seu, e a que não foi marcada fica vazia', () => {
  const c = caminhosDoParq({ respostas: { q0: 'nao', q3: 'sim' }, data: '2026-10-07', obs: '' });
  assert.equal(c['parq.respostas.q0'], 'nao');
  assert.equal(c['parq.respostas.q3'], 'sim');
  assert.equal(c['parq.respostas.q1'], undefined);
  assert.equal(c['parq.data'], '2026-10-07');
  assert.equal(Object.keys(c).length, 9, '7 perguntas + data + observações');
});

test('guarda de saída: sem pendência sai NA HORA; com pendência, só se a guarda deixar', async () => {
  const feitas = [];
  definirGuardaDeSaida(() => true);
  sairComCuidado(() => feitas.push('livre'));
  assert.deepEqual(feitas, ['livre'], 'no mesmo tique: a navegação continua síncrona');
  definirGuardaDeSaida(() => Promise.resolve(false));
  sairComCuidado(() => feitas.push('ficou'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(feitas, ['livre'], 'continuar editando: não sai');
  definirGuardaDeSaida(() => Promise.resolve(true));
  sairComCuidado(() => feitas.push('saiu'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(feitas, ['livre', 'saiu']);
  definirGuardaDeSaida(null);
});

test('saídas da ficha passam pela guarda: o voltar do cabeçalho e os botões de tela', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.match(ler('./ui-perfil.js'), /if \(acao === 'voltar'\) sairComCuidado\(\(\) => emit\(EVENTOS\.VOLTAR_LISTA\)\);/);
  assert.match(ler('./navegacao.js'), /sairComCuidado\(\(\) => emit\(EVENTOS\.ABRIR_TELA, b\.dataset\.tela\)\)/);
});

test('as abas de formulário não têm mais Salvar próprio, e se registram no salvar global', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  for (const [arq, aba] of [['ui-tab-geral', 'geral'], ['ui-tab-saude', 'saude'], ['ui-tab-treino', 'treino']]) {
    const f = ler(`./${arq}.js`);
    assert.doesNotMatch(f, /type="submit"|data-saved|db\.atualizar\(/, `${arq} ainda grava sozinho`);
    assert.match(f, new RegExp(`registrarFormulario\\(\\{\\s*aba: '${aba}'`), `${arq} não se registra`);
  }
  const telas = ler('./telas.js');
  assert.ok(telas.indexOf('iniciarSalvarGlobal();') < telas.indexOf('iniciarTabTreino();'), 'o salvar global liga antes das abas');
  const index = ler('./index.html');
  assert.match(index, /<div class="barra-salvar" id="barra-salvar"[^>]*hidden><\/div>\s*<\/section>/, 'a barra nasce escondida, na tela do perfil');
});
