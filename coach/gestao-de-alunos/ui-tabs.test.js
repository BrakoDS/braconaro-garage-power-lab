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
import { formDadosHTML, htmlAcesso, htmlAbaDados, calcIdade, waLink, DIAS_FORM } from './ui-tab-dados.js';
import { htmlListaAvaliacoes, htmlResultados, htmlComparacao } from './ui-tab-avaliacoes.js';
import { htmlAbaFinanceiro, htmlFatura, htmlResumo, htmlFormLancamento, htmlFormPagamento } from './ui-tab-financeiro.js';
import { historicoFinanceiro, resumoDoPlano } from './financeiro-aluno.js';
import { numf, fmtData, fmtDataCurta, addDias, opt, horaParaInput, horaLegivel } from './util/formato.js';
import { EVENTOS } from './estado.js';

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

const ana = {
  id: 'Ana01', nome: 'Ana Lima', email: 'ana@box.com', telefone: '(14) 99999-0000', sexo: 'Feminino',
  status: 'ativo', diasTreino: ['seg', 'qua'], horarios: { seg: '07:00' }, freqHorario: '19h',
  foco: ['perna'], appLiberado: true, parceria: { nome: 'Clínica', percentual: 25 },
};
const bia = { id: 'Bia02', nome: 'Bia', status: 'ativo' };
const caio = { id: 'Caio03', nome: 'Caio', status: 'inativo' };

test('dados: o formulário traz a ficha preenchida, com o ID travado', () => {
  const h = formDadosHTML(ana, { todos: [ana, bia, caio] });
  assert.match(h, /name="nome" type="text" required value="Ana Lima"/);
  assert.match(h, /<option value="Feminino" selected>Feminino<\/option>/);
  assert.match(h, /value="Ana01" disabled/);
  assert.match(h, /name="appLiberado" value="1" checked/);
  assert.match(h, /value="seg" checked\/>/);
  assert.match(h, /name="hora_seg" value="07:00" \/>/, 'hora do dia');
  assert.match(h, /name="hora_qua" value="19:00" \/>/, 'dia sem hora própria herda o freqHorario antigo');
  assert.match(h, /name="hora_ter" value="19:00" disabled \/>/, 'dia desmarcado vem desabilitado');
  assert.match(h, /<option value="25" selected>25% de desconto<\/option>/);
  assert.match(h, /name="foco" value="perna" checked\/>/);
});

test('dados: no cadastro o ID é editável', () => {
  assert.match(formDadosHTML({}, { idEditavel: true, todos: [] }), /<input name="id" type="text"/);
});

test('dados: "quem paga" só oferece ativos que não são ele nem têm responsável', () => {
  const dep = { id: 'Dudu', nome: 'Dudu', pagoPor: { id: 'Bia02', escopo: 'tudo' } };
  const h = formDadosHTML(ana, { todos: [ana, bia, caio, dep] });
  assert.match(h, /<option value="Bia02">Bia<\/option>/);
  assert.doesNotMatch(h, /value="Caio03"/, 'inativo não é responsável');
  assert.doesNotMatch(h, /value="Dudu"/, 'quem já tem responsável não vira responsável (sem corrente)');
  assert.doesNotMatch(h, /<option value="Ana01"/, 'ninguém paga a própria conta por aqui');
  const responsavel = formDadosHTML(bia, { todos: [ana, bia, dep] });
  assert.match(responsavel, /já paga a conta de outro/);
});

test('dados: texto da ficha é escapado no formulário', () => {
  const h = formDadosHTML({ id: 'x', nome: '"><script>', obs: '</textarea><b>' }, { todos: [] });
  assert.doesNotMatch(h, /<script>|<\/textarea><b>/);
});

test('dados: o bloco de acesso explica o próximo passo', () => {
  assert.match(htmlAcesso({ email: '' }), /Preencha e salve o e-mail.*id="btn-acesso" disabled/s);
  assert.match(htmlAcesso({ email: 'a@b.com' }), />Criar acesso</);
  const enviado = htmlAcesso({ email: 'a@b.com', acessoEnviadoEm: Date.UTC(2026, 9, 1, 15) });
  assert.match(enviado, /Link enviado em 01\/10\/2026/);
  assert.match(enviado, />Gerar novo link</);
  assert.match(htmlAcesso({ email: 'a@b.com', appLiberado: true }), /Acesso ao Portal e ao app/);
});

test('dados: a aba tem LGPD, acesso, formulário, salvar e excluir', () => {
  const h = htmlAbaDados(ana, { todos: [ana] });
  for (const id of ['lgpd-tag', 'acesso-aluno', 'form-dados', 'btn-excluir-aluno']) assert.match(h, new RegExp(`id="${id}"`));
  assert.match(h, /type="submit">Salvar alterações</);
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

test('avaliações: histórico da mais nova para a mais antiga, com atrasada marcada', () => {
  const h = htmlListaAvaliacoes(comAvs, '2026-10-07');
  assert.ok(h.indexOf('Avaliação #02') < h.indexOf('Avaliação #01'));
  assert.match(h, /Realizada: 10\/07\/2026 · 67,5 kg/);
  assert.match(h, /data-num="1"[\s\S]*class="aprox atrasada"[\s\S]*badge-late/, 'a #01 venceu em abril');
  assert.match(h, /data-num="2"[\s\S]*badge-ok/);
  assert.match(htmlListaAvaliacoes({ avaliacoes: [] }), /Nenhuma avaliação/);
});

test('avaliações: resultados calculados e o pedido do dado que falta', () => {
  const h = htmlResultados({ peso: '70', estatura: '170', perimetros: {} }, { sexo: 'Feminino', nascimento: '1996-01-01' });
  assert.match(h, /<span class="rt">IMC<\/span><span class="rv">24,2<\/span>/);
  assert.match(h, /Preencha as 3 dobras/);
  assert.match(htmlResultados({ peso: '70' }, {}), /Defina o sexo na aba Dados/);
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

test('financeiro: resumo do plano e do que está em aberto', () => {
  const h = historicoFinanceiro(alunaFin, [alunaFin], HOJE_FIN);
  const r = htmlResumo(resumoDoPlano(alunaFin, [alunaFin], HOJE_FIN), h);
  emOrdem(r, ['R$ 150,00<small>/mês</small>', '3x por semana · vence dia 10', 'fa-aberto bad">R$ 310,00<small>em aberto · R$ 160,00 atrasado']);
  const semPlano = htmlResumo(resumoDoPlano({}, [], HOJE_FIN), { emAberto: 0, atrasado: 0 });
  emOrdem(semPlano, ['Sem mensalidade', 'vence dia 10 (padrão)', 'aba <b>Dados</b>', 'fa-aberto ok">Em dia']);
});

test('financeiro: a aba tem "Novo lançamento" e o vazio orienta', () => {
  assert.ok(htmlAbaFinanceiro(alunaFin, [alunaFin], HOJE_FIN).includes('data-fin="novo" type="button">+ Novo lançamento<'));
  assert.ok(htmlAbaFinanceiro({}, [], HOJE_FIN).includes('Nenhuma cobrança ainda'));
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
