// @ts-check
/**
 * Tela Cobranças — quem ainda deve a mensalidade do mês, por urgência, com o
 * lembrete pronto para o WhatsApp e a baixa num clique.
 *
 * Saiu do `app.js` no fatiamento. Quem entra na lista, o valor, os prazos e o
 * texto do lembrete moram em financeiro-regras.js (`cobrancasDoMes`,
 * `msgCobranca`); a baixa é a mesma `darBaixa` da tela Financeiro e da aba do
 * aluno. Aqui ficam o desenho e os botões.
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'cobrancas') — sempre o mês
 * atual — e depois de cada lembrete ou baixa.
 */
import * as db from './db.js?v=11';
import { brl, mesIdAtual, rotuloMesFin } from './financeiro-aluno.js?v=11';
import { cobrancasDoMes, msgCobranca, darBaixa } from './financeiro-regras.js?v=11';
import { esc, hoje, waMsg } from './util/formato.js?v=11';
import { $ } from './util/dom.js?v=11';
import { on, EVENTOS } from './estado.js?v=11';
import { regFinanceiro } from './registro.js?v=11';

/** Quem já foi lembrado nesta sessão (só para marcar "avisado ✓"). */
const cobLembrados = new Set();

/** Uma linha da lista. @param {string} mesId @returns {(c: import('./financeiro-regras.js').Cobranca) => string} */
const linha = (mesId) => ({ a, dias: d, valor, soMensalidade, itens }) => {
  const tel = String(a.telefone || '').replace(/\D/g, '');
  const urg = d < 0 ? `<span class="cob-badge vencido">Atrasada ${Math.abs(d)}d</span>`
    : d === 0 ? `<span class="cob-badge hoje">Vence hoje</span>`
      : `<span class="cob-badge breve">Em ${d}d</span>`;
  const feito = cobLembrados.has(a.id);
  const wa = tel.length >= 10
    ? `<a class="btn btn-sm cob-wa" href="${waMsg(a.telefone, msgCobranca(a, mesId, valor, d, soMensalidade, itens))}" target="_blank" rel="noopener" data-id="${esc(a.id)}">${feito ? 'Reenviar' : 'WhatsApp'}</a>`
    : `<span class="cob-semtel">sem telefone</span>`;
  return `<div class="cob-row${feito ? ' lembrado' : ''}">
      <div class="cob-info"><div class="fin-nome">${esc(a.nome)}${feito ? ' <span class="cob-ok">avisado ✓</span>' : ''}</div><div class="fin-sub">${brl(valor)} · vence dia ${esc(a.vencimento || '—')}</div></div>
      ${urg}${wa}
      <button class="btn ghost btn-sm cob-pago" data-id="${esc(a.id)}" type="button">Pago</button>
    </div>`;
};

function renderCobrancas() {
  const mesId = mesIdAtual();
  $('#cob-mes-lbl').textContent = rotuloMesFin(mesId);
  const { vencidas, emBreve, aVencer, totalAtraso, totalPendente } = cobrancasDoMes(db.listar(), mesId, hoje());
  $('#cob-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Vencidas</span><span class="fin-card-v${vencidas.length ? ' bad' : ''}">${vencidas.length}</span></div>
    <div class="fin-card"><span class="fin-card-l">Em atraso (R$)</span><span class="fin-card-v${totalAtraso > 0 ? ' bad' : ''}">${brl(totalAtraso)}</span></div>
    <div class="fin-card"><span class="fin-card-l">A receber no mês</span><span class="fin-card-v">${brl(totalPendente)}</span></div>`;

  const row = linha(mesId);
  const grupo = (titulo, arr) => (arr.length ? `<h4 class="cob-grupo">${titulo}</h4>${arr.map(row).join('')}` : '');
  const html = grupo('Vencidas', vencidas) + grupo('Vencem em breve (até 5 dias)', emBreve) + grupo('A vencer', aVencer);
  $('#cob-list').innerHTML = html || `<div class="empty"><b>Tudo em dia! 🎉</b>Nenhuma mensalidade pendente neste mês.</div>`;
}

/** Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app. */
export function iniciarTelaCobrancas() {
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'cobrancas') renderCobrancas(); });
  $('#cob-list')?.addEventListener('click', (/** @type {any} */ e) => {
    const wa = e.target.closest('.cob-wa');
    // O link abre o WhatsApp numa aba nova; a marca de "avisado" vem logo depois.
    if (wa) { cobLembrados.add(wa.dataset.id); setTimeout(renderCobrancas, 100); return; }
    const pg = e.target.closest('.cob-pago');
    if (!pg) return;
    const a = db.obter(pg.dataset.id); if (!a) return;
    const r = darBaixa(a, mesIdAtual(), db.listar());
    if (r) { db.atualizar(a.id, r.patch); if (r.log) regFinanceiro(a, r.log); }
    renderCobrancas();
  });
}
