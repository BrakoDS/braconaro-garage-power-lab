// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tabs.test.js
 *
 * As abas extraídas do app.js (Dados, Avaliações, Financeiro) e os
 * utilitários que vieram com elas. Só o que monta HTML ou calcula — a fiação
 * com o DOM é conferida na vitrine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { camposDados, formCadastroCurtoHTML, CAMPOS_CADASTRO, calcIdade, waLink, DIAS_FORM } from './campos-aluno.js?v=25';
import { htmlCardPerfilTreino } from './ui-tab-treino.js?v=25';
import { htmlListaAvaliacoes, htmlResultados, htmlComparacao, htmlResumoAvaliacoes } from './ui-tab-avaliacoes.js?v=25';
import { htmlFatura, htmlFormLancamento, htmlFormPagamento } from './ui-tab-financeiro.js?v=25';
import { historicoFinanceiro, resumoDoPlano } from './financeiro-aluno.js?v=25';
import { numf, fmtData, fmtDataCurta, addDias, opt, horaParaInput, horaLegivel } from './util/formato.js?v=25';
import { EVENTOS } from './estado.js?v=25';

/* ---------- util/formato.js ---------- */

test('formato: números digitados, datas e horas como o box fala', () => {
  assert.equal(numf('72,5'), 72.5);
  assert.equal(numf(''), null);
  assert.equal(fmtData('2026-10-07'), '07/10/2026');
  assert.equal(fmtData(''), '—');
  assert.equal(fmtDataCurta('2026-10-07'), '07/10');
  assert.equal(addDias('2026-12-30', 3), '2027-01-02');
  assert.equal(opt('A & B', 'A & B'), '<option value="A &amp; B" selected>A &amp; B</option>');
  assert.equal(horaParaInput('19 Horas'), '19:00');
  assert.equal(horaParaInput('6:30'), '06:30');
  assert.equal(horaParaInput('sem hora'), '');
  assert.equal(horaLegivel('19:00'), '19h');
  assert.equal(horaLegivel('06:30'), '6h30');
});

/* ---------- Dados ---------- */

/** Todos os campos do cadastro, montados (cada card compõe os seus). @param {any} a @param {any} [o] */
const todosOsCampos = (a, o) => Object.values(camposDados(a, o)).join('');

const ana = {
  id: 'Ana01', nome: 'Ana Lima', email: 'ana@box.com', telefone: '(14) 99999-0000', sexo: 'Feminino',
  status: 'ativo', diasTreino: ['seg', 'qua'], horarios: { seg: '07:00' }, freqHorario: '19h',
  foco: ['perna'], appLiberado: true, parceria: { nome: 'Clínica', percentual: 25 },
};
const bia = { id: 'Bia02', nome: 'Bia', status: 'ativo' };
const caio = { id: 'Caio03', nome: 'Caio', status: 'inativo' };

test('dados: o formulário traz a ficha preenchida, com o ID travado', () => {
  const h = todosOsCampos(ana, { todos: [ana, bia, caio] });
  assert.match(h, /name="nome" type="text" required value="Ana Lima"/);
  assert.match(h, /<option value="Feminino" selected>Feminino<\/option>/);
  assert.match(h, /value="Ana01" disabled/);
  assert.match(h, /name="appLiberado" value="1" checked/);
  assert.match(h, /value="seg" checked\/>/);
  assert.match(h, /name="hora_seg" value="07:00" \/>/, 'hora do dia');
  assert.match(h, /name="hora_qua" value="19:00" \/>/, 'dia sem hora própria herda o freqHorario antigo');
  assert.match(h, /name="hora_ter" value="19:00" disabled \/>/, 'dia desmarcado vem desabilitado');
  assert.match(h, /<option value="25" selected>25% de desconto<\/option>/);
  assert.doesNotMatch(h, /name="foco"/, 'o foco em caixas saiu: ele é primário e secundário, no card Perfil de treino');
});

test('dados: no cadastro o ID é editável', () => {
  assert.match(todosOsCampos({}, { idEditavel: true, todos: [] }), /<input name="id" type="text"/);
});

test('cadastro curto: só o essencial — ID, nome, telefone, e-mail, nascimento, sexo, status, mensalidade e vencimento', () => {
  const h = formCadastroCurtoHTML({ todos: [] });
  const nomes = [...h.matchAll(/name="([a-zA-Z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['id', 'nome', 'telefone', 'email', 'nascimento', 'sexo', 'status', 'mensalidade', 'vencimento']);
  assert.match(h, /<input name="id" type="text"/, 'o ID é editável (ou vazio para numerar sozinho)');
  assert.match(h, /name="nome" type="text" required/);
  assert.match(h, /<option value="ativo" selected>/, 'novo aluno nasce ativo');
  assert.match(h, /completa na ficha/);
  assert.deepEqual([...CAMPOS_CADASTRO], ['id', 'nome', 'telefone', 'email', 'nascimento', 'sexo', 'status', 'mensalidade', 'vencimento'], 'a idade não: ela sai do nascimento');
});

test('dados: "quem paga" só oferece ativos que não são ele nem têm responsável', () => {
  const dep = { id: 'Dudu', nome: 'Dudu', pagoPor: { id: 'Bia02', escopo: 'tudo' } };
  const h = todosOsCampos(ana, { todos: [ana, bia, caio, dep] });
  assert.match(h, /<option value="Bia02">Bia<\/option>/);
  assert.doesNotMatch(h, /value="Caio03"/, 'inativo não é responsável');
  assert.doesNotMatch(h, /value="Dudu"/, 'quem já tem responsável não vira responsável (sem corrente)');
  assert.doesNotMatch(h, /<option value="Ana01"/, 'ninguém paga a própria conta por aqui');
  const responsavel = todosOsCampos(bia, { todos: [ana, bia, dep] });
  assert.match(responsavel, /já paga a conta de outro/);
});

test('dados: texto da ficha é escapado no formulário', () => {
  const h = todosOsCampos({ id: 'x', nome: '"><script>', obs: '</textarea><b>' }, { todos: [] });
  assert.doesNotMatch(h, /<script>|<\/textarea><b>/);
});

test('perfil de treino (card da aba Treino): objetivo, nível, fase, foco, frequência e dias — o resto foi para a Geral e a Saúde', () => {
  const h = htmlCardPerfilTreino(ana, true);
  assert.match(h, /id="form-treino-perfil"/);
  for (const n of ['objetivo', 'nivel', 'fase', 'focoPrimario', 'focoSecundario', 'freqVezes', 'diasTreino']) assert.match(h, new RegExp(`name="${n}"`), n);
  for (const n of ['nome', 'telefone', 'email', 'endereco', 'status', 'appLiberado', 'modoLite', 'mensalidade', 'vencimento', 'pagoPorId', 'nascimento', 'sexo', 'altura', 'peso', 'obs']) {
    assert.doesNotMatch(h, new RegExp(`name="${n}"`), `${n} mora num card da aba Geral ou da Saúde`);
  }
  assert.doesNotMatch(h, /lgpd-tag|acesso-aluno/, 'LGPD e acesso estão no card Acesso');
  assert.doesNotMatch(h, /type="submit"|Salvar alterações/, 'sem Salvar por aba: o salvar global grava a ficha inteira');
  assert.doesNotMatch(h, /btn-excluir-aluno|Excluir aluno/, 'excluir colado no Salvar era um toque errado de distância');
});

test('dados: idade e WhatsApp', () => {
  const ano = new Date().getFullYear();
  assert.equal(calcIdade(`${ano - 30}-01-01`), '30');
  assert.equal(calcIdade(''), '');
  assert.equal(waLink('(14) 99999-0000'), 'https://wa.me/5514999990000');
  assert.equal(waLink('5514999990000'), 'https://wa.me/5514999990000');
  assert.equal(waLink(''), '');
  assert.deepEqual(DIAS_FORM.map(([v]) => v), ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
});

/* ---------- Avaliações ---------- */

const comAvs = {
  id: 'A', nome: 'Ana', sexo: 'Feminino', nascimento: '1996-01-01',
  avaliacoes: [
    { num: 1, dataRealizada: '2026-01-10', dataProxima: '2026-04-10', peso: '70', perimetros: { cintura: '80' }, estatura: '165', fotos: { frente: 'https://x/1.webp' } },
    { num: 2, dataRealizada: '2026-07-10', dataProxima: '2026-12-10', peso: '67.5', perimetros: { cintura: '76' }, estatura: '165', fotos: { frente: 'https://x/2.webp' } },
  ],
};

test('avaliações: histórico da mais nova para a mais antiga; só a mais recente pode estar atrasada', () => {
  const h = htmlListaAvaliacoes(comAvs, '2026-10-07');
  assert.ok(h.indexOf('Avaliação #02') < h.indexOf('Avaliação #01'));
  assert.match(h, /Realizada: 10\/07\/2026 · 67,5 kg/);
  assert.match(h, /data-num="2"[\s\S]*badge-ok">Em dia</);
  assert.match(h, /data-num="1"[\s\S]*class="aprox"[\s\S]*badge-ok">Reavaliada</, 'a "próxima" da #01 foi cumprida pela #02');
  assert.doesNotMatch(h, /badge-late/);
  assert.match(htmlListaAvaliacoes(comAvs, '2026-12-11'), /data-num="2"[\s\S]*class="aprox atrasada"[\s\S]*badge-late">Atrasada/, 'a mais recente vence, sim');
  assert.match(htmlListaAvaliacoes({ avaliacoes: [] }), /Nenhuma avaliação/);
});

test('avaliações: o resumo do card — próxima reavaliação (pela regra do cabeçalho), a última e os números dela', () => {
  const h = htmlResumoAvaliacoes(comAvs, '2026-10-07');
  assert.match(h, /Próxima reavaliação<\/span>\s*<span class="bio-val">10\/12\/2026<\/span>\s*<span class="bio-sub">em 64 dias/);
  assert.match(h, /Última avaliação<\/span>\s*<span class="bio-val">#02<\/span>\s*<span class="bio-sub">10\/07\/2026 · 2 avaliações/);
  assert.match(h, /67,5 <small>kg<\/small>/);
  assert.match(h, /% Gordura[\s\S]*sem as dobras/);
  // Venceu: o bloco fica vermelho e diz há quanto tempo.
  const atrasada = htmlResumoAvaliacoes(comAvs, '2026-12-13');
  assert.match(atrasada, /class="bio-tile ruim"[\s\S]*atrasada há 3 dias/);
  assert.match(htmlResumoAvaliacoes(comAvs, '2026-12-10'), /class="bio-tile atencao"[\s\S]*é hoje/);
  assert.equal(htmlResumoAvaliacoes({ avaliacoes: [] }), '', 'sem avaliação, sem resumo (a lista já orienta)');
});

test('avaliações: a aba é um card com Comparar e "+ Nova avaliação" no canto (a Saúde aciona o mesmo botão)', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /id="card-avaliacoes"[\s\S]*id="btn-comparar"[\s\S]*id="btn-nova-aval"[\s\S]*id="aval-sumario"[\s\S]*id="aval-list"/);
  assert.doesNotMatch(html, /aval-head/);
});

test('index.html: nenhum id repetido (um id em dois lugares faz uma tela desenhar por cima da outra)', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repetidos, []);
});

test('avaliações: resultados calculados e o pedido do dado que falta', () => {
  const h = htmlResultados({ peso: '70', estatura: '170', perimetros: {} }, { sexo: 'Feminino', nascimento: '1996-01-01' });
  assert.match(h, /<span class="rt">IMC<\/span><span class="rv">24,2<\/span>/);
  assert.match(h, /Preencha as 3 dobras/);
  assert.match(htmlResultados({ peso: '70' }, {}), /Defina o sexo na aba Saúde/);
  assert.match(htmlResultados({ pas: '120', pad: '80' }, {}), /Pressão arterial[\s\S]*120\/80/);
});

test('avaliações: comparação mostra a diferença com a cor do "melhor"', () => {
  const h = htmlComparacao(comAvs, 1, 2);
  assert.match(h, /#01 · 10\/01\/2026/);
  assert.match(h, /<td>Peso<\/td><td>70,0 kg<\/td><td>67,5 kg<\/td><td class="">−2,5 kg<\/td>/, 'peso: sem juízo');
  assert.match(h, /<td>Cintura<\/td>.*<td class="bom">−4,0 cm<\/td>/, 'cintura caindo é bom');
  assert.match(h, /Fotos de progresso[\s\S]*1\.webp[\s\S]*2\.webp/);
  assert.equal(htmlComparacao(comAvs, 1, 9), '', 'avaliação que não existe');
});

/* ---------- Financeiro e barramento ---------- */

const HOJE_FIN = '2026-10-07';
const alunaFin = {
  id: 'Ana', nome: 'Ana', mensalidade: '150', vencimento: '10', freqVezes: '3', pagamentos: { '2026-08': true },
  consumos: [{ id: 'c1', nome: '<b>Energético</b>', preco: 10, data: '2026-09-05', mesId: '2026-09' }],
};
const faturasFin = () => historicoFinanceiro(alunaFin, [alunaFin], HOJE_FIN).faturas;

/** O HTML com o espaço do toLocaleString (NBSP) virando espaço comum. @param {string} h */
const txt = (h) => h.replace(/ /g, ' ');
/** Confere que cada trecho aparece, na ordem dada. @param {string} h @param {string[]} trechos */
function emOrdem(h, trechos) {
  let i = 0;
  for (const t of trechos) {
    const j = txt(h).indexOf(t, i);
    assert.ok(j >= 0, `faltou (ou fora de ordem): ${t}`);
    i = j + t.length;
  }
}

test('financeiro: etiqueta verde/âmbar/vermelha e a ação certa em cada fatura', () => {
  const [out, set, ago] = faturasFin().map(htmlFatura);
  emOrdem(out, ['class="fa-fatura st-pendente"', 'ac-chip-warn">A vencer<', 'data-fin="pagar" data-mes="2026-10"']);
  emOrdem(set, ['class="fa-fatura st-vencido"', 'ac-chip-bad">Atrasado<', '>Registrar pagamento<']);
  emOrdem(ago, ['class="fa-fatura st-pago"', 'ac-chip-ok">Pago<', 'data-fin="desfazer" data-mes="2026-08"']);
  assert.ok(!ago.includes('Registrar pagamento'));
});

test('financeiro: consumo removível só em fatura aberta; nome do consumo escapado', () => {
  const [, set] = faturasFin().map(htmlFatura);
  assert.ok(set.includes('data-fin="remover" data-consumo="c1"'));
  assert.ok(set.includes('&lt;b&gt;Energético&lt;/b&gt;<small>05/09</small>'));
  assert.ok(!set.includes('<b>Energético'));
  const pago = htmlFatura({ ...faturasFin()[1], status: 'pago' });
  assert.ok(!pago.includes('data-fin="remover"'), 'fatura paga não perde item por engano');
});

test('financeiro: conta acertada por outro aluno não tem baixa aqui', () => {
  const bia = { id: 'Bia', nome: 'Bia', mensalidade: '120', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' } };
  const [f] = historicoFinanceiro(bia, [alunaFin, bia], HOJE_FIN).faturas;
  const h = htmlFatura(f);
  assert.ok(h.includes('ac-chip-coberto">Na conta de Ana<'));
  assert.ok(h.includes('na conta de Ana</span>'));
  assert.ok(!h.includes('data-fin="pagar"') && !h.includes('data-fin="desfazer"'));
});

test('financeiro: lançamento por produto do box ou avulso; sem catálogo, só avulso', () => {
  const com = htmlFormLancamento([{ id: 'p1', nome: 'Energético', preco: 10 }], HOJE_FIN);
  emOrdem(com, ['value="produto" checked', '<option value="p1">Energético · R$ 10,00</option>', 'name="data" type="date" value="2026-10-07" max="2026-10-07"', 'não precisa ser lançada']);
  const sem = htmlFormLancamento([], HOJE_FIN);
  emOrdem(sem, ['value="produto" disabled', 'value="avulso" checked']);
});

test('financeiro: a confirmação de pagamento mostra o mês, os itens e o total', () => {
  emOrdem(htmlFormPagamento(faturasFin()[1]), [
    'Setembro / 2026 · vence 10/09/2026', '<li><span>Mensalidade</span><span>R$ 150,00</span></li>',
    '<li><span>&lt;b&gt;Energético&lt;/b&gt;</span><span>R$ 10,00</span></li>', 'Total <b>R$ 160,00</b>',
  ]);
});

test('barramento: as abas avisam quando o perfil abre', () => {
  assert.equal(EVENTOS.PERFIL_ABERTO, 'perfil-aberto');
});
