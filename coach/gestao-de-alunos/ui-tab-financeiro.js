// @ts-check
/**
 * O financeiro de UM aluno na ficha — o card Financeiro da aba Geral
 * (ui-tab-geral.js) mostra, e este módulo faz as operações de dinheiro.
 *
 *  - Resumo do plano: mensalidade (com a parceria, se houver), vencimento, e
 *    quem paga a conta de quem.
 *  - Histórico: uma fatura por mês (mensalidade + consumos + contas que ele
 *    acerta por outros), com a situação no MESMO critério do Portal e do app
 *    (`statusDaCobranca`): o coach vê o que o aluno vê.
 *  - Novo lançamento: consumo do catálogo do box ou avulso (camiseta, aula
 *    experimental), carimbado na fatura certa pela data.
 *  - Registrar pagamento: a baixa é da FATURA do mês — é assim que o Portal e o
 *    Pix cobram (`pagamentos['AAAA-MM']`). Não existe baixa por item. A janela
 *    pede o meio, o valor, a data e, se quiser, a foto do comprovante (etapa 3),
 *    e é a MESMA para a tela Financeiro do box e as Cobranças (`abrirPagamento`).
 *
 * A mensalidade não é lançada à mão: ela sai do plano a cada mês (o plano se
 * edita no ✎ do card Financeiro).
 *
 * Grava só pelo `db.js`; a gravação já publica o Portal e emite
 * 'alunos-mudaram', e é isso que redesenha o card, a lista e o cabeçalho.
 * Depois de gravar, deixa a trilha na aba Registros (registro.js): pagamento
 * registrado (mês e valor), pagamento desfeito, lançamento avulso.
 * As regras (o que é atrasado, em que fatura cai) moram em financeiro-aluno.js.
 */
import * as db from './db.js?v=32';
import { esc, hoje, fmtData, fmtDataCurta } from './util/formato.js?v=32';
import { $, abrirModal, fecharModal } from './util/dom.js?v=32';
import { estado } from './estado.js?v=32';
import { confirmar } from '../../compartilhado/ui/dialogo.js?v=32';
import { mesIdParaLancar } from '../../compartilhado/regras/consumo.js';
import { brl, numMoney, rotuloMesFin, MEIOS_PAGAMENTO, MEIOS_DA_BAIXA_MANUAL, textoDoRecebimento } from './financeiro-aluno.js?v=32';
import { darBaixa, desfazerBaixa, erroDaBaixa, lancarConsumo, removerConsumo } from './financeiro-regras.js?v=32';
import { faturaComFechamento, pagamentosParaLancar } from './fechamento-regras.js?v=32';
import { fechamentos } from './fechamentos-db.js?v=32';
import { regFinanceiro } from './registro.js?v=32';
import * as storage from '../../compartilhado/regras/storage-alunos.js?v=32';

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
 * Um card de fatura.
 * @param {import('./financeiro-aluno.js').Fatura} f
 */
export function htmlFatura(f) {
  const [rotulo, cor] = STATUS[f.status] || ['—', 'coberto'];
  const chip = f.status === 'coberto' && f.responsavel
    ? `<span class="ac-chip ac-chip-coberto">Na conta de ${esc(f.responsavel)}</span>`
    : `<span class="ac-chip ac-chip-${cor}">${rotulo}</span>`;
  // Fatura de mês FECHADO (etapa 4) é o retrato: nada sai dela.
  const fechadoEm = Number(/** @type {any} */ (f).fechadoEm) || 0;
  const removivel = f.status !== 'pago' && f.status !== 'coberto' && !fechadoEm;
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
        <div><span class="fa-mes">${esc(f.rotulo)}</span><span class="fa-venc">vence ${fmtData(f.vencimento)}</span>${fechadoEm ? `<span class="fa-fechado">🔒 fechado em ${fmtDataCurta(diaLocal(fechadoEm))}</span>` : ''}</div>
        ${chip}
      </header>
      <ul class="fa-itens">${itens}</ul>
      ${htmlRecebimento(f)}
      <footer class="fa-fatura-ft"><span class="fa-total">Total <b>${brl(f.total)}</b></span>${acao}</footer>
    </article>`;
}

/**
 * A linha do registro na fatura paga: "Pago em 10/11 · Pix por chave · R$ 130,00",
 * com o clipe da foto quando há comprovante. Paga antes do registro: diz isso.
 * @param {import('./financeiro-aluno.js').Fatura} f
 */
export function htmlRecebimento(f) {
  if (f.status !== 'pago' || !('recebimento' in f)) return '';
  const r = f.recebimento;
  // Pago depois que o mês foi fechado: o retrato guardou "em aberto", a ficha diz que entrou.
  const depois = /** @type {any} */ (f).pagoDepois ? ' · pago depois do fechamento' : '';
  if (!r) return `<p class="fa-recebido fa-recebido-antigo">Pago (antes do registro detalhado)${depois}</p>`;
  const foto = r.comprovante
    ? ` <button class="fa-comprovante" data-fin="comprovante" data-caminho="${esc(r.comprovante)}" type="button" aria-label="Abrir o comprovante">📎 comprovante</button>` : '';
  return `<p class="fa-recebido">${esc(textoDoRecebimento(r))}${depois}${foto}</p>`;
}

/** O dia ('AAAA-MM-DD') de um instante, no relógio deste aparelho (o do coach). @param {number} ms */
function diaLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    <p class="hint">A mensalidade não precisa ser lançada: ela entra sozinha em cada mês, pelo valor do plano (o ✎ do card Financeiro).</p>
    <p class="fa-erro" id="fa-erro" role="alert" hidden></p>`;
}

/**
 * A janela da baixa de uma fatura: o resumo da conta e o registro do pagamento
 * — meio (Pix por chave já marcado), valor (o total da conta), data (hoje) e a
 * foto do comprovante, opcional.
 * @param {import('./financeiro-aluno.js').Fatura} f @param {string} hojeIso
 * @param {string} [nome] o nome do aluno, quando a janela abre fora da ficha dele
 */
export function htmlFormPagamento(f, hojeIso, nome = '') {
  const itens = f.itens.filter((i) => !i.coberto).map((i) => `<li><span>${esc(i.descricao)}</span><span>${brl(i.valor)}</span></li>`).join('');
  const meios = MEIOS_DA_BAIXA_MANUAL.map((m, i) =>
    `<label class="chk"><input type="radio" name="meio" value="${m}"${i === 0 ? ' checked' : ''} /> ${esc(MEIOS_PAGAMENTO[m])}</label>`).join('');
  return `
    <p class="fa-pg-mes">${nome ? `${esc(nome)} · ` : ''}${esc(f.rotulo)} · vence ${fmtData(f.vencimento)}</p>
    <ul class="fa-pg-itens">${itens}</ul>
    <p class="fa-pg-total">Total <b>${brl(f.total)}</b></p>
    <div class="fa-tipo fa-pg-meio" role="radiogroup" aria-label="Meio de pagamento">${meios}</div>
    <div class="grid-form">
      <div class="field"><label for="fa-pg-valor">Valor recebido (R$)</label><input id="fa-pg-valor" name="valor" type="number" inputmode="decimal" min="0" step="0.01" value="${f.total.toFixed(2)}" /></div>
      <div class="field"><label for="fa-pg-data">Data do pagamento</label><input id="fa-pg-data" name="data" type="date" value="${esc(hojeIso)}" max="${esc(hojeIso)}" /></div>
      <div class="field full"><label for="fa-pg-foto">Comprovante (opcional)</label><input id="fa-pg-foto" name="comprovante" type="file" accept="image/*" /></div>
    </div>
    <p class="hint">A fatura inteira fica paga — no Portal e no app do aluno ela passa a aparecer como paga. A foto fica só na Gestão; PDF não entra (tire um print).</p>
    <p class="fa-erro" id="fa-erro" role="alert" hidden></p>`;
}

/* ============================================================
   DOM
   ============================================================ */

/** O aluno aberto, relido do banco. */
const alunoAberto = () => (estado.alunoAtual ? db.obter(estado.alunoAtual.id) : null);

/**
 * O que o modal está fazendo agora. Na baixa, de QUAL aluno (a janela também
 * abre pela tela Financeiro do box e pelas Cobranças, fora da ficha) e quem
 * redesenhar depois de gravar.
 * @type {{ modo: 'lancamento'|'pagamento', mesId?: string, alunoId?: string, aoGravar?: () => void, totalDaConta?: number } | null}
 */
let modal = null;
/** A baixa está gravando (a foto subindo): um segundo clique não grava de novo. */
let gravando = false;

function abrirLancamento() {
  const a = alunoAberto(); if (!a) return;
  modal = { modo: 'lancamento' };
  $('#modal-fin-titulo').textContent = 'Novo lançamento';
  $('#modal-fin-ok').textContent = 'Lançar';
  $('#modal-fin-ok').disabled = false;
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
  el.textContent = `Entra na fatura de ${rotuloMesFin(mesIdParaLancar(data, a.vencimento, pagamentosParaLancar(a, fechamentos())))}.`;
}

/**
 * A janela da baixa de uma fatura — a mesma no card Financeiro do aluno, na tela
 * Financeiro do box e nas Cobranças.
 * @param {string} alunoId @param {string} mesId
 * @param {() => void} [aoGravar] quem redesenhar depois da baixa (a tela que abriu)
 */
export function abrirPagamento(alunoId, mesId, aoGravar) {
  const a = db.obter(alunoId); if (!a) return;
  // Direto pelo mês: a tela Financeiro do box navega para meses fora do histórico da ficha.
  // Mês FECHADO (etapa 4): a fatura é a do retrato, e o valor também.
  const f = faturaComFechamento(a, mesId, db.listar(), hoje(), fechamentos());
  if (!f || f.status === 'pago' || !f.pagavel) return;
  modal = { modo: 'pagamento', mesId, alunoId, aoGravar, totalDaConta: f.total };
  gravando = false;
  $('#modal-fin-titulo').textContent = 'Registrar pagamento';
  $('#modal-fin-ok').textContent = 'Confirmar pagamento';
  $('#modal-fin-ok').disabled = false;
  const fora = !estado.alunoAtual || estado.alunoAtual.id !== a.id;
  $('#modal-fin-body').innerHTML = htmlFormPagamento(f, hoje(), fora ? (a.nome || '') : '');
  abrirModal('modal-fin');
}

/** Mostra o erro na janela. @param {string} texto */
function erroNaJanela(texto) {
  const er = $('#fa-erro'); if (!er) return;
  er.textContent = texto; er.hidden = !texto;
}

/**
 * Sobe a foto do comprovante e devolve o caminho dela no Storage.
 * @param {any} a @param {string} mesId @param {File} arquivo
 */
async function subirComprovante(a, mesId, arquivo) {
  if (!storage.storageAtivo() || !estado.uid) throw new Error('storage-indisponivel');
  const caminho = `gestao/${estado.uid}/comprovantes/${a.id}/${mesId}_${Date.now()}.webp`;
  await storage.enviar(caminho, await storage.comprimir(arquivo, 1600));
  return caminho;
}

/**
 * Grava a baixa da janela: confere, sobe a foto (se houver) e só então dá a
 * baixa. Foto que não subiu não dá baixa: a janela fica aberta, com o aviso.
 * @param {any} form
 */
async function gravarPagamento(form) {
  if (!modal || modal.modo !== 'pagamento' || !modal.mesId || !modal.alunoId || gravando) return;
  // A janela desta gravação: se ela fechar, ou outra abrir no lugar, enquanto a
  // foto sobe, esta gravação não mexe em nada (nem na janela nova).
  const sessao = modal;
  const mesmaJanela = () => modal === sessao && !!$('#modal-fin')?.classList.contains('open');
  const { mesId, alunoId, aoGravar } = sessao;
  const dados = { meio: String(form.meio?.value || ''), valor: numMoney(form.valor?.value), data: String(form.data?.value || '') };
  const erro = erroDaBaixa(dados, hoje());
  if (erro) { erroNaJanela(erro); return; }
  const arquivo = form.comprovante?.files?.[0] || null;
  if (arquivo && !String(arquivo.type).startsWith('image/')) { erroNaJanela('O comprovante precisa ser uma foto. PDF? Tire um print.'); return; }
  gravando = true;
  const ok = $('#modal-fin-ok');
  ok.disabled = true;
  let comprovante = null;
  try {
    if (arquivo) {
      ok.textContent = 'Enviando a foto…';
      comprovante = await subirComprovante(db.obter(alunoId), mesId, arquivo);
    }
  } catch (e) {
    console.warn('[financeiro] o comprovante não subiu.', e);
    if (mesmaJanela()) {
      erroNaJanela('Não deu para enviar a foto. Confira a internet e tente de novo, ou tire a foto e confirme sem ela.');
      gravando = false; ok.disabled = false; ok.textContent = 'Confirmar pagamento';
    }
    return;
  }
  // A janela foi fechada (Cancelar, ×, Esc) enquanto a foto subia: o coach
  // desistiu, então não há baixa. A foto que já subiu fica no Storage, solta.
  if (!mesmaJanela()) {
    if (modal === sessao) { gravando = false; ok.disabled = false; ok.textContent = 'Confirmar pagamento'; }
    return;
  }
  // Relê a ficha AGORA: a regra calcula o valor da conta e recusa o mês que já
  // ficou pago (pelo Pix, enquanto a foto subia).
  const a = db.obter(alunoId);
  if (a) aplicar(a, darBaixa(a, mesId, db.listar(), { ...dados, em: Date.now(), comprovante, totalDaConta: sessao.totalDaConta }));
  modal = null; gravando = false;
  fecharModal('modal-fin');
  aoGravar?.();
}

/** Abre a foto do comprovante numa aba nova. @param {string} caminho */
async function abrirComprovante(caminho) {
  // A aba abre já, no clique (senão o navegador bloqueia), e recebe o endereço quando ele chega.
  const aba = window.open('', '_blank');
  try {
    const url = await storage.urlDe(caminho);
    if (aba) aba.location.href = url; else window.open(url, '_blank');
  } catch (e) {
    aba?.close();
    console.warn('[financeiro] não deu para abrir o comprovante.', e);
    await confirmar({ titulo: 'Comprovante indisponível', texto: 'Não deu para abrir a foto agora. Confira a internet e tente de novo.', ok: 'Ok' });
  }
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
  if (!modal) return;
  if (modal.modo === 'pagamento') {
    // A mesma baixa da tela Financeiro e das Cobranças; quem fecha a janela é ela.
    void gravarPagamento(e.target);
    return;
  }
  const a = alunoAberto(); if (!a) return;
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
  // Data dentro de um mês FECHADO: o consumo vai para a próxima fatura aberta, como na fatura paga.
  aplicar(a, lancarConsumo({ ...a, pagamentos: pagamentosParaLancar(a, fechamentos()) }, item, data));
  modal = null;
  fecharModal('modal-fin');
}

/**
 * Liga os botões de dinheiro (`data-fin`: novo, pagar, desfazer, remover) dentro
 * de `painel` e o modal de lançamento/pagamento. Chamar uma vez, antes do resto
 * do app. Quem desenha (e redesenha depois de gravar) é o card Financeiro.
 * @param {string} [painel] onde ficam os botões — a aba Geral
 */
export function iniciarTabFinanceiro(painel = '#tab-geral') {
  $(painel)?.addEventListener('click', async (/** @type {any} */ e) => {
    const b = e.target.closest('[data-fin]'); if (!b) return;
    const a = alunoAberto(); if (!a) return;
    if (b.dataset.fin === 'novo') abrirLancamento();
    else if (b.dataset.fin === 'pagar') abrirPagamento(a.id, b.dataset.mes);
    else if (b.dataset.fin === 'comprovante') void abrirComprovante(b.dataset.caminho);
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
  form?.addEventListener('input', () => {
    if (modal?.modo === 'lancamento') atualizarDestino();
    const er = $('#fa-erro'); if (er) er.hidden = true;
  });
  form?.addEventListener('change', () => { if (modal?.modo === 'lancamento') atualizarDestino(); });
}
