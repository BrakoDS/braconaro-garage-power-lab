// @ts-check
/**
 * Tela Leads — quem pediu aula experimental no site: status do contato,
 * WhatsApp pronto, exclusão e o alerta de follow-up (lead parado esfria).
 *
 * Saiu do `app.js` no fatiamento. O follow-up, as contagens e a ordem moram
 * em comunicacao-regras.js (`followUpLead`, `painelDeLeads`); os leads vêm da
 * nuvem (leads-read.js). O selo no botão "Leads" da lista é carregado no login
 * (`carregarBadgeLeads`, chamado pelo boot.js) e refeito a cada desenho.
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'leads'), que recarrega da
 * nuvem, e depois de cada mudança de status ou exclusão.
 */
import { carregarLeads, atualizarStatusLead, excluirLead } from './leads-read.js';
import { followUpLead, painelDeLeads, comStatus, LEAD_STATUS_LABEL } from './comunicacao-regras.js';
import { esc, waMsg } from './util/formato.js';
import { $ } from './util/dom.js';
import { on, EVENTOS } from './estado.js';
import { confirmar as confirmarReal } from '../../compartilhado/ui/dialogo.js';

/** Os leads carregados por último. */
let LEADS_CACHE = /** @type {any[]} */ ([]);

/** @type {{ carregar: () => Promise<any[]>, atualizarStatus: (id: string, st: string) => Promise<any>, excluir: (id: string) => Promise<any>, confirmar: (o: any) => Promise<boolean>, agora: () => number }} */
let deps = { carregar: carregarLeads, atualizarStatus: atualizarStatusLead, excluir: excluirLead, confirmar: confirmarReal, agora: () => Date.now() };

/** Atualiza o selo de follow-up no botão "Leads" da listagem (lembrete sem abrir a tela). */
function atualizarBadgeLeads() {
  const btn = $('#btn-leads'); if (!btn) return;
  const agora = deps.agora();
  const n = LEADS_CACHE.filter((l) => l.status !== 'descartado' && followUpLead(l, agora).precisa).length;
  let badge = btn.querySelector('.btn-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'btn-badge'; btn.appendChild(badge); }
  badge.textContent = String(n);
  badge.title = `${n} lead(s) precisam de follow-up`;
}

/** Carrega os leads em cache (para o selo do botão) — silencioso. Chamado no login. */
export async function carregarBadgeLeads() {
  try { LEADS_CACHE = await deps.carregar(); atualizarBadgeLeads(); } catch (e) { console.warn('Leads badge:', /** @type {any} */ (e)?.code || e); }
}

async function renderLeads() {
  $('#leads-list').innerHTML = `<div class="prog-ph">Carregando…</div>`;
  try { LEADS_CACHE = await deps.carregar(); }
  catch (e) { console.warn('Leads:', /** @type {any} */ (e)?.code || e); $('#leads-list').innerHTML = `<div class="prog-ph">Não foi possível carregar agora.</div>`; return; }
  desenharLeads();
}

function desenharLeads() {
  const agora = deps.agora();
  const { ordenados, novos, contatados, convertidos, precisam } = painelDeLeads(LEADS_CACHE, agora);
  $('#leads-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Novos</span><span class="fin-card-v${novos ? ' bad' : ''}">${novos}</span></div>
    <div class="fin-card"><span class="fin-card-l">Contatados</span><span class="fin-card-v">${contatados}</span></div>
    <div class="fin-card"><span class="fin-card-l">Convertidos em aluno</span><span class="fin-card-v ok">${convertidos}</span></div>
    <div class="fin-card"><span class="fin-card-l">⏰ Follow-up</span><span class="fin-card-v${precisam ? ' bad' : ' ok'}">${precisam}</span></div>`;

  if (!ordenados.length) { $('#leads-list').innerHTML = `<div class="empty"><b>Nenhum lead ainda</b>Assim que alguém preencher o formulário de aula grátis no site, aparece aqui.</div>`; return; }

  const row = (l) => {
    const d = l.criadoEm ? new Date(l.criadoEm).toLocaleDateString('pt-BR') : '—';
    const st = l.status || 'novo';
    const fu = followUpLead(l, agora);
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
  $('#leads-list').innerHTML = ordenados.map(row).join('');
  atualizarBadgeLeads();
}

/**
 * Liga a tela ao roteador e os controles dela. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarTelaLeads(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'leads') renderLeads(); });
  $('#leads-list')?.addEventListener('change', async (/** @type {any} */ e) => {
    const sel = e.target.closest('.lead-status'); if (!sel) return;
    try { await deps.atualizarStatus(sel.dataset.id, sel.value); } catch (err) { console.warn('Leads:', /** @type {any} */ (err)?.code || err); }
    LEADS_CACHE = comStatus(LEADS_CACHE, sel.dataset.id, sel.value, deps.agora());
    desenharLeads();
  });
  $('#leads-list')?.addEventListener('click', async (/** @type {any} */ e) => {
    const btn = e.target.closest('.lead-excluir'); if (!btn) return;
    if (!(await deps.confirmar({ titulo: 'Excluir lead?', texto: 'O contato sai da lista de interessados.', ok: 'Excluir', perigo: true }))) return;
    try { await deps.excluir(btn.dataset.id); } catch (err) { console.warn('Leads:', /** @type {any} */ (err)?.code || err); }
    LEADS_CACHE = LEADS_CACHE.filter((x) => x.id !== btn.dataset.id);
    desenharLeads();
  });
}
