// @ts-check
/**
 * EDITOR MANUAL — formato `murphFixo` (Murph).
 *
 * O Murph não tem o que escolher: as 600 repetições, os três movimentos e a regra
 * de execução de cada nível SÃO o desafio. Mudar qualquer um deixa de ser Murph.
 *
 * O que sobra ao coach é agendar: o editor mostra o desafio inteiro para
 * conferência e o botão de salvar publica na data escolhida. O rodízio da turma
 * (quem corre primeiro, quem abre pelas puxadas) é organizado na hora, na aula —
 * por isso não há checagem de equipamento aqui.
 */
import { NIVEIS, NIVEL_LABEL } from '../core/niveis.js';
import { gerarMurph, volumeMurph, estimarDuracaoSeg } from '../core/murph.js';
import { esc } from './manual.js';

const mmss = (s) => `${Math.round(s / 60)}min`;

/** @type {import('./manual.js').EditorManual} */
export const editorMurph = {
  html(ctx) {
    const m = gerarMurph({ nAlunos: ctx.nAlunos });

    const blocos = m.blocos.map((b) => `<div class="man-check">
      <span><b>${b.n}. ${esc(b.nome)}</b>
        <span class="man-padrao">no lugar de ${esc(b.base)}</span>
        <span class="man-fixo">${b.reps} repetições${b.nota ? ` · ${esc(b.nota)}` : ''}</span>
      </span></div>`).join('');

    const niveis = NIVEIS.map((n) => {
      const c = m.cardio[n];
      const ex = m.execucao[n];
      const alt = c.alternativa ? ` ou ${c.alternativa.metros} m` : '';
      return `<div class="man-grupo">
        <div class="man-grupo-h"><b>${NIVEL_LABEL[n]}</b>
          <span class="man-fixo">~${mmss(m.duracaoSeg[n])}</span></div>
        <div class="man-fixo">🏃 ${c.metros} m${alt} em cada ponta · 🚲 ${String(c.bikeMin).replace('.', ',')} min de airbike</div>
        <div class="man-fixo"><b>${esc(ex.rotulo)}</b> — ${esc(ex.detalhe)}</div>
      </div>`;
    }).join('');

    return `
      <h4>Murph <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— desafio for time, ${m.totalReps} repetições</span></h4>
      <div class="mut" style="margin:0 0 10px">O desafio é fixo: os três movimentos, as repetições e a regra de cada nível não se editam. Confira e salve na data. <b>O rodízio da turma é organizado por você na hora</b> — um grupo abre pela corrida, outro pelas puxadas.</div>
      ${blocos}
      <div class="mut" style="margin:12px 0 8px">🔁 <b>Round do Cindy</b> (Iniciante): ${m.cindy.rounds} rounds de ${m.cindy.round.map((r) => `${r.reps} ${esc(r.nome)}`).join(' + ')}.</div>
      <h4>Por nível</h4>
      ${niveis}`;
  },

  aoMudar() { return false; },
  reset() {},

  montar(ctx) {
    const murph = gerarMurph({ nAlunos: ctx.nAlunos });
    return {
      vol: volumeMurph(),
      // O desafio está sempre completo — não há slot a preencher, então a barra de
      // salvar aparece assim que o coach abre a modalidade.
      nItens: murph.blocos.length,
      extra: {
        viabilidade: { ok: true, tamanhoGrupo: ctx.nAlunos },
        murph,
      },
    };
  },

  distribuicao(ctx) {
    const dur = NIVEIS.map((n) => `${NIVEL_LABEL[n]} ~${mmss(estimarDuracaoSeg(/** @type {any} */ (n)))}`).join(' · ');
    return `<article class="card">
      <h4>Dimensionamento da aula</h4>
      <div class="mut">⏱ ${dur}</div>
      <div class="mut" style="margin-top:8px">Turma de ${ctx.nAlunos}. A puxada é a única estação com aparelho — escalone a largada para não formar fila nela.</div>
    </article>`;
  },
};
