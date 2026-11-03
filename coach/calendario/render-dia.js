// @ts-check
/** A visão Dia: um dia em linha do tempo, com quem vem em cada turma — o mais legível de longe. */
import { esc, chipDoDia, avatar, nomesCurtos } from './render-comum.js';
import { DIAS_CURTO } from './core/periodo.js';

/**
 * @param {import('./core/modelo.js').Modelo} modelo @param {{ aberta: { iso: string, hora: string } | null }} o
 */
export function htmlDia(modelo, { aberta }) {
  const d = modelo.dias[0];
  const mesAtual = modelo.ancora.slice(0, 7);
  const mini = `<div class="mini">${DIAS_CURTO.map((x) => `<span class="mini-c">${x[0]}</span>`).join('')}${(modelo.semanas || []).flat().map((iso) => {
    const cls = ['mini-d', iso === modelo.ancora ? 'sel' : '', iso === modelo.hoje ? 'hoje' : '', iso.slice(0, 7) !== mesAtual ? 'fora' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" type="button" data-acao="ir" data-iso="${esc(iso)}">${Number(iso.slice(8))}</button>`;
  }).join('')}</div>`;
  const proximos = modelo.dias.slice(1).flatMap((x) => x.doDia.map((it) => `<div class="prox"><span class="prox-d">${esc(`${DIAS_CURTO[x.dow]} ${x.numero}`)}</span>${chipDoDia(it)}</div>`)).join('');
  const linhas = modelo.horas.map((l) => {
    const it = (d.porHora[l.hora] || []).find((x) => x.tipo === 'turma');
    if (!it) return '';
    const t = it.dados;
    const curtos = nomesCurtos(t.vem.map((/** @type {any} */ p) => p.aluno.nome));
    const pessoas = t.vem.map((/** @type {any} */ p, /** @type {number} */ i) => `<span class="p${p.tipo === 'reposicao' ? ' rep' : ''}">${avatar(p.aluno)}${esc(curtos[i])}${p.tipo === 'reposicao' ? ' · reposição' : ''}</span>`).join('');
    const sel = !!aberta && aberta.iso === d.iso && aberta.hora === l.hora;
    return `<div class="linha"><span class="hr${l.foraDaGrade ? ' extra' : ''}">${esc(l.hora || 'Sem horário')}</span>`
      + `<button class="cartao${t.lotada ? ' cheia' : ''}${sel ? ' sel' : ''}" type="button" data-acao="turma" data-iso="${esc(d.iso)}" data-hora="${esc(l.hora)}">`
      + `<span class="topo"><span>${t.vem.length} de ${t.capacidade} vagas</span>${t.pendentes ? '<span class="pend" title="Pedido do app ainda não aplicado"></span>' : ''}</span>`
      + `<span class="pessoas">${pessoas || '<span class="vazio">ninguém marcado</span>'}</span></button></div>`;
  }).join('');
  return `<div class="dia-wrap"><aside class="dia-lado">${mini}${d.doDia.length ? `<div class="dia-evs">${d.doDia.map(chipDoDia).join('')}</div>` : ''}`
    + `${proximos ? `<h4 class="dia-h4">Nos próximos dias</h4>${proximos}` : ''}</aside>`
    + `<div class="dia-linhas">${d.fechado ? '<p class="cal-fechado">Box fechado neste dia.</p>' : (linhas || '<p class="cal-vazio">Nenhuma turma neste dia.</p>')}</div></div>`;
}
