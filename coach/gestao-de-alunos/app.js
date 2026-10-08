// @ts-check
/**
 * Gestão de Alunos — app principal.
 * Gate de acesso reaproveitando o login do Coach/Montador (Firebase) e toda a
 * UI das telas 1 (listagem) e 2 (perfil com 3 abas). Dados via ./db.js.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../../compartilhado/firebase/cloud.js';
import { estaLiberado, tentarLiberar } from '../../compartilhado/firebase/auth.js';
import { bloquearSeNaoCoach } from '../../compartilhado/firebase/coach-guard.js';
import * as db from './db.js';
import { carregarSemanasPausadas } from '../../compartilhado/firebase/semanas-pausadas.js';
// `confirmar`/`avisar` do próprio site em vez do confirm()/alert() nativos: o
// Chrome deixa o usuario SUPRIMIR diálogos nativos, e a partir daí eles respondem
// sozinhos sem mostrar nada -- foi assim que a exclusão parou de funcionar.
import { confirmar, avisar, painel } from '../../compartilhado/ui/dialogo.js';
import { feriadosDoMes, feriadoEm } from '../../compartilhado/regras/feriados.js';
import { exportarFicha } from './pdf.js?v=3';
import { publicarPortal } from './portal-sync.js';
import { mergarInboxes } from './portal-merge.js';
import * as eventos from './eventos.js';
import { listarAvisos as avisos_listar, salvarAvisos as avisos_salvar, sincronizarAvisos } from './avisos.js';
import { listarDesafios as des_listar, salvarDesafios as des_salvar, sincronizarDesafios } from './desafios.js';
import { carregarTodosGastos } from './nutricao-read.js';
import { publicarRanking } from './ranking-sync.js';
import { carregarTodasConclusoes } from './desafios-read.js';
import { carregarLeads, atualizarStatusLead, excluirLead } from './leads-read.js';
import * as game from '../../compartilhado/regras/gamificacao.js';
import { mesIdParaLancar, faturaDoMes, faturaComDependentes, consumosDoMes, totalConsumos } from '../../compartilhado/regras/consumo.js';
import { estado, on, emit, EVENTOS } from './estado.js';
import { esc, isoLocal, hoje, fmtDataCurta, waMsg, semanaSegSab } from './util/formato.js';
import { abrirModal, fecharModal } from './util/dom.js';
import { reg, regFinanceiro } from './registro.js';
import { formDadosHTML, wireForm, lerForm } from './ui-tab-dados.js';
import { MESES_FIN, brl, numMoney, mesIdAtual, rotuloMesFin, addMesFin, statusFin as statusFinNoDia,
  novoConsumo, comPagamento, contaDoMes, eventoPagamento, eventoPagamentoDesfeito } from './financeiro-aluno.js';
import { renderLista, definirKcalDaSemana, definirMedalhas } from './ui-lista.js';
import { renderCabecalho } from './ui-perfil.js';

/* Publica o Portal do Aluno (debounced) a cada alteração + no login. */
let _portalTimer = null;
function agendarPublicarPortal() { clearTimeout(_portalTimer); _portalTimer = setTimeout(() => publicarPortal(db.listar(), db.diasFechados()), 1500); }
// Toda gravação: publica o Portal e avisa as telas que ouvem (a lista). É o
// ÚNICO lugar que agenda a publicação depois de gravar — as telas só gravam.
db.aoGravar(() => { agendarPublicarPortal(); emit(EVENTOS.ALUNOS_MUDARAM); });

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Formatação (esc, hoje, fmtData, numf, horaLegivel…): util/formato.js. Registro de ações: registro.js.

/* Fotos (escolher, subir, apagar) e a troca da foto do cabeçalho: ui-fotos.js. */

/* Formulário de DADOS (o mesmo no cadastro e na aba Dados): ui-tab-dados.js. */

/* ============================================================
   TELA 1 — Listagem
   ============================================================ */
/* ============================================================
   Lista de alunos — mora em ui-lista.js (render, busca, filtro, selos).
   Aqui ficam só as duas buscas que ALIMENTAM os selos, porque também
   publicam o ranking do box; o clique no card chega pelo barramento.
   ============================================================ */
on(EVENTOS.ABRIR_PERFIL, (id) => abrirPerfil(id));

/* Selo do total de treino queimado na semana (Seg–Sáb), vindo do Portal do Aluno. */
/** Busca todos os gastos numa consulta, soma a semana corrente por aluno e atualiza a listagem. */
async function atualizarGastoSemana() {
  try {
    const bruto = await carregarTodosGastos(); // Map(email → gastos[])
    const dias = semanaSegSab().map(isoLocal);
    const ini = dias[0], fim = dias[5];
    const nf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const m = new Map();
    bruto.forEach((gastos, email) => {
      const total = (gastos || []).filter((g) => g.data >= ini && g.data <= fim).reduce((s, g) => s + nf(g.calorias), 0);
      if (total > 0) m.set(email, total);
    });
    definirKcalDaSemana(m);
    publicarRanking(db.listar(), bruto); // publica o ranking do box (mesmo mapa)
    atualizarMedalhasLista(bruto); // selo de medalhas na listagem (reaproveita o mapa de gastos)
  } catch (e) { console.warn('Nutrição (lista):', e?.code || e); }
}

/* Selo do total de medalhas conquistadas, na listagem. */
/** Conta as medalhas de cada aluno (mesma lógica do Portal) e atualiza a listagem. */
async function atualizarMedalhasLista(mapaGastos) {
  try {
    const conclMap = await carregarTodasConclusoes(); // Map(email → concluidos[])
    // Semanas do box em branco (recesso): pausam a sequência, como no app e no Portal.
    const pausadas = await carregarSemanasPausadas();
    const mm = new Map();
    db.listar().forEach((a) => {
      const email = (a.email || '').trim().toLowerCase();
      const gastos = email ? (mapaGastos.get(email) || []) : [];
      const concl = email ? (conclMap.get(email) || []) : [];
      const meds = game.medalhasDaFicha(a, { gastos, conclusoes: concl, pausadas });
      const n = meds.filter((m) => m.ok).length;
      if (n > 0) mm.set(a.id, n);
    });
    definirMedalhas(mm);
  } catch (e) { console.warn('Medalhas (lista):', e?.code || e); }
}

/* Navegação entre telas: navegacao.js ('abrir-tela'). Cada tela abaixo ouve o
   próprio nome para se desenhar; mostrar e esconder é do roteador. */
on(EVENTOS.EXPORTAR_FICHA, () => { if (estado.alunoAtual) exportarFicha(estado.alunoAtual); });

/* ============================================================
   TELA — Financeiro (mensalidades)
   ============================================================ */
// Meses, reais e as gravações de consumo/pagamento: financeiro-aluno.js (a aba
// Financeiro do perfil usa as mesmas).

let finMes = mesIdAtual();
/** Qual aluno está com o balcão de consumíveis aberto na tela. */
let finBalcao = null;
/** O catálogo está aberto para edição? */
let finEditandoProdutos = false;

/** 'pago' | 'vencido' | 'pendente' para um aluno num mês, hoje. */
function statusFin(a, mesId) { return statusFinNoDia(a, mesId, hoje()); }

/**
 * O balcão: um botão por produto, para lançar na conta do aluno.
 *
 * Tudo aqui — o rótulo e a lista — fala da fatura de DESTINO, não da que está na
 * tela. Com o mês em tela já quitado, o lançamento pula para o seguinte; listando
 * o mês em tela, o coach clicava no produto e a tela não mexia em nada. Parecia
 * que o botão não funcionava, e clicar de novo enfiava consumos repetidos numa
 * fatura que ele nem estava vendo.
 */
function balcaoConsumo(a) {
  const produtos = db.listarProdutos();
  const destino = mesIdParaLancar(hoje(), a.vencimento, a.pagamentos);
  const lancadosNoDestino = consumosDoMes(a.consumos, destino);
  const botoes = produtos.length
    ? produtos.map((p) => `<button class="btn ghost btn-sm fin-add" data-id="${esc(a.id)}" data-prod="${esc(p.id)}" type="button">${esc(p.nome)} · ${brl(p.preco)}</button>`).join('')
    : '<span class="fin-vazio">Nenhum produto cadastrado. Use “Produtos” lá em cima.</span>';

  const soma = lancadosNoDestino.reduce((t, c) => t + (Number(c.preco) || 0), 0);
  const lancados = lancadosNoDestino.length
    ? `<span class="fin-balcao-cap">Já nesta fatura · ${brl(soma)}</span>
       <ul class="fin-consumos">${lancadosNoDestino.map((c) => `
        <li><span>${esc(c.nome)}</span><span class="fin-consumo-v">+ ${brl(c.preco)}</span>
          <span class="fin-consumo-d">${esc(fmtDataCurta(c.data))}</span>
          <button class="fin-x" data-id="${esc(a.id)}" data-consumo="${esc(c.id)}" type="button" aria-label="Remover">×</button></li>`).join('')}</ul>`
    : '<span class="fin-vazio">Nada lançado nesta fatura ainda.</span>';

  return `<div class="fin-balcao">
    <span class="fin-balcao-cap">Lançar consumo · vai para a fatura de ${esc(rotuloMesFin(destino))}${destino !== finMes ? ' <b>(a de ' + esc(rotuloMesFin(finMes)) + ' já está paga)</b>' : ''}</span>
    <div class="fin-prods">${botoes}</div>
    ${lancados}
  </div>`;
}

/** O painel de cadastro de produtos — some da tela até alguém pedir. */
function painelProdutos() {
  const linhas = db.listarProdutos().map((p, i) => `
    <div class="prod-linha">
      <input class="prod-nome" type="text" value="${esc(p.nome)}" data-i="${i}" placeholder="Nome do produto" />
      <input class="prod-preco" type="number" min="0" step="0.01" value="${esc(p.preco)}" data-i="${i}" placeholder="0,00" />
      <button class="fin-x" data-prod-rm="${i}" type="button" aria-label="Remover produto">×</button>
    </div>`).join('');
  return `<div class="prod-painel">
    <span class="fin-balcao-cap">Produtos vendidos no box</span>
    ${linhas || '<span class="fin-vazio">Nenhum produto cadastrado.</span>'}
    <div class="prod-acoes">
      <button class="btn ghost btn-sm" id="prod-add" type="button">+ Produto</button>
      <button class="btn btn-sm" id="prod-salvar" type="button">Salvar produtos</button>
    </div>
    <span class="hint">Mudar o preço aqui não mexe no que já foi lançado: cada consumo guarda o preço do dia da venda.</span>
  </div>`;
}

/**
 * Quem cobra de quem no mês.
 *
 * Cada aluno vira uma linha, mas nem toda linha é uma COBRANÇA: o dependente com
 * a conta inteira no responsável aparece para o coach ver, sem entrar nos totais.
 * Contar duas vezes o mesmo dinheiro é o erro fácil aqui — o pai somando o filho
 * e o filho somando sozinho — e o painel inteiro sai errado por isso.
 */
function linhasDoFinanceiro(mesId) {
  const todos = db.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
  return todos.map((a) => {
    const deps = todos.filter((x) => x.pagoPor && x.pagoPor.id === a.id);
    const resp = a.pagoPor && a.pagoPor.id ? todos.find((x) => x.id === a.pagoPor.id) : null;
    // Vínculo órfão (o responsável saiu, ou está inativo) não pode zerar a conta
    // de ninguém: sem responsável na lista, ele volta a pagar a própria.
    const efetivo = (a.pagoPor && !resp) ? { ...a, pagoPor: null } : a;
    const conta = faturaComDependentes(efetivo, mesId, deps);
    const propria = faturaDoMes(a, mesId);
    return { a, deps, resp, conta, propria, cobravel: conta.total > 0 };
  }).filter((l) => l.cobravel || l.resp || numMoney(l.a.mensalidade) > 0);
}

function renderFinanceiro() {
  $('#fin-mes-lbl').textContent = rotuloMesFin(finMes);
  const itens = linhasDoFinanceiro(finMes);
  let previsto = 0, recebido = 0, extras = 0, investido = 0;

  const linhas = itens.map(({ a, deps, resp, conta, propria }) => {
    extras += propria.extras;
    // O que o box banca: o desconto dele mais o dos dependentes que ele cobre.
    // Contado na linha de quem TEM a parceria, e não na de quem paga a conta —
    // senão o relatório diria que a parceria é do pai.
    investido += propria.desconto;
    const st = statusFin(a, finMes);
    // O dependente sem nada próprio a pagar espelha a situação do responsável:
    // ele não tem conta, então não pode ficar "vencido" por conta nenhuma.
    const stExibido = (resp && conta.total === 0) ? statusFin(resp, finMes) : st;
    // Quem não deve nada não pode aparecer vencido. Sem responsável e sem conta,
    // o motivo é a parceria — e é isso que o selo tem que dizer.
    const cortesia = !resp && conta.total === 0 && propria.desconto > 0;
    const lbl = cortesia ? 'Cortesia'
      : stExibido === 'pago' ? 'Pago' : stExibido === 'vencido' ? 'Vencido' : 'Pendente';
    if (conta.total > 0) {
      previsto += conta.total;
      if (st === 'pago') recebido += conta.total;
    }

    const partes = [];
    if (conta.propria.mensalidade > 0) partes.push(brl(conta.propria.mensalidade));
    else if (propria.desconto > 0 && !resp) partes.push(brl(0));
    if (conta.propria.extras > 0) partes.push(`${brl(conta.propria.extras)} em consumo`);
    conta.dependentes.forEach((d) => partes.push(`${brl(d.total)} de ${esc(d.nome)}`));
    const detalhe = conta.total === 0 && resp
      ? `acertado por <b>${esc(resp.nome || resp.id)}</b>`
      : (partes.length > 1 ? `${partes.join(' + ')} = <b>${brl(conta.total)}</b>` : brl(conta.total));

    // Consumo lançado numa fatura à frente não aparece na linha do mês em tela.
    // Sem este aviso, o dinheiro fica invisível até alguém navegar de mês.
    const destino = mesIdParaLancar(hoje(), a.vencimento, a.pagamentos);
    const adiante = destino !== finMes ? totalConsumos(a.consumos, destino) : 0;
    const aviso = adiante > 0
      ? ` <span class="fin-adiante">· ${brl(adiante)} em consumo já vai para ${esc(rotuloMesFin(destino))}</span>`
      : '';

    const btn = conta.total === 0
      ? ''
      : st === 'pago'
        ? `<button class="btn ghost btn-sm fin-toggle" data-id="${esc(a.id)}" data-op="0" type="button">Desfazer</button>`
        : `<button class="btn btn-sm fin-toggle" data-id="${esc(a.id)}" data-op="1" type="button">Marcar pago</button>`;

    const aberto = finBalcao === a.id;
    const marca = resp ? `<span class="fin-vinculo">conta de ${esc(resp.nome || resp.id)}</span>` : '';
    // A parceria fica ao lado do nome, e o quanto o box banca sai no detalhe: o
    // desconto tem que ser visível na linha, senão vira só uma mensalidade menor.
    const selo = propria.parceria
      ? `<span class="fin-parceria">${propria.parceria.percentual}%${propria.parceria.nome ? ' · ' + esc(propria.parceria.nome) : ''}</span>`
      : '';
    const custo = propria.desconto > 0
      ? ` <span class="fin-investido">· box banca ${brl(propria.desconto)}</span>`
      : '';
    return `<div class="fin-row fin-row-consumo">
      <div class="fin-info"><div class="fin-nome">${esc(a.nome)}${selo}${marca}</div>
        <div class="fin-sub">vence dia ${esc(a.vencimento || '—')} · ${detalhe}${custo}${aviso}</div></div>
      <span class="fin-badge ${cortesia ? 'cortesia' : stExibido}">${lbl}</span>
      <div class="fin-acoes">
        <button class="btn ghost btn-sm fin-balcao-btn${aberto ? ' on' : ''}" data-id="${esc(a.id)}" type="button">${aberto ? 'Fechar' : '+ Consumo'}</button>
        ${btn}
      </div>
      ${aberto ? balcaoConsumo(a) : ''}
    </div>`;
  }).join('');

  $('#fin-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Recebido</span><span class="fin-card-v ok">${brl(recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">A receber</span><span class="fin-card-v${previsto - recebido > 0 ? ' bad' : ''}">${brl(previsto - recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Previsto no mês</span><span class="fin-card-v">${brl(previsto)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Consumíveis</span><span class="fin-card-v">${brl(extras)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Investido em parcerias</span><span class="fin-card-v${investido > 0 ? ' parceria' : ''}">${brl(investido)}</span></div>`;
  $('#fin-list').innerHTML = (finEditandoProdutos ? painelProdutos() : '')
    + (linhas || `<div class="empty"><b>Nenhuma mensalidade cadastrada</b>Defina o valor da mensalidade no perfil do aluno (aba Dados → Financeiro).</div>`);
  $('#fin-produtos').textContent = finEditandoProdutos ? 'Fechar produtos' : 'Produtos';
}

function toggleFin(id, pago) {
  const a = db.obter(id); if (!a) return;
  const total = contaDoMes(a, finMes, db.listar()).conta.total; // o valor da fatura NA HORA da baixa
  db.atualizar(id, { pagamentos: comPagamento(a.pagamentos, finMes, pago) });
  regFinanceiro(a, pago ? eventoPagamento(finMes, total) : eventoPagamentoDesfeito(finMes));
  renderFinanceiro();
}

/**
 * Lança um consumo na conta do aluno.
 *
 * O nome e o preço são copiados do catálogo AGORA e ficam gravados no consumo:
 * a notinha de agosto não pode se reescrever quando o energético subir de preço.
 * A fatura também é carimbada aqui (ver consumo.js) — a data manda, e uma fatura
 * já quitada empurra a compra para a seguinte.
 */
function lancarConsumo(id, produtoId) {
  const a = db.obter(id); if (!a) return;
  const p = db.listarProdutos().find((x) => x.id === produtoId);
  if (!p) return;
  const consumos = [...(a.consumos || []), novoConsumo(a, { produtoId: p.id, nome: p.nome, preco: p.preco }, hoje())];
  db.atualizar(id, { consumos });
  renderFinanceiro();
}

function removerConsumo(id, consumoId) {
  const a = db.obter(id); if (!a) return;
  db.atualizar(id, { consumos: (a.consumos || []).filter((c) => c.id !== consumoId) });
  renderFinanceiro();
}

/** Lê os campos do painel de produtos e grava. Linha sem nome é descartada. */
function salvarProdutos() {
  const lista = $$('.prod-linha').map((linha, i) => {
    const nome = $('.prod-nome', linha).value.trim();
    const preco = numMoney($('.prod-preco', linha).value);
    const antigo = db.listarProdutos()[i];
    // O id é o que amarra o botão ao produto; mantém o antigo quando existe para
    // não perder o vínculo, e gera um novo só para linha recém-criada.
    return { id: (antigo && antigo.id) || `p${Date.now()}${i}`, nome, preco };
  }).filter((p) => p.nome);
  db.salvarProdutos(lista);
  renderFinanceiro();
}

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'financeiro') { finMes = mesIdAtual(); finBalcao = null; finEditandoProdutos = false; renderFinanceiro(); } });
$('#fin-prev').addEventListener('click', () => { finMes = addMesFin(finMes, -1); renderFinanceiro(); });
$('#fin-next').addEventListener('click', () => { finMes = addMesFin(finMes, 1); renderFinanceiro(); });
$('#fin-produtos').addEventListener('click', () => { finEditandoProdutos = !finEditandoProdutos; renderFinanceiro(); });

$('#fin-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.classList.contains('fin-toggle')) { toggleFin(btn.dataset.id, btn.dataset.op === '1'); return; }
  if (btn.classList.contains('fin-balcao-btn')) {
    finBalcao = finBalcao === btn.dataset.id ? null : btn.dataset.id;
    renderFinanceiro(); return;
  }
  if (btn.classList.contains('fin-add')) { lancarConsumo(btn.dataset.id, btn.dataset.prod); return; }
  if (btn.dataset.consumo) { removerConsumo(btn.dataset.id, btn.dataset.consumo); return; }
  if (btn.dataset.prodRm != null) {
    const lista = db.listarProdutos().filter((_, i) => i !== Number(btn.dataset.prodRm));
    db.salvarProdutos(lista); renderFinanceiro(); return;
  }
  if (btn.id === 'prod-add') {
    db.salvarProdutos([...db.listarProdutos(), { id: `p${Date.now()}`, nome: '', preco: 0 }]);
    renderFinanceiro(); return;
  }
  if (btn.id === 'prod-salvar') { salvarProdutos(); return; }
});

/* ============================================================
   TELA — Cobranças (lembrete de mensalidade)
   ============================================================ */
const PIX_CHAVE_FMT = '66.567.011/0001-66';   // CNPJ do box (para o lembrete)
const PIX_NOME = 'Guilherme Braconaro';
const cobLembrados = new Set();               // ids já avisados nesta sessão

/** Dias até o vencimento no mês (negativo = atrasado). */
function diasAteVenc(a, mesId) {
  const [ano, m] = mesId.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(1, parseInt(a.vencimento, 10) || 10), ultimoDia);
  const venc = new Date(ano, m - 1, dia); venc.setHours(0, 0, 0, 0);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((venc - h) / 86400000);
}
function msgCobranca(a, mesId) {
  const nome = (a.nome || '').trim().split(/\s+/)[0] || '';
  const mesNome = MESES_FIN[Number(mesId.split('-')[1]) - 1];
  const valor = brl(numMoney(a.mensalidade));
  const d = diasAteVenc(a, mesId);
  const quando = d < 0 ? `venceu dia ${a.vencimento}` : d === 0 ? 'vence hoje' : `vence dia ${a.vencimento}`;
  return `Olá, ${nome}! 😊 Passando pra lembrar da mensalidade de ${mesNome} (${valor}), que ${quando}. Pra facilitar, o Pix é a chave CNPJ ${PIX_CHAVE_FMT} (${PIX_NOME}) — dá pra pagar direto pelo Portal do Aluno também. Qualquer dúvida é só chamar! 💪`;
}

function renderCobrancas() {
  const mesId = mesIdAtual();
  $('#cob-mes-lbl').textContent = rotuloMesFin(mesId);
  const pend = db.listar()
    .filter((a) => (a.status || 'ativo') !== 'inativo' && numMoney(a.mensalidade) > 0 && statusFin(a, mesId) !== 'pago')
    .map((a) => ({ a, d: diasAteVenc(a, mesId) }))
    .sort((x, y) => x.d - y.d);
  const vencidas = pend.filter((x) => x.d < 0);
  const totalAtraso = vencidas.reduce((s, x) => s + numMoney(x.a.mensalidade), 0);
  const totalPend = pend.reduce((s, x) => s + numMoney(x.a.mensalidade), 0);
  $('#cob-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Vencidas</span><span class="fin-card-v${vencidas.length ? ' bad' : ''}">${vencidas.length}</span></div>
    <div class="fin-card"><span class="fin-card-l">Em atraso (R$)</span><span class="fin-card-v${totalAtraso > 0 ? ' bad' : ''}">${brl(totalAtraso)}</span></div>
    <div class="fin-card"><span class="fin-card-l">A receber no mês</span><span class="fin-card-v">${brl(totalPend)}</span></div>`;

  const row = ({ a, d }) => {
    const tel = String(a.telefone || '').replace(/\D/g, '');
    const urg = d < 0 ? `<span class="cob-badge vencido">Atrasada ${Math.abs(d)}d</span>`
      : d === 0 ? `<span class="cob-badge hoje">Vence hoje</span>`
        : `<span class="cob-badge breve">Em ${d}d</span>`;
    const feito = cobLembrados.has(a.id);
    const wa = tel.length >= 10
      ? `<a class="btn btn-sm cob-wa" href="${waMsg(a.telefone, msgCobranca(a, mesId))}" target="_blank" rel="noopener" data-id="${esc(a.id)}">${feito ? 'Reenviar' : 'WhatsApp'}</a>`
      : `<span class="cob-semtel">sem telefone</span>`;
    return `<div class="cob-row${feito ? ' lembrado' : ''}">
      <div class="cob-info"><div class="fin-nome">${esc(a.nome)}${feito ? ' <span class="cob-ok">avisado ✓</span>' : ''}</div><div class="fin-sub">${brl(numMoney(a.mensalidade))} · vence dia ${esc(a.vencimento || '—')}</div></div>
      ${urg}${wa}
      <button class="btn ghost btn-sm cob-pago" data-id="${esc(a.id)}" type="button">Pago</button>
    </div>`;
  };
  const grupo = (titulo, arr) => (arr.length ? `<h4 class="cob-grupo">${titulo}</h4>${arr.map(row).join('')}` : '');
  const html = grupo('Vencidas', vencidas) + grupo('Vencem em breve (até 5 dias)', pend.filter((x) => x.d >= 0 && x.d <= 5)) + grupo('A vencer', pend.filter((x) => x.d > 5));
  $('#cob-list').innerHTML = html || `<div class="empty"><b>Tudo em dia! 🎉</b>Nenhuma mensalidade pendente neste mês.</div>`;
}

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'cobrancas') { renderCobrancas(); } });
$('#cob-list').addEventListener('click', (e) => {
  const wa = e.target.closest('.cob-wa');
  if (wa) { cobLembrados.add(wa.dataset.id); setTimeout(renderCobrancas, 100); return; }
  const pg = e.target.closest('.cob-pago');
  if (pg) {
    const a = db.obter(pg.dataset.id);
    if (a) {
      const mes = mesIdAtual();
      const total = contaDoMes(a, mes, db.listar()).conta.total;
      db.atualizar(pg.dataset.id, { pagamentos: comPagamento(a.pagamentos, mes, true) });
      regFinanceiro(a, eventoPagamento(mes, total));
      renderCobrancas();
    }
  }
});

/* ============================================================
   TELA — Aviso em massa (WhatsApp)
   ============================================================ */
const AVISO_TPLS = [
  'Amanhã não tem aula! ⚠️',
  'Bom treino a todos! 💪',
  'Lembrete: sua mensalidade vence esta semana. 🙏',
  'Atenção: novo horário a partir de segunda-feira.',
];
const avisoEnviados = new Set();

function avisoDestinatarios() {
  return db.listar().filter((a) => (a.status || 'ativo') !== 'inativo' && String(a.telefone || '').replace(/\D/g, '').length >= 10);
}
function renderAviso() {
  $('#aviso-tpls').innerHTML = AVISO_TPLS.map((t) => `<button class="aviso-tpl" type="button" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  const alunos = avisoDestinatarios();
  $('#aviso-count').textContent = `${avisoEnviados.size} de ${alunos.length} enviados`;
  $('#aviso-list').innerHTML = alunos.length ? alunos.map((a) => {
    const env = avisoEnviados.has(a.id);
    return `<div class="aviso-row${env ? ' enviado' : ''}">
      <div class="aviso-info"><div class="fin-nome">${esc(a.nome)}</div><div class="fin-sub">${esc(a.telefone)}</div></div>
      ${env ? '<span class="aviso-ok">Enviado ✓</span>' : ''}
      <button class="btn ${env ? 'ghost ' : ''}btn-sm aviso-send" data-id="${esc(a.id)}" data-tel="${esc(a.telefone)}" type="button">${env ? 'Reenviar' : 'Enviar'}</button>
    </div>`;
  }).join('') : `<div class="empty"><b>Nenhum destinatário</b>Cadastre alunos ativos com telefone/WhatsApp para avisar aqui.</div>`;
}

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'aviso') { renderAviso(); } });
$('#aviso-tpls').addEventListener('click', (e) => { const c = e.target.closest('.aviso-tpl'); if (c) { $('#aviso-msg').value = c.dataset.t; $('#aviso-msg').focus(); } });
$('#aviso-copiar').addEventListener('click', async () => {
  const m = $('#aviso-msg').value.trim(); if (!m) return;
  try { await navigator.clipboard.writeText(m); const b = $('#aviso-copiar'), t = b.textContent; b.textContent = 'Copiado ✓'; setTimeout(() => (b.textContent = t), 1500); } catch {}
});
$('#aviso-list').addEventListener('click', (e) => {
  const b = e.target.closest('.aviso-send'); if (!b) return;
  const msg = $('#aviso-msg').value.trim();
  if (!msg) { avisar({ texto: 'Escreva a mensagem primeiro.' }); $('#aviso-msg').focus(); return; }
  const link = waMsg(b.dataset.tel, msg);
  if (link) window.open(link, '_blank');
  avisoEnviados.add(b.dataset.id);
  renderAviso();
});

/* ============================================================
   TELA — Mural de Avisos do Portal do Aluno
   ============================================================ */
const MURAL_TIPO = { info: 'Informativo', importante: 'Importante', evento: 'Evento' };
let muralEdit = null; // id em edição, ou null

function renderMural() {
  const avisos = avisos_listar().slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  const list = $('#mural-list');
  if (!avisos.length) {
    list.innerHTML = `<div class="empty"><b>Nenhum aviso</b>Publique o primeiro recado — ele aparece no Portal do Aluno.</div>`;
    return;
  }
  list.innerHTML = avisos.map((av) => {
    const d = av.criadoEm ? new Date(av.criadoEm).toLocaleDateString('pt-BR') : '';
    return `<div class="mural-item tipo-${esc(av.tipo || 'info')}${av.ativo === false ? ' off' : ''}">
      <div class="mural-item-head">
        <span class="mural-tag">${esc(MURAL_TIPO[av.tipo] || 'Informativo')}</span>
        <span class="mural-data">${d}</span>
        <span class="mural-estado">${av.ativo === false ? 'Oculto' : 'No ar'}</span>
      </div>
      <h4>${esc(av.titulo || '')}</h4>
      <p>${esc(av.texto || '')}</p>
      <div class="mural-item-actions">
        <button class="btn ghost btn-sm mural-toggle" data-id="${esc(av.id)}" type="button">${av.ativo === false ? 'Reativar' : 'Ocultar'}</button>
        <button class="btn ghost btn-sm mural-editar" data-id="${esc(av.id)}" type="button">Editar</button>
        <button class="btn ghost btn-sm mural-excluir" data-id="${esc(av.id)}" type="button">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

function muralReset() {
  muralEdit = null;
  $('#mural-titulo').value = ''; $('#mural-texto').value = ''; $('#mural-tipo').value = 'info';
  $('#mural-add').textContent = 'Publicar aviso';
  $('#mural-cancelar').hidden = true;
}

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'mural') { muralReset(); renderMural(); } });
$('#mural-cancelar').addEventListener('click', muralReset);

$('#mural-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const titulo = $('#mural-titulo').value.trim(), texto = $('#mural-texto').value.trim();
  if (!titulo || !texto) return;
  const tipo = $('#mural-tipo').value;
  const arr = avisos_listar();
  if (muralEdit) {
    const av = arr.find((x) => x.id === muralEdit);
    if (av) { av.titulo = titulo; av.texto = texto; av.tipo = tipo; }
  } else {
    arr.push({ id: 'av' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), titulo, texto, tipo, ativo: true, criadoEm: Date.now() });
  }
  await avisos_salvar(arr);
  muralReset(); renderMural();
});

$('#mural-list').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const arr = avisos_listar();
  if (e.target.closest('.mural-toggle')) {
    const av = arr.find((x) => x.id === id); if (av) av.ativo = av.ativo === false;
    await avisos_salvar(arr); renderMural();
  } else if (e.target.closest('.mural-editar')) {
    const av = arr.find((x) => x.id === id); if (!av) return;
    muralEdit = id; $('#mural-titulo').value = av.titulo || ''; $('#mural-texto').value = av.texto || ''; $('#mural-tipo').value = av.tipo || 'info';
    $('#mural-add').textContent = 'Salvar alteração'; $('#mural-cancelar').hidden = false; $('#mural-titulo').focus();
  } else if (e.target.closest('.mural-excluir')) {
    if (!(await confirmar({ titulo: 'Excluir aviso?', texto: 'Ele sai do Portal do Aluno.', ok: 'Excluir', perigo: true }))) return;
    await avisos_salvar(arr.filter((x) => x.id !== id));
    if (muralEdit === id) muralReset();
    renderMural();
  }
});

/* ============================================================
   TELA — Desafios da Semana
   ============================================================ */
const DES_EMOJIS = ['💧', '🚫🍬', '🥗', '😴', '🏃', '🔥', '🧘', '⭐', '🥦', '🚭'];
let desEmoji = '💧', desEdit = null;

function renderDesEmojis() {
  $('#des-emojis').innerHTML = DES_EMOJIS.map((e) => `<button type="button" class="des-emoji${e === desEmoji ? ' on' : ''}" data-e="${e}">${e}</button>`).join('');
}
function renderDesafios() {
  const arr = des_listar().slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  const list = $('#des-list');
  if (!arr.length) { list.innerHTML = `<div class="empty"><b>Nenhum desafio</b>Lance o primeiro — ele aparece nas Conquistas do aluno.</div>`; return; }
  list.innerHTML = arr.map((d) => `
    <div class="mural-item${d.ativo === false ? ' off' : ''}">
      <div class="mural-item-head"><span class="mural-tag">${esc(d.icone || '⭐')} ${esc(d.titulo || '')}</span><span class="mural-estado">${d.ativo === false ? 'Oculto' : 'No ar'} · meta ${esc(String(d.metaDias || 5))} dias</span></div>
      <p>${esc(d.descricao || '')}</p>
      <div class="mural-item-actions">
        <button class="btn ghost btn-sm des-toggle" data-id="${esc(d.id)}" type="button">${d.ativo === false ? 'Reativar' : 'Ocultar'}</button>
        <button class="btn ghost btn-sm des-editar" data-id="${esc(d.id)}" type="button">Editar</button>
        <button class="btn ghost btn-sm des-excluir" data-id="${esc(d.id)}" type="button">Excluir</button>
      </div>
    </div>`).join('');
}
function desReset() {
  desEdit = null; desEmoji = '💧';
  $('#des-titulo').value = ''; $('#des-texto').value = ''; $('#des-meta').value = '5'; $('#des-categoria').value = 'geral';
  $('#des-add').textContent = 'Publicar desafio'; $('#des-cancelar').hidden = true;
  renderDesEmojis();
}

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'desafios') { desReset(); renderDesafios(); } });
$('#des-cancelar').addEventListener('click', desReset);
$('#des-emojis').addEventListener('click', (e) => { const b = e.target.closest('.des-emoji'); if (b) { desEmoji = b.dataset.e; renderDesEmojis(); } });

$('#des-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const titulo = $('#des-titulo').value.trim(), descricao = $('#des-texto').value.trim();
  const metaDias = Math.min(7, Math.max(1, parseInt($('#des-meta').value, 10) || 5));
  const categoria = $('#des-categoria').value || 'geral';
  if (!titulo || !descricao) return;
  const arr = des_listar();
  if (desEdit) {
    const d = arr.find((x) => x.id === desEdit);
    if (d) { d.titulo = titulo; d.descricao = descricao; d.icone = desEmoji; d.metaDias = metaDias; d.categoria = categoria; }
  } else {
    arr.push({ id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), icone: desEmoji, titulo, descricao, metaDias, categoria, ativo: true, criadoEm: Date.now() });
  }
  await des_salvar(arr);
  desReset(); renderDesafios();
});
$('#des-list').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const arr = des_listar();
  if (e.target.closest('.des-toggle')) {
    const d = arr.find((x) => x.id === id); if (d) d.ativo = d.ativo === false;
    await des_salvar(arr); renderDesafios();
  } else if (e.target.closest('.des-editar')) {
    const d = arr.find((x) => x.id === id); if (!d) return;
    desEdit = id; desEmoji = d.icone || '💧';
    $('#des-titulo').value = d.titulo || ''; $('#des-texto').value = d.descricao || ''; $('#des-meta').value = String(d.metaDias || 5); $('#des-categoria').value = d.categoria || 'geral';
    $('#des-add').textContent = 'Salvar alteração'; $('#des-cancelar').hidden = false; renderDesEmojis(); $('#des-titulo').focus();
  } else if (e.target.closest('.des-excluir')) {
    if (!(await confirmar({ titulo: 'Excluir desafio?', texto: 'Ele sai do Portal do Aluno.', ok: 'Excluir', perigo: true }))) return;
    await des_salvar(arr.filter((x) => x.id !== id));
    if (desEdit === id) desReset();
    renderDesafios();
  }
});

/* ============================================================
   TELA — Leads (formulário de aula experimental)
   ============================================================ */
const LEAD_STATUS_LABEL = { novo: 'Novo', contatado: 'Contatado', convertido: 'Convertido', descartado: 'Descartado' };
let LEADS_CACHE = [];

// Follow-up: lead "novo" há ≥2 dias (nunca contatado) ou "contatado" há ≥4 dias
// (sem retorno). Objetivo: não deixar lead esfriar sem ação.
const LEAD_DIA = 86400000;
const LEAD_LIMIAR_NOVO = 2, LEAD_LIMIAR_CONTATADO = 4;
function leadDiasDesde(ts) { return ts ? Math.floor((Date.now() - ts) / LEAD_DIA) : null; }
/** @returns {{precisa:boolean, dias:number, motivo:string}} */
function followUpLead(l) {
  const st = l.status || 'novo';
  if (st === 'novo') { const d = leadDiasDesde(l.criadoEm); if (d != null && d >= LEAD_LIMIAR_NOVO) return { precisa: true, dias: d, motivo: 'sem contato' }; }
  else if (st === 'contatado') { const d = leadDiasDesde(l.statusEm || l.criadoEm); if (d != null && d >= LEAD_LIMIAR_CONTATADO) return { precisa: true, dias: d, motivo: 'sem retorno' }; }
  return { precisa: false, dias: 0, motivo: '' };
}

/** Atualiza o selo de follow-up no botão "Leads" da listagem (lembrete sem abrir a tela). */
function atualizarBadgeLeads() {
  const btn = $('#btn-leads'); if (!btn) return;
  const n = LEADS_CACHE.filter((l) => l.status !== 'descartado' && followUpLead(l).precisa).length;
  let badge = btn.querySelector('.btn-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'btn-badge'; btn.appendChild(badge); }
  badge.textContent = String(n);
  badge.title = `${n} lead(s) precisam de follow-up`;
}

/** Carrega os leads em cache (para o selo do botão) — silencioso. */
async function carregarBadgeLeads() {
  try { LEADS_CACHE = await carregarLeads(); atualizarBadgeLeads(); } catch (e) { console.warn('Leads badge:', e?.code || e); }
}

async function renderLeads() {
  $('#leads-list').innerHTML = `<div class="prog-ph">Carregando…</div>`;
  try { LEADS_CACHE = await carregarLeads(); }
  catch (e) { console.warn('Leads:', e?.code || e); $('#leads-list').innerHTML = `<div class="prog-ph">Não foi possível carregar agora.</div>`; return; }
  desenharLeads();
}

function desenharLeads() {
  const ativos = LEADS_CACHE.filter((l) => l.status !== 'descartado');
  const novos = ativos.filter((l) => l.status === 'novo' || !l.status);
  const contatados = ativos.filter((l) => l.status === 'contatado');
  const convertidos = ativos.filter((l) => l.status === 'convertido');
  const precisam = ativos.filter((l) => followUpLead(l).precisa).length;
  $('#leads-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Novos</span><span class="fin-card-v${novos.length ? ' bad' : ''}">${novos.length}</span></div>
    <div class="fin-card"><span class="fin-card-l">Contatados</span><span class="fin-card-v">${contatados.length}</span></div>
    <div class="fin-card"><span class="fin-card-l">Convertidos em aluno</span><span class="fin-card-v ok">${convertidos.length}</span></div>
    <div class="fin-card"><span class="fin-card-l">⏰ Follow-up</span><span class="fin-card-v${precisam ? ' bad' : ' ok'}">${precisam}</span></div>`;

  if (!ativos.length) { $('#leads-list').innerHTML = `<div class="empty"><b>Nenhum lead ainda</b>Assim que alguém preencher o formulário de aula grátis no site, aparece aqui.</div>`; return; }

  const row = (l) => {
    const d = l.criadoEm ? new Date(l.criadoEm).toLocaleDateString('pt-BR') : '—';
    const st = l.status || 'novo';
    const fu = followUpLead(l);
    const sub = [l.objetivo, l.horario ? 'prefere ' + l.horario : '', l.indicadoPor ? 'indicado por ' + l.indicadoPor : ''].filter(Boolean).join(' · ');
    const alerta = fu.precisa ? `<span class="lead-followup">⏰ ${fu.motivo} há ${fu.dias}d</span>` : '';
    return `<div class="cob-row${fu.precisa ? ' lead-parado' : ''}">
      <div class="cob-info"><div class="fin-nome">${esc(l.nome || 'Sem nome')} <span class="lead-badge ${st}">${LEAD_STATUS_LABEL[st] || st}</span>${alerta}</div><div class="fin-sub">${d}${sub ? ' · ' + esc(sub) : ''}</div></div>
      <a class="btn btn-sm cob-wa" href="${waMsg(l.whatsapp, 'Olá, ' + (l.nome || '').split(' ')[0] + '! Vi seu interesse na aula experimental do Garage Power Lab. Vamos agendar? 💪')}" target="_blank" rel="noopener">WhatsApp</a>
      <select class="lead-status" data-id="${esc(l.id)}">
        ${Object.entries(LEAD_STATUS_LABEL).map(([v, l2]) => `<option value="${v}"${v === st ? ' selected' : ''}>${l2}</option>`).join('')}
      </select>
      <button class="btn ghost btn-sm lead-excluir" data-id="${esc(l.id)}" type="button">Excluir</button>
    </div>`;
  };
  // quem precisa de follow-up primeiro (mais atrasado no topo), depois o resto por recência
  const ordenados = ativos.slice().sort((a, b) => {
    const fa = followUpLead(a), fb = followUpLead(b);
    if (fa.precisa !== fb.precisa) return fa.precisa ? -1 : 1;
    if (fa.precisa && fb.precisa) return fb.dias - fa.dias;
    return (b.criadoEm || 0) - (a.criadoEm || 0);
  });
  $('#leads-list').innerHTML = ordenados.map(row).join('');
  atualizarBadgeLeads();
}

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'leads') { renderLeads(); } });
$('#leads-list').addEventListener('change', async (e) => {
  const sel = e.target.closest('.lead-status'); if (!sel) return;
  try { await atualizarStatusLead(sel.dataset.id, sel.value); } catch (err) { console.warn('Leads:', err?.code || err); }
  const l = LEADS_CACHE.find((x) => x.id === sel.dataset.id); if (l) l.status = sel.value;
  desenharLeads();
});
$('#leads-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.lead-excluir'); if (!btn) return;
  if (!(await confirmar({ titulo: 'Excluir lead?', texto: 'O contato sai da lista de interessados.', ok: 'Excluir', perigo: true }))) return;
  try { await excluirLead(btn.dataset.id); } catch (err) { console.warn('Leads:', err?.code || err); }
  LEADS_CACHE = LEADS_CACHE.filter((x) => x.id !== btn.dataset.id);
  desenharLeads();
});

/* Check-in / frequência (a grade da semana): ui-tela-checkin.js; as regras de
   presença, troca de dia, atestado e reposição: checkin-regras.js. */

/* ============================================================
   TELA — Agenda (calendário: reavaliações + aniversários)
   ============================================================ */
let agMes = mesIdAtual();

/** Próxima reavaliação (dataProxima da avaliação mais recente) ou null. */
function proxReav(a) {
  const avs = (a.avaliacoes || []).filter((x) => x.dataRealizada);
  if (!avs.length) return null;
  const ult = avs.reduce((m, x) => (x.dataRealizada > m.dataRealizada ? x : m), avs[0]);
  return ult.dataProxima || null;
}

function renderAgenda() {
  $('#ag-mes-lbl').textContent = rotuloMesFin(agMes);
  const [ano, mes] = agMes.split('-').map(Number);
  const alunos = db.listar().filter((a) => (a.status || 'ativo') !== 'inativo');

  /** @type {Record<number, {tipo:string, nome:string}[]>} */
  const evs = {};
  const add = (dia, tipo, nome) => { (evs[dia] = evs[dia] || []).push({ tipo, nome }); };
  for (const a of alunos) {
    const prox = proxReav(a);
    if (prox) { const [pa, pm, pd] = prox.split('-').map(Number); if (pa === ano && pm === mes) add(pd, 'reav', a.nome); }
    if (a.nascimento) { const [, nm, nd] = a.nascimento.split('-').map(Number); if (nm === mes) add(nd, 'aniv', a.nome); }
  }

  // Feriados do mês: a lista é lei (compartilhado/regras/feriados.js) e a decisão
  // "o box abriu?" é do coach (db.feriadosDoBox). O calendário mostra as duas
  // coisas, porque são diferentes: o feriado existe independente de ele abrir.
  const feriados = feriadosDoMes(ano, mes);
  const decisao = db.feriadosDoBox();

  const primeiroDiaSem = new Date(ano, mes - 1, 1).getDay();
  const totalDias = new Date(ano, mes, 0).getDate();
  const hojeIso = hoje();

  let html = `<div class="ag-grid ag-hdr">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<div class="ag-wd">${d}</div>`).join('')}</div><div class="ag-grid">`;
  for (let i = 0; i < primeiroDiaSem; i++) html += '<div class="ag-cell vazio"></div>';
  for (let d = 1; d <= totalDias; d++) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvs = evs[d] || [];
    const chips = dayEvs.slice(0, 2).map((e) =>
      `<span class="ag-chip ${e.tipo}" title="${esc((e.tipo === 'reav' ? 'Reavaliação: ' : 'Aniversário: ') + e.nome)}">${e.tipo === 'reav' ? '🔄' : '🎂'} ${esc(e.nome.split(' ')[0])}</span>`).join('');
    const mais = dayEvs.length > 2 ? `<span class="ag-mais">+${dayEvs.length - 2}</span>` : '';

    const fer = feriados.find((f) => f.data === iso);
    let fchip = '';
    let cls = '';
    if (fer) {
      const abriu = decisao[iso];
      // Três estados de propósito: sem decisão (o padrão conta presença normal),
      // fechado (não gera falta) e aberto (o coach abriu por exceção).
      const rot = abriu === false ? 'não abriu' : abriu === true ? 'abriu' : 'decidir';
      cls = ` feriado ${fer.tipo}${abriu === false ? ' fechado' : ''}`;
      fchip = `<button class="ag-fer" data-fer="${iso}" type="button"
        title="${esc(fer.nome)} · ${fer.tipo === 'facultativo' ? 'ponto facultativo' : 'feriado ' + fer.tipo}">
        ${esc(fer.nome.split('—')[0].split('(')[0].trim())}<small>${rot}</small></button>`;
    }
    html += `<div class="ag-cell${iso === hojeIso ? ' hoje' : ''}${cls}"><span class="ag-dia">${d}</span>${fchip}${chips}${mais}</div>`;
  }
  html += '</div>';
  $('#ag-cal').innerHTML = html;
}

/**
 * Clique na ficha de feriado: pergunta se o box abriu. É delegado no container
 * do calendário, que `renderAgenda()` redesenha inteiro a cada mês — ligar no
 * botão empilharia um listener por navegação de mês.
 */
$('#ag-cal').addEventListener('click', async (ev) => {
  const b = /** @type {HTMLElement} */ (ev.target).closest('[data-fer]');
  if (!b) return;
  const iso = /** @type {HTMLElement} */ (b).dataset.fer;
  const fer = feriadoEm(iso);
  if (!fer) return;
  const atual = db.feriadosDoBox()[iso];
  const acao = await painel({
    titulo: fer.nome,
    corpoHTML: `<p class="dlg-texto">${fmtDataCurta(iso)} · ${fer.tipo === 'facultativo' ? 'ponto facultativo' : `feriado ${fer.tipo}`}.</p>
      <p class="dlg-texto mut">O box abriu neste dia? Marcando <b>não abriu</b>, ninguém recebe falta —
      nem aqui, nem no Portal do aluno. ${atual === undefined ? 'Sem decisão, o dia conta presença normalmente.' : ''}</p>`,
    acoes: [
      { id: 'fechou', label: 'Não abriu' },
      { id: 'abriu', label: 'Abriu normal' },
      ...(atual === undefined ? [] : [{ id: 'limpar', label: 'Limpar decisão', perigo: true }]),
    ],
    largo: false,
  });
  if (!acao) return;
  db.marcarFeriado(iso, acao === 'fechou' ? false : acao === 'abriu' ? true : null);
  renderAgenda();
});

on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'agenda') { agMes = mesIdAtual(); renderAgenda(); } });
$('#ag-prev').addEventListener('click', () => { agMes = addMesFin(agMes, -1); renderAgenda(); });
$('#ag-next').addEventListener('click', () => { agMes = addMesFin(agMes, 1); renderAgenda(); });

/* ============================================================
   TELA 2 — Perfil
   ============================================================ */
// A ficha aberta: estado.alunoAtual (estado.js).

function abrirPerfil(id) {
  const a = db.obter(id);
  if (!a) return;
  estado.alunoAtual = a;
  renderCabecalho(a);
  // As abas se preparam para o aluno novo, e a aba Dados abre — quem desenha
  // cada painel é o módulo dele (ui-tab-*.js).
  emit(EVENTOS.PERFIL_ABERTO, a.id);
  emit(EVENTOS.ABRIR_ABA, 'dados');
  emit(EVENTOS.ABRIR_TELA, 'perfil');
}

/* As abas do perfil não moram mais aqui. O app só abre o perfil (acima); a
   troca de aba é 'abrir-aba' no barramento: ui-perfil.js marca a barra e mostra
   o painel, e cada ui-tab-*.js desenha o seu — Dados, Anamnese, PAR-Q,
   Avaliações, Progresso, Matriz, Financeiro, Portal, Registros. */

/* ============================================================
   Modais
   ============================================================ */
$$('.modal-bg').forEach((bg) => {
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) bg.classList.remove('open'); });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal-bg.open').forEach((m) => m.classList.remove('open')); });

/* ---- Modal: novo aluno ---- */
$('#fab-novo').addEventListener('click', () => {
  $('#modal-aluno-body').innerHTML = formDadosHTML({}, { idEditavel: true });
  wireForm($('#modal-aluno-body'));
  abrirModal('modal-aluno');
  setTimeout(() => $('input[name=id]', $('#modal-aluno-body'))?.focus(), 50);
});
$('#form-novo').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = lerForm(e.target);
  if (!dados.nome) { avisar({ texto: 'Informe o nome do aluno.' }); return; }
  const novo = db.criar(dados);
  if (!novo) { avisar({ texto: 'Já existe um aluno com esse ID. Escolha outro.' }); return; }
  reg('aluno-criado', novo, 'Aluno cadastrado', { chave: `aluno-criado:${novo.id}` });
  fecharModal('modal-aluno');
  abrirPerfil(novo.id);
});

/* Avaliações (lista, formulário, fotos, exclusão, comparação): ui-tab-avaliacoes.js. */

/* ============================================================
   GATE de acesso (mesmo login do Coach/Montador)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gReset = $('#gate-reset');

/* ============================================================
   Medidor e backup do banco
   ============================================================
   Desde a v2 os alunos moram um por documento (gestao/{uid}/alunos/{id}), e o
   teto de 1 MiB do Firestore passou a valer por ALUNO. O medidor mostra o
   total (o tamanho que o blob antigo teria) e a maior ficha — é ela que mede a
   distância do teto agora. Ver docs/superpowers/specs/2026-10-06-refatoracao-gestao-design.md.
   `db.comoBlob` pode faltar se o navegador ainda tiver o db.js antigo em cache
   (ele é carregado sem `?v=`): aí lê a chave antiga direto. */
const CHAVE_BANCO_V1 = 'braconaro_gestao_alunos_v1';
const TETO_FIRESTORE = 1024 * 1024;

function blobDoBanco() {
  if (typeof db.comoBlob === 'function') return db.comoBlob();
  try { return JSON.parse(localStorage.getItem(CHAVE_BANCO_V1) || ''); } catch { return null; }
}

function medirTamanhoBanco(momento = 'boot') {
  try {
    const d = blobDoBanco() || { alunos: [] };
    // Bytes em UTF-8 (acentos ocupam 2), que é como o Firestore conta — `.length` contaria caracteres.
    const bytes = (v) => new Blob([JSON.stringify(v)]).size;
    const alunos = Array.isArray(d.alunos) ? d.alunos : [];
    const total = bytes(d);
    const avaliacoes = alunos.reduce((n, a) => n + ((a && a.avaliacoes) || []).length, 0);
    // A maior ficha SEM avaliações e feedbacks: é o documento gestao/{uid}/alunos/{id}.
    const maior = alunos.reduce((m, a) => { const { avaliacoes: _a, feedbacks: _f, ...f } = a || {}; return Math.max(m, bytes(f)); }, 0);
    const pct = (maior / TETO_FIRESTORE) * 100;
    const sinal = pct >= 80 ? '🔴' : pct >= 50 ? '🟡' : '🟢';
    const modo = typeof db.modoSync === 'function' ? db.modoSync() : 'v1';
    console.log(`${sinal} [Gestão · ${momento} · sync ${modo}] ${alunos.length} alunos · ${avaliacoes} avaliações · `
      + `total ${(total / 1024).toFixed(1)} KB · maior ficha ${(maior / 1024).toFixed(1)} KB (${pct.toFixed(2)}% do teto de 1 MB por documento)`);
    return total;
  } catch (e) {
    console.warn('Não foi possível medir o banco local:', e);
    return null;
  }
}

function baixarBackupGestao() {
  const d = blobDoBanco();
  if (!d || !Array.isArray(d.alunos) || !d.alunos.length) { avisar({ titulo: 'Nada para salvar', texto: 'O banco local está vazio neste aparelho.' }); return; }
  // Mesmo formato do backup antigo ({ seq, produtos, feriados, alunos[] }): o
  // simulador da migração e qualquer restauração leem os dois iguais.
  const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_garage_power_lab_${hoje()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#btn-backup').addEventListener('click', baixarBackupGestao);

medirTamanhoBanco();

async function entrar(user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra contas de aluno
  estado.uid = user?.uid || null;
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  renderLista();
  // Sincroniza com a nuvem (se houver usuário logado). Não bloqueia a UI.
  if (user && user.uid) {
    eventos.configurarEventos(user.uid); // sobe o que ficou na fila da última sessão
    db.iniciarSync(user.uid, () => {
      // Dados da nuvem chegaram: o estado passa a apontar para a ficha nova e
      // as telas que ouvem 'alunos-mudaram' (lista, cabeçalho, avaliações) se redesenham.
      if ($('#tela-perfil').classList.contains('active') && estado.alunoAtual) {
        const a = db.obter(estado.alunoAtual.id);
        if (a) estado.alunoAtual = a;
      }
      emit(EVENTOS.ALUNOS_MUDARAM);
    }).then(async (modo) => {
      // 0) agora o cache local é o espelho da nuvem
      medirTamanhoBanco('após sync');
      // Nuvem ainda no formato antigo e a migração não terminou (outro aparelho
      // migrando, rede): o merge APAGA a caixa do aluno depois de aplicar, e a
      // ficha daqui ainda não sobe — o feedback ficaria só neste aparelho. A
      // caixa espera a próxima abertura; o Portal também.
      const nuvemEmDia = modo !== 'local';
      // 1) puxa o que os alunos enviaram (foto/feedback/presença/diário) e mescla no coach
      const n = !nuvemEmDia ? 0 : await mergarInboxes(db.listar(), (id, patch) => db.atualizar(id, patch), eventos.registrar);
      if (n) {
        renderLista();
        if ($('#tela-perfil').classList.contains('active') && estado.alunoAtual) {
          const a = db.obter(estado.alunoAtual.id);
          if (a) {
            estado.alunoAtual = a;
            // O merge acabou de pôr eventos novos na fila (foto, feedback, diário):
            // a aba Registros e a Progresso, se abertas, mostram já.
            emit(EVENTOS.REGISTROS_MUDARAM, a.id);
          }
        }
      }
      // 2) publica o Portal do Aluno (com a foto nova já aplicada) após sincronizar
      if (nuvemEmDia) publicarPortal(db.listar());
      // 3) puxa o mural de avisos + desafios da nuvem (para editar no mesmo estado em qualquer aparelho)
      sincronizarAvisos();
      sincronizarDesafios();
      // 4) total de treino queimado na semana, por aluno (selo na listagem)
      atualizarGastoSemana();
      // 5) leads que precisam de follow-up (selo no botão "Leads")
      carregarBadgeLeads();
    });
  }
}
function erroMsg(m) { gErro.style.color = ''; gErro.textContent = m; gErro.style.display = 'block'; }
function okMsg(m) { gErro.style.color = 'var(--ok)'; gErro.textContent = m; gErro.style.display = 'block'; }
function msgAuth(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Conta não encontrada. Contas de coach são criadas pelo administrador.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — faça login normalmente.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado (regras do Firestore).',
  })[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

if (cloudAtivo()) {
  gate.style.display = 'flex';
  gReset.addEventListener('click', async (e) => { e.preventDefault(); const m = gEmail.value.trim(); if (!m) { erroMsg('Digite seu e-mail acima primeiro.'); gEmail.focus(); return; } try { await resetarSenha(m); okMsg('Enviamos um link de redefinição para seu e-mail.'); } catch (err) { erroMsg(msgAuth(err)); } });
  sessaoAtual().then((u) => { if (u) entrar(u); else gEmail.focus(); });
  gform.addEventListener('submit', async (e) => {
    e.preventDefault(); gErro.style.display = 'none';
    try {
      const user = await login(gEmail.value.trim(), gSenha.value);
      entrar(user);
    }
    catch (err) { erroMsg(msgAuth(err)); console.error('Auth:', err?.code, err?.message); }
  });
} else if (estaLiberado()) {
  entrar();
} else {
  gate.style.display = 'flex';
  gEmail?.remove(); gReset?.remove(); gSenha.focus();
  gform.addEventListener('submit', async (e) => { e.preventDefault(); if (await tentarLiberar(gSenha.value)) entrar(); else { erroMsg('Senha incorreta.'); gSenha.value = ''; gSenha.focus(); } });
}
