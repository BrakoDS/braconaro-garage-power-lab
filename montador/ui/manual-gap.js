// @ts-check
/**
 * EDITOR MANUAL — formato `gapMusicas` (GAP, TABATA "Siga o Mestre").
 *
 * Nove músicas em quatro partes (1 Aquecimento · 3 Pernas · 3 Glúteo · 2 Abdômen).
 * Cada música é 8 rounds ciclando 3 exercícios (1,2,3,1,2,3,1,2) — o coach escolhe o
 * movimento, e os 3 slots saem dele pelo mesmo montador do gerador automático.
 *
 * DUAS ROTAS, decididas pelo próprio movimento:
 *  - unilateral → Lado Direito, Lado Esquerdo e um bilateral que fecha a música
 *    (segundo select);
 *  - aceita quicada e isométrico → as 3 variações do mesmo movimento (liso/salto,
 *    3 quicadas, isométrico), sem mais nenhuma escolha.
 *
 * Por isso o select de Pernas/Glúteo lista SÓ movimentos que sustentam uma música.
 * Isto diverge do automático de propósito: `musicaMembro` cai num fallback quando o
 * banco filtrado esvazia, e nesse caminho gera rótulos como "panturrilha com 3
 * quicadas". No manual, onde o coach escolhe, não há razão para oferecer isso — e os
 * movimentos sem esses metadados continuam disponíveis como o terceiro bilateral.
 */
import {
  GAP_AQUECIMENTO, GAP_PERNAS, GAP_GLUTEO, GAP_ABDOMEN, MOV_GAP_POR_ID,
} from '../data/gap.js';
import { montarMusica, volumeGap, estimarDuracaoSeg, TABATA } from '../core/gap.js';
import { esc, optionsDe } from './manual.js';

const BANCOS = {
  aquecimento: GAP_AQUECIMENTO,
  pernas: GAP_PERNAS,
  gluteo: GAP_GLUTEO,
  abdomen: GAP_ABDOMEN,
};

/**
 * Estado: uma entrada por música, na ordem da aula.
 * `sel` tem 3 ids no trio; no membro tem [base, terceiro] (terceiro só se unilateral).
 * @type {{parte:string, banco:string, modo:string, indice:number, sel:string[]}[]}
 */
let musicas = [];

function sincronizar(f) {
  const esperado = f.partes.reduce((a, p) => a + p.musicas, 0);
  if (musicas.length === esperado) return;
  musicas = f.partes.flatMap((p) =>
    Array.from({ length: p.musicas }, (_, i) => ({
      parte: p.nome, banco: p.banco, modo: p.modo, indice: i,
      sel: p.modo === 'trio' ? ['', '', ''] : ['', ''],
    })));
}

/** Movimentos que sustentam uma música de membro sozinhos. */
const podeSerBase = (m) => Boolean(m.unilateral || (m.quicada && m.isometrico));
/** O modo que aquele movimento impõe. */
const modoDe = (mov) => (mov?.unilateral ? 'unilateral' : 'variacoes');

/** A música montada, ou null quando a escolha ainda está incompleta. */
function musicaDe(m) {
  if (m.modo === 'trio') {
    const trio = m.sel.map((id) => MOV_GAP_POR_ID[id]).filter(Boolean);
    if (trio.length < 3) return null;
    return montarMusica({ modo: 'trio', trio, titulo: rotulo(m) });
  }
  const base = MOV_GAP_POR_ID[m.sel[0]];
  if (!base) return null;
  if (base.unilateral) {
    const terceiro = MOV_GAP_POR_ID[m.sel[1]];
    if (!terceiro) return null;
    return montarMusica({ modo: 'unilateral', base, terceiro, titulo: rotulo(m) });
  }
  return montarMusica({ modo: 'variacoes', base, titulo: rotulo(m) });
}

/** Rótulo da música na tela e no snapshot ("Pernas 2", "Ativação geral"). */
function rotulo(m) {
  if (m.parte === 'Aquecimento') return 'Ativação geral';
  const total = musicas.filter((x) => x.parte === m.parte).length;
  return total > 1 ? `${m.parte} ${m.indice + 1}` : m.parte;
}

/** @type {import('./manual.js').EditorManual} */
export const editorGap = {
  html(ctx) {
    const f = ctx.formato;
    sincronizar(f);

    const blocos = musicas.map((m, k) => {
      const banco = BANCOS[m.banco] || [];
      let selects;
      if (m.modo === 'trio') {
        selects = `<div class="man-sub" style="grid-template-columns:1fr 1fr 1fr">${
          m.sel.map((id, j) =>
            `<select class="man-sel man-gap" data-k="${k}" data-j="${j}">${optionsDe(banco, id)}</select>`).join('')
        }</div>`;
      } else {
        const base = MOV_GAP_POR_ID[m.sel[0]];
        const bases = banco.filter(podeSerBase);
        const terceiros = banco.filter((x) => !x.unilateral && x.id !== m.sel[0]);
        selects = `<div class="man-sub">
          <select class="man-sel man-gap" data-k="${k}" data-j="0">${optionsDe(bases, m.sel[0])}</select>
          ${base?.unilateral
            ? `<select class="man-sel man-gap" data-k="${k}" data-j="1" title="Bilateral que fecha a música">${optionsDe(terceiros, m.sel[1])}</select>`
            : '<span class="man-fixo">variações do próprio movimento</span>'}
        </div>`;
      }

      const montada = musicaDe(m);
      const previa = montada
        ? `<ol class="man-derivado">${[...new Map(montada.rounds.map((r) => [r.nome, r])).values()]
          .map((r) => `<li>${esc(r.nome)}</li>`).join('')}</ol>`
        : '<div class="man-fixo" style="margin-top:6px">escolha para ver os 3 exercícios da música</div>';

      const tipo = m.modo === 'trio' ? 'trio' : modoDe(MOV_GAP_POR_ID[m.sel[0]]);
      return `<div class="man-grupo">
        <div class="man-grupo-h"><b>🎵 ${esc(rotulo(m))}</b>
          <span class="mut">8 rounds · ${esc(tipo)}</span></div>
        ${selects}
        ${previa}
      </div>`;
    }).join('');

    return `
      <h4>Músicas
        <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— TABATA ${TABATA.trabalhoSeg}s/${TABATA.descansoSeg}s · 9 músicas de 8 rounds, 3 exercícios cíclicos em cada</span></h4>
      <div class="mut" style="margin:0 0 10px">Em Pernas e Glúteo, a lista traz os movimentos que sustentam uma música sozinhos: <b>unilateral</b> abre Lado D/E e pede um bilateral para fechar; os demais viram as <b>3 variações</b> do próprio movimento.</div>
      ${blocos}`;
  },

  aoMudar(ctx, ev) {
    sincronizar(ctx.formato);
    const el = /** @type {HTMLSelectElement} */ (ev.target);
    if (!el.classList.contains('man-gap')) return false;
    const k = Number(el.dataset.k);
    const j = Number(el.dataset.j);
    musicas[k].sel[j] = el.value;
    // Trocar a base pode mudar o modo (unilateral pede um segundo select, variações não),
    // então o bloco precisa ser redesenhado.
    if (j === 0 && musicas[k].modo === 'membro') musicas[k].sel[1] = '';
    return true;
  },

  reset(ctx) {
    musicas = [];
    sincronizar(ctx.formato);
  },

  montar(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const partes = f.partes.map((p) => ({
      nome: p.nome,
      musicas: musicas.filter((m) => m.parte === p.nome).map(musicaDe).filter(Boolean),
    })).filter((p) => p.musicas.length);

    const totalMusicas = partes.reduce((a, p) => a + p.musicas.length, 0);
    const gap = {
      protocolo: TABATA,
      partes,
      totalMusicas,
      totalRounds: totalMusicas * TABATA.roundsPorMusica,
      duracaoSeg: estimarDuracaoSeg(totalMusicas),
      viabilidade: {
        ok: true,
        nota: `Aula de peso corporal — turma de até ${ctx.nAlunos} acompanha o professor (Siga o Mestre). Não depende de equipamento.`,
      },
    };

    return {
      vol: volumeGap(gap),
      nItens: totalMusicas,
      extra: { viabilidade: { ok: true, tamanhoGrupo: ctx.nAlunos }, gap },
    };
  },

  distribuicao(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const chips = f.partes.map((p) => {
      const feitas = musicas.filter((m) => m.parte === p.nome && musicaDe(m)).length;
      const cheia = feitas === p.musicas;
      return `<span class="chip ${cheia ? 'ok' : 'falta'}">${cheia ? '✓' : `${feitas}/${p.musicas}`} ${esc(p.nome)}</span>`;
    }).join('');
    const total = musicas.filter(musicaDe).length;
    return `<article class="card">
      <h4>Distribuição <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— músicas montadas por parte</span></h4>
      <div class="man-dist">${chips}</div>
      <div class="mut" style="margin-top:8px">${total}/9 músicas · ~${Math.round(estimarDuracaoSeg(total) / 60)}min de aula.</div>
    </article>`;
  },
};
