// @ts-check
/**
 * A COSTURA das quatro telas do Montador Híbrido.
 *
 * Carregado por `gate.js` só depois do login, e é ele que passa o `uid` adiante:
 * os quatro módulos precisam dele para falar com o Firestore, e nenhum vai
 * buscá-lo por conta própria — quem tem a sessão é quem entrega.
 *
 * A troca de aba dispara um evento (`hibrido:aba`) em vez de chamar cada módulo.
 * O Dashboard de Volume é o motivo: ele faz várias leituras do Firestore e não
 * pode carregar no boot, senão todo coach que abre a ferramenta só para montar a
 * aula de hoje paga por um mês de consolidado que não vai olhar. Ele escuta o
 * evento e carrega na primeira vez que a aba aparece.
 */
import { usuario } from '../../../compartilhado/firebase/cloud.js';
import * as lousa from './lousa.js';
import * as variabilidade from './variabilidade.js';
import * as distribuicao from './distribuicao.js';
import * as dashboard from './dashboard-volume.js';
import * as calendario from './calendario.js';
import * as store from './store.js';

const ABAS = ['lousa', 'alertas', 'turma', 'volume', 'calendario'];

/** O uid do coach logado. Lido a cada chamada porque a sessão pode ser renovada. */
const uid = () => usuario()?.uid || '';

/**
 * A aba viaja no HASH da URL (`#calendario`), e não no localStorage.
 *
 * Três coisas que o localStorage não dá: o F5 volta para onde estava (que é o
 * pedido), o botão VOLTAR do navegador anda entre as abas em vez de sair da
 * ferramenta, e o coach pode mandar o link de uma aba para si mesmo no celular.
 *
 * E uma que ele daria e não queremos: memória entre SESSÕES. Abrir a ferramenta
 * amanhã de manhã no Dashboard de Volume, porque foi ali que ele parou ontem à
 * noite, seria lembrar demais — quem abre o Montador vai montar a aula de hoje.
 *
 * @param {string} aba
 * @param {{daUrl?: boolean}} [opcoes] `daUrl` evita reescrever o hash que
 *   acabou de mudar — sem isso, voltar pelo navegador entra em laço.
 */
function irPara(aba, { daUrl = false } = {}) {
  if (!ABAS.includes(aba)) return;
  for (const b of document.querySelectorAll('.tab')) {
    b.classList.toggle('active', b.getAttribute('data-view') === aba);
  }
  for (const v of document.querySelectorAll('.view')) {
    v.classList.toggle('active', v.id === `view-${aba}`);
  }
  if (!daUrl && abaDoHash() !== aba) window.location.hash = aba;
  document.dispatchEvent(new CustomEvent('hibrido:aba', { detail: aba }));
  // O topo da tela, não a posição anterior: a aba nova começa do começo.
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/** A aba escrita na URL, ou '' quando não há nenhuma válida. */
function abaDoHash() {
  const bruto = decodeURIComponent(String(window.location.hash || '').replace(/^#/, '')).trim();
  return ABAS.includes(bruto) ? bruto : '';
}

const ctx = { uid, irPara };

for (const b of document.querySelectorAll('.tab')) {
  b.addEventListener('click', () => irPara(b.getAttribute('data-view') || 'lousa'));
}

// Cada módulo monta a sua aba. Um `try` por módulo, e não um em volta dos
// quatro: se o canvas falhar num navegador antigo, o Dashboard de Volume não
// tem por que cair junto — e o coach ainda consegue olhar o volume da semana.
for (const [nome, mod] of Object.entries({ lousa, variabilidade, distribuicao, dashboard, calendario })) {
  try {
    mod.montar(ctx);
  } catch (e) {
    console.error(`Falha ao montar o módulo "${nome}":`, e);
  }
}

// A aba inicial só é ativada DEPOIS de montar os módulos: é `irPara` que
// dispara `hibrido:aba`, e quem carrega no evento (Volume e Calendário) precisa
// já estar escutando. Ativar antes faria um F5 no Calendário abrir a aba certa
// e vazia, que é pior que voltar para a Lousa.
irPara(abaDoHash() || 'lousa', { daUrl: true });

// Voltar/avançar do navegador troca de aba, em vez de sair da ferramenta.
window.addEventListener('hashchange', () => {
  const aba = abaDoHash();
  if (aba) irPara(aba, { daUrl: true });
});

/** Indicador de etapa: mostra em quais abas já há trabalho feito. */
function marcarProgresso() {
  const est = store.ler();
  const feito = { lousa: !!est.treino, alertas: !!est.alertas, turma: !!est.fichas?.length, volume: false, calendario: false };
  for (const b of document.querySelectorAll('.tab')) {
    b.classList.toggle('feito', !!feito[b.getAttribute('data-view') || '']);
  }
}
store.aoMudar(marcarProgresso);
marcarProgresso();
