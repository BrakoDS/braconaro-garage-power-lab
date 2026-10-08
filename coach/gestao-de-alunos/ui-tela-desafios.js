// @ts-check
/**
 * Tela Desafios da Semana — os desafios que aparecem nas Conquistas do aluno:
 * publicar (com ícone, meta de dias e categoria), editar, ocultar/reativar e
 * excluir.
 *
 * Saiu do `app.js` no fatiamento. A lógica da lista é a mesma do Mural e mora
 * em comunicacao-regras.js; o armazenamento é desafios.js (cópia local + nuvem).
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'desafios'), que limpa o
 * formulário, e depois de cada gravação.
 */
import { listarDesafios, salvarDesafios } from './desafios.js';
import { recentes, publicarItem, alternarAtivo, removerItem, metaDiasValida } from './comunicacao-regras.js';
import { esc } from './util/formato.js';
import { $ } from './util/dom.js';
import { on, EVENTOS } from './estado.js';
import { confirmar as confirmarReal } from '../../compartilhado/ui/dialogo.js';

const DES_EMOJIS = ['💧', '🚫🍬', '🥗', '😴', '🏃', '🔥', '🧘', '⭐', '🥦', '🚭'];
let desEmoji = '💧';
/** O id do desafio em edição, ou null. */
let desEdit = /** @type {string|null} */ (null);

/** @type {{ listar: () => any[], salvar: (arr: any[]) => Promise<any>, confirmar: (o: any) => Promise<boolean>, agora: () => number, novoId: () => string }} */
let deps = {
  listar: listarDesafios, salvar: salvarDesafios, confirmar: confirmarReal, agora: () => Date.now(),
  novoId: () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
};

function renderDesEmojis() {
  $('#des-emojis').innerHTML = DES_EMOJIS.map((e) => `<button type="button" class="des-emoji${e === desEmoji ? ' on' : ''}" data-e="${e}">${e}</button>`).join('');
}
function renderDesafios() {
  const arr = recentes(deps.listar());
  const list = $('#des-list');
  if (!arr.length) { list.innerHTML = `<div class="empty"><b>Nenhum desafio</b>Lance o primeiro — ele aparece nas Conquistas do aluno.</div>`; return; }
  list.innerHTML = arr.map((d) => `
    <div class="mural-item${d.ativo === false ? ' off' : ''}">
      <div class="mural-item-head"><span class="mural-tag">${esc(d.icone || '⭐')} ${esc(d.titulo || '')}</span><span class="mural-estado">${d.ativo === false ? 'Oculto' : 'No ar'} · meta ${esc(String(d.metaDias || 5))} dias</span></div>
      <p>${esc(d.descricao || '')}</p>
      <div class="mural-item-actions">
        <button class="btn ghost btn-sm des-toggle" data-id="${esc(d.id)}" type="button">${d.ativo === false ? 'Reativar' : 'Ocultar'}</button>
        <button class="btn ghost btn-sm des-editar" data-id="${esc(d.id)}" type="button">Editar</button>
        <button class="btn ghost btn-sm des-excluir" data-id="${esc(d.id)}" type="button">Excluir</button>
      </div>
    </div>`).join('');
}
function desReset() {
  desEdit = null; desEmoji = '💧';
  $('#des-titulo').value = ''; $('#des-texto').value = ''; $('#des-meta').value = '5'; $('#des-categoria').value = 'geral';
  $('#des-add').textContent = 'Publicar desafio'; $('#des-cancelar').hidden = true;
  renderDesEmojis();
}

/**
 * Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarTelaDesafios(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'desafios') { desReset(); renderDesafios(); } });
  $('#des-cancelar')?.addEventListener('click', desReset);
  $('#des-emojis')?.addEventListener('click', (/** @type {any} */ e) => { const b = e.target.closest('.des-emoji'); if (b) { desEmoji = b.dataset.e; renderDesEmojis(); } });

  $('#des-form')?.addEventListener('submit', async (/** @type {any} */ e) => {
    e.preventDefault();
    const titulo = $('#des-titulo').value.trim(), descricao = $('#des-texto').value.trim();
    const metaDias = metaDiasValida($('#des-meta').value);
    const categoria = $('#des-categoria').value || 'geral';
    if (!titulo || !descricao) return;
    await deps.salvar(publicarItem(deps.listar(), desEdit, { icone: desEmoji, titulo, descricao, metaDias, categoria }, { id: deps.novoId(), agora: deps.agora() }));
    desReset(); renderDesafios();
  });

  $('#des-list')?.addEventListener('click', async (/** @type {any} */ e) => {
    const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
    const arr = deps.listar();
    if (e.target.closest('.des-toggle')) {
      await deps.salvar(alternarAtivo(arr, id)); renderDesafios();
    } else if (e.target.closest('.des-editar')) {
      const x = arr.find((y) => y.id === id); if (!x) return;
      desEdit = id; desEmoji = x.icone || '💧';
      $('#des-titulo').value = x.titulo || ''; $('#des-texto').value = x.descricao || ''; $('#des-meta').value = String(x.metaDias || 5); $('#des-categoria').value = x.categoria || 'geral';
      $('#des-add').textContent = 'Salvar alteração'; $('#des-cancelar').hidden = false; renderDesEmojis(); $('#des-titulo').focus();
    } else if (e.target.closest('.des-excluir')) {
      if (!(await deps.confirmar({ titulo: 'Excluir desafio?', texto: 'Ele sai do Portal do Aluno.', ok: 'Excluir', perigo: true }))) return;
      await deps.salvar(removerItem(arr, id));
      if (desEdit === id) desReset();
      renderDesafios();
    }
  });
}
