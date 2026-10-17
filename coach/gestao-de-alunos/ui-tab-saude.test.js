// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tab-saude.test.js
 *
 * A aba Saúde em cards (o que cada card mostra em leitura e em edição), as
 * lesões (lesoes.js: a única fonte de lesão ativa, editada aqui e só mostrada
 * na Matriz) e a regra do salvar global para caminhos que se cruzam. O fluxo
 * inteiro da anamnese e do PAR-Q (digitar, trocar de aba, Salvar) está em
 * saude.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  origemDaMedida, htmlCardBiometria, htmlCardAlerta, seloDoParq, leituraAnamnese, leituraParq,
  respondidasAnamnese, htmlCardFormularios, htmlAbaSaude,
} from './ui-tab-saude.js?v=23';
import { CAMINHO_LESOES, normalizarLesoes, descreverLesao, linhaLesao, lesoesDe } from './lesoes.js?v=23';
import { cruzaComRascunho } from './ui-salvar-global.js?v=23';

const HOJE = '2026-10-11';
const comLesoes = (lesoes, extra = {}) => ({ id: 'A1', nome: 'Ana', matrizIndividualizacao: { adaptacoes: { lesoes } }, ...extra });

/* ---------- lesões ---------- */

test('lesões: o caminho na ficha, a limpeza do Motor e o texto', () => {
  assert.equal(CAMINHO_LESOES, 'matrizIndividualizacao.adaptacoes.lesoes');
  assert.deepEqual(normalizarLesoes([{ regiao: 'joelho', gravidade: 'severa', desde: '2026-08-01', obs: ' menisco ' }, { regiao: '', gravidade: 'leve' }]),
    [{ regiao: 'joelho', gravidade: 'severa', desde: '2026-08-01', obs: 'menisco' }], 'linha sem região não é lesão; texto aparado');
  assert.equal(normalizarLesoes([{ regiao: 'ombro', gravidade: 'xyz' }])[0].gravidade, 'leve', 'gravidade desconhecida vira leve');
  assert.equal(descreverLesao({ regiao: 'joelho', gravidade: 'severa', desde: '2026-08-01', obs: 'menisco' }), 'Joelho · severa · desde 01/08/2026 · menisco');
  assert.equal(descreverLesao({ regiao: 'punho', gravidade: 'leve', desde: '', obs: '' }), 'Punho · leve');
  assert.deepEqual(lesoesDe({}), []);
});

test('lesões: a linha do editor vem com a gravidade leve e sem opção vazia de gravidade', () => {
  const h = linhaLesao();
  assert.match(h, /data-lesao/);
  assert.match(h, /<option value="leve" selected>Leve<\/option>/);
  assert.doesNotMatch(h, /aria-label="Gravidade"><option value="">/);
  assert.match(linhaLesao({ obs: 'dor <no> joelho' }), /value="dor &lt;no&gt; joelho"/);
});

test('aba Treino: as lesões só aparecem — quem edita é a aba Saúde', () => {
  const fonte = readFileSync(new URL('./ui-tab-treino.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /mtz-add-lesao|data-remover-lesao|linhaLesao/, 'sem editor de lesões na aba Treino');
  assert.match(fonte, /data-ir-aba="saude">Editar na aba Saúde/);
  assert.match(fonte, /r\[`\$\{CAMPO\}\.adaptacoes\.\$\{k\}`\]/, 'as adaptações gravam campo a campo: as lesões ficam como estão');
});

/* ---------- Biometria ---------- */

test('biometria: a origem de cada medida à vista', () => {
  assert.equal(origemDaMedida({ valor: 67.5, origem: 'avaliacao', num: 2, data: '2026-09-12' }), 'Avaliação #02 · 12/09/2026');
  assert.equal(origemDaMedida({ valor: 80, origem: 'cadastro' }), 'do cadastro — vale até a 1ª avaliação');
  assert.equal(origemDaMedida({ valor: null, origem: null }), 'sem medida');
});

test('biometria: em leitura, peso e altura da avaliação mais recente, idade e sexo', () => {
  const a = { id: 'A1', sexo: 'Feminino', nascimento: '1995-03-10', peso: '80', altura: '165',
    avaliacoes: [{ num: 1, dataRealizada: '2026-05-01', peso: '70', estatura: '165' }, { num: 2, dataRealizada: '2026-09-12', peso: '67,5' }] };
  const h = htmlCardBiometria(a, HOJE, false);
  assert.match(h, /67,5 <small>kg<\/small>[\s\S]*Avaliação #02 · 12\/09\/2026/);
  assert.match(h, /165 <small>cm<\/small>[\s\S]*Avaliação #01 · 01\/05\/2026/, 'a altura vem da avaliação que a mediu');
  assert.match(h, /31 <small>anos<\/small>[\s\S]*nasceu em 10\/03\/1995/);
  assert.match(h, /Feminino/);
  assert.match(h, /data-saude="nova-aval">\+ Nova avaliação/);
});

test('biometria: em edição, peso e altura de avaliação não se editam; os do cadastro sim', () => {
  const comAval = { id: 'A1', avaliacoes: [{ num: 1, dataRealizada: '2026-05-01', peso: '70', estatura: '165' }] };
  const ed = htmlCardBiometria(comAval, HOJE, true);
  assert.match(ed, /id="form-saude-bio"/);
  assert.match(ed, /name="nascimento"[\s\S]*name="sexo"/);
  assert.doesNotMatch(ed, /name="peso"|name="altura"/);
  assert.match(ed, /registre uma nova avaliação/);
  const semAval = htmlCardBiometria({ id: 'A2', peso: '80' }, HOJE, true);
  assert.match(semAval, /name="altura"[\s\S]*name="peso"/, 'sem avaliação, vale o cadastro');
  assert.doesNotMatch(semAval, /registre uma nova avaliação/);
});

/* ---------- Alerta médico e lesões ---------- */

test('alerta: vermelho com lesão moderada/severa; âmbar com leve ou PAR-Q "Sim"; nada sem motivo', () => {
  assert.match(htmlCardAlerta(comLesoes([{ regiao: 'joelho', gravidade: 'severa' }]), false), /fg-bad">Alerta vermelho · muda a prescrição[\s\S]*Lesão severa · Joelho/);
  assert.match(htmlCardAlerta(comLesoes([{ regiao: 'punho', gravidade: 'leve' }]), false), /fg-warn">Alerta âmbar/);
  assert.match(htmlCardAlerta({ id: 'A', parq: { respostas: { q1: 'sim' } } }, false), /fg-warn">Alerta âmbar[\s\S]*PAR-Q com resposta/);
  assert.match(htmlCardAlerta({ id: 'A' }, false), /fg-ok">Sem alerta/);
});

test('alerta: em leitura, as lesões, a nota clínica, o declarado na anamnese e o PAR-Q', () => {
  const a = comLesoes([{ regiao: 'joelho', gravidade: 'moderada', desde: '2026-08-01' }], {
    obs: 'Evitar impacto até a fisio liberar.', anamnese: { doresLesoes: 'Dor no ombro direito', medicamentos: 'Losartana' },
    parq: { respostas: { q0: 'nao', q1: 'nao', q2: 'nao', q3: 'nao', q4: 'nao', q5: 'nao', q6: 'nao' }, data: '2026-09-01' },
  });
  const h = htmlCardAlerta(a, false);
  assert.match(h, /class="sa-lesao g-moderada">Joelho · moderada · desde 01\/08\/2026/);
  assert.match(h, /Evitar impacto até a fisio liberar\./);
  assert.match(h, /Dores \/ lesões atuais<\/dt><dd>Dor no ombro direito/);
  assert.match(h, /Medicamentos<\/dt><dd>Losartana/);
  assert.match(h, /data-saude="registrar-lesao">\+ registrar como lesão/, 'dor declarada vira lesão com um toque');
  assert.match(h, /fg-ok">Apto — todas "Não"[\s\S]*01\/09\/2026/);
  assert.match(h, /data-saude="ver-parq"/);
  assert.doesNotMatch(htmlCardAlerta({ id: 'A' }, false), /registrar-lesao/, 'sem dor declarada, sem o atalho');
});

test('alerta: em edição, o editor de lesões e a nota clínica num formulário só', () => {
  const ed = htmlCardAlerta(comLesoes([{ regiao: 'joelho', gravidade: 'severa' }], { obs: 'x' }), true);
  assert.match(ed, /<form id="form-saude-alerta"/);
  assert.match(ed, /data-lista-lesoes>[\s\S]*data-lesao[\s\S]*<option value="joelho" selected>/);
  assert.match(ed, /data-saude="add-lesao">\+ Adicionar lesão/);
  assert.match(ed, /name="obs"[^>]*>x<\/textarea>/);
  assert.match(ed, /<label>Nota clínica do coach<\/label>/);
});

test('PAR-Q: a triagem numa linha', () => {
  assert.match(seloDoParq({}), /Não respondido/);
  assert.match(seloDoParq({ parq: { respostas: { q0: 'nao' } } }), /Incompleto/);
  assert.match(seloDoParq({ parq: { respostas: { q2: 'sim' }, data: '2026-10-01' } }), /avaliação médica recomendada[\s\S]*01\/10\/2026/);
});

/* ---------- Formulários ---------- */

test('formulários: anamnese em leitura mostra só o respondido, por seção', () => {
  const v = { anamnese: { sono: '7', medicamentos: 'Losartana', rotina: '' } };
  assert.equal(respondidasAnamnese(v), 2);
  const h = leituraAnamnese(v);
  assert.match(h, /Treino &amp; rotina|Treino & rotina/);
  assert.match(h, /Horas de sono \/ noite<\/dt><dd>7/);
  assert.match(h, /Medicamentos em uso<\/dt><dd>Losartana/);
  assert.doesNotMatch(h, /Profissão/, 'sem resposta, sem linha');
  assert.match(leituraAnamnese({}), /Ainda sem respostas/);
});

test('formulários: PAR-Q em leitura — a triagem, cada pergunta com a resposta, data e observações', () => {
  const h = leituraParq({ parq: { respostas: { q0: 'nao', q2: 'sim' }, data: '2026-10-01', obs: 'ok' } });
  assert.match(h, /parq-banner alerta/);
  assert.match(h, /<b class="sf-r nao">Não<\/b>/);
  assert.match(h, /<b class="sf-r sim">Sim<\/b>/);
  assert.match(h, /<b class="sf-r ">—<\/b>/);
  assert.match(h, /Data da triagem<\/dt><dd>01\/10\/2026/);
});

test('formulários: seções fechadas mostram o resumo; abertas, a leitura; em edição, o formulário', () => {
  const v = { anamnese: { sono: '7' }, parq: { respostas: { q0: 'sim' } } };
  const fechado = htmlCardFormularios(v, { abertos: new Set(), editando: new Set() });
  assert.match(fechado, /Anamnese<\/span><span class="sf-resumo">1 de 14 respondidas/);
  assert.match(fechado, /PAR-Q<\/span><span class="sf-resumo">há "Sim"/);
  assert.match(fechado, /aria-expanded="false"/);
  assert.doesNotMatch(fechado, /data-card=/, 'fechada, a seção não tem ✎');
  const aberto = htmlCardFormularios(v, { abertos: new Set(['anamnese']), editando: new Set() });
  assert.match(aberto, /data-card="anamnese" data-modo="editar"/);
  assert.doesNotMatch(aberto, /id="form-anamnese"/);
  const ed = htmlCardFormularios(v, { abertos: new Set(['anamnese', 'parq']), editando: new Set(['parq']) });
  assert.match(ed, /id="form-parq"/);
  assert.doesNotMatch(ed, /id="form-anamnese"/);
});

test('aba Saúde: Alerta primeiro, depois Biometria e Formulários', () => {
  const h = htmlAbaSaude({ id: 'A1' }, { hojeIso: HOJE, editando: new Set(), abertos: new Set() });
  const ordem = ['card-alerta', 'card-biometria', 'card-formularios'].map((id) => h.indexOf(`id="${id}"`));
  assert.ok(ordem.every((p) => p >= 0));
  assert.deepEqual([...ordem].sort((x, y) => x - y), ordem);
});

/* ---------- salvar global: caminhos que se cruzam ---------- */

test('salvar global: o campo cruza com o rascunho no próprio caminho, num de fora ou num de dentro', () => {
  // A Matriz guarda `adaptacoes` inteiro; a Saúde, `adaptacoes.lesoes`.
  assert.equal(cruzaComRascunho(CAMINHO_LESOES, ['matrizIndividualizacao.adaptacoes']), true, 'de fora');
  assert.equal(cruzaComRascunho('matrizIndividualizacao.adaptacoes', [CAMINHO_LESOES]), true, 'de dentro');
  assert.equal(cruzaComRascunho('nome', ['nome']), true);
  assert.equal(cruzaComRascunho('nome', ['nomeSocial', 'anamnese.sono']), false, 'prefixo de texto não é caminho');
});
