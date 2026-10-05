// @ts-check
/**
 * O HTML da seção Inventário, como STRING — sem DOM, para o teste rodar no Node.
 * Mesma divisão de `render.js`: texto e regra de exibição em `core/vista.js`,
 * marcação aqui, eventos em `inventario.js`.
 */
import { MAX_UNIDADES, semanaAfetada } from '../core/vista.js';
import { esc } from './render.js';

/** O aviso que separa este inventário do da Academia (decisão do coach, 05/10/2026). */
export const AVISO_ACADEMIA = 'Este inventário limita só a Semana do Box. O da Academia continua valendo para o Montador de treino.';

/**
 * @param {string} recurso @param {'total'|'emManutencao'} campo @param {number} valor
 * @param {number} max @param {boolean} ocupado @param {string} rotulo
 */
function seletor(recurso, campo, valor, max, ocupado, rotulo) {
  const dis = (cond) => (cond || ocupado ? ' disabled' : '');
  return `<div class="inv-campo">
    <span class="inv-rotulo">${esc(rotulo)}</span>
    <div class="inv-stepper">
      <button class="btn ghost inv-passo" type="button" data-inv="${campo}" data-recurso="${esc(recurso)}" data-passo="-1"
        aria-label="${esc(rotulo)}: menos um"${dis(valor <= 0)}>−</button>
      <output class="inv-valor" aria-live="polite">${esc(valor)}</output>
      <button class="btn ghost inv-passo" type="button" data-inv="${campo}" data-recurso="${esc(recurso)}" data-passo="1"
        aria-label="${esc(rotulo)}: mais um"${dis(valor >= max)}>+</button>
    </div>
  </div>`;
}

/**
 * O resultado do último salvamento: as semanas que passaram do limite novo.
 * @param {{semanasAfetadas: any[]|null, reconferidas: number}|null} r
 */
function resultado(r) {
  if (!r) return '';
  if (r.semanasAfetadas === null) {
    return `<section class="card card-alerta sev-media" role="status">
      <h3>Inventário salvo, mas as semanas não foram reconferidas</h3>
      <p class="mut">A conferência vai acontecer de qualquer jeito na hora de publicar. Se quiser ver agora, salve de novo.</p>
    </section>`;
  }
  if (!r.semanasAfetadas.length) {
    return `<section class="card card-ok" role="status">
      <h3>✓ Inventário salvo</h3>
      <p class="mut">${r.reconferidas
        ? `${esc(r.reconferidas)} semana${r.reconferidas > 1 ? 's' : ''} em aberto ${r.reconferidas > 1 ? 'foram reconferidas' : 'foi reconferida'}: nenhuma passa do limite.`
        : 'Nenhuma semana em aberto para reconferir.'}</p>
    </section>`;
  }
  const itens = r.semanasAfetadas.map((s) => {
    const a = semanaAfetada(s);
    return `<li class="inv-afetada">
      <b>${esc(a.titulo)}</b>
      <ul>${a.alertas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="mut">${esc(a.acao)}</p>
      <button class="btn ghost" type="button" data-abrir-semana="${esc(a.semanaId)}">Abrir ${esc(a.semanaId)} →</button>
    </li>`;
  }).join('');
  return `<section class="card card-alerta sev-alta" role="alert">
    <h3>⚠ Inventário salvo — ${r.semanasAfetadas.length} semana${r.semanasAfetadas.length > 1 ? 's passam' : ' passa'} do limite</h3>
    <ul class="inv-afetadas">${itens}</ul>
  </section>`;
}

/**
 * A seção inteira.
 * @param {{
 *   original: ReturnType<typeof import('../core/vista.js').linhasDoInventario>,
 *   editado: ReturnType<typeof import('../core/vista.js').linhasDoInventario>,
 *   ocupado?: boolean,
 *   ultimo?: {semanasAfetadas: any[]|null, reconferidas: number}|null,
 * }} o
 */
export function renderInventario({ original, editado, ocupado = false, ultimo = null }) {
  if (!editado.length) return '<p class="vazio">Carregando o inventário…</p>';
  const mudou = editado.some((e) => {
    const o = original.find((x) => x.recurso === e.recurso);
    return !o || o.total !== e.total || o.emManutencao !== e.emManutencao || o.observacao !== e.observacao.trim();
  });

  const linhas = editado.map((e) => {
    const o = original.find((x) => x.recurso === e.recurso);
    const alterado = !o || o.total !== e.total || o.emManutencao !== e.emManutencao || o.observacao !== e.observacao.trim();
    return `<article class="card inv-linha${alterado ? ' alterado' : ''}${e.emManutencao > 0 ? ' em-manutencao' : ''}">
      <header class="inv-h">
        <h3>${esc(e.nome)}</h3>
        ${alterado
          ? '<span class="selo selo-rascunho">Não salvo</span>'
          : `<span class="inv-ativos">${e.ativos === null ? '—' : esc(e.ativos)} ${e.ativos === 1 ? 'ativo' : 'ativos'}</span>`}
      </header>
      <div class="inv-campos">
        ${seletor(e.recurso, 'total', e.total, MAX_UNIDADES, ocupado, 'Total no box')}
        ${seletor(e.recurso, 'emManutencao', e.emManutencao, e.total, ocupado, 'Em manutenção')}
      </div>
      <label class="field inv-obs"><span class="inv-rotulo">Observação</span>
        <input type="text" maxlength="200" data-inv-obs="${esc(e.recurso)}" value="${esc(e.observacao)}"
          placeholder="Ex.: cabo rompido, aguardando peça"${ocupado ? ' disabled' : ''} />
      </label>
    </article>`;
  }).join('');

  return `<section class="panel">
      <p class="mut intro">${esc(AVISO_ACADEMIA)} Os ativos (total − em manutenção) são o limite que o gerador
        respeita em cada dia. Ao salvar, as semanas que ainda não terminaram são reconferidas.</p>
    </section>
    ${resultado(ultimo)}
    <div class="inv-grade">${linhas}</div>
    <div class="acoes inv-acoes">
      <button class="btn btn-ouro" type="button" data-inv-salvar${mudou && !ocupado ? '' : ' disabled'}>Salvar inventário</button>
      <button class="btn ghost" type="button" data-inv-descartar${mudou && !ocupado ? '' : ' disabled'}>Descartar alterações</button>
    </div>`;
}
