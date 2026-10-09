// @ts-check
/**
 * Tela Fila de mensagens — o que o motor de automação sugere mandar no
 * WhatsApp, com o texto pronto, e o selo de contagem no botão da lista.
 *
 * Nada sai sozinho. "Enviar" abre a conversa (wa.me) com o texto, marca a
 * mensagem como enviada e deixa a linha "WhatsApp · …" na aba Registros do
 * aluno; "Descartar" só tira da fila. Nos dois casos a mensagem não volta
 * (o anti-spam é das regras: automacao-regras.js).
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'automacao') e sempre que a
 * fila ('automacao-mudou') ou os alunos ('alunos-mudaram') mudam com a tela
 * aberta — a baixa numa outra tela tira a cobrança daqui. O selo do botão é
 * refeito nos mesmos momentos, com a tela aberta ou não.
 */
import * as db from './db.js?v=12';
import { brl, rotuloMesFin } from './financeiro-aluno.js?v=12';
import { GATILHOS } from './automacao-regras.js?v=12';
import { mensagens, marcarMensagem } from './automacao.js?v=12';
import { esc, waMsg } from './util/formato.js?v=12';
import { $ } from './util/dom.js?v=12';
import { on, EVENTOS } from './estado.js?v=12';
import { reg } from './registro.js?v=12';
import { telaAtual } from './navegacao.js?v=12';

/** @type {{ abrir: (url: string) => void }} */
let deps = { abrir: (url) => { window.open(url, '_blank', 'noopener'); } };

/** O detalhe da linha: quanto e de quando. @param {import('./automacao-regras.js').Mensagem} m */
function detalhe(m) {
  const d = m.dados;
  if (m.gatilho === 'cobranca-vencida') return `${brl(d.valor)} · venceu há ${Math.abs(d.dias)} dia${Math.abs(d.dias) === 1 ? '' : 's'}`;
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
  $('#auto-list').innerHTML = grupos
    || `<div class="empty"><b>Nenhuma mensagem na fila</b>Quando uma mensalidade vencer ou um pagamento entrar, a mensagem aparece aqui pronta para enviar.</div>`;
}

/** Enviar: abre o WhatsApp, marca e registra — uma vez só, mesmo com dois toques. @param {string} chave */
function enviar(chave) {
  const m = mensagens().find((x) => x.chave === chave);
  if (!m || !m.temTelefone) return;
  if (!marcarMensagem(chave, 'enviada')) return;
  deps.abrir(waMsg(m.telefone, m.texto));
  reg('mensagem-enviada', db.obter(m.alunoId) || { id: m.alunoId, nome: m.nome }, `WhatsApp · ${m.rotulo} · ${detalhe(m)}`, { chave: `mensagem:${chave}` });
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
    else if (b.classList.contains('auto-descartar')) marcarMensagem(b.dataset.chave, 'descartada');
  });
}
