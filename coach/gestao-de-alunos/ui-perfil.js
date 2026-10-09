// @ts-check
/**
 * Tela — Perfil do aluno: o cabeçalho e a barra de abas.
 *
 * Segunda tela tirada do `app.js` no fatiamento. Este módulo ABRE o perfil
 * ('abrir-perfil' → o aluno no estado, o cabeçalho, 'perfil-aberto', a aba
 * Dados e a tela), desenha o topo da ficha (foto grande, nome, número,
 * situação, Voltar e PDF) e a barra de abas, e troca o painel visível. O
 * CONTEÚDO de cada aba é do módulo dela (ui-tab-*.js).
 *
 * Cada clique vira um evento ('voltar-lista', 'exportar-ficha', 'trocar-foto',
 * 'abrir-aba'). O PDF chega por parâmetro (`exportar`), para este módulo não
 * carregar o gerador de PDF. E escuta 'alunos-mudaram' para o cabeçalho nunca
 * ficar velho — salvar uma avaliação muda o anel da foto, salvar a matriz muda
 * o objetivo.
 *
 * As abas vêm de `ABAS`: uma aba nova (Financeiro, por exemplo) é uma linha a
 * mais aqui e um painel `#tab-<id>` no index.html. A barra rola de lado no
 * celular e segue o padrão de tablist (setas do teclado trocam de aba).
 *
 * O anel em volta da foto é o MESMO da lista (`util/reavaliacao.js`): o sinal
 * que fez o coach abrir a ficha continua visível quando ela abre.
 */
import { esc, iniciais, hoje, STATUS_LABEL } from './util/formato.js?v=14';
import { reavaliacaoNaLista, seloReavaliacao } from './util/reavaliacao.js?v=14';
import { estado, on, emit, EVENTOS } from './estado.js?v=14';

/** As abas da ficha, na ordem da barra. `id` casa com o painel `#tab-<id>`. */
export const ABAS = Object.freeze([
  { id: 'dados', rotulo: 'Dados' },
  { id: 'anamnese', rotulo: 'Anamnese' },
  { id: 'parq', rotulo: 'PAR-Q' },
  { id: 'avaliacoes', rotulo: 'Avaliações' },
  { id: 'progresso', rotulo: 'Progresso' },
  { id: 'matriz', rotulo: 'Matriz' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'portal', rotulo: 'Portal' },
  { id: 'registros', rotulo: 'Registros' },
]);

const ICONE_CAMERA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

/* ============================================================
   HTML (puro)
   ============================================================ */

/**
 * O cabeçalho da ficha.
 * @param {any} a @param {string} [hojeIso]
 */
export function htmlCabecalho(a, hojeIso = hoje()) {
  const st = String(a.status || 'ativo').toLowerCase();
  const reav = reavaliacaoNaLista(a, hojeIso);
  const nome = a.nome || 'Sem nome';
  return `
    <div class="pc-acoes">
      <button class="pc-voltar" data-acao="voltar" type="button"><span aria-hidden="true">‹</span> Alunos</button>
      <button class="btn ghost btn-sm" data-acao="pdf" type="button">Exportar ficha (PDF)</button>
    </div>
    <div class="pc-id st-${esc(st)} reav-${reav.tipo}">
      <button id="p-avatar" class="pc-foto" data-acao="foto" type="button" aria-label="Trocar a foto de ${esc(nome)}">
        ${a.fotoUrl ? `<img src="${esc(a.fotoUrl)}" alt="" />` : `<span class="pc-ini">${esc(iniciais(a.nome))}</span>`}
        <span class="pc-cam">${ICONE_CAMERA}</span>
      </button>
      <div class="pc-texto">
        <h2 class="pc-nome">${esc(nome)}</h2>
        <div class="pc-meta">
          <span class="pc-num">#${esc(a.id)}</span>
          <span class="status ${esc(st)}">${esc(STATUS_LABEL[st] || 'Ativo')}</span>
          ${seloReavaliacao(reav)}
        </div>
        ${a.objetivo ? `<div class="pc-obj">${esc(a.objetivo)}</div>` : ''}
      </div>
    </div>`;
}

/**
 * A barra de abas, com a aba `ativa` marcada.
 * @param {string} ativa @param {readonly {id: string, rotulo: string}[]} [abas]
 */
export function htmlAbas(ativa, abas = ABAS) {
  return abas.map((t) => {
    const on = t.id === ativa;
    return `<button class="perfil-aba${on ? ' on' : ''}" role="tab" id="aba-${esc(t.id)}" aria-controls="tab-${esc(t.id)}" `
      + `aria-selected="${on}" tabindex="${on ? 0 : -1}" data-tab="${esc(t.id)}" type="button">${esc(t.rotulo)}</button>`;
  }).join('');
}

/* ============================================================
   DOM
   ============================================================ */

/** @type {{ obter: (id: string) => any, exportar?: (a: any) => any } | null} */
let deps = null;
const $ = (/** @type {string} */ s) => /** @type {HTMLElement|null} */ (document.querySelector(s));

/** Desenha o cabeçalho do aluno. @param {any} a */
export function renderCabecalho(a) {
  const el = $('#perfil-cab');
  if (el && a) el.innerHTML = htmlCabecalho(a);
}

/**
 * Marca a aba aberta na barra e a traz para a vista — no celular a barra rola,
 * e a aba aberta não pode ficar escondida.
 * @param {string} nome
 */
export function marcarAba(nome) {
  for (const b of document.querySelectorAll('.perfil-aba')) {
    const on = /** @type {HTMLElement} */ (b).dataset.tab === nome;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.setAttribute('tabindex', on ? '0' : '-1');
    if (on) /** @type {HTMLElement} */ (b).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
}

/**
 * Liga o perfil à página. Chamar uma vez, antes do resto do app.
 * @param {{ obter: (id: string) => any, exportar?: (a: any) => any }} d
 *   obter: a ficha pelo id (db.obter); exportar: gera o PDF da ficha
 */
export function iniciarPerfil(d) {
  deps = d;

  // Abrir o perfil: a ficha vai para o estado, o cabeçalho é desenhado, as abas
  // se preparam para o aluno novo ('perfil-aberto'), a aba Dados abre e a tela
  // aparece. Vem do clique num card da lista ou do cadastro de aluno novo.
  on(EVENTOS.ABRIR_PERFIL, (id) => {
    const a = deps?.obter(id);
    if (!a) return;
    estado.alunoAtual = a;
    renderCabecalho(a);
    emit(EVENTOS.PERFIL_ABERTO, a.id);
    emit(EVENTOS.ABRIR_ABA, 'dados');
    emit(EVENTOS.ABRIR_TELA, 'perfil');
  });
  on(EVENTOS.EXPORTAR_FICHA, () => { if (estado.alunoAtual) deps?.exportar?.(estado.alunoAtual); });
  const abas = $('#perfil-abas');
  if (abas) abas.innerHTML = htmlAbas('dados');

  $('#perfil-cab')?.addEventListener('click', (e) => {
    const alvo = /** @type {HTMLElement} */ (e.target).closest('[data-acao]');
    const acao = alvo instanceof HTMLElement ? alvo.dataset.acao : '';
    if (acao === 'voltar') emit(EVENTOS.VOLTAR_LISTA);
    else if (acao === 'pdf') emit(EVENTOS.EXPORTAR_FICHA);
    else if (acao === 'foto') emit(EVENTOS.TROCAR_FOTO);
  });

  abas?.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.perfil-aba');
    if (b instanceof HTMLElement && b.dataset.tab) emit(EVENTOS.ABRIR_ABA, b.dataset.tab);
  });
  // Setas, Home e End andam pelas abas (padrão WAI-ARIA de tablist).
  abas?.addEventListener('keydown', (e) => {
    const lista = /** @type {HTMLElement[]} */ ([...abas.querySelectorAll('.perfil-aba')]);
    const i = lista.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0) return;
    const prox = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: lista.length - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    const alvo = lista[(prox + lista.length) % lista.length];
    alvo.focus();
    if (alvo.dataset.tab) emit(EVENTOS.ABRIR_ABA, alvo.dataset.tab);
  });

  // A troca de aba: marca a barra e mostra o painel. O CONTEÚDO de cada painel
  // é do módulo da aba (ui-tab-*.js), que ouve o mesmo 'abrir-aba'. Este
  // ouvinte é registrado antes dos deles (iniciarPerfil vem primeiro no
  // main.js), então a aba já está visível quando o módulo desenha.
  on(EVENTOS.ABRIR_ABA, (nome) => {
    marcarAba(nome);
    for (const p of document.querySelectorAll('.tab-panel')) p.classList.toggle('active', p.id === 'tab-' + nome);
  });

  on(EVENTOS.ALUNOS_MUDARAM, () => {
    if (!deps || !estado.alunoAtual || !$('#tela-perfil')?.classList.contains('active')) return;
    const a = deps.obter(estado.alunoAtual.id);
    if (a) renderCabecalho(a);
  });
}
