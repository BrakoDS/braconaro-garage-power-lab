// @ts-check
/**
 * EDITOR MANUAL — formato `blocos` (Força e Hipertrofia).
 *
 * É a grade de sempre (exercício · séries · reps · técnica), mas dimensionada pela
 * modalidade: Força abre 5 blocos com 4×5 e 150s de pausa, Hipertrofia abre 6 com
 * 4×10 e 75s. Cada slot vem etiquetado com o padrão de movimento que ele deveria
 * cobrir, e o dropdown põe esse padrão na frente da lista — é a diferença entre um
 * full body e seis exercícios de peito.
 *
 * O nº de slots SUGERE, não trava: há botão para acrescentar bloco e mobilidade.
 * Quem avisa que o treino saiu do desenho é o painel de distribuição, embaixo.
 */
import { MODALIDADES } from '../config/modalidades.js';
import { PADRAO_LABEL, PADROES } from '../config/padroes.js';
import { EXERCICIOS, serveModalidade } from '../data/exercicios.js';
import { calcularVolume } from '../core/volume.js';
import { verificarViabilidade } from '../core/viabilidade.js';
import { variantesNivel } from '../core/niveis.js';
import {
  esc, porId, optionsNum, optionsTecnica, tecnicaSalva, blocoMobilidade, mobilidadeSalva,
  atualizarOrcamentoMob,
} from './manual.js';

/** @type {string[]} ids de mobilidade escolhidos ('' = vazio) */
let aquecSel = [];
/** @type {{ex:string, series:number, reps:number, tecnica:string}[]} */
let blocos = [];
/** Formato para o qual o estado atual foi dimensionado — detecta troca de modalidade. */
let dimensionadoPara = '';

/** Slot vazio, já com a prescrição da modalidade. */
const blocoVazio = (f) => ({ ex: '', series: f.seriesPadrao, reps: f.repsPadrao, tecnica: '' });

/**
 * Cresce/encolhe o estado até o tamanho que o formato pede, preservando o que o
 * coach já escolheu. Só encolhe quando a MODALIDADE muda — senão o botão
 * "+ bloco" seria desfeito no primeiro re-render.
 */
function sincronizar(f) {
  const chave = `${f.modalidade}:${f.nBlocos}:${f.mobilidade.nSlots}`;
  if (chave !== dimensionadoPara) {
    const validos = new Set(poolPrincipal(f.modalidade).map((e) => e.id));
    blocos = Array.from({ length: f.nBlocos }, (_, i) => {
      const antigo = blocos[i];
      if (!antigo) return blocoVazio(f);
      // Exercício que não pertence à nova classificação sai; a prescrição vem da nova.
      return { ...blocoVazio(f), ex: validos.has(antigo.ex) ? antigo.ex : '' };
    });
    aquecSel = Array.from({ length: f.mobilidade.nSlots }, (_, i) => aquecSel[i] || '');
    dimensionadoPara = chave;
    return;
  }
  while (blocos.length < f.nBlocos) blocos.push(blocoVazio(f));
  while (aquecSel.length < f.mobilidade.nSlots) aquecSel.push('');
}

/**
 * Pool do bloco principal. `serveModalidade` é a MESMA regra do gerador automático:
 * depois da unificação FORÇA+HIPERTROFIA na tag MUSCULAÇÃO, `categorias.includes('forca')`
 * não casa com nada — Força vira "musculação + composto com carga", e isso mora lá.
 */
function poolPrincipal(modalidade) {
  const mod = MODALIDADES[modalidade];
  return EXERCICIOS.filter((e) =>
    serveModalidade(e, modalidade)
    && !(e.categorias.length === 1 && e.categorias[0] === 'mobilidade')
    && (!mod?.padroesAlvo || mod.padroesAlvo.includes(e.padrao)));
}

/**
 * Opções agrupadas por padrão de movimento. O padrão SUGERIDO para aquele slot vem
 * primeiro — sem tirar nada da lista, porque o slot sugere e não trava.
 */
function optionsExercicios(modalidade, selecionado, usados, padraoSugerido, noTreino = new Set()) {
  const porPadrao = {};
  for (const e of poolPrincipal(modalidade)) (porPadrao[e.padrao] = porPadrao[e.padrao] || []).push(e);
  const ordem = PADROES.filter((p) => porPadrao[p]?.length);
  if (padraoSugerido && porPadrao[padraoSugerido]) {
    ordem.splice(ordem.indexOf(padraoSugerido), 1);
    ordem.unshift(padraoSugerido);
  }
  /** Avisa que o exercício já está em uso — no mesmo treino ou em outro dia da semana. */
  const marcaDeUso = (e) => {
    if (e.id !== selecionado && noTreino.has(e.id)) return ' · já neste treino';
    return usados.has(e.id) ? ' · já na semana' : '';
  };
  const grupos = ordem.map((p) => {
    const opts = porPadrao[p]
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
      .map((e) => `<option value="${e.id}"${e.id === selecionado ? ' selected' : ''}>${esc(e.nome)}${marcaDeUso(e)}</option>`)
      .join('');
    const selo = p === padraoSugerido ? ' ✓ sugerido' : '';
    return `<optgroup label="${PADRAO_LABEL[p] || p}${selo}">${opts}</optgroup>`;
  }).join('');
  return `<option value="">— vazio —</option>${grupos}`;
}

/** Os exercícios de fato escolhidos, na ordem. */
const escolhidos = () => blocos.filter((b) => b.ex && porId(b.ex));

/**
 * Padrões que a modalidade REALMENTE consegue oferecer.
 *
 * `padroesObrigatorios` descreve o full body ideal, mas o catálogo do box não tem
 * todos em todas as modalidades: Força (musculação + composto com carga) não tem
 * nenhum core nem estabilizador, e Hipertrofia não tem estabilizador. O gerador
 * automático encobre isso — tenta o padrão, não acha candidato e preenche o slot com
 * outro. Aqui a etiqueta é uma INSTRUÇÃO ao coach, e mandar cobrir um padrão que a
 * lista não oferece seria pedir o impossível: esses slots viram "livre", e o rodapé
 * do painel diz o motivo.
 */
function padroesDisponiveis(modalidade) {
  const temAlgum = new Set(poolPrincipal(modalidade).map((e) => e.padrao));
  return temAlgum;
}

/** O padrão sugerido para o slot `i`, ou null quando a modalidade não o oferece. */
function sugestaoDoSlot(f, i, disponiveis) {
  const p = f.padroesSugeridos[i] ?? null;
  return p && disponiveis.has(p) ? p : null;
}

/** @type {import('./manual.js').EditorManual} */
export const editorBlocos = {
  html(ctx) {
    const f = ctx.formato;
    sincronizar(f);
    const mod = MODALIDADES[f.modalidade];
    const disponiveis = padroesDisponiveis(f.modalidade);
    // Exercício repetido dentro do MESMO treino: marcado, não bloqueado.
    const noTreino = new Set(escolhidos().map((b) => b.ex));

    const linhas = blocos.map((b, i) => {
      const padrao = sugestaoDoSlot(f, i, disponiveis);
      const etiqueta = padrao
        ? `<span class="man-padrao">${esc(PADRAO_LABEL[padrao] || padrao)}</span>`
        : '<span class="man-padrao livre">livre</span>';
      return `
      <div class="man-row man-bloco">
        <span class="man-n">${i + 1}${etiqueta}</span>
        <select class="man-sel man-ex" data-i="${i}">${optionsExercicios(f.modalidade, b.ex, ctx.usados, padrao, noTreino)}</select>
        <select class="man-sel man-series" data-i="${i}" title="Séries">${optionsNum(2, 6, b.series, '×')}</select>
        <select class="man-sel man-reps" data-i="${i}" title="Repetições">${optionsNum(1, 20, b.reps, ' reps')}</select>
        <select class="man-sel man-tec" data-i="${i}" title="Técnica avançada">${optionsTecnica(b.tecnica)}</select>
      </div>`;
    }).join('');

    const faixa = f.repsFaixa ? `${f.repsFaixa[0]}–${f.repsFaixa[1]} reps` : '';
    return `
      ${blocoMobilidade(aquecSel, f.mobilidade.orcamentoSeg)}
      <h4>Parte principal
        <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${esc(mod?.nome || '')}: ${faixa}, ${f.descansoSeg}s de pausa · ${f.nBlocos} blocos no desenho</span></h4>
      <div class="man-head man-bloco"><span></span><span>Exercício</span><span>Séries</span><span>Reps</span><span>Técnica</span></div>
      ${linhas}
      <button class="btn ghost sm man-add" id="m-add-bloco" type="button">+ bloco</button>`;
  },

  aoMudar(ctx, ev) {
    const el = /** @type {HTMLSelectElement} */ (ev.target);
    if (el.id === 'm-add-bloco') { blocos.push(blocoVazio(ctx.formato)); return true; }
    if (el.id === 'm-add-mob') { aquecSel.push(''); return true; }
    const i = Number(el.dataset.i);
    if (el.classList.contains('man-mob')) {
      aquecSel[i] = el.value;
      atualizarOrcamentoMob(aquecSel, ctx.formato.mobilidade.orcamentoSeg);
      return false;
    }
    if (el.classList.contains('man-ex')) blocos[i].ex = el.value;
    else if (el.classList.contains('man-series')) blocos[i].series = Number(el.value);
    else if (el.classList.contains('man-reps')) blocos[i].reps = Number(el.value);
    else if (el.classList.contains('man-tec')) blocos[i].tecnica = el.value;
    return false;
  },

  reset(ctx) {
    aquecSel = [];
    blocos = [];
    dimensionadoPara = '';
    sincronizar(ctx.formato);
  },

  montar(ctx) {
    sincronizar(ctx.formato);
    const f = ctx.formato;
    const itens = escolhidos().map((b) => ({ exercicio: porId(b.ex), series: b.series }));
    const exercicios = itens.map((it) => it.exercicio);
    const viab = verificarViabilidade(exercicios, ctx.nAlunos, exercicios.length);

    // Tempos, na MESMA conta do gerador automático (core/gerador.js): cada série
    // custa o tempo do exercício mais o descanso, e a transição entre estações
    // são 20s. O +5min do total é a tolerância que o automático também aplica.
    const aquecimentoSeg = mobilidadeSalva(aquecSel).reduce((a, m) => a + m.duracaoSeg, 0);
    const principalSeg = escolhidos().reduce((a, b) => {
      const e = porId(b.ex);
      return a + b.series * ((e.tempoMedioSeg || 40) + f.descansoSeg) + 20;
    }, 0);

    return {
      vol: calcularVolume(itens),
      nItens: itens.length,
      extra: {
        viabilidade: { ok: viab.ok, tamanhoGrupo: viab.tamanhoGrupo },
        tempos: { aquecimentoSeg, principalSeg, totalSeg: aquecimentoSeg + principalSeg + 300 },
        aquecimento: mobilidadeSalva(aquecSel),
        exercicios: escolhidos().map((b) => {
          const e = porId(b.ex);
          return {
            id: e.id, nome: e.nome, padrao: e.padrao, equipamento: e.equipamento,
            reps: `${b.reps} reps`, descansoSeg: f.descansoSeg, seriesRef: b.series,
            niveis: variantesNivel(e, b.series, f.modalidade),
            musculosPrimarios: e.musculosPrimarios || [],
            musculosSecundarios: e.musculosSecundarios || [],
            tecnica: tecnicaSalva(b.tecnica),
          };
        }),
        finalizador: null,
      },
    };
  },

  distribuicao(ctx) {
    const f = ctx.formato;
    const exercicios = escolhidos().map((b) => porId(b.ex));
    if (!exercicios.length) return '';
    const disponiveis = padroesDisponiveis(f.modalidade);
    const cobertos = new Set(exercicios.map((e) => e.padrao));

    // Só cobra o que a modalidade tem como oferecer.
    const alvos = f.padroesSugeridos.filter((p) => p && disponiveis.has(p));
    const chips = alvos.map((p) => {
      const ok = cobertos.has(p);
      return `<span class="chip ${ok ? 'ok' : 'falta'}">${ok ? '✓' : '○'} ${esc(PADRAO_LABEL[p] || p)}</span>`;
    }).join('');
    // Padrões cobertos fora do desenho — não é erro, é informação.
    const extras = [...cobertos].filter((p) => !alvos.includes(p))
      .map((p) => `<span class="chip">+ ${esc(PADRAO_LABEL[p] || p)}</span>`).join('');

    const semOpcao = f.padroesSugeridos.filter((p) => p && !disponiveis.has(p));
    const nota = semOpcao.length
      ? `<div class="mut" style="margin-top:8px">O desenho de ${esc(MODALIDADES[f.modalidade]?.nome || f.modalidade)} pediria ${semOpcao.map((p) => esc(PADRAO_LABEL[p] || p)).join(' e ')}, mas o catálogo não tem nenhum exercício desse padrão nesta classificação — esses slots ficam livres. Cubra no aquecimento ou em outro dia da semana.</div>`
      : '';

    const viab = verificarViabilidade(exercicios, ctx.nAlunos, exercicios.length);
    const selo = viab.ok
      ? `<span class="ok">✓ viável p/ ${ctx.nAlunos} (grupos de ${viab.tamanhoGrupo})</span>`
      : `<span class="bad">⚠ ${esc(viab.conflitos.join(' '))}</span>`;

    const repetidos = exercicios.length - new Set(exercicios.map((e) => e.id)).size;
    const avisoRepetido = repetidos
      ? `<div class="mut" style="margin-top:6px">⚠ ${repetidos} exercício${repetidos > 1 ? 's' : ''} repetido${repetidos > 1 ? 's' : ''} no mesmo treino.</div>`
      : '';

    return `<article class="card">
      <h4>Distribuição <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— padrões de movimento e aparelhos</span></h4>
      <div class="man-dist">${chips}${extras}</div>
      <div style="margin-top:8px">${selo}</div>
      ${avisoRepetido}
      ${nota}
    </article>`;
  },
};
