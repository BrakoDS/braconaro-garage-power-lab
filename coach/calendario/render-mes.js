// @ts-check
/** A visão Mês: o mês inteiro, com o total de alunos e os eventos de cada dia. */
import { esc, chipDoDia, nomesCurtos } from './render-comum.js';
import { DIAS_CURTO } from './core/periodo.js';
import { ordemHora } from './core/modelo.js';

/** @param {any} it */
const evCurto = (it) => (it.tipo === 'aniversario' ? `🎂 ${String(it.titulo).split(' ')[0]}`
  : it.tipo === 'reavaliacao' ? `📏 ${String(it.titulo).split(' ')[0]}` : String(it.titulo));

/**
 * @param {import('./core/modelo.js').Modelo} modelo @param {{ diaAberto: string|null }} o
 */
export function htmlMes(modelo, { diaAberto }) {
  const porIso = new Map(modelo.dias.map((d) => [d.iso, d]));
  let h = `<div class="mes-grade"><div class="mes-cab">${DIAS_CURTO.map((d) => `<span>${d}</span>`).join('')}</div>`;
  for (const semana of modelo.semanas || []) {
    for (const iso of semana) {
      const d = porIso.get(iso);
      if (!d) { h += `<div class="mes-dia fora" aria-hidden="true"><span class="num">${Number(iso.slice(8))}</span></div>`; continue; }
      const fer = d.doDia.find((i) => i.tipo === 'feriado');
      const evs = d.doDia.filter((i) => i.tipo !== 'feriado');
      const cls = ['mes-dia', d.hoje ? 'hoje' : '', d.fechado ? 'fechado' : '', diaAberto === d.iso ? 'sel' : ''].filter(Boolean).join(' ');
      h += `<div class="${cls}" role="button" tabindex="0" data-acao="dia" data-iso="${esc(d.iso)}">`
        + `<span class="num">${Number(d.numero)}</span>`
        + (d.temTurma && !d.fechado ? `<span class="tot"><b>${d.total}</b> alunos</span>` : '')
        + (fer ? chipDoDia(fer) : '')
        + evs.slice(0, 2).map((e) => `<span class="ev ev-${esc(e.tipo)}">${esc(evCurto(e))}</span>`).join('')
        + (evs.length > 2 ? `<span class="ev-mais">+${evs.length - 2}</span>` : '')
        + '</div>';
    }
  }
  return h + '</div>';
}

/** As turmas de um dia, para o painel ao lado do mês. @param {import('./core/modelo.js').DiaModelo} d */
export function htmlListaDoDia(d) {
  const [, m, dd] = d.iso.split('-');
  const turmas = Object.values(d.porHora).flat().filter((i) => i.tipo === 'turma')
    .sort((a, b) => ordemHora(a.hora || '', b.hora || ''));
  const linhas = turmas.map((t) => {
    const nomes = nomesCurtos(t.dados.vem.map((/** @type {any} */ p) => p.aluno.nome)).join(', ');
    return `<button class="turma-linha" type="button" data-acao="turma" data-iso="${esc(d.iso)}" data-hora="${esc(t.hora)}">`
      + `<span class="hr">${esc(t.hora || 'Sem horário')}</span><span class="who"><b>${t.dados.vem.length}/${t.dados.capacidade}</b>${nomes ? ` · ${esc(nomes)}` : ''}</span></button>`;
  }).join('');
  return '<div class="lado-topo"><span class="k">Dia</span><button class="lado-x" type="button" data-acao="fechar" aria-label="Fechar">×</button></div>'
    + `<h2>${esc(d.rotulo.toUpperCase())} · ${esc(`${dd}/${m}`)}</h2>`
    + (d.doDia.length ? `<div class="lado-evs">${d.doDia.map(chipDoDia).join('')}</div>` : '')
    + (d.fechado ? '<p class="meta">Box fechado neste dia.</p>' : (linhas || '<p class="vazio">Nenhuma turma neste dia.</p>'));
}
