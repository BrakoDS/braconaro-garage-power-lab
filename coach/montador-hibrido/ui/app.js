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

function irPara(aba) {
  if (!ABAS.includes(aba)) return;
  for (const b of document.querySelectorAll('.tab')) {
    b.classList.toggle('active', b.getAttribute('data-view') === aba);
  }
  for (const v of document.querySelectorAll('.view')) {
    v.classList.toggle('active', v.id === `view-${aba}`);
  }
  document.dispatchEvent(new CustomEvent('hibrido:aba', { detail: aba }));
  // O topo da tela, não a posição anterior: a aba nova começa do começo.
  window.scrollTo({ top: 0, behavior: 'instant' });
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

irPara('lousa');
