// @ts-check
/**
 * Tela Mural — os recados do box no Portal do Aluno: publicar, editar,
 * ocultar/reativar e excluir.
 *
 * Saiu do `app.js` no fatiamento. A lógica da lista (publicar ou salvar a
 * edição, ocultar, excluir) é a mesma dos Desafios e mora em
 * comunicacao-regras.js; o armazenamento é avisos.js (cópia local + nuvem).
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'mural'), que limpa o
 * formulário, e depois de cada gravação.
 */
import { listarAvisos, salvarAvisos } from './avisos.js?v=11';
import { recentes, publicarItem, alternarAtivo, removerItem } from './comunicacao-regras.js?v=11';
import { esc } from './util/formato.js?v=11';
import { $ } from './util/dom.js?v=11';
import { on, EVENTOS } from './estado.js?v=11';
import { confirmar as confirmarReal } from '../../compartilhado/ui/dialogo.js?v=11';

const MURAL_TIPO = { info: 'Informativo', importante: 'Importante', evento: 'Evento' };
/** O id do aviso em edição, ou null. */
let muralEdit = /** @type {string|null} */ (null);

/** @type {{ listar: () => any[], salvar: (arr: any[]) => Promise<any>, confirmar: (o: any) => Promise<boolean>, agora: () => number, novoId: () => string }} */
let deps = {
  listar: listarAvisos, salvar: salvarAvisos, confirmar: confirmarReal, agora: () => Date.now(),
  novoId: () => 'av' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
};

function renderMural() {
  const avisos = recentes(deps.listar());
  const list = $('#mural-list');
  if (!avisos.length) {
    list.innerHTML = `<div class="empty"><b>Nenhum aviso</b>Publique o primeiro recado — ele aparece no Portal do Aluno.</div>`;
    return;
  }
  list.innerHTML = avisos.map((av) => {
    const d = av.criadoEm ? new Date(av.criadoEm).toLocaleDateString('pt-BR') : '';
    return `<div class="mural-item tipo-${esc(av.tipo || 'info')}${av.ativo === false ? ' off' : ''}">
      <div class="mural-item-head">
        <span class="mural-tag">${esc(MURAL_TIPO[av.tipo] || 'Informativo')}</span>
        <span class="mural-data">${d}</span>
        <span class="mural-estado">${av.ativo === false ? 'Oculto' : 'No ar'}</span>
      </div>
      <h4>${esc(av.titulo || '')}</h4>
      <p>${esc(av.texto || '')}</p>
      <div class="mural-item-actions">
        <button class="btn ghost btn-sm mural-toggle" data-id="${esc(av.id)}" type="button">${av.ativo === false ? 'Reativar' : 'Ocultar'}</button>
        <button class="btn ghost btn-sm mural-editar" data-id="${esc(av.id)}" type="button">Editar</button>
        <button class="btn ghost btn-sm mural-excluir" data-id="${esc(av.id)}" type="button">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

function muralReset() {
  muralEdit = null;
  $('#mural-titulo').value = ''; $('#mural-texto').value = ''; $('#mural-tipo').value = 'info';
  $('#mural-add').textContent = 'Publicar aviso';
  $('#mural-cancelar').hidden = true;
}

/**
 * Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarTelaMural(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'mural') { muralReset(); renderMural(); } });
  $('#mural-cancelar')?.addEventListener('click', muralReset);

  $('#mural-form')?.addEventListener('submit', async (/** @type {any} */ e) => {
    e.preventDefault();
    const titulo = $('#mural-titulo').value.trim(), texto = $('#mural-texto').value.trim();
    if (!titulo || !texto) return;
    const tipo = $('#mural-tipo').value;
    await deps.salvar(publicarItem(deps.listar(), muralEdit, { titulo, texto, tipo }, { id: deps.novoId(), agora: deps.agora() }));
    muralReset(); renderMural();
  });

  $('#mural-list')?.addEventListener('click', async (/** @type {any} */ e) => {
    const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
    const arr = deps.listar();
    if (e.target.closest('.mural-toggle')) {
      await deps.salvar(alternarAtivo(arr, id)); renderMural();
    } else if (e.target.closest('.mural-editar')) {
      const av = arr.find((x) => x.id === id); if (!av) return;
      muralEdit = id; $('#mural-titulo').value = av.titulo || ''; $('#mural-texto').value = av.texto || ''; $('#mural-tipo').value = av.tipo || 'info';
      $('#mural-add').textContent = 'Salvar alteração'; $('#mural-cancelar').hidden = false; $('#mural-titulo').focus();
    } else if (e.target.closest('.mural-excluir')) {
      if (!(await deps.confirmar({ titulo: 'Excluir aviso?', texto: 'Ele sai do Portal do Aluno.', ok: 'Excluir', perigo: true }))) return;
      await deps.salvar(removerItem(arr, id));
      if (muralEdit === id) muralReset();
      renderMural();
    }
  });
}
