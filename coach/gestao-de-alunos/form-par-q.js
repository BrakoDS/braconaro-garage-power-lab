// @ts-check
/**
 * O formulário do PAR-Q — o questionário de prontidão para atividade física,
 * com o resultado da triagem atualizado a cada resposta.
 *
 * Era uma aba; hoje é uma seção do card Formulários da aba Saúde
 * (ui-tab-saude.js), que o desenha e o lê para o salvar global. As perguntas
 * e a regra da triagem moram em `saude.js`, as mesmas que o PDF usa.
 */
import { esc } from './util/formato.js?v=22';
import { PARQ_PERGUNTAS, triagemParq } from './saude.js?v=22';

/** O aviso de cada resultado da triagem ('' quando nada foi respondido). */
const BANNER = {
  vazio: '',
  alerta: `<div class="parq-banner alerta">⚠️ Há resposta "Sim" — recomende avaliação médica antes de iniciar ou intensificar a atividade física.</div>`,
  ok: `<div class="parq-banner ok">✓ Todas as respostas "Não" — apto a iniciar atividade física com bom senso. Reavalie periodicamente.</div>`,
  incompleto: `<div class="parq-banner">Responda todas as ${PARQ_PERGUNTAS.length} perguntas para concluir a triagem.</div>`,
};

/** O aviso para estas respostas. @param {Record<string, string>} respostas */
export function bannerParq(respostas) { return BANNER[triagemParq(respostas)]; }

/** O formulário (sem os eventos). @param {any} a */
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
    </form>`;
}

/** As respostas marcadas no formulário. @param {HTMLFormElement} form */
export function respostasDoForm(form) {
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

/**
 * O PAR-Q por caminho de campo, para o salvar global: cada resposta no seu
 * caminho ('parq.respostas.q3'), a data e as observações.
 * @param {{ respostas: Record<string, string>, data: string, obs: string }} p
 */
export function caminhosDoParq(p) {
  /** @type {Record<string, any>} */ const r = { 'parq.data': p.data, 'parq.obs': p.obs };
  for (let i = 0; i < PARQ_PERGUNTAS.length; i++) r[`parq.respostas.q${i}`] = p.respostas['q' + i];
  return r;
}
