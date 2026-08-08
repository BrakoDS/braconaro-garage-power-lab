// @ts-check
/**
 * EDITOR MANUAL — formato `tabata4` (HIIT).
 *
 * Quatro estações (Inferiores · Core · Superiores · Cardio), quatro slots cada. Não
 * há séries nem reps: o protocolo é TABATA 20s/10s, e cada estação roda 16 rounds
 * ciclando pelos 4 slots.
 *
 * Exercício UNILATERAL ocupa DOIS slots — Lado D e Lado E. É a mesma regra do
 * gerador automático (`preencherEstacao`), e existe porque um unilateral em 1 slot
 * faria a aluna trabalhar 20s de um lado só e nunca do outro.
 */
import { EXERCICIOS } from '../data/exercicios.js';
import { grupoTabata, slotDe, volumeHiit, estimarDuracaoSeg, TABATA } from '../core/hiitTabata.js';
import { esc, porId, optionsDe } from './manual.js';

/**
 * Estado: 4 estações × 4 slots. Cada slot é `null` ou `{exId, lado}` — `lado` só
 * nos unilaterais, que sempre vêm em par (D no slot i, E no i+1).
 * @type {({exId:string, lado:('D'|'E'|null)}|null)[][]}
 */
let estacoes = [];
/** Aviso da última ação recusada (unilateral sem dois slots livres). */
let aviso = '';

function sincronizar(f) {
  if (estacoes.length === f.estacoes.length) return;
  estacoes = f.estacoes.map((e) => Array.from({ length: e.nSlots }, () => null));
}

/** O slot `i` é o lado E de um par que começa em `i-1`? */
const ehSegundoLado = (slots, i) =>
  slots[i]?.lado === 'E' && slots[i - 1]?.exId === slots[i]?.exId && slots[i - 1]?.lado === 'D';

/** Limpa o slot e, se ele fizer parte de um par unilateral, o parceiro junto. */
function limpar(slots, i) {
  const s = slots[i];
  if (!s) return;
  if (s.lado === 'D' && slots[i + 1]?.exId === s.exId && slots[i + 1]?.lado === 'E') slots[i + 1] = null;
  if (s.lado === 'E' && slots[i - 1]?.exId === s.exId && slots[i - 1]?.lado === 'D') slots[i - 1] = null;
  slots[i] = null;
}

/** Pool da estação: só o que está marcado para HIIT e cai naquele grupo. */
const poolDaEstacao = (grupo) =>
  EXERCICIOS.filter((e) => e.categorias.includes('hiit') && grupoTabata(e) === grupo);

/** @type {import('./manual.js').EditorManual} */
export const editorTabata = {
  html(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const p = f.protocolo;

    const blocos = f.estacoes.map((est, e) => {
      const slots = estacoes[e];
      const pool = poolDaEstacao(est.grupo);
      const linhas = slots.map((s, i) => {
        if (ehSegundoLado(slots, i)) {
          const nome = porId(s.exId)?.nome || s.exId;
          return `<div class="man-row man-aquec">
            <span class="man-n">${i + 1}</span>
            <div><span class="hiit-lado">${esc(nome)} — Lado E</span>
              <button class="btn ghost sm man-x" data-e="${e}" data-s="${i}" type="button" title="Remover o par">×</button></div>
          </div>`;
        }
        const marca = s?.lado === 'D' ? ' — Lado D' : '';
        return `<div class="man-row man-aquec">
          <span class="man-n">${i + 1}</span>
          <select class="man-sel man-hiit-ex" data-e="${e}" data-s="${i}">${optionsDe(pool, s?.exId || '', ctx.usados)}</select>
          ${marca ? `<span class="hiit-lado">${marca}</span>` : ''}
        </div>`;
      }).join('');

      return `<div class="man-grupo">
        <div class="man-grupo-h"><b>Estação ${e + 1} · ${esc(est.titulo.toUpperCase())}</b>
          <span class="mut">${TABATA.roundsPorEstacao} rounds · 4 voltas cíclicas</span></div>
        ${linhas}
      </div>`;
    }).join('');

    return `
      <h4>Estações TABATA
        <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${p.trabalhoSeg}s on / ${p.descansoSeg}s off · o protocolo manda no tempo, não há séries nem reps</span></h4>
      <div class="mut" style="margin:0 0 10px">Exercício unilateral ocupa <b>2 slots</b> (Lado D e Lado E) — é o que garante que a aluna trabalhe os dois lados.</div>
      ${aviso ? `<div class="bad" style="margin-bottom:8px">⚠ ${esc(aviso)}</div>` : ''}
      ${blocos}`;
  },

  aoMudar(ctx, ev) {
    sincronizar(ctx.formato);
    const el = /** @type {HTMLElement} */ (ev.target);
    const e = Number(el.dataset.e);
    const i = Number(el.dataset.s);
    if (Number.isNaN(e) || Number.isNaN(i)) return false;
    const slots = estacoes[e];
    aviso = '';

    if (el.classList.contains('man-x')) { limpar(slots, i); return true; }

    const exId = /** @type {HTMLSelectElement} */ (el).value;
    limpar(slots, i);
    if (!exId) return true;
    const ex = porId(exId);
    if (!ex) return true;

    if (ex.unilateral) {
      if (i + 1 >= slots.length) {
        aviso = `${ex.nome} é unilateral e precisa de 2 slots — escolha em outro slot da estação.`;
        return true;
      }
      limpar(slots, i + 1);
      slots[i] = { exId, lado: 'D' };
      slots[i + 1] = { exId, lado: 'E' };
    } else {
      slots[i] = { exId, lado: null };
    }
    return true;
  },

  reset(ctx) {
    estacoes = [];
    aviso = '';
    sincronizar(ctx.formato);
  },

  montar(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const preenchidas = f.estacoes.map((est, e) => ({
      grupo: est.grupo,
      titulo: est.titulo,
      rounds: TABATA.roundsPorEstacao,
      slots: estacoes[e].filter(Boolean)
        .map((s) => slotDe(porId(s.exId), s.lado || undefined))
        .filter((s) => s.nome),
    }));
    const nItens = preenchidas.reduce((a, est) => a + est.slots.length, 0);

    return {
      vol: volumeHiit(preenchidas),
      nItens,
      extra: {
        viabilidade: { ok: true, tamanhoGrupo: ctx.nAlunos },
        hiit: {
          protocolo: TABATA,
          estacoes: preenchidas,
          duracaoSeg: estimarDuracaoSeg(),
          viabilidade: {
            ok: true,
            nota: `4 estações TABATA. Turma de até ${ctx.nAlunos} faz junto (peso corporal) ou em revezamento onde o aparelho tiver poucas unidades.`,
          },
        },
      },
    };
  },

  distribuicao(ctx) {
    sincronizar(ctx.formato);
    const chips = ctx.formato.estacoes.map((est, e) => {
      const n = estacoes[e].filter(Boolean).length;
      const cheia = n === est.nSlots;
      return `<span class="chip ${cheia ? 'ok' : 'falta'}">${cheia ? '✓' : `${n}/${est.nSlots}`} ${esc(est.titulo)}</span>`;
    }).join('');
    return `<article class="card">
      <h4>Distribuição <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— slots preenchidos por estação</span></h4>
      <div class="man-dist">${chips}</div>
      <div class="mut" style="margin-top:8px">Estação incompleta encurta a volta cíclica: os 16 rounds passam a repetir menos exercícios.</div>
    </article>`;
  },
};
