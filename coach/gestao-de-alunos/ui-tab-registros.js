// @ts-check
/**
 * Aba Registros do perfil — a linha do tempo DESTE aluno.
 *
 * Três fontes numa lista só (a parte pura está em registros-ui.js): os eventos
 * gravados do aluno, os que ainda estão na fila do navegador e, antes do
 * primeiro gravado, o histórico reconstruído da ficha. A consulta por aluno já
 * traz todos os eventos dele de uma vez (eventos.listarEventos), então
 * "Carregar mais" só pagina o histórico reconstruído.
 *
 * Saiu do `app.js` no fatiamento. Escuta o barramento:
 *   'abrir-aba' (registros)  lê os eventos gravados e as fotos do Diário;
 *   'registros-mudaram'      entrou evento novo (uma ação do coach — inclusive
 *                            a trilha do financeiro —, a caixa do aluno):
 *                            redesenha, e relê as fotos do Diário;
 *   'alunos-mudaram'         a ficha mudou: redesenha (o histórico reconstruído
 *                            sai da ficha).
 */
import * as eventos from './eventos.js';
import { CATEGORIAS, FILTROS_ORIGEM, agruparPorDia, anexarFotosDoDiario, fotosDoDiarioPorDia, juntarEventos,
  linhaDoTempoDoAluno, linhaHTML } from './registros-ui.js';
import { carregarFotosDoDiario } from './diario-read.js';
import { esc, hoje } from './util/formato.js';
import { $, abrirModal } from './util/dom.js';
import { estado, on, EVENTOS } from './estado.js';

const REG_HIST = 60; // linhas do histórico reconstruído por "Carregar mais"
let regAlunoId = ''; // de quem são os eventos em `regEventos`
let regPedido = 0;   // a leitura mais recente; uma resposta atrasada de outro aluno é descartada
/** @type {any[]} */ let regEventos = [];
let regHist = REG_HIST;
let regCarregando = false;
let regErro = '';
/** As fotos do Diário do aluno, por dia (ver fotosDoDiarioPorDia); null = ainda não lidas. @type {any} */
let regFotos = null;
let regFotosPedido = 0; // só a leitura de fotos mais recente vale (a do merge pode passar a da abertura)
/** @type {Record<string, string>} */
const regFiltro = { categoria: 'todos', origem: 'todas' };

const abaVisivel = () => !!$('#tab-registros')?.classList.contains('active');

async function abrirRegistros() {
  if (!estado.alunoAtual) return;
  const id = String(estado.alunoAtual.id);
  const pedido = ++regPedido;
  regAlunoId = id; regEventos = []; regFotos = null; regHist = REG_HIST; regErro = ''; regCarregando = true;
  regFiltro.categoria = 'todos'; regFiltro.origem = 'todas';
  renderRegFiltros();
  desenharRegistros();
  const fotosPedido = ++regFotosPedido;
  const fotos = lerFotosDoDiario(estado.alunoAtual); // em paralelo com os eventos
  try {
    const r = await eventos.listarEventos({ alunoId: id });
    if (pedido !== regPedido) return; // trocou de aluno (ou reabriu a aba) enquanto carregava
    regEventos = r.eventos;
  } catch (e) {
    if (pedido !== regPedido) return;
    // Sem os gravados (sem rede, regra fora do ar), a aba ainda mostra o que a
    // ficha conta — melhor que uma lista vazia com um erro.
    console.warn('Registros:', /** @type {any} */ (e)?.code || e);
    regErro = 'Não deu para ler os registros gravados agora. Abaixo, só o que a ficha conta.';
  }
  const lidas = await fotos;
  if (pedido !== regPedido) return;
  if (fotosPedido === regFotosPedido) regFotos = lidas;
  regCarregando = false;
  desenharRegistros();
}

/**
 * As fotos do Diário, lidas na hora (não ficam no evento: foto apagada pelo
 * aluno tem de sumir daqui também). Falha vira null — a linha fica só com o
 * texto, que é melhor do que dizer "apagada" para uma foto que existe.
 * @param {any} a
 */
async function lerFotosDoDiario(a) {
  try {
    return fotosDoDiarioPorDia(await carregarFotosDoDiario(a && a.email));
  } catch (e) {
    console.warn('Registros: não deu para ler as fotos do Diário.', /** @type {any} */ (e)?.code || e);
    return null;
  }
}

/** Evento novo (do merge, de uma ação do coach): um aviso novo do Diário precisa da foto dele. */
async function atualizarRegistros() {
  const pedido = regPedido;
  const fotosPedido = ++regFotosPedido;
  const lidas = await lerFotosDoDiario(estado.alunoAtual);
  if (pedido !== regPedido || fotosPedido !== regFotosPedido) return;
  if (lidas) regFotos = lidas;
  desenharRegistros();
}

/** A foto do Diário em tela cheia. @param {string} url @param {string} dia */
function abrirFotoDoDiario(url, dia) {
  const [a, m, d] = String(dia || '').split('-');
  $('#modal-foto-titulo').textContent = d ? `Diário · ${d}/${m}/${a}` : 'Diário de Evolução';
  const img = $('#modal-foto-img');
  img.src = url;
  img.alt = `Foto do Diário de Evolução${d ? ` de ${d}/${m}/${a}` : ''}`;
  abrirModal('modal-foto');
}

function renderRegFiltros() {
  const chip = (grupo, v, txt) => `<button class="filtro-chip${regFiltro[grupo] === v ? ' on' : ''}" data-g="${grupo}" data-v="${v}" type="button">${txt}</button>`;
  $('#reg-filtros').innerHTML =
    `<div class="reg-chips">${CATEGORIAS.map(([v, t]) => chip('categoria', v, t)).join('')}</div>` +
    `<div class="reg-chips">${FILTROS_ORIGEM.map(([v, t]) => chip('origem', v, t)).join('')}</div>`;
}

function desenharRegistros() {
  const a = estado.alunoAtual;
  if (!a || String(a.id) !== regAlunoId) return;
  // Pendentes primeiro: se um evento está nas duas listas, fica o selo "na fila".
  const gravados = juntarEventos(eventos.pendentes().map((e) => ({ ...e, pendente: true })), regEventos);
  const tempo = linhaDoTempoDoAluno(gravados, a, regFiltro);
  const reais = anexarFotosDoDiario(tempo.reais, regFotos);
  const hist = tempo.hist;
  // Enquanto os gravados não chegam, o histórico ainda não sabe onde começa.
  const histVisivel = regCarregando ? [] : hist.slice(0, regHist);

  const grupos = (lista) => agruparPorDia(lista, hoje()).map((g) =>
    `<div class="reg-dia">${esc(g.rotulo)}</div>` + g.itens.map((e) => linhaHTML(e)).join('')).join('');

  let html = regErro ? `<div class="prog-ph">${esc(regErro)}</div>` : '';
  html += grupos(reais);
  if (histVisivel.length) {
    html += `<div class="reg-antes"><b>Antes do registro</b> Reconstruído da ficha: sem origem, e sem hora quando o check-in não foi confirmado no dia.</div>`;
    html += grupos(histVisivel);
  }
  if (regCarregando) html += `<div class="prog-ph">Carregando…</div>`;
  else if (!reais.length && !histVisivel.length) {
    html += `<div class="empty"><b>Nada por aqui</b>${regFiltro.categoria !== 'todos' || regFiltro.origem !== 'todas' ? 'Nenhum registro com esses filtros.' : 'Os check-ins, fotos, feedbacks, edições de ficha e pagamentos deste aluno aparecem aqui.'}</div>`;
  }
  $('#reg-lista').innerHTML = html;
  $('#reg-mais').hidden = regCarregando || hist.length <= regHist;
}

/** Liga a aba à página e ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabRegistros() {
  $('#reg-mais')?.addEventListener('click', () => { regHist += REG_HIST; desenharRegistros(); });
  $('#reg-lista')?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('.reg-thumb'); if (!b) return;
    abrirFotoDoDiario(b.dataset.foto, b.dataset.dia);
  });
  $('#reg-filtros')?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    regFiltro[b.dataset.g] = b.dataset.v;
    renderRegFiltros();
    desenharRegistros();
  });
  on(EVENTOS.ABRIR_ABA, (nome) => { if (nome === 'registros') abrirRegistros(); });
  on(EVENTOS.REGISTROS_MUDARAM, () => { if (abaVisivel()) atualizarRegistros(); });
  on(EVENTOS.ALUNOS_MUDARAM, () => { if (abaVisivel()) desenharRegistros(); });
}
