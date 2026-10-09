// @ts-check
/**
 * Tela — Lista de alunos (busca, filtro de reavaliação e selos).
 *
 * Primeira tela tirada do `app.js` no fatiamento. Duas metades:
 *  - o que é PURO (situação da reavaliação, filtro, ordem, HTML de cada card) —
 *    testado em `ui-lista.test.js`;
 *  - `iniciarLista` liga isso ao DOM de index.html (#lista-alunos, #aval-resumo,
 *    #busca) e ao barramento: re-renderiza em 'alunos-mudaram' e, no clique,
 *    emite 'abrir-perfil' — a lista não conhece o perfil.
 *
 * O visual: card por aluno, foto em destaque e um ANEL em volta dela que diz a
 * situação da reavaliação (vermelho atrasada, âmbar a vencer). É o que o coach
 * precisa ver de relance no celular, entre uma aula e outra. "Ativo" não ganha
 * selo — é quase todo mundo, e selo repetido em todo card não informa nada;
 * inativo e pendente ganham, e o card inativo fica apagado.
 */
import { esc, iniciais, hoje, fmtN, STATUS_LABEL } from './util/formato.js?v=14';
import { on, emit, EVENTOS } from './estado.js?v=14';
import { statusAvaliacao, ehInativo, reavaliacaoNaLista, seloReavaliacao } from './util/reavaliacao.js?v=14';

// A regra da reavaliação é compartilhada com o perfil; daqui também sai para quem já importava da lista.
export { statusAvaliacao, ehInativo, reavaliacaoNaLista, seloReavaliacao };

/* ============================================================
   Regras puras
   ============================================================ */

/**
 * Filtra pela busca e pelo chip de reavaliação, e ordena: ativos primeiro
 * (atrasadas, depois a vencer, depois o resto), inativos no fim. Conta as
 * atrasadas e a vencer do box inteiro, só entre os ativos — o resumo não muda
 * com a busca.
 * @param {any[]} todos @param {{ busca?: string, filtroStatus?: string, hojeIso?: string }} [o]
 */
export function filtrarOrdenar(todos, { busca = '', filtroStatus = 'todos', hojeIso = hoje() } = {}) {
  let nAtr = 0, nVenc = 0;
  const tipo = new Map(todos.map((a) => [a, reavaliacaoNaLista(a, hojeIso).tipo]));
  for (const t of tipo.values()) { if (t === 'atrasada') nAtr++; else if (t === 'avencer') nVenc++; }
  const q = busca.trim().toLowerCase();
  const prio = (a) => { const t = tipo.get(a); return t === 'atrasada' ? 0 : t === 'avencer' ? 1 : t === 'inativo' ? 3 : 2; };
  const alunos = todos
    .filter((a) => filtroStatus === 'todos' || tipo.get(a) === filtroStatus)
    .filter((a) => !q || (a.nome || '').toLowerCase().includes(q) || String(a.id || '').toLowerCase().includes(q))
    .sort((x, y) => prio(x) - prio(y));
  return { alunos, nAtr, nVenc };
}

/**
 * O card de um aluno.
 * @param {any} a
 * @param {{ kcal?: number, medalhas?: number, hojeIso?: string }} [extras]
 *   kcal: treino queimado na semana (Portal); medalhas: quantas conquistou
 */
export function htmlAluno(a, { kcal = 0, medalhas = 0, hojeIso = hoje() } = {}) {
  const st = (a.status || 'ativo').toLowerCase();
  const reav = reavaliacaoNaLista(a, hojeIso);
  const chips = [
    st !== 'ativo' ? `<span class="ac-chip ac-chip-${esc(st)}">${esc(STATUS_LABEL[st] || st)}</span>` : '',
    seloReavaliacao(reav),
    kcal > 0 ? `<span class="ac-chip ac-chip-kcal" title="Treino queimado nesta semana (seg–sáb)">🔥 ${fmtN(kcal, 0)} kcal</span>` : '',
    medalhas > 0 ? `<span class="ac-chip ac-chip-med" title="Medalhas conquistadas">🏅 ${medalhas}</span>` : '',
  ].filter(Boolean).join('');
  const nome = a.nome || 'Sem nome';
  return `
    <button class="aluno-card st-${esc(st)} reav-${reav.tipo}" data-id="${esc(a.id)}" type="button" aria-label="Abrir ficha de ${esc(nome)}">
      <span class="ac-foto">${a.fotoUrl ? `<img src="${esc(a.fotoUrl)}" alt="" loading="lazy" />` : `<span class="ac-ini">${esc(iniciais(a.nome))}</span>`}</span>
      <span class="ac-corpo">
        <span class="ac-nome">${esc(nome)}</span>
        <span class="ac-sub">${esc(a.objetivo || 'Sem objetivo definido')} <span class="ac-id">#${esc(a.id)}</span></span>
        ${chips ? `<span class="ac-chips">${chips}</span>` : ''}
      </span>
      <span class="ac-seta" aria-hidden="true">›</span>
    </button>`;
}

/**
 * A lista inteira (ou o estado vazio).
 * @param {any[]} alunos já filtrados e ordenados @param {number} total quantos existem no box
 * @param {{ kcalPorEmail?: Map<string, number>, medalhasPorId?: Map<string, number>, hojeIso?: string }} [o]
 */
export function htmlLista(alunos, total, { kcalPorEmail = new Map(), medalhasPorId = new Map(), hojeIso = hoje() } = {}) {
  if (!alunos.length) {
    return total
      ? '<div class="empty"><b>Nenhum aluno encontrado</b>Tente outro nome, ID ou filtro.</div>'
      : '<div class="empty"><b>Nenhum aluno cadastrado</b>Use o botão “Cadastrar novo aluno” para começar.</div>';
  }
  return alunos.map((a) => htmlAluno(a, {
    kcal: kcalPorEmail.get(String(a.email || '').trim().toLowerCase()) || 0,
    medalhas: medalhasPorId.get(a.id) || 0,
    hojeIso,
  })).join('');
}

/**
 * Os chips de filtro por reavaliação. Sem nenhuma atrasada nem a vencer, nada.
 * @param {number} nAtr @param {number} nVenc @param {string} filtroStatus
 */
export function htmlResumo(nAtr, nVenc, filtroStatus) {
  if (!nAtr && !nVenc) return '';
  const chip = (f, cls, txt) => `<button class="filtro-chip ${cls}${filtroStatus === f ? ' on' : ''}" data-f="${f}" type="button" aria-pressed="${filtroStatus === f}">${txt}</button>`;
  return chip('todos', '', 'Todos')
    + (nAtr ? chip('atrasada', 'atrasada', `${nAtr} atrasada${nAtr > 1 ? 's' : ''}`) : '')
    + (nVenc ? chip('avencer', 'avencer', `${nVenc} a vencer`) : '');
}

/* ============================================================
   DOM
   ============================================================ */

/** @type {{ listar: () => any[] } | null} */
let deps = null;
let busca = '';
let filtroStatus = 'todos';
/** @type {Map<string, number>} e-mail → kcal da semana */
let kcalPorEmail = new Map();
/** @type {Map<string, number>} id → nº de medalhas */
let medalhasPorId = new Map();

const $ = (/** @type {string} */ s) => /** @type {HTMLElement|null} */ (document.querySelector(s));

/** Desenha a lista. Antes de `iniciarLista`, não faz nada. */
export function renderLista() {
  const elLista = $('#lista-alunos');
  if (!deps || !elLista) return;
  const todos = deps.listar();
  const r = filtrarOrdenar(todos, { busca, filtroStatus });
  const elResumo = $('#aval-resumo');
  if (elResumo) elResumo.innerHTML = htmlResumo(r.nAtr, r.nVenc, filtroStatus);
  elLista.innerHTML = htmlLista(r.alunos, todos.length, { kcalPorEmail, medalhasPorId });
}

const visivel = () => !!$('#tela-lista')?.classList.contains('active');

/** Selo de treino queimado na semana. @param {Map<string, number>} mapa e-mail → kcal */
export function definirKcalDaSemana(mapa) {
  kcalPorEmail = mapa;
  if (visivel()) renderLista();
}

/** Selo de medalhas. @param {Map<string, number>} mapa id do aluno → nº de medalhas */
export function definirMedalhas(mapa) {
  medalhasPorId = mapa;
  if (visivel()) renderLista();
}

/**
 * Liga a lista à página. Chamar uma vez, antes do resto do app.
 * @param {{ listar: () => any[] }} d
 */
export function iniciarLista(d) {
  deps = d;
  $('#lista-alunos')?.addEventListener('click', (e) => {
    const card = /** @type {HTMLElement} */ (e.target).closest('.aluno-card');
    if (card instanceof HTMLElement && card.dataset.id) emit(EVENTOS.ABRIR_PERFIL, card.dataset.id);
  });
  $('#aval-resumo')?.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement} */ (e.target).closest('.filtro-chip');
    if (chip instanceof HTMLElement && chip.dataset.f) { filtroStatus = chip.dataset.f; renderLista(); }
  });
  $('#busca')?.addEventListener('input', (e) => { busca = /** @type {HTMLInputElement} */ (e.target).value; renderLista(); });
  on(EVENTOS.ALUNOS_MUDARAM, renderLista);
  // Voltar para a lista redesenha: a semana de cada aluno pode ter virado.
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'lista') renderLista(); });
}
