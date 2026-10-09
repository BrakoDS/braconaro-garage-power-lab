// @ts-check
/**
 * O roteador de telas da Gestão.
 *
 * Uma tela é uma `<section class="screen" id="tela-{nome}">`. Para mostrar uma,
 * emite-se 'abrir-tela' com o nome — de um botão com `data-tela="{nome}"` (os
 * da barra da lista e os "← Voltar"), ou do código (o perfil, ao abrir).
 *
 * O roteador só MOSTRA a tela. Quem a desenha é ela mesma, ouvindo o próprio
 * nome no mesmo evento — como as abas do perfil com 'abrir-aba'. Antes, cada
 * uma das nove telas ligava o próprio botão de entrar e o de voltar, e cada
 * "voltar" repetia `renderLista(); mostrarTela('tela-lista')`.
 *
 * Ligar antes das telas (main.js): este ouvinte vem primeiro, então a tela já
 * está visível quando o módulo dela desenha.
 */
import { on, emit, EVENTOS } from './estado.js?v=13';

/** As telas que existem, na ordem da barra. */
export const TELAS = Object.freeze(['lista', 'perfil', 'checkin', 'agenda', 'financeiro', 'cobrancas', 'aviso', 'mural', 'desafios', 'leads', 'automacao']);

/** A tela à mostra agora. */
let atual = 'lista';

/** O nome da tela à mostra. */
export function telaAtual() { return atual; }

/** Mostra a tela `nome` e esconde as outras. @param {string} nome */
function mostrar(nome) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === 'tela-' + nome);
  atual = nome;
  window.scrollTo(0, 0);
}

/** Liga o roteador. Chamar uma vez, antes de qualquer tela. */
export function iniciarNavegacao() {
  on(EVENTOS.ABRIR_TELA, (nome) => {
    // Nome desconhecido não esconde tudo: a tela atual fica, e o erro aparece.
    if (!TELAS.includes(nome)) { console.error(`abrir-tela: tela desconhecida "${nome}"`); return; }
    mostrar(nome);
  });
  on(EVENTOS.VOLTAR_LISTA, () => emit(EVENTOS.ABRIR_TELA, 'lista'));
  // Um ouvinte para todos os botões de navegação.
  document.addEventListener('click', (e) => {
    const b = /** @type {any} */ (e.target)?.closest?.('[data-tela]');
    if (b && b.dataset && b.dataset.tela) emit(EVENTOS.ABRIR_TELA, b.dataset.tela);
  });
}
