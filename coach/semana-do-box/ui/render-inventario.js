// @ts-check
/**
 * O HTML da seção Inventário, como STRING — sem DOM, para o teste rodar no Node.
 * Mesma divisão de `render.js`: texto e regra de exibição em `core/vista.js`,
 * marcação aqui, eventos em `inventario.js`.
 */
import { MAX_UNIDADES, TURMA_MAX, TURMA_MIN, alunosPorEstacao, semanaAfetada } from '../core/vista.js';
import { esc } from './render.js';

/** O aviso que separa este inventário do da Academia (decisão do coach, 05/10/2026). */
export const AVISO_ACADEMIA = 'Este inventário limita só a Semana do Box. O da Academia continua valendo para o Montador de treino.';

/**
 * @param {string} recurso @param {'total'|'emManutencao'|'turma'} campo @param {number} valor
 * @param {number} max @param {boolean} ocupado @param {string} rotulo @param {number} [min]
 */
function seletor(recurso, campo, valor, max, ocupado, rotulo, min = 0) {
  const dis = (cond) => (cond || ocupado ? ' disabled' : '');
  return `<div class="inv-campo">
    <span class="inv-rotulo">${esc(rotulo)}</span>
    <div class="inv-stepper">
      <button class="btn ghost inv-passo" type="button" data-inv="${campo}" data-recurso="${esc(recurso)}" data-passo="-1"
        aria-label="${esc(rotulo)}: menos um"${dis(valor <= min)}>−</button>
      <output class="inv-valor" aria-live="polite">${esc(valor)}</output>
      <button class="btn ghost inv-passo" type="button" data-inv="${campo}" data-recurso="${esc(recurso)}" data-passo="1"
        aria-label="${esc(rotulo)}: mais um"${dis(valor >= max)}>+</button>
    </div>
  </div>`;
}

/** A linha mudou em relação ao gravado? @param {any} e @param {any} o */
const linhaAlterada = (e, o) => !o || o.total !== e.total || o.emManutencao !== e.emManutencao || o.observacao !== e.observacao.trim();

/**
 * O cartão de um recurso.
 * @param {any} e a linha editada @param {any} o a gravada @param {boolean} ocupado
 */
function cartaoRecurso(e, o, ocupado) {
  const alterado = linhaAlterada(e, o);
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
}

/**
 * O cartão da turma (`alunosPorAula`): só o HIIT usa. Mostra quantos alunos
 * dividem cada estação — é esse número que multiplica o equipamento.
 * @param {number} turma @param {number|null} gravada @param {boolean} ocupado
 */
function cartaoTurma(turma, gravada, ocupado) {
  const alterado = turma !== gravada;
  const porEstacao = alunosPorEstacao(turma);
  return `<article class="card inv-linha inv-turma${alterado ? ' alterado' : ''}">
      <header class="inv-h">
        <h3>Alunos por aula</h3>
        ${alterado ? '<span class="selo selo-rascunho">Não salvo</span>' : ''}
      </header>
      <div class="inv-campos">
        ${seletor('turma', 'turma', turma, TURMA_MAX, ocupado, 'Turma máxima', TURMA_MIN)}
        <p class="inv-por-estacao"><b>→ até ${esc(porEstacao)} aluno${porEstacao > 1 ? 's' : ''} por estação</b></p>
      </div>
      <p class="mut inv-nota">A turma se divide entre as 4 estações, que rodam ao mesmo tempo: cada exercício precisa
        de uma unidade por aluno da estação. Mudar a turma reconfere as semanas em aberto. Não muda a conta do bloco H.</p>
    </article>`;
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
 * A seção inteira: os recursos do bloco H e, separados, os do HIIT com a turma.
 * @param {{
 *   original: ReturnType<typeof import('../core/vista.js').linhasDoInventario>,
 *   editado: ReturnType<typeof import('../core/vista.js').linhasDoInventario>,
 *   turmaOriginal?: number|null,
 *   turma?: number|null,
 *   ocupado?: boolean,
 *   ultimo?: {semanasAfetadas: any[]|null, reconferidas: number}|null,
 * }} o
 */
export function renderInventario({ original, editado, turmaOriginal = null, turma = null, ocupado = false, ultimo = null }) {
  if (!editado.length) return '<p class="vazio">Carregando o inventário…</p>';
  const mudou = (turma !== null && turma !== turmaOriginal)
    || editado.some((e) => linhaAlterada(e, original.find((x) => x.recurso === e.recurso)));
  const cartoes = (grupo) => editado.filter((e) => e.grupo === grupo)
    .map((e) => cartaoRecurso(e, original.find((x) => x.recurso === e.recurso), ocupado)).join('');

  return `<section class="panel">
      <p class="mut intro">${esc(AVISO_ACADEMIA)} Os ativos (total − em manutenção) são o limite que o gerador
        respeita em cada dia. Ao salvar, as semanas que ainda não terminaram são reconferidas.</p>
    </section>
    ${resultado(ultimo)}
    <h3 class="inv-secao">Força (bloco H)</h3>
    <p class="mut inv-secao-nota">Cada exercício do bloco ocupa um aparelho, qualquer que seja o número de alunos revezando nele.</p>
    <div class="inv-grade">${cartoes('forca')}</div>
    <h3 class="inv-secao">HIIT</h3>
    <p class="mut inv-secao-nota">Contados por aluno: as 4 estações rodam na mesma música, e o mesmo slot de todas acontece
      ao mesmo tempo.</p>
    <div class="inv-grade">${turma === null ? '' : cartaoTurma(turma, turmaOriginal, ocupado)}${cartoes('hiit')}</div>
    <div class="acoes inv-acoes">
      <button class="btn btn-ouro" type="button" data-inv-salvar${mudou && !ocupado ? '' : ' disabled'}>Salvar inventário</button>
      <button class="btn ghost" type="button" data-inv-descartar${mudou && !ocupado ? '' : ' disabled'}>Descartar alterações</button>
    </div>`;
}
