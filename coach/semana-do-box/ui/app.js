// @ts-check
/**
 * SEMANA DO BOX — a tela. Carregado por `gate.js` só depois do login.
 *
 * Um mês de cada vez: os cartões das semanas ISO que tocam o mês e, abaixo, o
 * detalhe da semana escolhida. Todo botão é um PEDIDO ao servidor (gerar,
 * sortear de novo, publicar, voltar para rascunho); depois de cada um a tela
 * RELÊ o documento da semana em vez de usar a resposta da chamada — assim o que
 * aparece é sempre o que está gravado, inclusive quando a chamada falha depois
 * de o servidor ter atualizado os alertas (ver `publicarSemanaBox`).
 */
import { usuario } from '../../../compartilhado/firebase/cloud.js';
import { confirmar } from '../../../compartilhado/ui/dialogo.js';
import { chaveMes, chaveSemana, rotuloMes, semanasDoMes } from '../../montador-hibrido/core/periodos.js';
import { variacaoSeguinte } from '../core/vista.js';
import { gerarMatriz, publicar, lerSemanas } from '../cloud/semana.js';
import { esc, renderLista, renderSemana } from './render.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** 'AAAA-MM-DD' de hoje no fuso do box. */
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const estado = {
  mes: chaveMes(hoje()),
  /** @type {{chave: string, inicio: string, rotulo: string}[]} */
  semanas: [],
  /** @type {Record<string, any>} */
  docs: {},
  selecionada: '',
  ocupado: false,
};

const uid = () => usuario()?.uid || '';

/** @param {string} msg @param {'ok'|'erro'|''} [tipo] */
function status(msg, tipo = '') {
  const el = $('#semana-status');
  el.textContent = msg;
  el.className = `semana-status ${tipo}`;
}

function desenhar() {
  $('#mes-titulo').textContent = rotuloMes(estado.mes);
  $('#lista-semanas').innerHTML = renderLista(estado.semanas, estado.docs, estado.selecionada);
  const s = estado.semanas.find((x) => x.chave === estado.selecionada);
  $('#semana-detalhe').innerHTML = s
    ? renderSemana({ ...s, doc: estado.docs[s.chave] ?? null, ocupado: estado.ocupado })
    : '<p class="vazio">Escolha uma semana.</p>';
}

/** Lê as semanas do mês e escolhe a de hoje (ou a primeira). */
async function carregarMes() {
  estado.semanas = semanasDoMes(estado.mes);
  const chaves = estado.semanas.map((s) => s.chave);
  if (!chaves.includes(estado.selecionada)) {
    const atual = chaveSemana(hoje());
    estado.selecionada = chaves.includes(atual) ? atual : chaves[0] ?? '';
  }
  estado.docs = {};
  desenhar();
  status('Carregando as semanas…');
  try {
    estado.docs = await lerSemanas(uid(), chaves);
    status('');
  } catch (e) {
    console.error(e);
    status('Não deu para ler as semanas. Confira a conexão e recarregue.', 'erro');
  }
  desenhar();
}

/** Relê UMA semana — depois de qualquer pedido ao servidor. @param {string} chave */
async function reler(chave) {
  const lidos = await lerSemanas(uid(), [chave]);
  estado.docs[chave] = lidos[chave];
}

/**
 * Executa um pedido com a tela travada, relê a semana e mostra o resultado.
 * Relê também no ERRO: `publicarSemanaBox` grava os alertas de agora antes de recusar.
 * @param {string} chave @param {string} ocupando @param {() => Promise<any>} pedido @param {string} sucesso
 */
async function executar(chave, ocupando, pedido, sucesso) {
  estado.ocupado = true;
  desenhar();
  status(ocupando);
  let erro = null;
  try {
    await pedido();
  } catch (e) {
    erro = e;
  }
  try { await reler(chave); } catch (e) { console.error('Falha ao reler a semana:', e); }
  estado.ocupado = false;
  desenhar();
  if (erro) status(/** @type {any} */ (erro).message || 'Não deu para completar a operação.', 'erro');
  else status(sucesso, 'ok');
}

async function aoClicar(ev) {
  const alvo = /** @type {HTMLElement} */ (ev.target).closest('[data-semana], [data-acao]');
  if (!alvo || estado.ocupado) return;

  const semana = alvo.getAttribute('data-semana');
  if (semana) {
    estado.selecionada = semana;
    status('');
    desenhar();
    return;
  }

  const s = estado.semanas.find((x) => x.chave === estado.selecionada);
  if (!s) return;
  const doc = estado.docs[s.chave];
  const acao = alvo.getAttribute('data-acao');

  if (acao === 'gerar') {
    const data = $('#semana-data')?.value || s.inicio;
    await executar(s.chave, 'Gerando a semana no servidor…', () => gerarMatriz({ data }),
      'Rascunho gerado. Revise a grade e publique quando estiver pronto.');
  } else if (acao === 'sortear') {
    const ok = await confirmar({
      titulo: 'Sortear de novo?',
      texto: `O rascunho de <b>${esc(s.chave)}</b> será substituído por um novo sorteio. Edições feitas nele se perdem.`,
      ok: 'Sortear de novo',
    });
    if (!ok) return;
    await executar(s.chave, 'Sorteando de novo…',
      () => gerarMatriz({ data: s.inicio, variacao: variacaoSeguinte(doc), substituirRascunho: true }),
      'Novo sorteio gravado como rascunho.');
  } else if (acao === 'publicar') {
    const ok = await confirmar({
      titulo: 'Publicar a semana?',
      texto: `Os alunos passam a ver a semana <b>${esc(s.chave)}</b> (${esc(s.rotulo)}).`,
      ok: 'Publicar',
    });
    if (!ok) return;
    await executar(s.chave, 'Publicando…', () => publicar(s.chave, true), 'Semana publicada. Os alunos já veem a grade.');
  } else if (acao === 'despublicar') {
    const ok = await confirmar({
      titulo: 'Voltar para rascunho?',
      texto: `A semana <b>${esc(s.chave)}</b> sai da tela dos alunos até ser publicada de novo.`,
      ok: 'Voltar para rascunho',
      perigo: true,
    });
    if (!ok) return;
    await executar(s.chave, 'Voltando para rascunho…', () => publicar(s.chave, false), 'Semana de volta ao rascunho.');
  }
}

/** @param {number} passo */
function mudarMes(passo) {
  const [ano, m] = estado.mes.split('-').map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + passo, 1));
  estado.mes = d.toISOString().slice(0, 7);
  carregarMes();
}

$('#mes-anterior').addEventListener('click', () => !estado.ocupado && mudarMes(-1));
$('#mes-seguinte').addEventListener('click', () => !estado.ocupado && mudarMes(1));
$('#mes-hoje').addEventListener('click', () => {
  if (estado.ocupado) return;
  estado.mes = chaveMes(hoje());
  estado.selecionada = chaveSemana(hoje());
  carregarMes();
});
$('main').addEventListener('click', (ev) => { aoClicar(ev).catch((e) => console.error(e)); });

carregarMes();
