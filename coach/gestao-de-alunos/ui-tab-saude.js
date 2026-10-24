// @ts-check
/**
 * Aba Saúde da ficha — a visão clínica num lugar só
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md):
 *
 *  - Alerta médico e lesões  o alerta (o mesmo do cabeçalho: vermelho para
 *        lesão moderada/severa, âmbar para lesão leve ou PAR-Q com "Sim"), as
 *        LESÕES ATIVAS (a única fonte, `matrizIndividualizacao.adaptacoes.lesoes`,
 *        que o Motor lê — editadas aqui, a Matriz só mostra), a nota clínica do
 *        coach (`obs`), o que o aluno DECLAROU na anamnese (só leitura, com
 *        "+ registrar como lesão") e a triagem do PAR-Q;
 *  - Biometria atual  peso e altura da avaliação mais recente (a origem à vista;
 *        o valor do cadastro só vale sem avaliação), idade e sexo;
 *  - Formulários  Anamnese e PAR-Q completos, cada um numa seção que abre e
 *        fecha, em leitura; o ✎ de cada seção abre o formulário.
 *
 * Tudo abre em modo leitura (ui-card.js). O que se edita vai para o rascunho do
 * salvar global (ui-salvar-global.js), que desenha a aba a partir da ficha COM
 * o rascunho e grava pela barra do rodapé.
 */
import { esc, hoje, fmtData, fmtN } from './util/formato.js?v=24';
import { $ } from './util/dom.js?v=24';
import { on, emit, EVENTOS } from './estado.js?v=24';
import { registrarFormulario, redesenharAberta, comPrefixo } from './ui-salvar-global.js?v=24';
import { camposDados, wireForm, lerCampos, CAMPOS } from './campos-aluno.js?v=24';
import { biometriaAtual, idadeDoAluno, alertaMedico } from './perfil-derivados.js?v=24';
import { CAMINHO_LESOES, linhaLesao, lesoesDe, normalizarLesoes, descreverLesao, lerLinhasDeLesao } from './lesoes.js?v=24';
import { ANAMNESE_SECOES, ANAMNESE_CAMPOS, PARQ_PERGUNTAS, triagemParq } from './saude.js?v=24';
import { htmlAnamnese, lerAnamnese } from './form-anamnese.js?v=24';
import { htmlParq, lerParq, caminhosDoParq, bannerParq, respostasDoForm } from './form-par-q.js?v=24';
import { htmlCard, botaoEditar, htmlLinhas } from './ui-card.js?v=24';

/* ============================================================
   HTML (puro)
   ============================================================ */

/**
 * "Avaliação #2 · 12/09/2026", "do cadastro" ou "sem medida".
 * @param {import('./perfil-derivados.js').Medida} m
 */
export function origemDaMedida(m) {
  if (m.origem === 'avaliacao') return `Avaliação #${String(m.num).padStart(2, '0')} · ${fmtData(m.data || '')}`;
  if (m.origem === 'cadastro') return 'do cadastro — vale até a 1ª avaliação';
  return 'sem medida';
}

/** Um bloco de número grande. @param {string} rotulo @param {string} valor @param {string} sub */
const tile = (rotulo, valor, sub) => `
  <div class="bio-tile">
    <span class="bio-rot">${esc(rotulo)}</span>
    <span class="bio-val">${valor || '<span class="card-vazio">—</span>'}</span>
    ${sub ? `<span class="bio-sub">${esc(sub)}</span>` : ''}
  </div>`;

/**
 * Card Biometria atual.
 * @param {any} v a ficha com o rascunho @param {string} hojeIso @param {boolean} editando
 */
export function htmlCardBiometria(v, hojeIso, editando) {
  const b = biometriaAtual(v);
  const idade = idadeDoAluno(v, hojeIso);
  let corpo;
  if (editando) {
    const c = camposDados(v);
    // Peso e altura de avaliação não se editam aqui: quem manda é a avaliação.
    const medidas = [b.altura.origem === 'avaliacao' ? '' : c.altura, b.peso.origem === 'avaliacao' ? '' : c.peso].filter(Boolean);
    const nota = medidas.length < 2
      ? '<p class="hint bio-nota">Peso e altura vêm da avaliação mais recente — para mudar, registre uma nova avaliação.</p>' : '';
    corpo = `<form id="form-saude-bio" class="grid-form" novalidate>${c.nascimento}${c.sexo}${medidas.join('')}</form>${nota}`;
  } else {
    corpo = `<div class="bio-tiles">
      ${tile('Peso', b.peso.valor != null ? `${fmtN(b.peso.valor, 1)} <small>kg</small>` : '', origemDaMedida(b.peso))}
      ${tile('Altura', b.altura.valor != null ? `${fmtN(b.altura.valor, 0)} <small>cm</small>` : '', origemDaMedida(b.altura))}
      ${tile('Idade', idade != null ? `${idade} <small>anos</small>` : '', v.nascimento ? `nasceu em ${fmtData(v.nascimento)}` : 'sem nascimento')}
      ${tile('Sexo', esc(v.sexo || ''), '')}
    </div>`;
  }
  return htmlCard({
    id: 'biometria',
    titulo: 'Biometria atual',
    classe: 'card-largo',
    acoes: `<button class="card-btn" type="button" data-saude="nova-aval">+ Nova avaliação</button>${botaoEditar('biometria', 'a biometria', editando)}`,
    corpo,
  });
}

/** O selo do alerta médico, por extenso. @param {'vermelho'|'ambar'|null} nivel */
function seloDoAlerta(nivel) {
  if (nivel === 'vermelho') return '<span class="ac-chip fg-chip fg-bad">Alerta vermelho · muda a prescrição</span>';
  if (nivel === 'ambar') return '<span class="ac-chip fg-chip fg-warn">Alerta âmbar · atenção</span>';
  return '<span class="ac-chip fg-chip fg-ok">Sem alerta</span>';
}

/** A triagem do PAR-Q, numa linha. @param {any} v */
export function seloDoParq(v) {
  const t = triagemParq((v.parq && v.parq.respostas) || {});
  const data = v.parq && v.parq.data ? ` · ${fmtData(v.parq.data)}` : '';
  if (t === 'alerta') return `<span class="ac-chip fg-chip fg-warn">Há resposta "Sim" — avaliação médica recomendada</span><span class="sa-data">${data}</span>`;
  if (t === 'ok') return `<span class="ac-chip fg-chip fg-ok">Apto — todas "Não"</span><span class="sa-data">${data}</span>`;
  if (t === 'incompleto') return `<span class="ac-chip fg-chip fg-neutro">Incompleto</span><span class="sa-data">${data}</span>`;
  return '<span class="ac-chip fg-chip fg-neutro">Não respondido</span>';
}

/** O nome curto de um campo da anamnese. @param {string} k */
const curto = (k) => (ANAMNESE_CAMPOS.find((c) => c.k === k) || { curto: k }).curto;

/**
 * Card Alerta médico e lesões.
 * @param {any} v a ficha com o rascunho @param {boolean} editando
 */
export function htmlCardAlerta(v, editando) {
  const al = alertaMedico(v);
  const lesoes = lesoesDe(v);
  const an = v.anamnese || {};
  const declarado = ['doresLesoes', 'doencas', 'medicamentos'].map((k) => [curto(k), esc(an[k] || '')]);
  const textoNota = v.obs ? `<p class="sa-nota">${esc(v.obs)}</p>` : '<p class="card-vazio">Sem nota.</p>';
  const listaLesoes = lesoes.length
    ? `<ul class="sa-lesoes">${lesoes.map((l) => `<li class="sa-lesao g-${esc(l.gravidade)}">${esc(descreverLesao(l))}</li>`).join('')}</ul>`
    : '<p class="card-vazio">Nenhuma lesão registrada.</p>';
  const edicao = editando ? `
    <form id="form-saude-alerta" novalidate>
      <div class="sa-bloco">
        <h3 class="sa-t">Lesões ativas</h3>
        <div data-lista-lesoes>${lesoes.map(linhaLesao).join('')}</div>
        <p class="mtz-vazio" data-lesoes-vazio${lesoes.length ? ' hidden' : ''}>Nenhuma lesão registrada.</p>
        <button class="btn ghost btn-sm" type="button" data-saude="add-lesao">+ Adicionar lesão</button>
        <p class="hint">Lesão moderada ou severa acende o alerta vermelho (o Motor adapta o treino); leve, o âmbar. Só entra a linha com a região escolhida.</p>
      </div>
      <div class="sa-bloco">
        <div class="grid-form">${camposDados(v).obs}</div>
      </div>
    </form>` : `
    <div class="sa-bloco"><h3 class="sa-t">Lesões ativas</h3>${listaLesoes}</div>
    <div class="sa-bloco"><h3 class="sa-t">Nota clínica do coach</h3>${textoNota}</div>`;
  return htmlCard({
    id: 'alerta',
    titulo: 'Alerta médico e lesões',
    classe: 'card-largo',
    acoes: botaoEditar('alerta', 'as lesões e a nota clínica', editando),
    corpo: `
      <div class="sa-status">${seloDoAlerta(al.nivel)}${al.motivos.length ? `<span class="sa-motivos">${esc(al.motivos.join(' · '))}</span>` : ''}</div>
      ${edicao}
      <div class="sa-bloco">
        <h3 class="sa-t">O que o aluno declarou na anamnese</h3>
        ${htmlLinhas(declarado)}
        ${an.doresLesoes && !editando ? '<button class="btn ghost btn-sm" type="button" data-saude="registrar-lesao">+ registrar como lesão</button>' : ''}
      </div>
      <div class="sa-bloco sa-parq">
        <h3 class="sa-t">PAR-Q</h3>
        <div class="sa-parq-linha">${seloDoParq(v)}<button class="card-btn" type="button" data-saude="ver-parq">Ver PAR-Q</button></div>
      </div>`,
  });
}

/** A anamnese em leitura: só as respostas, por seção. @param {any} v */
export function leituraAnamnese(v) {
  const an = v.anamnese || {};
  const secoes = ANAMNESE_SECOES.map(([titulo, campos]) => {
    const pares = campos.filter((c) => String(an[c.k] ?? '').trim()).map((c) => /** @type {[string, string]} */ ([c.rotulo, esc(an[c.k])]));
    return pares.length ? `<h4 class="sf-sub">${esc(titulo)}</h4>${htmlLinhas(pares)}` : '';
  }).join('');
  return secoes || '<p class="card-vazio">Ainda sem respostas. Toque em ✎ Editar para preencher.</p>';
}

/** O PAR-Q em leitura: a triagem, cada pergunta com a resposta, data e observações. @param {any} v */
export function leituraParq(v) {
  const p = v.parq || {}; const resp = p.respostas || {};
  const linhas = PARQ_PERGUNTAS.map((q, i) => {
    const r = resp['q' + i];
    return `<li class="sf-pq"><span>${i + 1}. ${esc(q)}</span><b class="sf-r ${r === 'sim' ? 'sim' : r === 'nao' ? 'nao' : ''}">${r === 'sim' ? 'Sim' : r === 'nao' ? 'Não' : '—'}</b></li>`;
  }).join('');
  return `${bannerParq(resp)}<ol class="sf-pqs">${linhas}</ol>${htmlLinhas([['Data da triagem', p.data ? fmtData(p.data) : ''], ['Observações', esc(p.obs || '')]])}`;
}

/** Quantas perguntas da anamnese têm resposta. @param {any} v */
export function respondidasAnamnese(v) {
  const an = v.anamnese || {};
  return ANAMNESE_CAMPOS.filter((c) => String(an[c.k] ?? '').trim()).length;
}

/**
 * Card Formulários: Anamnese e PAR-Q, cada um numa seção que abre e fecha.
 * @param {any} v @param {{ abertos: Set<string>, editando: Set<string> }} o
 */
export function htmlCardFormularios(v, { abertos, editando }) {
  const secao = (id, titulo, resumo, leitura, form) => {
    const aberta = abertos.has(id), ed = editando.has(id);
    return `
      <div class="sf-sec${aberta ? ' aberta' : ''}" id="sf-${id}">
        <div class="sf-cab">
          <button class="sf-toggle" type="button" data-saude="alternar" data-secao="${id}" aria-expanded="${aberta}" aria-controls="sf-${id}-corpo">
            <span class="sf-titulo">${titulo}</span><span class="sf-resumo">${resumo}</span><span class="sf-seta" aria-hidden="true">${aberta ? '▴' : '▾'}</span>
          </button>
          ${aberta ? botaoEditar(id, titulo === 'PAR-Q' ? 'o PAR-Q' : 'a anamnese', ed) : ''}
        </div>
        <div class="sf-corpo" id="sf-${id}-corpo"${aberta ? '' : ' hidden'}>${aberta ? (ed ? form() : leitura()) : ''}</div>
      </div>`;
  };
  const triagem = { alerta: 'há "Sim"', ok: 'apto', incompleto: 'incompleto', vazio: 'não respondido' }[triagemParq((v.parq && v.parq.respostas) || {})];
  return htmlCard({
    id: 'formularios',
    titulo: 'Formulários',
    classe: 'card-largo',
    corpo: secao('anamnese', 'Anamnese', `${respondidasAnamnese(v)} de ${ANAMNESE_CAMPOS.length} respondidas`, () => leituraAnamnese(v), () => htmlAnamnese(v))
      + secao('parq', 'PAR-Q', triagem, () => leituraParq(v), () => htmlParq(v)),
  });
}

/**
 * A aba inteira: Alerta, Biometria e Formulários.
 * @param {any} v @param {{ hojeIso: string, editando: Set<string>, abertos: Set<string> }} o
 */
export function htmlAbaSaude(v, { hojeIso, editando, abertos }) {
  return `
    <div class="cards-geral">
      ${htmlCardAlerta(v, editando.has('alerta'))}
      ${htmlCardBiometria(v, hojeIso, editando.has('biometria'))}
      ${htmlCardFormularios(v, { abertos, editando })}
    </div>`;
}

/* ============================================================
   DOM
   ============================================================ */

/** O que está em edição ('biometria', 'alerta', 'anamnese', 'parq') e as seções abertas. */
const editando = new Set();
const abertos = new Set();
/** Texto para a próxima linha de lesão (o "+ registrar como lesão"). @type {string|null} */
let linhaNova = null;
/** A ficha com que a aba foi desenhada por último. */
let vistaAtual = /** @type {any} */ (null);

/** Desenha a aba com a ficha recebida (a ficha com o rascunho por cima). @param {any} v */
function desenhar(v) {
  const painel = $('#tab-saude'); if (!painel) return;
  vistaAtual = v;
  painel.innerHTML = htmlAbaSaude(v, { hojeIso: hoje(), editando, abertos });
  if (editando.has('biometria')) { const bio = $('#form-saude-bio'); if (bio) wireForm(bio); }
  // "+ registrar como lesão": a linha nova chega com o que o aluno declarou; a
  // região quem escolhe é o coach (sem ela, a linha ainda não é lesão).
  const lista = $('#form-saude-alerta [data-lista-lesoes]');
  if (lista && linhaNova != null) {
    lista.insertAdjacentHTML('beforeend', linhaLesao({ obs: linhaNova }));
    const vazio = $('#form-saude-alerta [data-lesoes-vazio]'); if (vazio) vazio.hidden = true;
    /** @type {any} */ ([...lista.querySelectorAll('[data-campo=regiao]')].pop())?.focus();
  }
  linhaNova = null;
  // O aviso da triagem acompanha as respostas, antes de salvar.
  const parq = $('#form-parq');
  parq?.addEventListener('change', () => { const r = $('#parq-result'); if (r) r.innerHTML = bannerParq(respostasDoForm(parq)); });
}

/** O que está em edição, por campo (para o salvar global). */
function ler() {
  /** @type {Record<string, any>} */ const r = {};
  const form = (/** @type {string} */ id) => /** @type {any} */ ($(id));
  if (editando.has('biometria') && form('#form-saude-bio')) Object.assign(r, lerCampos(form('#form-saude-bio'), CAMPOS.biometria));
  if (editando.has('alerta') && form('#form-saude-alerta')) {
    const f = form('#form-saude-alerta');
    r[CAMINHO_LESOES] = normalizarLesoes(lerLinhasDeLesao(f));
    Object.assign(r, lerCampos(f, CAMPOS.clinica));
  }
  if (editando.has('anamnese') && form('#form-anamnese')) Object.assign(r, comPrefixo('anamnese', lerAnamnese(form('#form-anamnese'))));
  if (editando.has('parq') && form('#form-parq')) Object.assign(r, caminhosDoParq(lerParq(form('#form-parq'))));
  return r;
}

/**
 * Abre (ou fecha) a edição de uma parte da aba e a redesenha. Anamnese e PAR-Q
 * abrem a seção junto. Exportado para os testes, que não clicam.
 * @param {string} parte 'biometria' | 'alerta' | 'anamnese' | 'parq' @param {boolean} [sim]
 */
export function editarSecao(parte, sim = true) {
  if (sim) { editando.add(parte); if (parte === 'anamnese' || parte === 'parq') abertos.add(parte); } else editando.delete(parte);
  redesenharAberta();
}

/** Liga a aba ao salvar global e ao barramento. Chamar uma vez, depois de `iniciarSalvarGlobal`. */
export function iniciarTabSaude() {
  registrarFormulario({ aba: 'saude', desenhar, ler, aposSalvar: () => editando.clear() });
  on(EVENTOS.PERFIL_ABERTO, () => { editando.clear(); abertos.clear(); linhaNova = null; });

  $('#tab-saude')?.addEventListener('click', (/** @type {any} */ e) => {
    const t = e.target;
    const remover = t.closest('[data-remover-lesao]');
    if (remover) {
      const form = remover.closest('form');
      remover.closest('[data-lesao]')?.remove();
      const vazio = form?.querySelector('[data-lesoes-vazio]'); if (vazio) vazio.hidden = !!form.querySelector('[data-lesao]');
      // Tirar a linha não dispara `input`: avisa o salvar global como se fosse.
      form?.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const alvo = t.closest('[data-card], [data-saude]');
    if (!alvo) return;
    if (alvo.dataset.card) {
      editarSecao(alvo.dataset.card, alvo.dataset.modo === 'editar');
      if (alvo.dataset.modo === 'editar') /** @type {any} */ ($(`#tab-saude form input:not([disabled]), #tab-saude form select, #tab-saude form textarea`))?.focus();
      return;
    }
    const acao = alvo.dataset.saude;
    if (acao === 'alternar') {
      const s = alvo.dataset.secao;
      if (abertos.has(s)) { abertos.delete(s); editando.delete(s); } else abertos.add(s);
      redesenharAberta();
    } else if (acao === 'add-lesao') {
      const form = alvo.closest('form');
      form?.querySelector('[data-lista-lesoes]')?.insertAdjacentHTML('beforeend', linhaLesao());
      const vazio = form?.querySelector('[data-lesoes-vazio]'); if (vazio) vazio.hidden = true;
      /** @type {any} */ ([...(form?.querySelectorAll('[data-campo=regiao]') || [])].pop())?.focus();
    } else if (acao === 'registrar-lesao') {
      linhaNova = String((vistaAtual && vistaAtual.anamnese && vistaAtual.anamnese.doresLesoes) || '').trim().slice(0, 80);
      editarSecao('alerta', true);
    } else if (acao === 'ver-parq') {
      abertos.add('parq');
      redesenharAberta();
      $('#sf-parq')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    } else if (acao === 'nova-aval') {
      emit(EVENTOS.ABRIR_ABA, 'avaliacoes');
      /** @type {any} */ ($('#btn-nova-aval'))?.click();
    }
  });
}
