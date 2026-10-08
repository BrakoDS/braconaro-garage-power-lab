// @ts-check
/**
 * Aba PAR-Q do perfil — o questionário de prontidão para atividade física, com
 * o resultado da triagem atualizado a cada resposta.
 *
 * Saiu do `app.js` no fatiamento. As perguntas e a regra da triagem moram em
 * `saude.js`, as mesmas que o PDF da ficha usa.
 *
 * Quando desenha: na primeira vez que a aba abre depois de 'perfil-aberto',
 * como Dados, Matriz e Anamnese. Trocar de aba e voltar NÃO redesenha — as
 * respostas marcadas e ainda não salvas continuam marcadas.
 */
import * as db from './db.js?v=11';
import { esc } from './util/formato.js?v=11';
import { $ } from './util/dom.js?v=11';
import { estado, on, EVENTOS } from './estado.js?v=11';
import { regParq } from './registro.js?v=11';
import { PARQ_PERGUNTAS, triagemParq } from './saude.js?v=11';

/** O aviso de cada resultado da triagem ('' quando nada foi respondido). */
const BANNER = {
  vazio: '',
  alerta: `<div class="parq-banner alerta">⚠️ Há resposta "Sim" — recomende avaliação médica antes de iniciar ou intensificar a atividade física.</div>`,
  ok: `<div class="parq-banner ok">✓ Todas as respostas "Não" — apto a iniciar atividade física com bom senso. Reavalie periodicamente.</div>`,
  incompleto: `<div class="parq-banner">Responda todas as ${PARQ_PERGUNTAS.length} perguntas para concluir a triagem.</div>`,
};

/** O aviso para estas respostas. @param {Record<string, string>} respostas */
export function bannerParq(respostas) { return BANNER[triagemParq(respostas)]; }

/** O formulário da aba (sem os eventos). @param {any} a */
export function htmlParq(a) {
  const p = (a && a.parq) || {}; const resp = p.respostas || {};
  const linhas = PARQ_PERGUNTAS.map((q, i) => `
    <div class="parq-q">
      <span class="parq-txt">${i + 1}. ${q}</span>
      <div class="parq-opts">
        <label class="chk"><input type="radio" name="q${i}" value="sim"${resp['q' + i] === 'sim' ? ' checked' : ''}/> Sim</label>
        <label class="chk"><input type="radio" name="q${i}" value="nao"${resp['q' + i] === 'nao' ? ' checked' : ''}/> Não</label>
      </div>
    </div>`).join('');
  return `
    <form id="form-parq">
      <div id="parq-result">${bannerParq(resp)}</div>
      <div class="form-sec"><h3>Questionário de prontidão para atividade física (PAR-Q)</h3><div class="parq-list">${linhas}</div></div>
      <div class="form-sec"><div class="grid-form">
        <div class="field"><label>Data da triagem</label><input name="data" type="date" value="${esc(p.data || '')}" /></div>
        <div class="field full"><label>Observações</label><textarea name="obs">${esc(p.obs)}</textarea></div>
      </div></div>
      <div class="form-actions"><button class="btn" type="submit">Salvar PAR-Q</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    </form>`;
}

/** As respostas marcadas no formulário. @param {HTMLFormElement} form */
function respostasDoForm(form) {
  const fd = new FormData(form);
  /** @type {Record<string, string>} */ const respostas = {};
  for (let i = 0; i < PARQ_PERGUNTAS.length; i++) { const v = fd.get('q' + i); if (v) respostas['q' + i] = String(v); }
  return respostas;
}

/** Lê o formulário para o objeto gravado em `parq`. @param {HTMLFormElement} form */
export function lerParq(form) {
  const fd = new FormData(form);
  return { respostas: respostasDoForm(form), data: String(fd.get('data') || ''), obs: String(fd.get('obs') || '').trim() };
}

/** Desenha a aba do aluno e liga a triagem e o salvar. @param {any} a */
function renderParq(a) {
  const painel = $('#tab-parq'); if (!painel) return;
  painel.innerHTML = htmlParq(a);
  const form = $('#form-parq');
  form.addEventListener('change', () => { $('#parq-result').innerHTML = bannerParq(respostasDoForm(form)); });
  form.addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const parq = lerParq(form);
    // O "antes" é a ficha do banco na hora de salvar (ver ui-tab-anamnese.js).
    const antes = db.obter(a.id);
    db.atualizar(a.id, { parq });
    regParq(antes, parq);
    estado.alunoAtual = db.obter(a.id);
    const fl = $('[data-saved]', form); fl.classList.add('show'); setTimeout(() => fl.classList.remove('show'), 1500);
  });
}

/** Liga a aba ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabParq() {
  let desenhada = false;
  on(EVENTOS.PERFIL_ABERTO, () => { desenhada = false; });
  on(EVENTOS.ABRIR_ABA, (nome) => {
    if (nome !== 'parq' || desenhada || !estado.alunoAtual) return;
    renderParq(estado.alunoAtual);
    desenhada = true;
  });
}
