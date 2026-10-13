// @ts-check
/**
 * Aba Histórico da ficha — o que o aluno fez e o que ele vê
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md). Junta o
 * que eram as abas Registros, Portal e Uso do app, em dois cards:
 *
 *  - Uso do app  adesão aos hábitos e medalhas (ui-tab-progresso.js);
 *  - Histórico   um seletor com dois segmentos:
 *        Linha do tempo   check-ins, fotos, feedbacks, edições e pagamentos
 *                         (ui-tab-registros.js);
 *        Prévia do Portal o Portal do Aluno como ele vê (ui-tab-portal.js) —
 *                         o quadro só carrega quando este segmento é escolhido.
 *
 * Este módulo só orquestra: mostra o segmento escolhido e chama quem desenha
 * cada parte. A marcação é estática no index.html (os módulos ligam os botões
 * deles uma vez, no início). Nada aqui é editável, então nada passa pelo
 * salvar global.
 */
import { $ } from './util/dom.js?v=20';
import { on, EVENTOS } from './estado.js?v=20';
import { abrirLinhaDoTempo } from './ui-tab-registros.js?v=20';
import { abrirPrevia } from './ui-tab-portal.js?v=20';
import { abrirUsoDoApp } from './ui-tab-progresso.js?v=20';

/** Os segmentos do card Histórico, na ordem do seletor. `id` casa com `#hi-<id>` e `#hi-seg-<id>`. */
export const SEGMENTOS = Object.freeze([
  { id: 'tempo', rotulo: 'Linha do tempo' },
  { id: 'portal', rotulo: 'Prévia do Portal' },
]);

/**
 * O segmento ao lado (setas do teclado, dando a volta nas pontas).
 * @param {string} atual @param {1 | -1} passo
 */
export function segmentoVizinho(atual, passo) {
  const i = SEGMENTOS.findIndex((s) => s.id === atual);
  return SEGMENTOS[(i + passo + SEGMENTOS.length) % SEGMENTOS.length].id;
}

/** O segmento escolhido. Perfil reaberto volta para a linha do tempo. */
let segmento = 'tempo';

/** Marca o segmento no seletor e mostra só o painel dele. @param {string} seg */
function marcar(seg) {
  for (const s of SEGMENTOS) {
    const sim = s.id === seg;
    const botao = $(`#hi-seg-${s.id}`);
    botao?.setAttribute('aria-selected', String(sim));
    botao?.setAttribute('tabindex', sim ? '0' : '-1');
    const painel = $(`#hi-${s.id}`);
    if (painel) painel.hidden = !sim;
  }
}

/** Mostra um segmento e carrega o que ele mostra. @param {string} seg */
export function escolherSegmento(seg) {
  if (!SEGMENTOS.some((s) => s.id === seg)) return;
  segmento = seg;
  marcar(seg);
  if (seg === 'tempo') abrirLinhaDoTempo();
  else abrirPrevia();
}

/**
 * Liga a aba ao barramento. Chamar uma vez, depois de iniciar a linha do tempo,
 * a prévia e o uso do app (os módulos que ela abre).
 */
export function iniciarTabHistorico() {
  on(EVENTOS.PERFIL_ABERTO, () => { segmento = 'tempo'; marcar(segmento); });
  // Abrir a aba: o uso do app e o segmento escolhido, com o que há de novo.
  on(EVENTOS.ABRIR_ABA, (nome) => {
    if (nome !== 'historico') return;
    abrirUsoDoApp();
    escolherSegmento(segmento);
  });

  const seletor = $('#hi-seletor');
  seletor?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('[data-hist]');
    if (b && b.dataset.hist !== segmento) escolherSegmento(b.dataset.hist);
  });
  // Setas trocam de segmento, como numa barra de abas.
  seletor?.addEventListener('keydown', (/** @type {any} */ e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    escolherSegmento(segmentoVizinho(segmento, e.key === 'ArrowRight' ? 1 : -1));
    /** @type {any} */ ($(`#hi-seg-${segmento}`))?.focus();
  });
}
