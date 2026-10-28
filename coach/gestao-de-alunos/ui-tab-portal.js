// @ts-check
/**
 * A prévia do Portal do Aluno deste aluno — o segmento "Prévia do Portal" do
 * card Histórico, na aba Histórico (ui-tab-historico.js abre e troca os
 * segmentos). O quadro só carrega quando o coach escolhe a prévia: abrir a
 * aba não puxa o Portal inteiro à toa.
 *
 * Abre a PÁGINA REAL do Portal novo (`/previa` do portal-aluno-web, no mesmo
 * Hosting e no mesmo deploy do portal) num quadro. Ela desenha o mesmo
 * componente que o aluno vê, com as mesmas consultas — treino do dia, cargas,
 * "Última vez", semana do box —, num pacote em que o Firebase não grava. Não
 * existe uma segunda implementação da tela para divergir, nem uma cópia que
 * fica para trás quando o portal muda.
 *
 * Quem lê lá dentro é o coach: o quadro é de outro site, então ele entra com a
 * conta dele uma vez no próprio quadro. As regras deixam o coach ler tudo do
 * aluno, menos `portal/{email}` (só o ALUNO lê; o coach escreve). Esse a Gestão
 * manda por mensagem: a mesma fatia que `publicarPortal` grava lá — é a mesma
 * função.
 *
 * Saiu do `app.js` no fatiamento. O acesso do aluno (criar conta, link de
 * senha, app liberado) NÃO mora aqui: fica no card Acesso da aba Geral
 * (ui-tab-geral.js) e no menu ⋯ do cabeçalho (ui-acoes-aluno.js).
 *
 * Quando desenha: toda vez que o segmento é escolhido. Não há o que digitar,
 * então não há rascunho a guardar. Com a prévia na tela, uma gravação
 * ('alunos-mudaram') reenvia a fatia — a prévia acompanha a ficha. Perfil
 * reaberto: o quadro esvazia (nada do aluno anterior).
 */
import * as db from './db.js?v=27';
import { fatia } from './portal-sync.js?v=27';
import { $ } from './util/dom.js?v=27';
import { estado, on, EVENTOS } from './estado.js?v=27';

/** A prévia do Portal novo. Outros dias e semanas o coach abre lá dentro, no cronograma do Treino. */
export const URL_PREVIA = 'https://portal-garagepowerlab.web.app/previa';

let prvPronto = false;
let urlPrevia = URL_PREVIA;
/** Só desta origem a Gestão aceita o "pronto", e só para ela manda a ficha. */
let origemPrevia = '';

/** A mensagem que a prévia recebe: a mesma fatia do `portal/{email}`. @param {any} a */
export function mensagemPrevia(a) {
  return {
    tipo: 'portal-previa',
    dados: fatia(a, db.listar(), db.diasFechados()),
    email: (a.email || '').toLowerCase(),
  };
}

const quadro = () => /** @type {HTMLIFrameElement|null} */ ($('#prv-frame'));

function prvEnviar() {
  const a = estado.alunoAtual;
  const frame = quadro();
  if (!a || !frame || !frame.contentWindow || !prvPronto) return;
  frame.contentWindow.postMessage(mensagemPrevia(a), origemPrevia);
}

/** Põe a prévia do aluno aberto no quadro. A aba Histórico chama. */
export function abrirPrevia() {
  const a = estado.alunoAtual;
  const frame = quadro();
  if (!a || !frame) return;
  // Até a página nova avisar que está pronta, nada é enviado — nem para a
  // prévia do aluno anterior, que ainda pode estar no quadro.
  prvPronto = false;
  if (!a.email) {
    $('#prv-lbl').textContent = 'Este aluno não tem e-mail cadastrado — sem e-mail não há Portal.';
    frame.removeAttribute('src');
    return;
  }
  $('#prv-lbl').textContent = `Portal de ${a.email.toLowerCase()}`;
  frame.src = `${urlPrevia}?t=${Date.now()}`;
}

/** A prévia está na tela (aba Histórico aberta, neste segmento)? */
const visivel = () => !!$('#tab-historico')?.classList.contains('active') && !$('#hi-portal')?.hidden && !!$('#tela-perfil')?.classList.contains('active');

/**
 * Liga a aba ao barramento. Chamar uma vez, antes do resto do app.
 * @param {{ urlPrevia?: string }} [o] urlPrevia: a página posta no quadro — a
 *   vitrine troca pela dela, que não fala com a nuvem.
 */
export function iniciarTabPortal(o = {}) {
  urlPrevia = o.urlPrevia || URL_PREVIA;
  origemPrevia = new URL(urlPrevia, location.href).origin;
  // Outro aluno: o quadro esvazia até a prévia ser escolhida de novo.
  on(EVENTOS.PERFIL_ABERTO, () => { prvPronto = false; quadro()?.removeAttribute('src'); });
  // Gravou com a prévia aberta: manda a fatia nova.
  on(EVENTOS.ALUNOS_MUDARAM, () => {
    if (!visivel() || !estado.alunoAtual) return;
    estado.alunoAtual = db.obter(estado.alunoAtual.id) || estado.alunoAtual;
    prvEnviar();
  });

  // O Portal avisa quando terminou de carregar; só então os dados são enviados —
  // mandar antes seria falar com uma página que ainda não tem quem escute. Só
  // vale o aviso do nosso quadro, vindo do endereço da prévia.
  window.addEventListener('message', (ev) => {
    if (ev.origin !== origemPrevia || !ev.source || ev.source !== quadro()?.contentWindow) return;
    if (ev.data && ev.data.tipo === 'portal-previa-pronto') { prvPronto = true; prvEnviar(); }
  });
}
