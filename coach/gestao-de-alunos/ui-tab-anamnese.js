// @ts-check
/**
 * Aba Anamnese do perfil — treino e rotina, hábitos, saúde e objetivo.
 *
 * Saiu do `app.js` no fatiamento. Os campos (nome, rótulo, opções) moram em
 * `saude.js`, que o PDF da ficha e a linha da aba Registros também leem.
 *
 * Quando desenha: na primeira vez que a aba abre depois de 'perfil-aberto',
 * como Dados e Matriz. Trocar de aba e voltar NÃO redesenha — o que o coach
 * digitou e ainda não salvou continua no formulário. (Antes, cada volta à aba
 * redesenhava a partir da ficha salva e apagava o rascunho.)
 */
import * as db from './db.js?v=12';
import { esc, opt } from './util/formato.js?v=12';
import { $ } from './util/dom.js?v=12';
import { estado, on, EVENTOS } from './estado.js?v=12';
import { regAnamnese } from './registro.js?v=12';
import { ANAMNESE_SECOES } from './saude.js?v=12';

/** @param {string[]} arr @param {string} [atual] */
function optsSelect(arr, atual) { return `<option value="">—</option>` + arr.map((s) => opt(s, atual)).join(''); }

/** Um campo do formulário. @param {import('./saude.js').CampoAnamnese} c @param {any} an */
function campoHTML(c, an) {
  const v = an[c.k];
  if (c.tipo === 'select') return `<div class="field"><label>${c.rotulo}</label><select name="${c.k}">${optsSelect(c.opcoes || [], v)}</select></div>`;
  if (c.tipo === 'area') return `<div class="field full"><label>${c.rotulo}</label><textarea name="${c.k}">${esc(v)}</textarea></div>`;
  if (c.tipo === 'numero') return `<div class="field"><label>${c.rotulo}</label><input name="${c.k}" type="number" step="any" value="${esc(v)}" /></div>`;
  return `<div class="field"><label>${c.rotulo}</label><input name="${c.k}" value="${esc(v)}" /></div>`;
}

/** O formulário da aba (sem os eventos). @param {any} a */
export function htmlAnamnese(a) {
  const an = (a && a.anamnese) || {};
  const secoes = ANAMNESE_SECOES.map(([titulo, campos]) => `
      <div class="form-sec"><h3>${titulo}</h3><div class="grid-form">
        ${campos.map((c) => campoHTML(c, an)).join('\n        ')}
      </div></div>`).join('');
  return `
    <form id="form-anamnese">${secoes}
      <div class="form-actions"><button class="btn" type="submit">Salvar anamnese</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    </form>`;
}

/** Lê o formulário para o objeto gravado em `anamnese`. @param {HTMLFormElement} form */
export function lerAnamnese(form) {
  /** @type {Record<string, any>} */ const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}

/** Desenha a aba do aluno e liga o salvar. @param {any} a */
function renderAnamnese(a) {
  const painel = $('#tab-anamnese'); if (!painel) return;
  painel.innerHTML = htmlAnamnese(a);
  const form = $('#form-anamnese');
  form.addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const nova = lerAnamnese(form);
    // O "antes" é a ficha do banco na hora de salvar, não a do momento em que
    // a aba foi desenhada — outra aba pode ter gravado no meio.
    const antes = db.obter(a.id);
    db.atualizar(a.id, { anamnese: nova });
    regAnamnese(antes, nova);
    estado.alunoAtual = db.obter(a.id);
    const fl = $('[data-saved]', form); fl.classList.add('show'); setTimeout(() => fl.classList.remove('show'), 1500);
  });
}

/** Liga a aba ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabAnamnese() {
  let desenhada = false;
  on(EVENTOS.PERFIL_ABERTO, () => { desenhada = false; });
  on(EVENTOS.ABRIR_ABA, (nome) => {
    if (nome !== 'anamnese' || desenhada || !estado.alunoAtual) return;
    renderAnamnese(estado.alunoAtual);
    desenhada = true;
  });
}
