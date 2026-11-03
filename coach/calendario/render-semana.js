// @ts-check
/**
 * A visão Semana: colunas dos dias, linhas dos horários.
 *
 * Cada célula vai com posição explícita (`grid-column`/`grid-row`) e `order`
 * = dia × 1000 + linha. No computador manda a grade; no celular o CSS troca o
 * contêiner para uma coluna (flex) e o `order` empilha dia a dia — cabeçalho,
 * eventos e as turmas daquele dia —, sem desenhar a tela duas vezes.
 */
import { esc, chipDoDia, nomesCurtos } from './render-comum.js';

/** @param {import('./camadas/turmas.js').Pessoa[]} vem */
function nomesDaCelula(vem) {
  const curtos = nomesCurtos(vem.map((p) => p.aluno.nome));
  return vem.map((p, i) => (p.tipo === 'reposicao' ? `<span class="rep">+${esc(curtos[i])}</span>` : esc(curtos[i]))).join(', ');
}

/**
 * @param {import('./core/modelo.js').DiaModelo} d @param {import('./core/modelo.js').LinhaModelo} l
 * @param {any} it @param {string} pos @param {{ iso: string, hora: string } | null} aberta
 */
function celula(d, l, it, pos, aberta) {
  if (d.fechado) return `<div class="cel fech" style="${pos}" aria-hidden="true"></div>`;
  if (!it) return `<div class="cel nada" style="${pos}" aria-hidden="true"></div>`;
  const t = it.dados;
  const sel = !!aberta && aberta.iso === d.iso && aberta.hora === l.hora;
  const cls = ['cel', t.lotada ? 'cheia' : '', sel ? 'sel' : '', t.vem.length ? '' : 'vazia', t.naGrade ? '' : 'fora'].filter(Boolean).join(' ');
  return `<button class="${cls}" type="button" style="${pos}" data-acao="turma" data-iso="${esc(d.iso)}" data-hora="${esc(l.hora)}" aria-label="${esc(`${d.rotulo} ${d.numero}, ${l.hora || 'sem horário'}: ${t.vem.length} de ${t.capacidade}`)}">`
    + (t.pendentes ? '<span class="pend" title="Pedido do app ainda não aplicado na ficha"></span>' : '')
    + `<span class="cel-hora">${esc(l.hora || 'Sem horário')}</span>`
    + `<span class="cnt">${t.vem.length}<small>/${t.capacidade}</small></span>`
    + (t.vem.length ? `<span class="nomes">${nomesDaCelula(t.vem)}</span>` : '')
    + (t.naGrade ? '' : '<span class="fora-txt">fora da grade</span>')
    + '</button>';
}

/**
 * @param {import('./core/modelo.js').Modelo} modelo
 * @param {{ aberta: { iso: string, hora: string } | null }} o
 */
export function htmlSemana(modelo, { aberta }) {
  const comHoje = modelo.dias.some((d) => d.hoje);
  const jAgora = comHoje ? modelo.horas.findIndex((l) => l.hora && l.hora >= modelo.agora) : -1;
  let h = `<div class="cal-grade" style="--cols:${modelo.dias.length}">`;
  h += '<div class="cal-canto" style="grid-column:1;grid-row:1 / 3"></div>';
  modelo.dias.forEach((d, i) => {
    const c = i + 2;
    const tot = d.fechado ? 'box fechado' : `${d.total} aluno${d.total === 1 ? '' : 's'}`;
    h += `<div class="cal-dh${d.hoje ? ' hoje' : ''}${d.fechado ? ' fechado' : ''}" style="grid-column:${c};grid-row:1;order:${i * 1000}">`
      + `<span class="d">${esc(d.rotulo)}</span><span class="n">${esc(d.numero)}</span><span class="tot">${esc(tot)}</span></div>`;
    h += `<div class="cal-evs" style="grid-column:${c};grid-row:2;order:${i * 1000 + 1}">${d.doDia.map(chipDoDia).join('')}</div>`;
  });
  modelo.horas.forEach((l, j) => {
    const r = j + 3;
    h += `<div class="cal-h${l.foraDaGrade ? ' extra' : ''}" style="grid-column:1;grid-row:${r}"${l.foraDaGrade ? ' title="Horário de ficha fora da grade do box"' : ''}>${esc(l.hora || 'Sem horário')}</div>`;
    modelo.dias.forEach((d, i) => {
      const it = (d.porHora[l.hora] || []).find((x) => x.tipo === 'turma');
      h += celula(d, l, it, `grid-column:${i + 2};grid-row:${r};order:${i * 1000 + r}`, aberta);
    });
    if (j === jAgora) h += `<div class="cal-agora" style="grid-column:2 / -1;grid-row:${r}" aria-hidden="true"><span>agora ${esc(modelo.agora)}</span></div>`;
  });
  if (!modelo.horas.length) h += '<p class="cal-vazio" style="grid-column:1 / -1;grid-row:3">Nenhuma turma nesta semana.</p>';
  return h + '</div>';
}
