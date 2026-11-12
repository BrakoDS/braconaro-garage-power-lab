// @ts-check
/**
 * Tela "Aprovações" (Fase 1 · etapa 7, decisão 13 do ESCOPO): o que os agentes
 * PROPUSERAM e espera o coach. Os agentes só leem e propõem; nada acontece sem
 * o ok daqui.
 *
 * Aprovar executa conforme o tipo (agentes-regras.js, `planoDaAprovacao`):
 *  - mensagem → vai para a Fila de mensagens, pronta para enviar;
 *  - meta → a meta entra na ficha do aluno;
 *  - baixa → abre a janela de baixa já preenchida; a proposta só fica aprovada
 *    quando a baixa é confirmada nela;
 *  - divergência e pendência de ficha → "ciente".
 * Recusar pede o motivo. As duas decisões deixam a linha nos Registros, com
 * quem propôs e quem decidiu.
 *
 * Embaixo, o log das chamadas dos agentes (quem, o quê, quantos registros,
 * quando) — sem os dados devolvidos, que nunca são guardados.
 */
import * as db from './db.js?v=40';
import { $ } from './util/dom.js?v=40';
import { esc } from './util/formato.js?v=40';
import { htmlProposta, htmlDecididas, htmlLog } from './aprovacoes-html.js?v=40';
import { estado, on, EVENTOS } from './estado.js?v=40';
import { reg } from './registro.js?v=40';
import { telaAtual } from './navegacao.js?v=40';
import { confirmar, pedirMotivo, avisar } from '../../compartilhado/ui/dialogo.js?v=40';
import * as calc from '../../compartilhado/regras/calc.js?v=40';
import { metasCorporaisDe, patchDeMetas } from './metas-grupo.js?v=40';
import { propostas, logDosAgentes, decidir } from './propostas-db.js?v=40';
import { adicionarMensagemDoAgente } from './automacao.js?v=40';
import { abrirPagamento } from './ui-tab-financeiro.js?v=40';
import {
  pendentes, descricaoDaProposta, planoDaAprovacao, decidirProposta, rotuloDoTime,
} from './agentes-regras.js?v=40';

/* ============================================================
   DOM
   ============================================================ */

const visivel = () => telaAtual() === 'aprovacoes';

/** O número de pendentes no botão da tela. */
function atualizarBadge() {
  const btn = $('#btn-aprovacoes'); if (!btn) return;
  const n = pendentes(propostas()).length;
  let badge = btn.querySelector('.btn-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'btn-badge'; btn.appendChild(badge); }
  badge.textContent = String(n);
  badge.title = `${n} proposta${n === 1 ? '' : 's'} esperando a sua decisão`;
}

function render() {
  atualizarBadge();
  if (!visivel()) return;
  const lista = $('#apr-lista'), log = $('#apr-log');
  if (!lista || !log) return;
  const esperando = pendentes(propostas());
  lista.innerHTML = (esperando.length
    ? esperando.map(htmlProposta).join('')
    : '<div class="empty"><b>Nada esperando</b>Quando um agente propuser uma ação, ela aparece aqui para você aprovar ou recusar.</div>')
    + htmlDecididas(Object.values(propostas()));
  log.innerHTML = htmlLog(logDosAgentes(), Date.now());
}

/**
 * Grava a decisão e a linha dos Registros. false quando não deu (a proposta
 * já foi decidida noutro aparelho, ou a gravação falhou).
 * @param {any} p @param {'aprovada'|'recusada'} decisao @param {string} [motivo]
 */
async function gravarDecisao(p, decisao, motivo = '') {
  const r = decidirProposta(p, decisao, { em: Date.now(), motivo });
  if (!r) return false;
  try {
    await decidir(estado.uid, p.id, r.patch);
  } catch (e) {
    console.warn('[aprovações] a decisão não foi gravada.', /** @type {any} */ (e)?.code || e);
    await avisar({ titulo: 'Não deu para gravar', texto: 'A decisão não foi gravada (a proposta pode ter sido decidida noutro aparelho). Confira a internet e tente de novo.' });
    return false;
  }
  const aluno = db.obter(p.alunoId) || { id: p.alunoId, nome: p.alunoNome || '' };
  const { tipo, resumo, ...extra } = r.log;
  reg(tipo, aluno, resumo, { ...extra, chave: `decisao:${p.id}` });
  return true;
}

/** A meta nova de uma proposta aprovada, com a base da última avaliação (como o card de metas faz). @param {any} a @param {any} plano */
function metaNova(a, plano) {
  const avs = (a.avaliacoes || []).filter((/** @type {any} */ x) => x.dataRealizada)
    .sort((/** @type {any} */ x, /** @type {any} */ y) => (x.dataRealizada < y.dataRealizada ? -1 : 1));
  const ultima = avs[avs.length - 1];
  return {
    id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tipo: plano.tipo, alvo: plano.alvo,
    base: calc.valorMetrica(plano.tipo, ultima, a), baseData: ultima?.dataRealizada || null, criadoEm: Date.now(),
    ...(plano.prazo ? { prazo: plano.prazo } : {}),
  };
}

/** @param {string} id */
async function aprovar(id) {
  const p = propostas()[id];
  if (!p || p.situacao !== 'proposta') return;
  const plano = planoDaAprovacao(p);
  if (plano.acao === 'baixa') {
    // A baixa é confirmada na janela de sempre; só então a proposta fica aprovada.
    const abriu = abrirPagamento(plano.alunoId, plano.mesId, () => { void gravarDecisao(p, 'aprovada'); }, { valor: plano.valor, data: plano.data, meio: plano.meio });
    if (!abriu) await avisar({ titulo: 'A conta não está aberta', texto: 'Essa conta já está paga, não tem valor ou é de outro aluno. Se a proposta não serve mais, recuse com o motivo.' });
    return;
  }
  const a = db.obter(plano.alunoId);
  if (!a) { await avisar({ titulo: 'Aluno não encontrado', texto: 'A ficha desse aluno não existe mais. Recuse a proposta com o motivo.' }); return; }
  if (plano.acao === 'fila') {
    if (!await confirmar({ titulo: 'Aprovar a mensagem?', texto: `A mensagem para <b>${esc(a.nome || '')}</b> vai para a Fila de mensagens, pronta para você enviar pelo WhatsApp.`, ok: 'Aprovar' })) return;
    adicionarMensagemDoAgente(p);
  } else if (plano.acao === 'meta') {
    if (!await confirmar({ titulo: 'Aprovar a meta?', texto: `${esc(descricaoDaProposta(p))} — entra na ficha de <b>${esc(a.nome || '')}</b>, e ele acompanha no Portal.`, ok: 'Aprovar' })) return;
    db.atualizar(a.id, patchDeMetas(a, [...metasCorporaisDe(a), metaNova(a, plano)]));
  } else if (!await confirmar({ titulo: 'Marcar como ciente?', texto: `${esc(descricaoDaProposta(p))}. Nada muda na ficha.`, ok: 'Ciente' })) {
    return;
  }
  await gravarDecisao(p, 'aprovada');
}

/** @param {string} id */
async function recusar(id) {
  const p = propostas()[id];
  if (!p || p.situacao !== 'proposta') return;
  const motivo = await pedirMotivo({
    titulo: 'Recusar a proposta?', texto: `${esc(rotuloDoTime(p.time))} · ${esc(descricaoDaProposta(p))}. Por que está recusando?`,
    ok: 'Recusar', placeholder: 'Ex.: o aluno já pagou; não é o tom certo', perigo: true,
  });
  if (motivo === null) return;
  if (!motivo) { await avisar({ titulo: 'Falta o motivo', texto: 'Para recusar, escreva o motivo: ele fica nos Registros e ajuda o agente a errar menos. Nada foi recusado.' }); return; }
  await gravarDecisao(p, 'recusada', motivo);
}

export function iniciarTelaAprovacoes() {
  on(EVENTOS.PROPOSTAS_MUDARAM, render);
  on(EVENTOS.ABRIR_TELA, (/** @type {string} */ nome) => { if (nome === 'aprovacoes') render(); });
  $('#tela-aprovacoes')?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('[data-apr]'); if (!b || b.disabled) return;
    if (b.dataset.apr === 'aprovar') void aprovar(b.dataset.id);
    else if (b.dataset.apr === 'recusar') void recusar(b.dataset.id);
  });
  atualizarBadge();
}
