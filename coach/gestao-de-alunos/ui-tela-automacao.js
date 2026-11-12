// @ts-check
/**
 * Tela Fila de mensagens — o que o motor de automação sugere mandar no
 * WhatsApp, com o texto pronto, e o selo de contagem no botão da lista: a
 * régua de pagamento, os créditos vencendo e as faltas (a rotina das 7h, etapa
 * 8), os recibos e as propostas aprovadas dos agentes. No topo, os avisos só
 * para o coach: o mês a fechar e as pendências (quem passou do vencimento + 1).
 *
 * Nada sai sozinho. "Enviar" abre a conversa do WhatsApp com o texto, marca a
 * mensagem como enviada e deixa a linha "WhatsApp · …" na aba Registros do
 * aluno; "Descartar" só tira da fila. Nos dois casos a mensagem não volta
 * (o anti-spam é das regras: automacao-regras.js).
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'automacao') e sempre que a
 * fila ('automacao-mudou') ou os alunos ('alunos-mudaram') mudam com a tela
 * aberta — a baixa numa outra tela tira a cobrança daqui. O selo do botão é
 * refeito nos mesmos momentos, com a tela aberta ou não.
 */
import * as db from './db.js?v=40';
import { brl, rotuloMesFin } from './financeiro-aluno.js?v=40';
import { GATILHOS } from './automacao-regras.js?v=40';
import { rotuloDoTime } from './agentes-regras.js?v=40';
import { mensagens, marcarMensagem, avisos } from './automacao.js?v=40';
import { esc, waMsg } from './util/formato.js?v=40';
import { $ } from './util/dom.js?v=40';
import { on, EVENTOS } from './estado.js?v=40';
import { reg } from './registro.js?v=40';
import { telaAtual } from './navegacao.js?v=40';

/** @type {{ abrir: (url: string) => void }} */
let deps = { abrir: (url) => { window.open(url, '_blank', 'noopener'); } };

/** 'AAAA-MM-DD' → 'DD/MM'. @param {unknown} iso */
const ddmm = (iso) => { const s = String(iso || ''); return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : s; };

/** O detalhe da linha: quanto e de quando. @param {import('./automacao-regras.js').Mensagem} m */
function detalhe(m) {
  const d = m.dados;
  if (m.gatilho === 'agente') return `${rotuloDoTime(d.time)} · proposta aprovada`;
  if (m.gatilho === 'credito-vencendo') return `crédito vence ${ddmm(d.expira)}`;
  if (m.gatilho === 'falta-seguida') return `faltou ${(Array.isArray(d.dias) ? d.dias : []).map(ddmm).join(' e ')}`;
  if (GATILHOS[m.gatilho] && GATILHOS[m.gatilho].fonte === 'rotina') return rotuloMesFin(d.mesId);
  return `${brl(d.valor)} · ${rotuloMesFin(d.mesId)}`;
}

/** Uma mensagem da fila. @param {import('./automacao-regras.js').Mensagem} m */
function linha(m) {
  const k = esc(m.chave);
  const enviar = m.temTelefone
    ? `<button class="btn btn-sm cob-wa auto-enviar" data-chave="${k}" type="button">Enviar no WhatsApp</button>`
    : `<span class="cob-semtel">sem telefone na ficha</span>`;
  return `<div class="auto-row auto-${esc(m.gatilho)}">
      <div class="auto-cab"><div class="cob-info"><div class="fin-nome">${esc(m.nome)}</div><div class="fin-sub">${esc(detalhe(m))}</div></div>
        <span class="auto-tag">${esc(m.rotulo)}</span></div>
      <p class="auto-texto">${esc(m.texto)}</p>
      <div class="auto-acoes">${enviar}<button class="btn ghost btn-sm auto-descartar" data-chave="${k}" type="button">Descartar</button></div>
    </div>`;
}

/** O selo com a contagem no botão "Fila de mensagens" da lista. @param {number} n */
function selo(n) {
  const btn = $('#btn-automacao'); if (!btn) return;
  let badge = btn.querySelector('.btn-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'btn-badge'; btn.appendChild(badge); }
  badge.textContent = String(n);
  badge.title = `${n} mensage${n === 1 ? 'm' : 'ns'} esperando envio`;
}

/** Refaz o selo (e a tela, se aberta). Chamado também pelo boot, depois de entrar. */
export function atualizarFilaDeMensagens() {
  const lista = mensagens();
  selo(lista.length);
  if (telaAtual() !== 'automacao') return;
  const grupos = Object.entries(GATILHOS).map(([g, info]) => {
    const doGrupo = lista.filter((m) => m.gatilho === g);
    return doGrupo.length ? `<h4 class="cob-grupo">${esc(info.grupo)}</h4>${doGrupo.map(linha).join('')}` : '';
  }).join('');
  $('#auto-list').innerHTML = htmlAvisos(avisos()) + (grupos
    || `<div class="empty"><b>Nenhuma mensagem na fila</b>A rotina das 7h põe aqui a régua de pagamento, os créditos vencendo e as faltas; um pagamento põe o recibo.</div>`);
}

/**
 * Os avisos só para o coach (etapa 8), no topo: o mês a fechar, com o botão que
 * abre o Financeiro, e as pendências — quem passou do vencimento + 1 sem pagar
 * (sem mensagem pronta: o caso é seu, decisão 4).
 * @param {{ fechar: string[], pendencias: { alunoId: string, nome: string, mesId: string, valor: number, diasAtraso: number }[] }} av
 */
function htmlAvisos(av) {
  const fechar = av.fechar.map((mes) => `<div class="auto-aviso auto-aviso-fechar"><span>🔒 Feche <b>${esc(rotuloMesFin(mes))}</b>: o mês ainda não foi fechado.</span>`
    + `<button class="btn btn-sm" data-tela="financeiro" type="button">Abrir o Financeiro</button></div>`).join('');
  const pend = av.pendencias.length ? `<div class="auto-aviso auto-aviso-pend"><b>Pendências</b> · passaram do vencimento + 1 sem pagar (sem mensagem pronta: o caso é seu)<ul>`
    + av.pendencias.map((p) => `<li>${esc(p.nome)} · ${esc(rotuloMesFin(p.mesId))} · ${esc(brl(p.valor))} · ${p.diasAtraso} dia${p.diasAtraso === 1 ? '' : 's'} de atraso</li>`).join('')
    + '</ul></div>' : '';
  return fechar + pend;
}

/**
 * O rastro da Fila (etapa 5): a ROTINA propôs a mensagem (pela Fila, quando a
 * ação aconteceu ou a condição apareceu) e o COACH decidiu — enviar é aprovar,
 * descartar é recusar.
 * @param {any} m a mensagem @param {'aprovada'|'recusada'} decisao
 */
function rastroDaFila(m, decisao) {
  // A mensagem de um agente (etapa 7) foi proposta por ele, não pela rotina da Fila.
  const por = m.gatilho === 'agente' ? { tipo: 'agente', nome: rotuloDoTime(m.dados.time) } : { tipo: 'rotina' };
  return {
    proposta: { por, via: m.gatilho === 'agente' ? 'funcao' : 'fila', ...(Number(m.criadaEm) > 0 ? { em: Number(m.criadaEm) } : {}) },
    aprovacao: { por: { tipo: 'coach' }, em: Date.now(), decisao },
  };
}

/** Enviar: abre o WhatsApp, marca e registra — uma vez só, mesmo com dois toques. @param {string} chave */
function enviar(chave) {
  const m = mensagens().find((x) => x.chave === chave);
  if (!m || !m.temTelefone) return;
  if (!marcarMensagem(chave, 'enviada')) return;
  deps.abrir(waMsg(m.telefone, m.texto));
  reg('mensagem-enviada', db.obter(m.alunoId) || { id: m.alunoId, nome: m.nome }, `WhatsApp · ${m.rotulo} · ${detalhe(m)}`, { chave: `mensagem:${chave}`, ...rastroDaFila(m, 'aprovada') });
}

/** Descartar: marca e deixa o rastro "Sugestão descartada" (proposta recusada) — uma vez só. @param {string} chave */
function descartar(chave) {
  const m = mensagens().find((x) => x.chave === chave);
  if (!marcarMensagem(chave, 'descartada') || !m) return;
  reg('mensagem-descartada', db.obter(m.alunoId) || { id: m.alunoId, nome: m.nome }, `Sugestão descartada · ${m.rotulo} · ${detalhe(m)}`,
    { chave: `mensagem-descartada:${chave}`, situacao: 'recusada', ...rastroDaFila(m, 'recusada') });
}

/**
 * Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (a vitrine troca o WhatsApp)
 */
export function iniciarTelaAutomacao(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'automacao' || t === 'lista') atualizarFilaDeMensagens(); });
  on(EVENTOS.AUTOMACAO_MUDOU, atualizarFilaDeMensagens);
  on(EVENTOS.ALUNOS_MUDARAM, atualizarFilaDeMensagens);
  $('#auto-list')?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('[data-chave]');
    if (!b) return;
    if (b.classList.contains('auto-enviar')) enviar(b.dataset.chave);
    else if (b.classList.contains('auto-descartar')) descartar(b.dataset.chave);
  });
}
