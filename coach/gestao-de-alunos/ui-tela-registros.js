// @ts-check
/**
 * Tela "Registros do box" (Fase 1 · etapa 5, decisão 8 do ESCOPO): todas as
 * linhas do log, de todos os alunos — e as do box inteiro, como o fechamento do
 * mês, e as das rotinas, que não aparecem em nenhuma ficha.
 *
 * Lê `gestao/{uid}/eventos` de 50 em 50, do mais novo ao mais antigo, e junta o
 * que ainda está na fila deste aparelho. Os filtros (quem fez, tipo, aluno)
 * valem sobre o que já carregou; "Carregar mais" traz a página seguinte. O
 * desenho é puro, em registros-ui.js (`htmlFiltrosDoBox`, `htmlListaDoBox`).
 */
import * as db from './db.js?v=33';
import * as eventos from './eventos.js?v=33';
import { $ } from './util/dom.js?v=33';
import { hoje } from './util/formato.js?v=33';
import { on, EVENTOS } from './estado.js?v=33';
import { filtrarEventos, juntarEventos, htmlFiltrosDoBox, htmlListaDoBox } from './registros-ui.js?v=33';

const LIMITE = 50;
/** As linhas já lidas da nuvem, do mais novo ao mais antigo. @type {any[]} */
let lidas = [];
let fim = false, carregando = false, erro = '';
/** Evita que uma leitura antiga desenhe por cima da nova (reabriu a tela). */
let pedido = 0;
const filtro = { autor: 'todos', categoria: 'todos', alunoId: '' };

const visivel = () => !!$('#tela-registros')?.classList.contains('active');

/** O que está na fila deste aparelho (ainda não subiu), marcado. */
const pendentes = () => eventos.pendentes().map((e) => ({ ...e, pendente: true }));

function desenhar() {
  const f = $('#rb-filtros'), l = $('#rb-lista');
  if (!f || !l) return;
  f.innerHTML = htmlFiltrosDoBox(filtro, db.listar());
  const todas = filtrarEventos(juntarEventos(pendentes(), lidas), filtro);
  l.innerHTML = htmlListaDoBox(todas, { fim, carregando, erro, hojeIso: hoje() });
}

/** Lê a próxima página (ou a primeira, com `doZero`). @param {boolean} [doZero] */
async function carregar(doZero = false) {
  if (carregando) return;
  const meu = doZero ? ++pedido : pedido;
  if (doZero) { lidas = []; fim = false; erro = ''; }
  carregando = true; desenhar();
  try {
    const ultimo = lidas.length ? lidas[lidas.length - 1].em : undefined;
    const r = await eventos.listarEventos({ limite: LIMITE, ...(ultimo ? { antesDe: ultimo } : {}) });
    if (meu !== pedido) return;
    lidas = juntarEventos(lidas, r.eventos);
    fim = r.fim;
  } catch (e) {
    if (meu !== pedido) return;
    console.warn('[registros do box]', /** @type {any} */ (e)?.code || e);
    erro = 'Não deu para ler os registros gravados agora. Abaixo, só o que está na fila deste aparelho.';
    fim = true;
  } finally {
    if (meu === pedido) { carregando = false; desenhar(); }
  }
}

/** Liga a tela ao roteador e aos filtros. Chamar uma vez, antes do resto do app. */
export function iniciarTelaRegistros() {
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'registros') void carregar(true); });
  // Uma ação nova (aqui ou vinda da nuvem): a tela aberta mostra na hora.
  on(EVENTOS.REGISTROS_MUDARAM, () => { if (visivel()) desenhar(); });
  $('#rb-filtros')?.addEventListener('change', (/** @type {any} */ e) => {
    const campo = e.target?.dataset?.rb;
    if (!campo || !(campo in filtro)) return;
    /** @type {any} */ (filtro)[campo] = e.target.value;
    desenhar();
  });
  $('#rb-lista')?.addEventListener('click', (/** @type {any} */ e) => {
    if (e.target.closest('[data-rb-mais]')) void carregar(false);
  });
}
