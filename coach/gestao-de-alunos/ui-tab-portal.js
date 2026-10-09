// @ts-check
/**
 * Aba Portal do perfil — o Portal do Aluno deste aluno, em prévia.
 *
 * Abre a PÁGINA REAL do Portal num quadro e manda para ela a mesma fatia que
 * `publicarPortal` grava em `portal/{email}`. É a mesma função — por isso o que
 * aparece aqui é, por construção, o que o aluno vê: não existe uma segunda
 * implementação da tela para divergir.
 *
 * Por que mandar em vez de deixar a página buscar: a regra do Firestore só
 * permite ao ALUNO ler `portal/{email}`. O coach escreve, não lê. Como é ele
 * quem monta o documento, ele já tem o conteúdo — e a prévia não precisa (nem
 * ganha) permissão nenhuma a mais.
 *
 * Saiu do `app.js` no fatiamento. O acesso do aluno (criar conta, link de
 * senha, app liberado) NÃO mora aqui: fica na aba Dados, junto do e-mail que
 * ele usa (ui-tab-dados.js).
 *
 * Quando desenha: toda vez que a aba abre (a prévia volta para a semana atual).
 * Não há o que digitar, então não há rascunho a guardar. Com a aba aberta, uma
 * gravação ('alunos-mudaram') reenvia a fatia — a prévia acompanha a ficha.
 */
import * as db from './db.js?v=13';
import { fatia } from './portal-sync.js?v=13';
import { isoLocal } from './util/formato.js?v=13';
import { $ } from './util/dom.js?v=13';
import { estado, on, EVENTOS } from './estado.js?v=13';

/** A página da prévia, relativa à Gestão. `?previa=1` liga o modo no Portal. */
export const URL_PREVIA = '../../painel-do-aluno/previa.html';

let prvSemana = 0;   // 0 = semana de hoje; -1 = a anterior, e assim por diante
let prvPronto = false;
let urlPrevia = URL_PREVIA;

/** Segunda-feira da semana deslocada em `n` semanas, em ISO. @param {number} n */
function prvDataRef(n) {
  const d = new Date();
  d.setDate(d.getDate() + n * 7);
  return isoLocal(d);
}

/** O rótulo da semana mostrada. @param {number} n */
export function rotuloSemana(n) {
  return n === 0 ? 'Semana atual' : n < 0 ? `${-n} semana(s) atrás` : `${n} semana(s) à frente`;
}

/** A mensagem que a prévia recebe: a mesma fatia do `portal/{email}`. @param {any} a @param {number} semana */
export function mensagemPrevia(a, semana) {
  return {
    tipo: 'portal-previa',
    dados: fatia(a, db.listar(), db.diasFechados()),
    email: (a.email || '').toLowerCase(),
    hoje: prvDataRef(semana),
  };
}

function prvEnviar() {
  const a = estado.alunoAtual;
  const frame = /** @type {HTMLIFrameElement|null} */ ($('#prv-frame'));
  if (!a || !frame || !frame.contentWindow || !prvPronto) return;
  frame.contentWindow.postMessage(mensagemPrevia(a, prvSemana), location.origin);
  $('#prv-lbl').textContent = rotuloSemana(prvSemana);
}

function renderPortalPrevia() {
  const a = estado.alunoAtual;
  const frame = /** @type {HTMLIFrameElement|null} */ ($('#prv-frame'));
  if (!a || !frame) return;
  // Até a página nova avisar que está pronta, nada é enviado — nem para a
  // prévia do aluno anterior, que ainda pode estar no quadro.
  prvSemana = 0;
  prvPronto = false;
  if (!a.email) {
    $('#prv-lbl').textContent = 'Este aluno não tem e-mail cadastrado — sem e-mail não há Portal.';
    frame.removeAttribute('src');
    return;
  }
  // `previa.html` e não `index.html`: o index do portal antigo agora só redireciona
  // para o portal novo, que ainda não tem prévia; previa.html é o antigo, só para cá.
  frame.src = `${urlPrevia}?previa=1&t=${Date.now()}`;
}

/** A aba Portal está na tela? */
const visivel = () => !!$('#tab-portal')?.classList.contains('active') && !!$('#tela-perfil')?.classList.contains('active');

/**
 * Liga a aba ao barramento. Chamar uma vez, antes do resto do app.
 * @param {{ urlPrevia?: string }} [o] urlPrevia: a página posta no quadro — a
 *   vitrine troca pela dela, que não fala com a nuvem.
 */
export function iniciarTabPortal(o = {}) {
  urlPrevia = o.urlPrevia || URL_PREVIA;
  on(EVENTOS.ABRIR_ABA, (nome) => { if (nome === 'portal') renderPortalPrevia(); });
  // Gravou com a prévia aberta: manda a fatia nova, na mesma semana.
  on(EVENTOS.ALUNOS_MUDARAM, () => {
    if (!visivel() || !estado.alunoAtual) return;
    estado.alunoAtual = db.obter(estado.alunoAtual.id) || estado.alunoAtual;
    prvEnviar();
  });

  // O Portal avisa quando terminou de carregar; só então os dados são enviados —
  // mandar antes seria falar com uma página que ainda não tem quem escute.
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data && ev.data.tipo === 'portal-previa-pronto') { prvPronto = true; prvEnviar(); }
  });

  $('#prv-prev')?.addEventListener('click', () => { prvSemana -= 1; prvEnviar(); });
  $('#prv-next')?.addEventListener('click', () => { prvSemana += 1; prvEnviar(); });
  $('#prv-hoje')?.addEventListener('click', () => { prvSemana = 0; prvEnviar(); });
}
