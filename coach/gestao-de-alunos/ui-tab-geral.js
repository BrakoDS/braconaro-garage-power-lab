// @ts-check
/**
 * Aba Geral da ficha — a visão do dia a dia, em cards
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md):
 *
 *  - Financeiro  o plano (valor, parceria, vencimento, quem paga), a situação
 *                (atrasado / a vencer / em dia…, o critério do Portal) e as
 *                ações de dinheiro: Registrar pagamento da fatura mais antiga em
 *                aberto, + Lançamento e Ver faturas (abre a lista no próprio
 *                card — o pagamento já abre um modal, e modal sobre modal não);
 *  - Perfil      idade, objetivo, frequência e dias — só leitura; o ✎ abre o
 *                card Perfil de treino da aba Treino, já em edição;
 *  - Contato e cadastro  nome, telefone, e-mail, endereço, status e o ID;
 *  - Acesso      app liberado, modo Lite, o link do Portal e o consentimento LGPD.
 *
 * Os cards abrem em modo leitura; o ✎ troca o corpo pelo formulário (ui-card.js).
 * O que se edita vai para o rascunho do salvar global (ui-salvar-global.js), que
 * desenha esta aba a partir da ficha COM o rascunho e grava na barra do rodapé.
 * O dinheiro (pagar, lançar, desfazer) e o acesso continuam gravando na hora,
 * pelo ui-tab-financeiro.js e pelo ui-acoes-aluno.js; a situação e as faturas
 * mostram sempre a ficha SALVA.
 */
import * as db from './db.js?v=20';
import { esc, hoje, fmtData } from './util/formato.js?v=20';
import { $ } from './util/dom.js?v=20';
import { estado, on, emit, EVENTOS } from './estado.js?v=20';
import { registrarFormulario, redesenharAberta } from './ui-salvar-global.js?v=20';
import { camposDados, wireForm, lerCampos, CAMPOS } from './ui-tab-dados.js?v=20';
import { resumoDosDias, editarNaAbaTreino } from './ui-tab-treino.js?v=20';
import { idadeDoAluno, situacaoFinanceira, seloStatus } from './perfil-derivados.js?v=20';
import { brl, historicoFinanceiro, resumoDoPlano } from './financeiro-aluno.js?v=20';
import { htmlFatura } from './ui-tab-financeiro.js?v=20';
import { carregarConsentimentoLGPD } from './consentimento-read.js?v=20';
import { htmlCard, botaoEditar, htmlLinhas } from './ui-card.js?v=20';

/** Os cards com formulário (os que têm ✎ Editar). */
export const CARDS_EDITAVEIS = Object.freeze(['contato', 'financeiro', 'acesso']);

/* ============================================================
   HTML (puro)
   ============================================================ */

// Os dias com a hora de cada um — quem os edita é o card Perfil de treino.
export { resumoDosDias };

/** Card Perfil (só leitura). @param {any} v a ficha com o rascunho @param {string} hojeIso */
export function htmlCardPerfil(v, hojeIso) {
  const idade = idadeDoAluno(v, hojeIso);
  const vezes = parseInt(v.freqVezes, 10);
  return htmlCard({
    id: 'perfil',
    titulo: 'Perfil',
    acoes: '<button class="card-btn" type="button" data-ir-aba="treino" data-editar="perfil-treino" aria-label="Editar o perfil de treino (aba Treino)">✎ Editar</button>',
    corpo: htmlLinhas([
      ['Idade', idade != null ? `${idade} anos` : ''],
      ['Objetivo', esc(v.objetivo || '')],
      ['Frequência', vezes ? `${vezes}x por semana` : ''],
      ['Dias de treino', esc(resumoDosDias(v))],
    ]),
  });
}

/** Card Contato e cadastro. @param {any} v @param {boolean} editando */
export function htmlCardContato(v, editando) {
  const st = seloStatus(v);
  const c = editando ? camposDados(v) : null;
  return htmlCard({
    id: 'contato',
    titulo: 'Contato e cadastro',
    acoes: botaoEditar('contato', 'contato e cadastro', editando),
    corpo: c
      ? `<form id="form-geral-contato" class="grid-form" novalidate>${c.nome}${c.telefone}${c.email}${c.endereco}${c.status}${c.id}</form>`
      : htmlLinhas([
        ['Nome', esc(v.nome || '')],
        ['Telefone', esc(v.telefone || '')],
        ['E-mail', esc(v.email || '')],
        ['Endereço', esc(v.endereco || '')],
        ['Status', `<span class="status ${esc(st.valor)}">${esc(st.rotulo)}</span>`],
        ['ID', `<span class="card-id">#${esc(v.id)}</span>`],
      ]),
  });
}

/** Classe do selo de cada situação financeira. */
const COR_SITUACAO = { atrasado: 'bad', 'a-vencer': 'warn', 'em-dia': 'ok', coberto: 'neutro', 'sem-plano': 'neutro' };

/**
 * A fatura que o "Registrar pagamento" do card paga: a MAIS ANTIGA em aberto
 * (atrasada ou a vencer) — paga-se a dívida mais velha primeiro. null sem nada
 * a pagar.
 * @param {{ faturas: any[] }} h o histórico (do mais novo para o mais antigo)
 */
export function faturaParaPagar(h) {
  const abertas = h.faturas.filter((f) => f.pagavel && (f.status === 'vencido' || f.status === 'pendente'));
  return abertas.length ? abertas[abertas.length - 1] : null;
}

/**
 * A parte do card Financeiro que muda com o dinheiro (sempre da ficha SALVA):
 * a situação, os botões e, aberta, a lista de faturas.
 * @param {any} salvo @param {any[]} todos @param {string} hojeIso @param {boolean} faturasAbertas
 */
export function htmlFinanceiroDinamico(salvo, todos, hojeIso, faturasAbertas) {
  const s = situacaoFinanceira(salvo, todos, hojeIso);
  const h = historicoFinanceiro(salvo, todos, hojeIso);
  const pagar = faturaParaPagar(h);
  const aberto = s.emAberto > 0
    ? `<span class="fg-aberto">${brl(s.emAberto)} em aberto${s.atrasado > 0 ? ` · ${brl(s.atrasado)} atrasado` : ''}</span>` : '';
  const lista = h.faturas.length
    ? h.faturas.map(htmlFatura).join('')
    : '<div class="empty"><b>Nenhuma cobrança ainda</b>Defina a mensalidade no ✎ do card, ou lance um consumo.</div>';
  return `
    <div class="fg-situacao">
      <span class="ac-chip fg-chip fg-${COR_SITUACAO[s.tipo]}">${esc(s.rotulo)}</span>${aberto}
    </div>
    <div class="fg-botoes">
      ${pagar ? `<button class="btn btn-sm" type="button" data-fin="pagar" data-mes="${esc(pagar.mesId)}">Registrar pagamento · ${esc(pagar.rotulo)}</button>` : ''}
      <button class="btn ghost btn-sm" type="button" data-fin="novo">+ Lançamento</button>
      <button class="btn ghost btn-sm" type="button" data-geral="faturas" aria-expanded="${faturasAbertas}" aria-controls="fg-faturas">${faturasAbertas ? 'Ocultar faturas ▴' : 'Ver faturas ▾'}</button>
    </div>
    <div class="fg-faturas" id="fg-faturas"${faturasAbertas ? '' : ' hidden'}>
      ${faturasAbertas ? `<div class="fa-lista">${lista}</div>${h.temMais ? '<p class="hint fa-mais">Mostrando os últimos 12 meses.</p>' : ''}` : ''}
    </div>`;
}

/**
 * Card Financeiro.
 * @param {any} v a ficha com o rascunho (o plano) @param {any} salvo a ficha salva (o dinheiro)
 * @param {any[]} todos @param {string} hojeIso @param {{ editando: boolean, faturasAbertas: boolean }} o
 */
export function htmlCardFinanceiro(v, salvo, todos, hojeIso, { editando, faturasAbertas }) {
  let plano;
  if (editando) {
    const c = camposDados(v, { todos });
    plano = `<form id="form-geral-plano" class="grid-form" novalidate>${c.mensalidade}${c.vencimento}${c.parceriaPct}${c.parceriaNome}${c.pagoPor}${c.pagoPorEscopo}</form>`;
  } else {
    const r = resumoDoPlano(v, todos, hojeIso);
    const temPlano = r.mensalidadeCheia > 0;
    const notas = [];
    if (r.parceria) notas.push(`Parceria ${r.parceria.percentual}%${r.parceria.nome ? ' · ' + esc(r.parceria.nome) : ''} — cheia ${brl(r.mensalidadeCheia)}, o box banca ${brl(r.desconto)}`);
    if (r.responsavel) notas.push(`Conta acertada por <b>${esc(r.responsavel.nome)}</b> (${r.responsavel.escopo === 'plano' ? 'só o plano' : 'plano e consumíveis'})`);
    if (r.dependentes.length) notas.push(`Paga também a conta de <b>${r.dependentes.map(esc).join(', ')}</b>`);
    plano = `
      <div class="fg-plano">
        <span class="fg-valor">${temPlano ? `${brl(r.mensalidade)}<small>/mês</small>` : '<span class="fg-sem">Sem mensalidade</span>'}</span>
        <span class="fg-venc">vence dia ${r.vencimento}${r.vencimentoDefinido ? '' : ' (padrão)'}</span>
      </div>
      ${notas.length ? `<ul class="fg-notas">${notas.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}`;
  }
  return htmlCard({
    id: 'financeiro',
    titulo: 'Financeiro',
    classe: 'card-largo',
    acoes: botaoEditar('financeiro', 'o plano financeiro', editando),
    corpo: `${plano}<div class="fg-dinamico" id="ger-fin-dinamico">${htmlFinanceiroDinamico(salvo, todos, hojeIso, faturasAbertas)}</div>`,
  });
}

/** A linha do Portal no card Acesso (da ficha SALVA). @param {any} salvo */
export function htmlAcessoPortal(salvo) {
  const email = String(salvo.email || '').trim();
  const enviado = salvo.acessoEnviadoEm ? new Date(salvo.acessoEnviadoEm).toLocaleDateString('pt-BR') : '';
  const texto = !email ? 'Sem e-mail na ficha — preencha no card Contato.' : enviado ? `Link enviado em ${enviado}` : 'Ainda sem link de acesso';
  return `<span class="fg-portal">${esc(texto)}</span>
    <button class="btn btn-sm" type="button" data-geral="acesso"${email ? '' : ' disabled'}>${enviado ? 'Gerar novo link' : 'Criar acesso'}</button>`;
}

/** Card Acesso. @param {any} v @param {any} salvo @param {boolean} editando */
export function htmlCardAcesso(v, salvo, editando) {
  const c = editando ? camposDados(v) : null;
  const sim = (ok, rotulo) => `<span class="ac-chip ${ok ? 'fg-ok' : 'fg-neutro'}">${rotulo}</span>`;
  const leitura = htmlLinhas([
    ['App mobile', sim(v.appLiberado === true, v.appLiberado === true ? 'Liberado' : 'Bloqueado')],
    ['Tela do app', sim(v.modoLite === true, v.modoLite === true ? 'Simplificada (Lite)' : 'Completa')],
    ['Consentimento LGPD', '<span id="ger-lgpd" class="fg-lgpd">verificando…</span>'],
  ]);
  return htmlCard({
    id: 'acesso',
    titulo: 'Acesso',
    acoes: botaoEditar('acesso', 'o acesso ao app', editando),
    corpo: `${c ? `<form id="form-geral-acesso" class="grid-form" novalidate>${c.appLiberado}${c.modoLite}</form>` : leitura}
      <div class="fg-acesso-portal" id="ger-acesso-portal">${htmlAcessoPortal(salvo)}</div>`,
  });
}

/**
 * A aba inteira.
 * @param {any} v a ficha com o rascunho @param {any} salvo a ficha salva
 * @param {{ todos: any[], hojeIso: string, editando: Set<string>, faturasAbertas: boolean }} o
 */
export function htmlAbaGeral(v, salvo, { todos, hojeIso, editando, faturasAbertas }) {
  return `
    <div class="cards-geral">
      ${htmlCardFinanceiro(v, salvo, todos, hojeIso, { editando: editando.has('financeiro'), faturasAbertas })}
      ${htmlCardPerfil(v, hojeIso)}
      ${htmlCardContato(v, editando.has('contato'))}
      ${htmlCardAcesso(v, salvo, editando.has('acesso'))}
    </div>`;
}

/* ============================================================
   DOM
   ============================================================ */

/** Os cards abertos para edição (voltam à leitura ao salvar ou ao trocar de aluno). */
const editando = new Set();
let faturasAbertas = false;

/** A ficha SALVA do aluno aberto. */
const salvoAgora = () => (estado.alunoAtual ? db.obter(estado.alunoAtual.id) : null);

/** O consentimento LGPD (só leitura, da conta do aluno). @param {any} salvo */
async function carregarLGPD(salvo) {
  const el = $('#ger-lgpd'); if (!el) return;
  const alvoId = salvo.id;
  const email = String(salvo.email || '').trim().toLowerCase();
  if (!email) { el.innerHTML = '<span class="semdado">sem e-mail cadastrado</span>'; return; }
  let c = null;
  try { c = await carregarConsentimentoLGPD(email); } catch (e) { console.warn('LGPD:', /** @type {any} */ (e)?.code || e); }
  const alvo = $('#ger-lgpd');
  if (!alvo || estado.alunoAtual?.id !== alvoId) return; // trocou de aluno enquanto carregava
  alvo.innerHTML = c && c.aceitoEm
    ? `<span class="ok">✓ aceito em ${new Date(c.aceitoEm).toLocaleDateString('pt-BR')}</span>`
    : '<span class="pendente">⚠ ainda não aceito</span>';
}

/** Desenha a aba com a ficha recebida (a ficha com o rascunho por cima). @param {any} v */
function desenhar(v) {
  const painel = $('#tab-geral'); if (!painel) return;
  const salvo = db.obter(v.id) || v;
  painel.innerHTML = htmlAbaGeral(v, salvo, { todos: db.listar(), hojeIso: hoje(), editando, faturasAbertas });
  for (const id of ['#form-geral-contato', '#form-geral-plano', '#form-geral-acesso']) { const f = $(id); if (f) wireForm(f); }
  carregarLGPD(salvo);
}

/** Os formulários dos cards abertos, por campo. */
function ler() {
  /** @type {Record<string, any>} */ const r = {};
  const grupos = /** @type {[string, readonly string[]][]} */ ([['#form-geral-contato', CAMPOS.contato], ['#form-geral-plano', CAMPOS.plano], ['#form-geral-acesso', CAMPOS.acesso]]);
  for (const [id, chaves] of grupos) { const f = /** @type {any} */ ($(id)); if (f) Object.assign(r, lerCampos(f, chaves)); }
  return r;
}

/** Redesenha só o que muda com o dinheiro e com o acesso (o resto pode estar em edição). */
function atualizarPartesSalvas() {
  const salvo = salvoAgora(); if (!salvo) return;
  const fin = $('#ger-fin-dinamico');
  if (fin) fin.innerHTML = htmlFinanceiroDinamico(salvo, db.listar(), hoje(), faturasAbertas);
  const portal = $('#ger-acesso-portal');
  if (portal) portal.innerHTML = htmlAcessoPortal(salvo);
}

/** Liga a aba ao salvar global e ao barramento. Chamar uma vez, depois de `iniciarSalvarGlobal`. */
export function iniciarTabGeral() {
  registrarFormulario({ aba: 'geral', desenhar, ler, aposSalvar: () => editando.clear() });

  on(EVENTOS.PERFIL_ABERTO, () => { editando.clear(); faturasAbertas = false; });
  // Pagou, lançou, gerou acesso: a situação, as faturas e o link mudam — mesmo
  // com um card em edição (o rascunho dele fica como está).
  on(EVENTOS.ALUNOS_MUDARAM, () => { if ($('#tab-geral')?.classList.contains('active')) atualizarPartesSalvas(); });

  $('#tab-geral')?.addEventListener('click', (/** @type {any} */ e) => {
    const alvo = e.target.closest('[data-card], [data-ir-aba], [data-geral]');
    if (!alvo) return;
    if (alvo.dataset.card) {
      const card = alvo.dataset.card;
      if (alvo.dataset.modo === 'editar') editando.add(card); else editando.delete(card);
      redesenharAberta();
      // Abriu para editar: o foco vai para o primeiro campo do card.
      if (alvo.dataset.modo === 'editar') /** @type {any} */ ($(`#card-${card} form input:not([disabled]), #card-${card} form select`))?.focus();
    } else if (alvo.dataset.editar) {
      editarNaAbaTreino(alvo.dataset.editar);
    } else if (alvo.dataset.irAba) {
      emit(EVENTOS.ABRIR_ABA, alvo.dataset.irAba);
    } else if (alvo.dataset.geral === 'faturas') {
      faturasAbertas = !faturasAbertas;
      atualizarPartesSalvas();
    } else if (alvo.dataset.geral === 'acesso' && estado.alunoAtual) {
      emit(EVENTOS.GERAR_ACESSO, estado.alunoAtual.id);
    }
  });
}
