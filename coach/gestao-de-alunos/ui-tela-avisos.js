// @ts-check
/**
 * Tela Aviso em massa — uma mensagem, e um botão de WhatsApp por aluno ativo.
 *
 * Saiu do `app.js` no fatiamento. Quem recebe mora em comunicacao-regras.js
 * (`destinatariosDoAviso`). O "enviado ✓" vale só nesta sessão: é para o coach
 * não se perder na fila, não um registro.
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'aviso') e a cada envio.
 */
import * as db from './db.js?v=13';
import { destinatariosDoAviso } from './comunicacao-regras.js?v=13';
import { esc, waMsg } from './util/formato.js?v=13';
import { $ } from './util/dom.js?v=13';
import { on, EVENTOS } from './estado.js?v=13';
import { avisar as avisarReal } from '../../compartilhado/ui/dialogo.js?v=13';

const AVISO_TPLS = [
  'Amanhã não tem aula! ⚠️',
  'Bom treino a todos! 💪',
  'Lembrete: sua mensalidade vence esta semana. 🙏',
  'Atenção: novo horário a partir de segunda-feira.',
];
/** Quem já recebeu nesta sessão. */
const avisoEnviados = new Set();

/** @type {{ listar: () => any[], avisar: (o: any) => any, abrir: (url: string) => void, copiar: (t: string) => Promise<void> }} */
let deps = { listar: db.listar, avisar: avisarReal, abrir: (u) => { window.open(u, '_blank'); }, copiar: (t) => navigator.clipboard.writeText(t) };

function renderAviso() {
  $('#aviso-tpls').innerHTML = AVISO_TPLS.map((t) => `<button class="aviso-tpl" type="button" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  const alunos = destinatariosDoAviso(deps.listar());
  $('#aviso-count').textContent = `${avisoEnviados.size} de ${alunos.length} enviados`;
  $('#aviso-list').innerHTML = alunos.length ? alunos.map((a) => {
    const env = avisoEnviados.has(a.id);
    return `<div class="aviso-row${env ? ' enviado' : ''}">
      <div class="aviso-info"><div class="fin-nome">${esc(a.nome)}</div><div class="fin-sub">${esc(a.telefone)}</div></div>
      ${env ? '<span class="aviso-ok">Enviado ✓</span>' : ''}
      <button class="btn ${env ? 'ghost ' : ''}btn-sm aviso-send" data-id="${esc(a.id)}" data-tel="${esc(a.telefone)}" type="button">${env ? 'Reenviar' : 'Enviar'}</button>
    </div>`;
  }).join('') : `<div class="empty"><b>Nenhum destinatário</b>Cadastre alunos ativos com telefone/WhatsApp para avisar aqui.</div>`;
}

/**
 * Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarTelaAvisos(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'aviso') renderAviso(); });
  $('#aviso-tpls')?.addEventListener('click', (/** @type {any} */ e) => { const c = e.target.closest('.aviso-tpl'); if (c) { $('#aviso-msg').value = c.dataset.t; $('#aviso-msg').focus(); } });
  $('#aviso-copiar')?.addEventListener('click', async () => {
    const m = $('#aviso-msg').value.trim(); if (!m) return;
    try { await deps.copiar(m); const b = $('#aviso-copiar'), t = b.textContent; b.textContent = 'Copiado ✓'; setTimeout(() => (b.textContent = t), 1500); } catch {}
  });
  $('#aviso-list')?.addEventListener('click', (/** @type {any} */ e) => {
    const b = e.target.closest('.aviso-send'); if (!b) return;
    const msg = $('#aviso-msg').value.trim();
    if (!msg) { deps.avisar({ texto: 'Escreva a mensagem primeiro.' }); $('#aviso-msg').focus(); return; }
    const link = waMsg(b.dataset.tel, msg);
    if (link) deps.abrir(link);
    avisoEnviados.add(b.dataset.id);
    renderAviso();
  });
}
