// @ts-check
/**
 * EDITOR MANUAL — formato `hyroxEstacoes` (Hyrox).
 *
 * O Hyrox é o formato da PROVA: 8 rodadas de corrida + estação, sempre na mesma
 * ordem, com a prescrição já escalada por nível. Não há exercício a escolher sem
 * descaracterizá-lo.
 *
 * A decisão real que sobra ao coach é outra: quais estações o box vai rodar hoje.
 * O trenó pode estar ocupado, a sandbag emprestada. Desligar uma estação recalcula
 * a duração — inclusive a corrida, que acontece antes de CADA estação e por isso é
 * a parte que mais encolhe.
 */
import {
  estimarDuracaoSeg, volumeHyrox, HYROX_CORRIDA, NIVEIS_HYROX, NIVEL_HYROX_LABEL,
} from '../core/hyrox.js';
import { esc } from './manual.js';

/** Nº das estações desligadas. Vazio = a prova inteira, que é o default. @type {Set<number>} */
let desligadas = new Set();

const ativasDe = (f) => f.estacoes.filter((e) => !desligadas.has(e.n));
const mmss = (s) => `${Math.round(s / 60)}min`;

/** @type {import('./manual.js').EditorManual} */
export const editorHyrox = {
  html(ctx) {
    const f = ctx.formato;
    const ativas = ativasDe(f);

    const linhas = f.estacoes.map((e) => {
      const off = desligadas.has(e.n);
      const unidade = (v) => (e.tipo === 'distancia' ? `${v} m` : `${v} reps`);
      const presc = NIVEIS_HYROX.map((n) => `${NIVEL_HYROX_LABEL[n]} ${unidade(e.prescricao[n])}`).join(' · ');
      return `<label class="man-check${off ? ' off' : ''}">
        <input type="checkbox" class="man-hyrox" data-n="${e.n}"${off ? '' : ' checked'} />
        <span>
          <b>${e.n}. ${esc(e.nome)}</b>
          <span class="man-padrao">${esc(e.base)} · ${esc(e.carga)}</span>
          <span class="man-fixo">${presc}</span>
        </span>
      </label>`;
    }).join('');

    const corrida = NIVEIS_HYROX.map((n) => `${NIVEL_HYROX_LABEL[n]} ${HYROX_CORRIDA[n].metros} m`).join(' · ');
    const bike = NIVEIS_HYROX.map((n) => `${NIVEL_HYROX_LABEL[n]} ${String(HYROX_CORRIDA[n].bikeMin).replace('.', ',')} min`).join(' · ');
    const dur = ativas.length
      ? NIVEIS_HYROX.map((n) => `${NIVEL_HYROX_LABEL[n]} <b>~${mmss(estimarDuracaoSeg(n, ativas))}</b>`).join(' · ')
      : '—';

    return `
      <h4>Estações da prova
        <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${ativas.length} de ${f.estacoes.length} ligadas</span></h4>
      <div class="mut" style="margin:0 0 6px">Antes de <b>cada</b> estação, a corrida — ${corrida}. A ordem e a prescrição são as da competição e não se editam; desligue o que o box não vai rodar hoje.</div>
      <div class="mut" style="margin:0 0 10px">🚲 Aluno sem liberação para impacto, ou dia sem rua: a mesma rodada na airbike — ${bike}.</div>
      ${linhas}
      <div class="hyrox-dur" style="margin-top:10px">⏱ Duração estimada: ${dur}</div>`;
  },

  aoMudar(ctx, ev) {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    if (!el.classList.contains('man-hyrox')) return false;
    const n = Number(el.dataset.n);
    if (el.checked) desligadas.delete(n); else desligadas.add(n);
    return true; // a duração no rodapé muda
  },

  reset() {
    desligadas = new Set();
  },

  montar(ctx) {
    const f = ctx.formato;
    const estacoes = ativasDe(f);
    return {
      vol: volumeHyrox(estacoes),
      nItens: estacoes.length,
      extra: {
        viabilidade: { ok: true, tamanhoGrupo: ctx.nAlunos },
        hyrox: {
          corrida: HYROX_CORRIDA,
          estacoes,
          duracaoSeg: Object.fromEntries(NIVEIS_HYROX.map((n) => [n, estimarDuracaoSeg(n, estacoes)])),
          viabilidade: {
            ok: true,
            formato: 'for-time',
            nota: `Formato for-time: turma de até ${ctx.nAlunos} em rodízio, ${estacoes.length} estações. Organize o revezamento no trenó, na sandbag e nos monocross, que têm poucas unidades.`,
          },
        },
      },
    };
  },

  distribuicao(ctx) {
    const f = ctx.formato;
    const ativas = ativasDe(f);
    if (ativas.length === f.estacoes.length) return '';
    const fora = f.estacoes.filter((e) => desligadas.has(e.n))
      .map((e) => `<span class="chip warn">− ${esc(e.base)}</span>`).join('');
    return `<article class="card">
      <h4>Fora da sessão de hoje</h4>
      <div class="man-dist">${fora}</div>
      <div class="mut" style="margin-top:8px">${ativas.length} de ${f.estacoes.length} estações — a sessão deixa de ser a prova completa, e os padrões dessas estações somem do volume da semana.</div>
    </article>`;
  },
};
