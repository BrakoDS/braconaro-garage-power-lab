// @ts-check
/**
 * Tela Financeiro do box — as mensalidades do mês, aluno por aluno: quem cobra
 * de quem, o selo de cada linha, o balcão de consumíveis e o catálogo de
 * produtos.
 *
 * Saiu do `app.js` no fatiamento. As CONTAS (o mês do box, os totais) e as
 * AÇÕES (dar baixa, desfazer, lançar e remover consumo) moram em
 * financeiro-regras.js, puras e testadas, as mesmas da aba Financeiro do aluno
 * e das Cobranças. Aqui ficam o desenho, os botões e a aplicação: a regra
 * devolve o que mudar e a linha do log, e a tela grava (`db.atualizar` — que já
 * publica o Portal e avisa a lista) e registra.
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'financeiro'), que sempre
 * volta para o mês atual, e a cada ação ou troca de mês.
 */
import * as db from './db.js?v=13';
import { mesIdParaLancar, consumosDoMes } from '../../compartilhado/regras/consumo.js';
import { brl, numMoney, mesIdAtual, rotuloMesFin, addMesFin } from './financeiro-aluno.js?v=13';
import { mesDoBox, darBaixa, desfazerBaixa, lancarConsumo, removerConsumo } from './financeiro-regras.js?v=13';
import { esc, hoje, fmtDataCurta } from './util/formato.js?v=13';
import { $, $$ } from './util/dom.js?v=13';
import { on, EVENTOS } from './estado.js?v=13';
import { regFinanceiro } from './registro.js?v=13';

let finMes = mesIdAtual();
/** Qual aluno está com o balcão de consumíveis aberto na tela. */
let finBalcao = /** @type {string|null} */ (null);
/** O catálogo está aberto para edição? */
let finEditandoProdutos = false;

/**
 * O balcão: um botão por produto, para lançar na conta do aluno.
 *
 * Tudo aqui — o rótulo e a lista — fala da fatura de DESTINO, não da que está na
 * tela. Com o mês em tela já quitado, o lançamento pula para o seguinte; listando
 * o mês em tela, o coach clicava no produto e a tela não mexia em nada. Parecia
 * que o botão não funcionava, e clicar de novo enfiava consumos repetidos numa
 * fatura que ele nem estava vendo.
 * @param {any} a
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

/** Uma linha do mês. @param {import('./financeiro-regras.js').LinhaDoMes} l */
function linhaHTML({ a, resp, conta, propria, status, statusExibido, cortesia, rotulo, destino, adiante }) {
  const partes = [];
  if (conta.propria.mensalidade > 0) partes.push(brl(conta.propria.mensalidade));
  else if (propria.desconto > 0 && !resp) partes.push(brl(0));
  if (conta.propria.extras > 0) partes.push(`${brl(conta.propria.extras)} em consumo`);
  conta.dependentes.forEach((d) => partes.push(`${brl(d.total)} de ${esc(d.nome)}`));
  const detalhe = conta.total === 0 && resp
    ? `acertado por <b>${esc(resp.nome || resp.id)}</b>`
    : (partes.length > 1 ? `${partes.join(' + ')} = <b>${brl(conta.total)}</b>` : brl(conta.total));

  const aviso = adiante > 0
    ? ` <span class="fin-adiante">· ${brl(adiante)} em consumo já vai para ${esc(rotuloMesFin(destino))}</span>`
    : '';

  const btn = conta.total === 0
    ? ''
    : status === 'pago'
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
      <span class="fin-badge ${cortesia ? 'cortesia' : statusExibido}">${rotulo}</span>
      <div class="fin-acoes">
        <button class="btn ghost btn-sm fin-balcao-btn${aberto ? ' on' : ''}" data-id="${esc(a.id)}" type="button">${aberto ? 'Fechar' : '+ Consumo'}</button>
        ${btn}
      </div>
      ${aberto ? balcaoConsumo(a) : ''}
    </div>`;
}

function renderFinanceiro() {
  $('#fin-mes-lbl').textContent = rotuloMesFin(finMes);
  const { linhas, totais } = mesDoBox(db.listar(), finMes, hoje());
  const { previsto, recebido, extras, investido } = totais;
  const html = linhas.map(linhaHTML).join('');

  $('#fin-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Recebido</span><span class="fin-card-v ok">${brl(recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">A receber</span><span class="fin-card-v${previsto - recebido > 0 ? ' bad' : ''}">${brl(previsto - recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Previsto no mês</span><span class="fin-card-v">${brl(previsto)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Consumíveis</span><span class="fin-card-v">${brl(extras)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Investido em parcerias</span><span class="fin-card-v${investido > 0 ? ' parceria' : ''}">${brl(investido)}</span></div>`;
  $('#fin-list').innerHTML = (finEditandoProdutos ? painelProdutos() : '')
    + (html || `<div class="empty"><b>Nenhuma mensalidade cadastrada</b>Defina o valor da mensalidade no perfil do aluno (aba Dados → Financeiro).</div>`);
  $('#fin-produtos').textContent = finEditandoProdutos ? 'Fechar produtos' : 'Produtos';
}

/**
 * Roda a regra sobre a ficha do banco, grava, registra (se a ação deixa
 * trilha) e redesenha. Regra que devolve null não faz nada.
 * @param {string} id @param {(a: any) => (import('./financeiro-regras.js').Mudanca | null)} regra
 */
function aplicar(id, regra) {
  const a = db.obter(id); if (!a) return;
  const r = regra(a);
  if (!r) return;
  db.atualizar(id, r.patch);
  if (r.log) regFinanceiro(a, r.log);
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

/** Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app. */
export function iniciarTelaFinanceiro() {
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'financeiro') { finMes = mesIdAtual(); finBalcao = null; finEditandoProdutos = false; renderFinanceiro(); } });
  $('#fin-prev')?.addEventListener('click', () => { finMes = addMesFin(finMes, -1); renderFinanceiro(); });
  $('#fin-next')?.addEventListener('click', () => { finMes = addMesFin(finMes, 1); renderFinanceiro(); });
  $('#fin-produtos')?.addEventListener('click', () => { finEditandoProdutos = !finEditandoProdutos; renderFinanceiro(); });

  $('#fin-list')?.addEventListener('click', (/** @type {any} */ e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('fin-toggle')) {
      const mes = finMes;
      aplicar(btn.dataset.id, (a) => (btn.dataset.op === '1' ? darBaixa(a, mes, db.listar()) : desfazerBaixa(a, mes)));
      return;
    }
    if (btn.classList.contains('fin-balcao-btn')) {
      finBalcao = finBalcao === btn.dataset.id ? null : btn.dataset.id;
      renderFinanceiro(); return;
    }
    if (btn.classList.contains('fin-add')) {
      // O nome e o preço são copiados do catálogo AGORA (ver lancarConsumo).
      const p = db.listarProdutos().find((x) => x.id === btn.dataset.prod);
      if (p) aplicar(btn.dataset.id, (a) => lancarConsumo(a, { produtoId: p.id, nome: p.nome, preco: p.preco }, hoje()));
      return;
    }
    if (btn.dataset.consumo) { aplicar(btn.dataset.id, (a) => removerConsumo(a, btn.dataset.consumo)); return; }
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
}
