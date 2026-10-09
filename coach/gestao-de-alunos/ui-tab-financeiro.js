// @ts-check
/**
 * Aba Financeiro do perfil — o financeiro de UM aluno.
 *
 *  - Resumo do plano: mensalidade (com a parceria, se houver), vencimento, e
 *    quem paga a conta de quem.
 *  - Histórico: uma fatura por mês (mensalidade + consumos + contas que ele
 *    acerta por outros), com a situação no MESMO critério do Portal e do app
 *    (`statusDaCobranca`): o coach vê o que o aluno vê.
 *  - Novo lançamento: consumo do catálogo do box ou avulso (camiseta, aula
 *    experimental), carimbado na fatura certa pela data.
 *  - Registrar pagamento: a baixa é da FATURA do mês — é assim que o Portal e o
 *    Pix cobram (`pagamentos['AAAA-MM']`). Não existe baixa por item.
 *
 * A mensalidade não é lançada à mão: ela sai do plano a cada mês (aba Dados).
 *
 * Grava só pelo `db.js`; a gravação já publica o Portal e emite
 * 'alunos-mudaram', e é isso que redesenha esta aba, a lista e o cabeçalho.
 * Depois de gravar, deixa a trilha na aba Registros (registro.js): pagamento
 * registrado (mês e valor), pagamento desfeito, lançamento avulso.
 * As regras (o que é atrasado, em que fatura cai) moram em financeiro-aluno.js.
 */
import * as db from './db.js?v=12';
import { esc, hoje, fmtData, fmtDataCurta } from './util/formato.js?v=12';
import { $, abrirModal, fecharModal } from './util/dom.js?v=12';
import { estado, on, EVENTOS } from './estado.js?v=12';
import { confirmar } from '../../compartilhado/ui/dialogo.js?v=12';
import { mesIdParaLancar } from '../../compartilhado/regras/consumo.js';
import { brl, numMoney, rotuloMesFin, historicoFinanceiro, resumoDoPlano } from './financeiro-aluno.js?v=12';
import { darBaixa, desfazerBaixa, lancarConsumo, removerConsumo } from './financeiro-regras.js?v=12';
import { regFinanceiro } from './registro.js?v=12';

/** Rótulo e cor de cada situação. */
const STATUS = {
  pago: ['Pago', 'ok'],
  pendente: ['A vencer', 'warn'],
  proximo: ['Próximo mês', 'proximo'],
  vencido: ['Atrasado', 'bad'],
  cortesia: ['Cortesia', 'cortesia'],
  coberto: ['Na conta de outro aluno', 'coberto'],
};

/* ============================================================
   HTML (puro)
   ============================================================ */

/**
 * O card do topo: o plano e quanto está em aberto.
 * @param {ReturnType<typeof resumoDoPlano>} r @param {{ emAberto: number, atrasado: number }} h
 */
export function htmlResumo(r, h) {
  const semPlano = !(r.mensalidadeCheia > 0);
  const linhas = [];
  if (r.plano) linhas.push(esc(r.plano));
  linhas.push(`vence dia ${r.vencimento}${r.vencimentoDefinido ? '' : ' (padrão)'}`);
  const valor = semPlano
    ? '<span class="fa-valor fa-vazio">Sem mensalidade</span>'
    : `<span class="fa-valor">${brl(r.mensalidade)}<small>/mês</small></span>`;
  const extras = [];
  if (r.parceria) {
    extras.push(`<span class="ac-chip ac-chip-cortesia">Parceria ${r.parceria.percentual}%${r.parceria.nome ? ' · ' + esc(r.parceria.nome) : ''}</span>`
      + `<span class="fa-nota">cheia ${brl(r.mensalidadeCheia)} · o box banca ${brl(r.desconto)}</span>`);
  }
  if (r.responsavel) {
    extras.push(`<span class="fa-nota">Conta acertada por <b>${esc(r.responsavel.nome)}</b> (${r.responsavel.escopo === 'plano' ? 'só o plano — o consumo é dele' : 'plano e consumíveis'}).</span>`);
  }
  if (r.dependentes.length) {
    extras.push(`<span class="fa-nota">Paga também a conta de <b>${r.dependentes.map(esc).join(', ')}</b>.</span>`);
  }
  if (semPlano) extras.push('<span class="fa-nota">Defina o valor na aba <b>Dados</b>, em Financeiro.</span>');
  const aberto = h.atrasado > 0
    ? `<span class="fa-aberto bad">${brl(h.emAberto)}<small>em aberto · ${brl(h.atrasado)} atrasado</small></span>`
    : h.emAberto > 0
      ? `<span class="fa-aberto warn">${brl(h.emAberto)}<small>em aberto</small></span>`
      : '<span class="fa-aberto ok">Em dia<small>nada em aberto</small></span>';
  return `
    <section class="fa-plano" aria-label="Resumo do plano">
      <div class="fa-plano-l">
        <span class="fa-eyebrow">Plano</span>
        ${valor}
        <span class="fa-plano-sub">${linhas.join(' · ')}</span>
        ${extras.length ? `<div class="fa-extras">${extras.join('')}</div>` : ''}
      </div>
      ${aberto}
    </section>`;
}

/**
 * Um card de fatura.
 * @param {import('./financeiro-aluno.js').Fatura} f
 */
export function htmlFatura(f) {
  const [rotulo, cor] = STATUS[f.status] || ['—', 'coberto'];
  const chip = f.status === 'coberto' && f.responsavel
    ? `<span class="ac-chip ac-chip-coberto">Na conta de ${esc(f.responsavel)}</span>`
    : `<span class="ac-chip ac-chip-${cor}">${rotulo}</span>`;
  const removivel = f.status !== 'pago' && f.status !== 'coberto';
  const itens = f.itens.map((i) => {
    const sub = i.tipo === 'consumo' && i.detalhe ? fmtDataCurta(i.detalhe) : (i.detalhe || '');
    const valor = i.coberto ? `<span class="fa-item-v fa-coberto">na conta de ${esc(f.responsavel || 'outro aluno')}</span>` : `<span class="fa-item-v">${brl(i.valor)}</span>`;
    const x = i.consumoId && removivel
      ? `<button class="fa-x" data-fin="remover" data-consumo="${esc(i.consumoId)}" type="button" aria-label="Remover ${esc(i.descricao)}">×</button>` : '';
    return `<li class="fa-item fa-${i.tipo}"><span class="fa-item-d">${esc(i.descricao)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${valor}${x}</li>`;
  }).join('');
  const acao = !f.pagavel ? ''
    : f.status === 'pago'
      ? `<button class="fa-desfazer" data-fin="desfazer" data-mes="${f.mesId}" type="button">Desfazer pagamento</button>`
      : `<button class="btn btn-sm" data-fin="pagar" data-mes="${f.mesId}" type="button">Registrar pagamento</button>`;
  return `
    <article class="fa-fatura st-${f.status}" aria-label="Fatura de ${esc(f.rotulo)}">
      <header class="fa-fatura-hd">
        <div><span class="fa-mes">${esc(f.rotulo)}</span><span class="fa-venc">vence ${fmtData(f.vencimento)}</span></div>
        ${chip}
      </header>
      <ul class="fa-itens">${itens}</ul>
      <footer class="fa-fatura-ft"><span class="fa-total">Total <b>${brl(f.total)}</b></span>${acao}</footer>
    </article>`;
}

/**
 * A aba inteira.
 * @param {any} a @param {any[]} todos @param {string} [hojeIso]
 */
export function htmlAbaFinanceiro(a, todos, hojeIso = hoje()) {
  const h = historicoFinanceiro(a, todos, hojeIso);
  const lista = h.faturas.length
    ? h.faturas.map(htmlFatura).join('')
    : '<div class="empty"><b>Nenhuma cobrança ainda</b>Defina a mensalidade na aba Dados, ou lance um consumo.</div>';
  return `
    ${htmlResumo(resumoDoPlano(a, todos, hojeIso), h)}
    <div class="fa-cab">
      <span class="fa-eyebrow">Histórico</span>
      <button class="btn btn-sm" data-fin="novo" type="button">+ Novo lançamento</button>
    </div>
    <div class="fa-lista">${lista}</div>
    ${h.temMais ? '<p class="hint fa-mais">Mostrando os últimos 12 meses.</p>' : ''}`;
}

/**
 * O formulário de novo lançamento.
 * @param {{id: string, nome: string, preco: number}[]} produtos @param {string} hojeIso
 */
export function htmlFormLancamento(produtos, hojeIso) {
  const prods = produtos.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)} · ${brl(p.preco)}</option>`).join('');
  return `
    <div class="fa-tipo" role="radiogroup" aria-label="Tipo de lançamento">
      <label class="chk"><input type="radio" name="tipo" value="produto"${produtos.length ? ' checked' : ' disabled'} /> Produto do box</label>
      <label class="chk"><input type="radio" name="tipo" value="avulso"${produtos.length ? '' : ' checked'} /> Avulso</label>
    </div>
    <div class="grid-form">
      <div class="field full" data-campo="produto"${produtos.length ? '' : ' hidden'}><label>Produto</label><select name="produtoId">${prods}</select></div>
      <div class="field" data-campo="avulso"${produtos.length ? ' hidden' : ''}><label>Descrição</label><input name="nome" type="text" maxlength="60" placeholder="Ex.: Camiseta do box" /></div>
      <div class="field" data-campo="avulso"${produtos.length ? ' hidden' : ''}><label>Valor (R$)</label><input name="preco" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,00" /></div>
      <div class="field"><label>Data da compra</label><input name="data" type="date" value="${esc(hojeIso)}" max="${esc(hojeIso)}" /></div>
    </div>
    <p class="hint" id="fa-destino"></p>
    <p class="hint">A mensalidade não precisa ser lançada: ela entra sozinha em cada mês, pelo valor do plano (aba Dados).</p>
    <p class="fa-erro" id="fa-erro" role="alert" hidden></p>`;
}

/**
 * A confirmação de pagamento de uma fatura.
 * @param {import('./financeiro-aluno.js').Fatura} f
 */
export function htmlFormPagamento(f) {
  const itens = f.itens.filter((i) => !i.coberto).map((i) => `<li><span>${esc(i.descricao)}</span><span>${brl(i.valor)}</span></li>`).join('');
  return `
    <p class="fa-pg-mes">${esc(f.rotulo)} · vence ${fmtData(f.vencimento)}</p>
    <ul class="fa-pg-itens">${itens}</ul>
    <p class="fa-pg-total">Total <b>${brl(f.total)}</b></p>
    <p class="hint">A fatura inteira fica paga — no Portal e no app do aluno ela passa a aparecer como paga.</p>`;
}

/* ============================================================
   DOM
   ============================================================ */

/** O aluno aberto, relido do banco. */
const alunoAberto = () => (estado.alunoAtual ? db.obter(estado.alunoAtual.id) : null);

/** O que o modal está fazendo agora. @type {{ modo: 'lancamento'|'pagamento', mesId?: string } | null} */
let modal = null;

/** Desenha a aba do aluno aberto. */
export function renderFinanceiro() {
  const a = alunoAberto(); const painel = $('#tab-financeiro');
  if (!a || !painel) return;
  painel.innerHTML = htmlAbaFinanceiro(a, db.listar());
}

function abrirLancamento() {
  const a = alunoAberto(); if (!a) return;
  modal = { modo: 'lancamento' };
  $('#modal-fin-titulo').textContent = 'Novo lançamento';
  $('#modal-fin-ok').textContent = 'Lançar';
  $('#modal-fin-body').innerHTML = htmlFormLancamento(db.listarProdutos(), hoje());
  atualizarDestino();
  abrirModal('modal-fin');
}

/** "Entra na fatura de Outubro" — muda com a data e com uma fatura já paga. */
function atualizarDestino() {
  const a = alunoAberto(); const form = $('#form-fin'); const el = $('#fa-destino');
  if (!a || !form || !el) return;
  const tipo = form.tipo.value;
  for (const c of form.querySelectorAll('[data-campo]')) c.hidden = c.dataset.campo !== tipo;
  const data = form.data.value || hoje();
  el.textContent = `Entra na fatura de ${rotuloMesFin(mesIdParaLancar(data, a.vencimento, a.pagamentos || {}))}.`;
}

/** @param {string} mesId */
function abrirPagamento(mesId) {
  const a = alunoAberto(); if (!a) return;
  const f = historicoFinanceiro(a, db.listar(), hoje(), 120).faturas.find((x) => x.mesId === mesId);
  if (!f) return;
  modal = { modo: 'pagamento', mesId };
  $('#modal-fin-titulo').textContent = 'Registrar pagamento';
  $('#modal-fin-ok').textContent = 'Confirmar pagamento';
  $('#modal-fin-body').innerHTML = htmlFormPagamento(f);
  abrirModal('modal-fin');
}

/**
 * Grava o resultado de uma regra de financeiro-regras.js e registra (se a ação
 * deixa trilha). A gravação emite 'alunos-mudaram', que redesenha a aba.
 * @param {any} a @param {import('./financeiro-regras.js').Mudanca | null} r
 */
function aplicar(a, r) {
  if (!r) return;
  db.atualizar(a.id, r.patch);
  if (r.log) regFinanceiro(a, r.log);
}

/** @param {SubmitEvent} e */
function salvarModal(e) {
  e.preventDefault();
  const a = alunoAberto(); if (!a || !modal) return;
  if (modal.modo === 'pagamento' && modal.mesId) {
    // A mesma baixa da tela Financeiro e das Cobranças: o valor registrado é o
    // da fatura agora, não o de quando o modal abriu.
    aplicar(a, darBaixa(a, modal.mesId, db.listar()));
  } else {
    const form = /** @type {any} */ (e.target);
    const erro = $('#fa-erro');
    const data = form.data.value || hoje();
    let item;
    if (form.tipo.value === 'produto') {
      const p = db.listarProdutos().find((x) => x.id === form.produtoId.value);
      if (!p) return;
      item = { produtoId: p.id, nome: p.nome, preco: p.preco };
    } else {
      const nome = form.nome.value.trim(), preco = numMoney(form.preco.value);
      if (!nome || !(preco > 0)) {
        erro.textContent = !nome ? 'Escreva o que foi vendido.' : 'Informe o valor, maior que zero.';
        erro.hidden = false; return;
      }
      item = { nome, preco };
    }
    // Do catálogo, o produto e o preço já dizem tudo; o avulso é o que deixa trilha.
    aplicar(a, lancarConsumo(a, item, data));
  }
  modal = null;
  fecharModal('modal-fin');
}

/** Liga a aba à página e ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabFinanceiro() {
  $('#tab-financeiro')?.addEventListener('click', async (/** @type {any} */ e) => {
    const b = e.target.closest('[data-fin]'); if (!b) return;
    const a = alunoAberto(); if (!a) return;
    if (b.dataset.fin === 'novo') abrirLancamento();
    else if (b.dataset.fin === 'pagar') abrirPagamento(b.dataset.mes);
    else if (b.dataset.fin === 'desfazer') {
      if (await confirmar({ titulo: 'Desfazer pagamento?', texto: `A fatura de <b>${esc(rotuloMesFin(b.dataset.mes))}</b> volta a ficar em aberto, também no Portal do aluno.`, ok: 'Desfazer', perigo: true })) {
        aplicar(a, desfazerBaixa(a, b.dataset.mes));
      }
    } else if (b.dataset.fin === 'remover') {
      const c = (a.consumos || []).find((x) => x.id === b.dataset.consumo); if (!c) return;
      if (await confirmar({ titulo: 'Remover lançamento?', texto: `Tirar <b>${esc(c.nome)}</b> (${brl(c.preco)}) da fatura de ${esc(rotuloMesFin(c.mesId))}?`, ok: 'Remover', perigo: true })) {
        aplicar(a, removerConsumo(a, c.id));
      }
    }
  });
  const form = $('#form-fin');
  form?.addEventListener('submit', salvarModal);
  form?.addEventListener('input', () => { if (modal?.modo === 'lancamento') { atualizarDestino(); const er = $('#fa-erro'); if (er) er.hidden = true; } });
  form?.addEventListener('change', () => { if (modal?.modo === 'lancamento') atualizarDestino(); });

  on(EVENTOS.ABRIR_ABA, (nome) => { if (nome === 'financeiro') renderFinanceiro(); });
  on(EVENTOS.ALUNOS_MUDARAM, () => { if ($('#tab-financeiro')?.classList.contains('active')) renderFinanceiro(); });
}
