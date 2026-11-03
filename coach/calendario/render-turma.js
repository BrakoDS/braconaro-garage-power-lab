// @ts-check
/**
 * O painel de uma turma: quem vem, o que o aluno pediu pelo app e a Gestão
 * ainda não aplicou, quem não vem e por quê — e o atalho para agir no Painel
 * de Presença. O Calendário só mostra.
 */
import { esc, avatar, tempoDesde } from './render-comum.js';
import { STATUS } from '../gestao-de-alunos/presenca-regras.js?v=28';

/** @param {import('./camadas/turmas.js').Pessoa} p */
const tagDe = (p) => (p.status === 'presente' ? '<span class="tag ok">presente</span>'
  : p.tipo === 'reposicao' ? '<span class="tag ok">reposição</span>' : '<span class="tag">fixo</span>');

/** @param {import('./camadas/turmas.js').Pessoa} p */
const textoDoPedido = (p) => (p.pendente && p.pendente.tipo === 'reserva'
  ? `${p.aluno.nome} marcou esta reposição` : `${p.aluno.nome} avisou "Não irei"`);

/**
 * @param {import('./core/modelo.js').DiaModelo} dia @param {any} item a turma
 * @param {{ agoraMs: number, voltarDia: boolean }} o
 */
export function htmlTurma(dia, item, { agoraMs, voltarDia }) {
  const t = item.dados;
  const [, m, d] = dia.iso.split('-');
  const pessoa = (/** @type {any} */ p, /** @type {string} */ tag, risc = false) =>
    `<div class="pes">${avatar(p.aluno)}<span${risc ? ' class="risc"' : ''}>${esc(p.aluno.nome)}</span>${tag}</div>`;
  const pedidos = [...t.vem, ...t.naoVem].filter((p) => p.pendente);
  const meta = [`${t.vem.length} de ${t.capacidade} vagas`];
  if (t.pendentes) meta.push(`${t.pendentes} pedido${t.pendentes > 1 ? 's' : ''} do app ainda não aplicado${t.pendentes > 1 ? 's' : ''}`);
  if (!t.naGrade) meta.push('fora da grade do box');
  const link = `../gestao-de-alunos/index.html#turmas?dia=${encodeURIComponent(dia.iso)}&hora=${encodeURIComponent(t.hora)}`;
  return `<div class="lado-topo">${voltarDia ? `<button class="btn ghost btn-sm" type="button" data-acao="dia" data-iso="${esc(dia.iso)}">← Turmas do dia</button>` : '<span class="k">Turma</span>'}`
    + '<button class="lado-x" type="button" data-acao="fechar" aria-label="Fechar">×</button></div>'
    + `<h2>${esc(dia.rotulo.toUpperCase())} ${esc(`${d}/${m}`)} · ${esc(t.hora || 'Sem horário')}</h2>`
    + `<p class="meta">${esc(meta.join(' · '))}</p>`
    + `<div class="grupo"><h4>Vêm (${t.vem.length})</h4>${t.vem.map((/** @type {any} */ p) => pessoa(p, tagDe(p))).join('') || '<p class="vazio">Ninguém marcado para esta turma.</p>'}</div>`
    + (pedidos.length ? `<div class="grupo"><h4>Pedido pelo app · aguardando a Gestão</h4>${pedidos.map((p) =>
      `<div class="pes">${avatar(p.aluno)}<span>${esc(textoDoPedido(p))}</span><span class="tag info">${esc(tempoDesde(agoraMs - p.pendente.em))}</span></div>`).join('')}</div>` : '')
    + (t.naoVem.length ? `<div class="grupo"><h4>Não vêm (${t.naoVem.length})</h4>${t.naoVem.map((/** @type {any} */ p) =>
      pessoa(p, `<span class="tag bad">${esc(/** @type {Record<string, string>} */ (STATUS)[p.status] || p.status)}</span>`, true)).join('')}</div>` : '')
    + `<a class="cal-link" href="${esc(link)}">Abrir no Painel de Presença →</a>`;
}
