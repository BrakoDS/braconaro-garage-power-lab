// @ts-check
/**
 * EDITOR MANUAL — formato `postosBiset` (Híbrido).
 *
 * Mobilidade → Hipertrofia em postos de bi-set antagonista → WOD.
 *
 * O que o coach escolhe: as mobilidades, os DOIS exercícios de cada posto, a técnica
 * do posto, e o formato e os movimentos do WOD.
 *
 * O que ele NÃO escolhe, e por quê: quantos postos (vem do tamanho da turma — 1 dupla
 * por posto) e quantas séries (o produto `postos × séries` fica travado em 12, que é
 * o que segura o bloco em 24 min). Reps, pausa e %1RM vêm da semana do mesociclo: a
 * pausa é o resto de 120s depois do trabalho, e é isso que faz mais carga significar
 * menos reps e mais descanso sem ninguém ter de calcular.
 */
import { EXERCICIOS } from '../data/exercicios.js';
import { unidadesDe } from '../data/equipamentos.js';
import { verificarViabilidade } from '../core/viabilidade.js';
import {
  poolLado, montarPostosDe, movimentoWod, ladoSalvo, volumeHibrido,
  CORE_FLEXAO, CORE_ANTI, DESCRICAO_FORMATO,
} from '../core/hibrido.js';
import {
  esc, porId, optionsDe, optionsTecnica, tecnicaSalva, blocoMobilidade, mobilidadeSalva,
  atualizarOrcamentoMob,
} from './manual.js';

/** @type {string[]} */
let aquecSel = [];
/** @type {{aId:string, bId:string, tecnica:string}[]} */
let postos = [];
let wodFormato = '';
/** @type {string[]} */
let wodSel = [];
let dimensionadoPara = '';

/** Quantos selects de WOD a tela oferece (os 3 primeiros são o mínimo do formato). */
const wodSlots = (f) => f.wod.nMovimentos[1];

function sincronizar(f) {
  const chave = `${f.nPostos}:${f.mobilidade.nSlots}:${f.wod.formatos.join()}`;
  if (chave === dimensionadoPara) return;
  postos = Array.from({ length: f.nPostos }, (_, i) => postos[i] || { aId: '', bId: '', tecnica: '' });
  aquecSel = Array.from({ length: f.mobilidade.nSlots }, (_, i) => aquecSel[i] || '');
  wodSel = Array.from({ length: wodSlots(f) }, (_, i) => wodSel[i] || '');
  // No deload o formato é EMOM e ponto — se o coach tinha escolhido outro, ele sai.
  if (!f.wod.formatos.includes(wodFormato)) wodFormato = f.wod.formatos[0];
  dimensionadoPara = chave;
}

/**
 * RNG estável por exercício. A prescrição do WOD ('12 reps', '250m') é sorteada no
 * automático; aqui ela precisa ser a MESMA a cada re-render, senão o número dançaria
 * na tela a cada clique do coach. Semear pelo id dá variedade entre exercícios e
 * estabilidade no mesmo.
 */
function rngDoId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pool de um lado do par. O posto de core precisa de planos diferentes nos dois lados. */
function poolDoLado(par, lado) {
  const ids = par.id === 'core' ? (lado === 'a' ? CORE_FLEXAO : CORE_ANTI) : null;
  return poolLado(lado === 'a' ? par.a : par.b, ids);
}

/** Movimentos elegíveis ao WOD: cross/wod com o equipamento existente no box. */
const poolWod = () => EXERCICIOS.filter((e) =>
  (e.categorias.includes('cross') || e.categorias.includes('wod'))
  && e.equipamento.every((id) => unidadesDe(id) >= 1));

/** As escolhas de posto que estão completas, no formato de `montarPostosDe`. */
function escolhasCompletas(f) {
  return postos.map((p, i) => ({
    par: f.pares[i]?.id,
    aId: p.aId, bId: p.bId,
    tecnica: tecnicaSalva(p.tecnica),
  })).filter((e) => e.par && e.aId && e.bId);
}

/** O bloco de WOD montado a partir das escolhas. */
function wodMontado(f) {
  const movimentos = wodSel
    .map((id) => porId(id))
    .filter(Boolean)
    .map((ex) => movimentoWod(ex, rngDoId(ex.id)));
  return {
    formato: wodFormato,
    descricaoFormato: DESCRICAO_FORMATO[wodFormato] || '',
    duracaoMin: f.wod.duracaoMin,
    movimentos,
  };
}

/** @type {import('./manual.js').EditorManual} */
export const editorPostos = {
  html(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const p = f.presc;

    const blocos = f.pares.map((par, i) => {
      const est = postos[i];
      const prescTxt = `${f.series} × ${p.reps} reps · ${p.descansoSeg}s de pausa · ~${p.pctRM}% 1RM`;
      return `<div class="man-grupo">
        <div class="man-grupo-h"><b>Posto ${i + 1} — ${esc(par.label)}</b>
          <span class="man-fixo">${prescTxt}</span></div>
        <div class="man-sub">
          <select class="man-sel man-posto" data-i="${i}" data-lado="a">${optionsDe(poolDoLado(par, 'a'), est.aId, ctx.usados)}</select>
          <select class="man-sel man-posto" data-i="${i}" data-lado="b">${optionsDe(poolDoLado(par, 'b'), est.bId, ctx.usados)}</select>
        </div>
        <div class="hib-biset mut" style="margin:6px 0">↕ bi-set — uma faz A enquanto a outra faz B, trocam a cada série</div>
        <select class="man-sel man-posto-tec" data-i="${i}" title="Técnica avançada do posto">${optionsTecnica(est.tecnica)}</select>
      </div>`;
    }).join('');

    const pool = poolWod();
    const min = f.wod.nMovimentos[0];
    const wodLinhas = wodSel.map((id, i) => `
      <div class="man-row man-aquec">
        <span class="man-n">${i + 1}</span>
        <select class="man-sel man-wod" data-i="${i}">${optionsDe(pool, id)}</select>
      </div>`).join('');
    const travado = f.wod.formatos.length === 1;

    return `
      ${blocoMobilidade(aquecSel, f.mobilidade.orcamentoSeg, false)}

      <h4>Parte 1 — Hipertrofia
        <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${f.nPostos} postos (1 dupla cada) · ${esc(p.rotulo)}</span></h4>
      <div class="mut" style="margin:0 0 10px">Turma de ${ctx.nAlunos} → ${f.nPostos} postos × ${f.series} séries. O produto fica travado em 12 para o bloco fechar 24 min; a onda da semana age em reps, pausa e carga.</div>
      ${blocos}

      <h4>Parte 2 — WOD
        <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${f.wod.duracaoMin} min · ${min} a ${wodSlots(f)} movimentos</span></h4>
      <div class="man-sub" style="grid-template-columns:1fr; margin-bottom:8px">
        <select class="man-sel man-wod-fmt"${travado ? ' disabled' : ''}>
          ${f.wod.formatos.map((x) => `<option value="${esc(x)}"${x === wodFormato ? ' selected' : ''}>${esc(x)}</option>`).join('')}
        </select>
      </div>
      ${travado ? '<div class="man-fixo" style="margin-bottom:8px">O deload trava o WOD em EMOM: é o único formato cujo ritmo a estrutura impõe, em vez de ficar a cargo de quanto a aluna decide se enterrar.</div>' : ''}
      <div class="mut" style="margin:0 0 6px">${esc(DESCRICAO_FORMATO[wodFormato] || '')}</div>
      ${wodLinhas}`;
  },

  aoMudar(ctx, ev) {
    sincronizar(ctx.formato);
    const el = /** @type {HTMLSelectElement} */ (ev.target);
    const i = Number(el.dataset.i);
    if (el.classList.contains('man-mob')) {
      aquecSel[i] = el.value;
      atualizarOrcamentoMob(aquecSel, ctx.formato.mobilidade.orcamentoSeg);
      return false;
    }
    if (el.classList.contains('man-posto')) {
      postos[i][el.dataset.lado === 'a' ? 'aId' : 'bId'] = el.value;
      return false;
    }
    if (el.classList.contains('man-posto-tec')) { postos[i].tecnica = el.value; return false; }
    if (el.classList.contains('man-wod')) { wodSel[i] = el.value; return false; }
    if (el.classList.contains('man-wod-fmt')) { wodFormato = el.value; return true; } // muda a descrição
    return false;
  },

  reset(ctx) {
    aquecSel = []; postos = []; wodSel = []; wodFormato = '';
    dimensionadoPara = '';
    sincronizar(ctx.formato);
  },

  montar(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const montados = montarPostosDe(escolhasCompletas(f), { semana: ctx.semana, nivel: 'intermediario' });
    const wod = wodMontado(f);
    const mobilidade = mobilidadeSalva(aquecSel);

    const exercicios = montados.flatMap((x) => [x.a, x.b]);
    // Mesma checagem final do gerador: o denominador é o Nº REAL de exercícios em
    // pista, porque é ele que decide quantas alunas caem em cada aparelho.
    const viab = verificarViabilidade(exercicios, ctx.nAlunos, exercicios.length);

    const mobSeg = mobilidade.reduce((a, m) => a + m.duracaoSeg, 0);
    const duracaoSeg = mobSeg
      + montados.reduce((a, x) => a + x.tempoSeg, 0)
      + wod.duracaoMin * 60
      + 120; // +2min de transição geral, como em gerarHibrido

    return {
      vol: volumeHibrido(montados, wod),
      nItens: montados.length,
      extra: {
        viabilidade: { ok: viab.ok, tamanhoGrupo: viab.tamanhoGrupo },
        hibrido: {
          mobilidade,
          semanaRotulo: f.presc.rotulo,
          hipertrofia: montados.map((x) => ({
            par: x.par, parLabel: x.parLabel,
            series: x.series, reps: x.reps, descansoSeg: x.descansoSeg, pctRM: x.pctRM,
            tecnica: x.tecnica,
            a: ladoSalvo(x.a, x.series), b: ladoSalvo(x.b, x.series),
          })),
          wod,
          duracaoSeg,
          viabilidade: {
            ok: viab.ok,
            nota: viab.ok
              ? `${f.presc.rotulo} · ${montados.length} postos de bi-set: ${montados.map((x) => x.parLabel).join(' · ')}.`
              : `⚠ ${viab.conflitos.join(' ')}`,
          },
        },
      },
    };
  },

  distribuicao(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const chips = f.pares.map((par, i) => {
      const est = postos[i];
      const cheio = Boolean(est.aId && est.bId);
      const meio = Boolean(est.aId) !== Boolean(est.bId);
      return `<span class="chip ${cheio ? 'ok' : 'falta'}">${cheio ? '✓' : meio ? '½' : '○'} ${esc(par.label)}</span>`;
    }).join('');

    const nWod = wodSel.filter(Boolean).length;
    const minWod = f.wod.nMovimentos[0];
    const wodChip = `<span class="chip ${nWod >= minWod ? 'ok' : 'falta'}">${nWod}/${minWod}+ movimentos no WOD</span>`;

    const { extra } = this.montar(ctx);
    const selo = extra.viabilidade.ok
      ? `<span class="ok">✓ viável p/ ${ctx.nAlunos} (grupos de ${extra.viabilidade.tamanhoGrupo})</span>`
      : `<span class="bad">⚠ ${esc(extra.hibrido.viabilidade.nota.replace(/^⚠ /, ''))}</span>`;

    return `<article class="card">
      <h4>Distribuição <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— postos completos e WOD</span></h4>
      <div class="man-dist">${chips}${wodChip}</div>
      <div style="margin-top:8px">${selo}</div>
      <div class="mut" style="margin-top:6px">Posto pela metade não entra na aula: o bi-set é o que divide a turma, e um lado só deixaria a dupla sem revezamento.</div>
    </article>`;
  },
};
