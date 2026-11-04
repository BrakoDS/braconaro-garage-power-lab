// @ts-check
/**
 * CALENDÁRIO — a tela. Carregado pelo gate.js depois do login.
 *
 * Junta os dados (as fichas da Gestão, o meta do box e os pedidos do app ainda
 * não aplicados), monta o modelo pelas camadas e desenha a visão escolhida.
 * Só mostra — a única escrita é a decisão "o box abriu?" do feriado, que
 * republica o Portal (o aluno não pode levar falta em dia de porta fechada).
 *
 * Atualização: os pedidos do app chegam ao vivo; o resto (ficha nova, horário
 * trocado na Gestão) ao voltar para a aba e no botão Atualizar. Sem releitura
 * periódica, de propósito: reler todas as fichas a cada intervalo gastaria a
 * cota gratuita do Firestore com a aba aberta o dia inteiro.
 */
import * as db from '../gestao-de-alunos/db.js?v=30';
import { horasDaGrade } from '../gestao-de-alunos/presenca-regras.js?v=30';
import { publicarPortal } from '../gestao-de-alunos/portal-sync.js?v=30';
import { chaveDoDia } from '../../compartilhado/regras/semana.js';
import { feriadoEm } from '../../compartilhado/regras/feriados.js';
import { painel as painelReal } from '../../compartilhado/ui/dialogo.js';
import { CAMADAS } from './camadas/registro.js';
import { montarModelo } from './core/modelo.js';
import { navegar, relogioLocal, VISOES } from './core/periodo.js';
import { aplicarPendentes, ouvirPendentes } from './pendentes.js';
import { esc } from './render-comum.js';
import { htmlSemana } from './render-semana.js';
import { htmlTurma } from './render-turma.js';
import { htmlMes, htmlListaDoDia } from './render-mes.js';
import { htmlDia } from './render-dia.js';

const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const PREF = 'braconaro_calendario_v1';
const RELER_NO_MAXIMO_A_CADA_MS = 30_000;
const NOME_VISAO = /** @type {Record<string, string>} */ ({ semana: 'Semana', mes: 'Mês', dia: 'Dia' });

/** @type {{ painel: (o: any) => Promise<string|null>, relogio: () => { hoje: string, agora: string }, agoraMs: () => number }} */
let deps = { painel: painelReal, relogio: () => relogioLocal(), agoraMs: () => Date.now() };

/** @returns {{ visao: import('./core/periodo.js').Visao, desligadas: string[] }} */
function lerPref() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || '{}');
    return { visao: VISOES.includes(p.visao) ? p.visao : 'semana', desligadas: Array.isArray(p.desligadas) ? p.desligadas : [] };
  } catch { return { visao: 'semana', desligadas: [] }; }
}
function gravarPref() {
  try {
    localStorage.setItem(PREF, JSON.stringify({ visao: est.visao, desligadas: CAMADAS.map((c) => c.id).filter((id) => !est.ligadas.has(id)) }));
  } catch { /* sem storage: só não lembra */ }
}

const pref = lerPref();
const est = {
  /** @type {string|null} */ uid: null,
  /** @type {import('./core/periodo.js').Visao} */ visao: pref.visao,
  ancora: '',
  ligadas: new Set(CAMADAS.map((c) => c.id).filter((id) => !pref.desligadas.includes(id))),
  /** @type {{ tipo: 'turma', iso: string, hora: string } | { tipo: 'dia', iso: string } | null} */ aberta: null,
  /** @type {import('./pendentes.js').Caixas} */ caixas: { avisos: {}, reservas: {} },
  pendentesOk: true,
  /** @type {number|null} */ lidoEm: null,
  lendo: false,
};

/** O contexto das camadas, com os pedidos do app aplicados numa cópia. @returns {import('./core/camadas.js').Contexto} */
function contexto() {
  const { hoje, agora } = deps.relogio();
  const base = db.listar();
  const { fichas, porAluno } = est.uid ? aplicarPendentes(base, est.caixas, est.uid) : { fichas: base, porAluno: {} };
  return { fichas, meta: { turmas: db.configTurmas(), feriados: db.feriadosDoBox() }, fechados: db.diasFechados(), pendentes: porAluno, hoje, agora };
}

const hhmm = (/** @type {number} */ ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function render() {
  const ctx = contexto();
  const modelo = montarModelo({
    camadas: CAMADAS, ctx, visao: est.visao, ancora: est.ancora, ligadas: est.ligadas,
    gradeDoDia: (iso) => horasDaGrade(ctx.meta.turmas, chaveDoDia(iso)),
  });
  $('#cal-periodo').textContent = modelo.rotulo;
  $('#cal-visoes').innerHTML = VISOES.map((v) =>
    `<button type="button" class="${v === est.visao ? 'on' : ''}" data-acao="visao" data-v="${v}" aria-pressed="${v === est.visao}">${NOME_VISAO[v]}</button>`).join('');
  $('#cal-camadas').innerHTML = CAMADAS.map((c) => {
    const on = est.ligadas.has(c.id);
    return `<button type="button" class="cam${on ? '' : ' off'}" data-acao="camada" data-v="${esc(c.id)}" aria-pressed="${on}"><i style="background:var(${esc(c.cor)})"></i>${esc(c.nome)}</button>`;
  }).join('');

  const aberta = est.aberta;
  const turmaAberta = aberta && aberta.tipo === 'turma' ? aberta : null;
  if (est.visao === 'semana') $('#cal-corpo').innerHTML = htmlSemana(modelo, { aberta: turmaAberta });
  else if (est.visao === 'mes') $('#cal-corpo').innerHTML = htmlMes(modelo, { diaAberto: aberta ? aberta.iso : null });
  else $('#cal-corpo').innerHTML = htmlDia(modelo, { aberta: turmaAberta });

  const dia = aberta ? modelo.dias.find((d) => d.iso === aberta.iso) : null;
  const item = turmaAberta && dia ? (dia.porHora[turmaAberta.hora] || []).find((i) => i.tipo === 'turma') : null;
  if (turmaAberta && dia && item) $('#cal-lado').innerHTML = htmlTurma(dia, item, { agoraMs: deps.agoraMs(), voltarDia: est.visao === 'mes' });
  else if (aberta && aberta.tipo === 'dia' && dia) $('#cal-lado').innerHTML = htmlListaDoDia(dia);
  else {
    // O que estava aberto sumiu (outro período, camada desligada): o painel volta à dica.
    est.aberta = null;
    $('#cal-lado').innerHTML = `<p class="lado-dica">${est.visao === 'mes' ? 'Toque num dia para ver as turmas.' : 'Toque numa turma para ver quem vem.'}</p>`;
  }
  const quando = est.lendo ? 'atualizando…' : est.lidoEm ? `dados de ${hhmm(est.lidoEm)}` : 'dados deste aparelho';
  $('#cal-status').textContent = quando + (est.pendentesOk ? '' : ' · pedidos do app indisponíveis agora');
}

/** Relê a nuvem (fichas e meta). Silencioso em falha: segue com o que tem. */
async function recarregar() {
  if (!est.uid || est.lendo) return;
  est.lendo = true;
  render();
  try {
    const modo = await db.iniciarSync(est.uid, render);
    if (modo === 'v2') est.lidoEm = deps.agoraMs();
  } catch (e) {
    console.warn('[Calendário] não deu para reler a nuvem:', /** @type {any} */ (e)?.code || e);
  } finally {
    est.lendo = false;
    render();
  }
}

/**
 * Republica o Portal depois de mudar um feriado — só com a nuvem em dia (v2):
 * sobe a decisão, relê a nuvem (as baixas de Pix que a Gestão fez vêm junto)
 * e publica com os dias fechados. Fora do v2, a Gestão publica quando abrir.
 */
async function publicarFechados() {
  if (!est.uid || db.modoSync() !== 'v2') return;
  try {
    await db.enviarAgora();
    await db.iniciarSync(est.uid, render);
    est.lidoEm = deps.agoraMs();
    await publicarPortal(db.listar(), db.diasFechados());
  } catch (e) {
    console.warn('[Calendário] o Portal não foi republicado agora:', /** @type {any} */ (e)?.code || e);
  }
  render();
}

/** "O box abriu?" — a mesma pergunta que a Agenda fazia. @param {string} iso */
async function decidirFeriado(iso) {
  const fer = feriadoEm(iso);
  if (!fer) return;
  const atual = db.feriadosDoBox()[iso];
  const [a, m, d] = iso.split('-');
  const acao = await deps.painel({
    titulo: fer.nome,
    corpoHTML: `<p class="dlg-texto">${d}/${m}/${a} · ${fer.tipo === 'facultativo' ? 'ponto facultativo' : `feriado ${esc(fer.tipo)}`}.</p>
      <p class="dlg-texto">O box abriu neste dia? Marcando <b>não abriu</b>, ninguém recebe falta —
      nem aqui, nem no Portal do aluno. ${atual === undefined ? 'Sem decisão, o dia conta presença normalmente.' : ''}</p>`,
    acoes: [
      { id: 'fechou', label: 'Não abriu' },
      { id: 'abriu', label: 'Abriu normal' },
      ...(atual === undefined ? [] : [{ id: 'limpar', label: 'Limpar decisão', perigo: true }]),
    ],
    largo: false,
  });
  if (!acao) return;
  db.marcarFeriado(iso, acao === 'fechou' ? false : acao === 'abriu' ? true : null);
  render();
  await publicarFechados();
}

/** Uma escuta só, no #app: todo botão diz o que faz em `data-acao`. @param {any} e */
async function aoClicar(e) {
  const b = e.target && e.target.closest ? e.target.closest('[data-acao]') : null;
  if (!b) return;
  const { acao, iso, hora, v } = b.dataset;
  if (acao === 'prev' || acao === 'next') { est.ancora = navegar(est.visao, est.ancora, acao === 'next' ? 1 : -1); est.aberta = null; }
  else if (acao === 'hoje') { est.ancora = deps.relogio().hoje; est.aberta = null; }
  else if (acao === 'visao' && VISOES.includes(v)) { est.visao = v; est.aberta = null; gravarPref(); }
  else if (acao === 'camada') { if (est.ligadas.has(v)) est.ligadas.delete(v); else est.ligadas.add(v); gravarPref(); }
  else if (acao === 'turma') est.aberta = { tipo: 'turma', iso, hora: hora ?? '' };
  else if (acao === 'dia') est.aberta = { tipo: 'dia', iso };
  else if (acao === 'fechar') est.aberta = null;
  else if (acao === 'ir') { est.ancora = iso; est.aberta = null; }
  else if (acao === 'atualizar') { await recarregar(); return; }
  else if (acao === 'feriado') { await decidirFeriado(iso); return; }
  else return;
  render();
}

/**
 * Liga a tela. `user` é o coach logado (null sem nuvem: só os dados deste aparelho).
 * @param {any} user @param {Partial<typeof deps>} [d] o que os testes trocam
 */
export function iniciarCalendario(user, d = {}) {
  deps = { ...deps, ...d };
  est.uid = (user && user.uid) || null;
  est.ancora = deps.relogio().hoje;
  $('#app').addEventListener('click', aoClicar);
  // Teclado: o dia do mês é um <div role="button">.
  $('#app').addEventListener('keydown', (/** @type {any} */ e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target?.dataset?.acao && e.target.tagName !== 'BUTTON') { e.preventDefault(); aoClicar(e); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!est.lidoEm || deps.agoraMs() - est.lidoEm > RELER_NO_MAXIMO_A_CADA_MS)) recarregar();
  });
  render();
  if (!est.uid) return;
  recarregar();
  const falhou = (/** @type {any} */ e) => { console.warn('[Calendário] pedidos do app indisponíveis:', e?.code || e); est.pendentesOk = false; render(); };
  ouvirPendentes((caixas) => { est.caixas = caixas; est.pendentesOk = true; render(); }, falhou).catch(falhou);
}
