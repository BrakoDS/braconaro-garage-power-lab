// @ts-check
/**
 * O card "Evolução visual" da aba Avaliações: as fotos de corpo do aluno (Diário
 * de Evolução + avaliações físicas) que vão para a IA, o botão "Analisar
 * Evolução com IA" e o relatório para o coach.
 *
 * A parte pura (quais fotos, o pedido, o HTML) está em `evolucao-fotos.js`; a
 * chamada, em `evolucao-ia-cloud.js`. O Diário é relido a cada abertura da aba
 * (foto nova do aluno); o relatório fica na tela até trocar de aluno e não é
 * gravado em lugar nenhum. Escuta o barramento:
 *   'abrir-aba' (avaliacoes)  lê o Diário e desenha;
 *   'perfil-aberto'           outro aluno: esquece fotos e relatório;
 *   'alunos-mudaram'          foto de avaliação nova: redesenha a seleção.
 */
import { $ } from './util/dom.js?v=27';
import { esc } from './util/formato.js?v=27';
import { estado, on, EVENTOS } from './estado.js?v=27';
import { carregarFotosDoDiario } from './diario-read.js?v=27';
import { analisarEvolucao } from './evolucao-ia-cloud.js?v=27';
import { escolherParaIA, fotosDoAluno, htmlFotosParaIA, htmlRelatorio, pedidoParaIA } from './evolucao-fotos.js?v=27';

let alunoId = '';       // de quem são as fotos e o relatório na tela
let leitura = 0;        // só a leitura do Diário mais recente vale
/** Os documentos do Diário: undefined = lendo; null = não deu para ler. @type {any[]|null|undefined} */
let docsDiario;
let analisando = false;
let resultado = '';     // o HTML do relatório (ou do erro)
let versaoResultado = 0; // o relatório só é redesenhado quando muda: o coach pode estar editando o feedback

const abaVisivel = () => !!$('#tab-avaliacoes')?.classList.contains('active');

function esquecer() {
  alunoId = ''; docsDiario = undefined; resultado = ''; versaoResultado++;
}

/** A aba abriu: relê o Diário do aluno aberto (o relatório do mesmo aluno fica). */
async function abrir() {
  const a = estado.alunoAtual;
  if (!a) return;
  if (String(a.id) !== alunoId) { esquecer(); alunoId = String(a.id); }
  const minha = ++leitura;
  if (docsDiario === undefined) desenhar();
  let lidos = null;
  try {
    lidos = await carregarFotosDoDiario(a.email);
  } catch (e) {
    console.warn('Evolução visual: não deu para ler o Diário.', /** @type {any} */ (e)?.code || e);
  }
  if (minha !== leitura || String(a.id) !== alunoId) return;
  docsDiario = lidos;
  desenhar();
}

function desenhar() {
  const a = estado.alunoAtual;
  const lista = $('#evo-fotos'), botao = /** @type {HTMLButtonElement|null} */ ($('#btn-evolucao-ia')), res = $('#evo-resultado');
  if (!a || !lista || !botao || !res || String(a.id) !== alunoId) return;

  let escolhidas = 0;
  if (docsDiario === undefined) {
    lista.innerHTML = '<div class="prog-ph">Carregando as fotos…</div>';
  } else {
    const todas = fotosDoAluno(a, docsDiario);
    const fotos = escolherParaIA(todas);
    escolhidas = fotos.length;
    lista.innerHTML = (docsDiario === null ? '<p class="evo-nota">Não deu para ler o Diário de Evolução agora: só as fotos das avaliações.</p>' : '')
      + (fotos.length
        ? htmlFotosParaIA(fotos, todas.length)
        : '<div class="empty"><b>Sem fotos ainda</b>As fotos do Diário de Evolução do aluno e as das avaliações físicas aparecem aqui.</div>');
  }
  botao.disabled = analisando || escolhidas < 2;
  botao.title = !analisando && escolhidas < 2 ? 'A análise compara fotos: precisa de pelo menos 2.' : '';
  botao.textContent = analisando ? 'Analisando…' : '✨ Analisar Evolução com IA';
  if (res.dataset.versao !== String(versaoResultado)) {
    res.innerHTML = resultado;
    res.dataset.versao = String(versaoResultado);
  }
}

async function analisar() {
  const a = estado.alunoAtual;
  if (!a || analisando || docsDiario === undefined) return;
  const fotos = escolherParaIA(fotosDoAluno(a, docsDiario));
  if (fotos.length < 2) return;
  const id = String(a.id);
  analisando = true;
  resultado = `<div class="prog-ph">A IA está comparando ${fotos.length} fotos — leva até um minuto.</div>`;
  versaoResultado++;
  desenhar();
  let html = '';
  try {
    const r = await analisarEvolucao(pedidoParaIA(a, fotos));
    html = htmlRelatorio(r.relatorio, r.fotos);
  } catch (e) {
    html = `<p class="evo-erro" role="alert">${esc(/** @type {any} */ (e)?.message || 'Não deu para analisar as fotos agora.')}</p>`;
  }
  analisando = false;
  if (id === alunoId) { resultado = html; versaoResultado++; }
  desenhar();
}

/** Copia o feedback (como o coach deixou no campo). @param {HTMLButtonElement} botao */
async function copiarFeedback(botao) {
  const campo = /** @type {HTMLTextAreaElement|null} */ ($('#evo-feedback'));
  if (!campo) return;
  try {
    await navigator.clipboard.writeText(campo.value);
    botao.textContent = 'Copiado ✓';
  } catch {
    campo.select(); // sem permissão de área de transferência: fica selecionado para o Ctrl+C
    botao.textContent = 'Selecionado — Ctrl+C';
  }
  setTimeout(() => { botao.textContent = 'Copiar'; }, 2500);
}

/** Liga o card à página e ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarEvolucaoIA() {
  $('#btn-evolucao-ia')?.addEventListener('click', () => { void analisar(); });
  $('#evo-resultado')?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('#evo-copiar');
    if (b) void copiarFeedback(b);
  });
  on(EVENTOS.ABRIR_ABA, (nome) => { if (nome === 'avaliacoes') void abrir(); });
  on(EVENTOS.PERFIL_ABERTO, () => { esquecer(); if (abaVisivel()) void abrir(); });
  on(EVENTOS.ALUNOS_MUDARAM, () => { if (abaVisivel()) desenhar(); });
}
