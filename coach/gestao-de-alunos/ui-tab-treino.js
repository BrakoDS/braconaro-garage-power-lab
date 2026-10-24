// @ts-check
/**
 * Aba Treino da ficha — performance técnica, cargas e adaptações, em cards
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md). Junta o
 * que eram as abas Perfil de treino, Matriz e Progresso:
 *
 *  - Perfil de treino  o ÚNICO lugar onde se editam nível, objetivo, fase,
 *        frequência, foco (primário e secundário) e os dias e horários;
 *  - Cargas de referência  os três levantamentos (1RM medido ou estimado por
 *        Epley, com a prévia de carga), a zona de RIR e a Airbike;
 *  - Adaptações  as regras que o Motor executa sozinho (impacto, tração,
 *        mobilidade), as lesões (só leitura — editam-se na aba Saúde) e as
 *        trocas fixas feitas no Montador (`restricoes`, só leitura);
 *  - Metas e evolução  as metas corporais (gravam na hora, como sempre), os
 *        gráficos das avaliações e o que melhorou;
 *  - Força e gasto  o registro de cargas e o gasto calórico, vindos do Portal;
 *  - Feedbacks  o pós-treino que o aluno manda pelo Portal.
 *
 * No topo, uma linha diz o que o Motor vai aplicar de diferente com este aluno
 * — e acompanha o que o coach digita, antes de salvar.
 *
 * Os três primeiros cards abrem em modo leitura e editam pelo ✎ (ui-card.js),
 * para o rascunho do salvar global (ui-salvar-global.js). Os outros três são
 * leitura (das avaliações e da nuvem) e se redesenham quando a aba ABRE, não a
 * cada ✎: o coach não vê "Carregando…" piscar nos gráficos ao editar um card.
 *
 * Onde cada coisa grava:
 *  - nível, objetivo, frequência, foco, dias e horários: no topo da ficha, onde
 *    o Portal, o app, o check-in e o Montador já leem;
 *  - fase, cargas e adaptações: em `matrizIndividualizacao`, campo a campo
 *    (`.perfil.fase`, `.cargas`, `.adaptacoes.impacto`…). Campo a campo de
 *    propósito: as lesões moram em `.adaptacoes.lesoes` e são da aba Saúde —
 *    gravar `adaptacoes` inteiro daqui passaria por cima delas;
 *  - `matrizIndividualizacao.historico` (as correções de volume da semana) não
 *    se edita aqui: vem do fluxo da semana e vence sozinho.
 */
import * as db from './db.js?v=24';
import { esc, fmtData, fmtN, horaLegivel, horaParaInput } from './util/formato.js?v=24';
import { $, $$ } from './util/dom.js?v=24';
import { estado, on, emit, EVENTOS } from './estado.js?v=24';
import { registrarFormulario, redesenharAberta } from './ui-salvar-global.js?v=24';
import { camposDados, wireForm, lerCampos, CAMPOS, DIAS_FORM } from './campos-aluno.js?v=24';
import { criarRascunho } from './perfil-rascunho.js?v=24';
import { descreverLesao } from './lesoes.js?v=24';
import { htmlCard, botaoEditar, htmlLinhas } from './ui-card.js?v=24';
import {
  htmlEvolucao, htmlMelhorias, feedbacksHTML, renderMetasCoach, carregarGastoSemana, carregarCargasForca,
} from './ui-tab-progresso.js?v=24';
import {
  CAMPO, matrizDe, separarParaGravar, cargaDe1RM, resumoDeAdaptacoes, rotulo,
  OPCOES_NIVEL, FASES, LEVANTAMENTOS, ZONAS_RIR, REGRAS_IMPACTO, REGRAS_TRACAO, RESTRICOES_MOBILIDADE, GRUPOS_COM_ROTULO,
} from '../../compartilhado/regras/matriz-individualizacao.js?v=24';

/** Os cards com formulário (os que têm ✎ Editar). */
export const CARDS_EDITAVEIS = Object.freeze(['perfil-treino', 'cargas', 'adaptacoes']);

/**
 * Acima disto a estimativa de 1RM deixa de valer — para Epley e para qualquer
 * outra fórmula. É aqui que o coach digita, e ainda dá para refazer o teste com
 * menos repetições.
 */
const REPS_LIMITE_ESTIMATIVA = 12;

/** Percentual usado só na PRÉVIA de carga de trabalho ao lado do 1RM. */
const PCT_PREVIA = 70;

/** Os campos de adaptação que esta aba grava (as lesões são da aba Saúde). */
const CAMPOS_ADAPTACAO = /** @type {const} */ (['impacto', 'tracao', 'mobilidade', 'obs']);

const opcoes = (lista, atual, vazio = '—') =>
  `<option value="">${esc(vazio)}</option>` +
  lista.map(([v, r]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(r)}</option>`).join('');

/** "90 kg" / "92,5 kg". @param {number} n */
const kg = (n) => `${fmtN(n, Number.isInteger(n) ? 0 : 1)} kg`;

/* ============================================================
   HTML (puro)
   ============================================================ */

/**
 * "Seg 7h · Qua 19h" — os dias de treino com a hora de cada um (a hora antiga,
 * única para a semana, vale para o dia que não tem a sua).
 * @param {any} a
 */
export function resumoDosDias(a) {
  const dias = new Set(a.diasTreino || []);
  const horas = a.horarios || {};
  const antiga = horaParaInput(a.freqHorario);
  return DIAS_FORM.filter(([v]) => dias.has(v))
    .map(([v, l]) => { const h = horas[v] || antiga; return h ? `${l} ${horaLegivel(h)}` : l; })
    .join(' · ');
}

/**
 * A linha do topo: o que o Motor vai fazer diferente com este aluno.
 * @param {any} m o retorno de `matrizDe`
 */
export function htmlResumoMotor(m) {
  const r = resumoDeAdaptacoes(m);
  const fase = rotulo(FASES, m.perfil.fase);
  const partes = [
    fase ? `Fase: <b>${esc(fase)}</b>` : '',
    m.perfil.focoPrimario ? `Foco: <b>${esc(rotulo(GRUPOS_COM_ROTULO, m.perfil.focoPrimario))}</b>` : '',
    m.cargas.rir ? `RIR <b>${esc(m.cargas.rir)}</b>` : '',
  ].filter(Boolean).join(' · ');
  return r || partes
    ? `<span class="mtz-resumo-tag">O Motor vai aplicar</span> ${[partes, esc(r)].filter(Boolean).join(' · ')}`
    : '<span class="mtz-resumo-tag mudo">Sem individualização</span> este aluno recebe o treino da turma como está.';
}

/** "Peito (primário) · Costas (secundário)". @param {any} m */
function textoDoFoco(m) {
  const { focoPrimario: p, focoSecundario: s } = m.perfil;
  return [p && `${esc(rotulo(GRUPOS_COM_ROTULO, p))} <span class="tr-sub">(primário)</span>`,
    s && `${esc(rotulo(GRUPOS_COM_ROTULO, s))} <span class="tr-sub">(secundário)</span>`].filter(Boolean).join(' · ');
}

/**
 * Card Perfil de treino.
 * @param {any} v a ficha com o rascunho @param {boolean} editando
 */
export function htmlCardPerfilTreino(v, editando) {
  const m = matrizDe(v);
  let corpo;
  if (editando) {
    const c = camposDados(v);
    corpo = `
      <form id="form-treino-perfil" class="grid-form" novalidate>
        ${c.nivel}${c.objetivo}
        <div class="field"><label>Fase atual</label><select name="fase">${opcoes(FASES, m.perfil.fase)}</select><span class="hint">O bloco em que ele está agora. O objetivo não muda de mês em mês; a fase, sim.</span></div>
        ${c.freqVezes}
        <div class="field"><label>Foco primário</label><select name="focoPrimario">${opcoes(GRUPOS_COM_ROTULO, m.perfil.focoPrimario)}</select></div>
        <div class="field"><label>Foco secundário</label><select name="focoSecundario">${opcoes(GRUPOS_COM_ROTULO, m.perfil.focoSecundario)}</select><span class="hint">O Montador tira série de onde ele está mais adiantado e põe no foco, mantendo o total da turma.</span></div>
        <p class="mtz-erro field full" data-erro-foco hidden>Os dois focos estão no mesmo grupo — o secundário será ignorado.</p>
        ${c.dias}
      </form>`;
  } else {
    const vezes = parseInt(v.freqVezes, 10);
    corpo = htmlLinhas([
      ['Nível', esc(rotulo(OPCOES_NIVEL, m.perfil.nivel))],
      ['Objetivo', esc(m.perfil.objetivo)],
      ['Fase atual', esc(rotulo(FASES, m.perfil.fase))],
      ['Frequência', vezes ? `${vezes}x por semana` : ''],
      ['Foco', textoDoFoco(m)],
      ['Dias e horários', esc(resumoDosDias(v))],
    ]);
  }
  return htmlCard({
    id: 'perfil-treino',
    titulo: 'Perfil de treino',
    acoes: botaoEditar('perfil-treino', 'o perfil de treino', editando),
    corpo,
  });
}

/**
 * Bloco de um levantamento de referência, em edição.
 *
 * Todo placeholder numérico leva "ex.:" na frente, de propósito. Com três blocos
 * iguais empilhados, um placeholder "90" num campo vazio fica logo abaixo de um
 * "90" DE VERDADE no bloco anterior — e a única diferença visual é o tom do
 * cinza. O coach leria o supino como preenchido e a carga dele sairia sem kg.
 * @param {string} id @param {string} nome @param {any} r
 */
function blocoLevantamento(id, nome, r) {
  return `
  <div class="mtz-lev" data-lev="${esc(id)}">
    <h5>${esc(nome)}</h5>
    <div class="mtz-lev-campos">
      <label>Peso (kg)<input type="text" inputmode="decimal" data-campo="kg" value="${r.kg ?? ''}" placeholder="ex.: 90" /></label>
      <label>Repetições<input type="text" inputmode="numeric" data-campo="reps" value="${r.reps ?? ''}" placeholder="ex.: 5" /></label>
      <label>1RM medido<input type="text" inputmode="decimal" data-campo="rm" value="${r.rm ?? ''}" placeholder="opcional" /></label>
      <label>Testado em<input type="date" data-campo="medidoEm" value="${esc(r.medidoEm)}" /></label>
    </div>
    <p class="mtz-lev-saida" data-saida></p>
  </div>`;
}

/**
 * O 1RM de um levantamento em leitura: o número, de onde veio e a prévia.
 * @param {any} r a referência de `matrizDe` (com `rmEfetivo`)
 */
export function textoDoLevantamento(r) {
  if (!r.rmEfetivo) return '';
  const origem = r.rm ? '1RM medido' : `estimado · ${kg(r.kg)} × ${r.reps}`;
  const aviso = !r.rm && r.reps > REPS_LIMITE_ESTIMATIVA ? ` · <b class="tr-aviso">acima de ${REPS_LIMITE_ESTIMATIVA} reps a estimativa perde a validade</b>` : '';
  return `<b class="tr-rm">${kg(r.rmEfetivo)}</b> <span class="tr-sub">${esc(origem)}${r.medidoEm ? ` · ${fmtData(r.medidoEm)}` : ''} · ${PCT_PREVIA}% ≈ ${kg(/** @type {number} */ (cargaDe1RM(r.rmEfetivo, PCT_PREVIA)))}</span>${aviso}`;
}

/**
 * Card Cargas de referência.
 * @param {any} v @param {boolean} editando
 */
export function htmlCardCargas(v, editando) {
  const m = matrizDe(v);
  const ref = m.cargas.referencia;
  const ab = m.cargas.airbike;
  let corpo;
  if (editando) {
    corpo = `
      <form id="form-treino-cargas" class="mtz" novalidate>
        <p class="hint tr-ajuda">Preencha <b>peso e repetições</b> do teste e o 1RM sai estimado (Epley). Se mediu a máxima de verdade, digite em <b>1RM medido</b> — ela ganha da estimativa. Só estes três levantamentos balizam carga no Montador.</p>
        ${LEVANTAMENTOS.map(([id, nome]) => blocoLevantamento(id, nome, ref[id])).join('')}
        <div class="mtz-grid">
          <label>Zona de RIR habitual<select name="rir">${opcoes(ZONAS_RIR, m.cargas.rir)}</select></label>
          <label>Airbike · RPM<input type="text" inputmode="numeric" name="rpm" value="${ab.rpm ?? ''}" placeholder="ex.: 60" /></label>
          <label>Airbike · cal/min<input type="text" inputmode="decimal" name="calPorMin" value="${ab.calPorMin ?? ''}" placeholder="ex.: 12" /></label>
        </div>
        <label class="mtz-full">Observação da Airbike
          <input type="text" name="airbikeObs" value="${esc(ab.obs)}" placeholder="ex.: manter cadência no metcon" /></label>
      </form>`;
  } else {
    const airbike = [ab.rpm != null ? `${ab.rpm} RPM` : '', ab.calPorMin != null ? `${fmtN(ab.calPorMin, Number.isInteger(ab.calPorMin) ? 0 : 1)} cal/min` : '', esc(ab.obs)].filter(Boolean).join(' · ');
    corpo = htmlLinhas([
      ...LEVANTAMENTOS.map(([id, nome]) => /** @type {[string, string]} */ ([nome, textoDoLevantamento(ref[id])])),
      ['Zona de RIR', esc(rotulo(ZONAS_RIR, m.cargas.rir))],
      ['Airbike', airbike],
    ]);
  }
  return htmlCard({
    id: 'cargas',
    titulo: 'Cargas de referência',
    acoes: botaoEditar('cargas', 'as cargas de referência', editando),
    corpo,
  });
}

/** As trocas fixas do Montador ("Trocar sempre"), só as válidas. @param {any} v */
export function trocasDe(v) {
  return (Array.isArray(v.restricoes) ? v.restricoes : []).filter((r) => r && r.evitarId);
}

/** O nome de um exercício; sem o catálogo carregado, o id legível. @param {string} id @param {Record<string, string>|null} nomes */
export function nomeDoExercicio(id, nomes) {
  if (nomes && nomes[id]) return nomes[id];
  const t = String(id || '').replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A lista das trocas fixas. @param {any} v @param {Record<string, string>|null} nomes */
export function htmlTrocas(v, nomes) {
  const trocas = trocasDe(v);
  if (!trocas.length) return '<p class="card-vazio">Nenhuma troca fixa.</p>';
  const ex = (/** @type {string} */ id) => `<span data-ex="${esc(id)}">${esc(nomeDoExercicio(id, nomes))}</span>`;
  return `<ul class="tr-trocas">${trocas.map((t) => `
    <li><s>${ex(t.evitarId)}</s> → ${t.substitutoId ? `<b>${ex(t.substitutoId)}</b>` : '<span class="card-vazio">sem substituto</span>'}${t.motivo ? ` <span class="tr-sub">· ${esc(t.motivo)}</span>` : ''}</li>`).join('')}
  </ul>`;
}

/**
 * Card Adaptações.
 * @param {any} v @param {boolean} editando @param {Record<string, string>|null} [nomes] os nomes dos exercícios
 */
export function htmlCardAdaptacoes(v, editando, nomes = null) {
  const a = matrizDe(v).adaptacoes;
  const regras = editando ? `
    <form id="form-treino-adapt" class="mtz" novalidate>
      <p class="hint tr-ajuda">Estas regras o sistema <b>executa sozinho</b> no dia da aula.</p>
      <div class="mtz-grid">
        <label>Impacto (salto, corrida, burpee)<select name="impacto">${opcoes(REGRAS_IMPACTO, a.impacto, '')}</select></label>
        <label>Tração (barra, puxada)<select name="tracao">${opcoes(REGRAS_TRACAO, a.tracao, '')}</select></label>
      </div>
      <fieldset class="mtz-check">
        <legend>Restrições de mobilidade</legend>
        ${RESTRICOES_MOBILIDADE.map(([val, r]) => `
          <label class="mtz-chk"><input type="checkbox" name="mobilidade" value="${esc(val)}"${a.mobilidade.includes(val) ? ' checked' : ''} /> ${esc(r)}</label>`).join('')}
      </fieldset>
      <label class="mtz-full">Observação geral das adaptações
        <input type="text" name="adaptacoesObs" value="${esc(a.obs)}" placeholder="ex.: evitar carga axial alta" /></label>
    </form>` : htmlLinhas([
    ['Impacto', esc(rotulo(REGRAS_IMPACTO, a.impacto))],
    ['Tração', esc(rotulo(REGRAS_TRACAO, a.tracao))],
    ['Mobilidade', esc(a.mobilidade.map((k) => rotulo(RESTRICOES_MOBILIDADE, k)).join(', '))],
    ['Observação', esc(a.obs)],
  ]);
  const lesoes = a.lesoes.length
    ? `<ul class="sa-lesoes">${a.lesoes.map((l) => `<li class="sa-lesao g-${esc(l.gravidade)}">${esc(descreverLesao(l))}</li>`).join('')}</ul>`
    : '<p class="card-vazio">Nenhuma lesão registrada.</p>';
  return htmlCard({
    id: 'adaptacoes',
    titulo: 'Adaptações',
    classe: 'card-largo',
    acoes: botaoEditar('adaptacoes', 'as adaptações', editando),
    corpo: `
      ${regras}
      <div class="tr-colunas">
        <div class="sa-bloco">
          <div class="tr-bloco-top"><h3 class="sa-t">Lesões ativas</h3><button class="card-btn" type="button" data-ir-aba="saude">Editar na aba Saúde</button></div>
          ${lesoes}
        </div>
        <div class="sa-bloco">
          <h3 class="sa-t">Trocas fixas do Montador</h3>
          ${htmlTrocas(v, nomes)}
          <p class="hint">Feitas no Montador Individual ("Trocar sempre") — valem em todos os dias.</p>
        </div>
      </div>`,
  });
}

/**
 * Os três cards editáveis.
 * @param {any} v @param {{ editando: Set<string>, nomes?: Record<string, string>|null }} o
 */
export function htmlEditaveis(v, { editando, nomes = null }) {
  return htmlCardPerfilTreino(v, editando.has('perfil-treino'))
    + htmlCardCargas(v, editando.has('cargas'))
    + htmlCardAdaptacoes(v, editando.has('adaptacoes'), nomes);
}

/**
 * Os três cards de leitura: Metas e evolução, Força e gasto, Feedbacks. As
 * metas, a força e o gasto chegam depois (os `id` são preenchidos pelo
 * ui-tab-progresso.js).
 * @param {any} a a ficha SALVA
 */
export function htmlFixos(a) {
  return htmlCard({
    id: 'metas',
    titulo: 'Metas e evolução',
    classe: 'card-largo',
    corpo: `
      <div class="tr-primeiro"><h3 class="sa-t">Metas do aluno</h3><div id="prog-metas"></div></div>
      <div class="sa-bloco"><h3 class="sa-t">Evolução nas avaliações</h3>${htmlEvolucao(a)}</div>
      <div class="sa-bloco"><h3 class="sa-t">Pontos que foram melhorados</h3>${htmlMelhorias(a)}</div>`,
  }) + htmlCard({
    id: 'forca',
    titulo: 'Força e gasto',
    classe: 'card-largo',
    corpo: `
      <div class="tr-colunas">
        <div><h3 class="sa-t">Evolução de força (registro de cargas)</h3><div id="prog-cargas"><div class="prog-ph">Carregando…</div></div></div>
        <div><h3 class="sa-t">Gasto calórico de treino (semana)</h3><div id="prog-nutri"><div class="prog-ph">Carregando…</div></div></div>
      </div>`,
  }) + htmlCard({
    id: 'feedbacks',
    titulo: 'Feedbacks pós-treino',
    classe: 'card-largo',
    corpo: feedbacksHTML(a),
  });
}

/**
 * A aba inteira. Os cards de leitura entram depois, por `atualizarFixos`.
 * @param {any} v @param {{ editando: Set<string>, nomes?: Record<string, string>|null }} o
 */
export function htmlAbaTreino(v, o) {
  return `
    <div class="mtz-resumo tr-motor" id="tr-motor">${htmlResumoMotor(matrizDe(v))}</div>
    <div class="cards-geral">
      <div class="tr-zona" id="treino-editaveis">${htmlEditaveis(v, o)}</div>
      <div class="tr-zona" id="treino-fixos"></div>
    </div>`;
}

/* ============================================================
   Leitura dos formulários (por caminho de campo)
   ============================================================ */

/**
 * O que um formulário tem num campo. @param {ParentNode} form @param {string} nome
 * @returns {string}
 */
const valor = (form, nome) => /** @type {any} */ (form.querySelector(`[name="${nome}"]`))?.value ?? '';

/**
 * O card Perfil de treino, por caminho. Foco e fase passam pela mesma limpeza da
 * gravação da matriz (`separarParaGravar`): o foco sai como lista ordenada
 * [primário, secundário], sem repetir o grupo.
 * @param {HTMLFormElement} form
 */
export function lerPerfil(form) {
  const base = lerCampos(form, CAMPOS.treino);
  const { topo, matriz } = separarParaGravar({
    perfil: { fase: valor(form, 'fase'), focoPrimario: valor(form, 'focoPrimario'), focoSecundario: valor(form, 'focoSecundario') },
  });
  return { ...base, foco: topo.foco, [`${CAMPO}.perfil.fase`]: matriz.perfil.fase };
}

/** O card Cargas de referência, por caminho. @param {HTMLFormElement} form */
export function lerCargas(form) {
  /** @type {any} */ const referencia = {};
  for (const bloco of $$('[data-lev]', form)) {
    const campo = (/** @type {string} */ c) => /** @type {any} */ (bloco.querySelector(`[data-campo=${c}]`))?.value ?? '';
    referencia[bloco.getAttribute('data-lev')] = { kg: campo('kg'), reps: campo('reps'), rm: campo('rm'), medidoEm: campo('medidoEm') };
  }
  const { matriz } = separarParaGravar({
    cargas: { referencia, rir: valor(form, 'rir'), airbike: { rpm: valor(form, 'rpm'), calPorMin: valor(form, 'calPorMin'), obs: valor(form, 'airbikeObs') } },
  });
  return { [`${CAMPO}.cargas`]: matriz.cargas };
}

/** O card Adaptações, por caminho — sem as lesões, que são da aba Saúde. @param {HTMLFormElement} form */
export function lerAdaptacoes(form) {
  const { matriz } = separarParaGravar({
    adaptacoes: {
      impacto: valor(form, 'impacto'),
      tracao: valor(form, 'tracao'),
      mobilidade: $$('input[name=mobilidade]:checked', form).map((c) => /** @type {any} */ (c).value),
      obs: valor(form, 'adaptacoesObs'),
    },
  });
  /** @type {Record<string, any>} */ const r = {};
  for (const k of CAMPOS_ADAPTACAO) r[`${CAMPO}.adaptacoes.${k}`] = matriz.adaptacoes[k];
  return r;
}

/**
 * A ficha com os caminhos aplicados por cima — o que o resumo do Motor mostra
 * enquanto o coach digita.
 * @param {any} v @param {Record<string, any>} caminhos
 */
export function vistaCom(v, caminhos) {
  const r = criarRascunho(v);
  for (const [c, x] of Object.entries(caminhos)) r.definir(c, x);
  return { ...v, ...r.montarPatch(v) };
}

/* ============================================================
   DOM
   ============================================================ */

/** Os cards em edição. */
const editando = new Set();
/** A ficha (com o rascunho) com que a aba foi desenhada por último. */
let vistaAtual = /** @type {any} */ (null);
/** O desenho completo acabou de preencher os cards de leitura (a abertura da aba não precisa repetir). */
let fixosAgora = false;
/** Os nomes do catálogo de exercícios (para as trocas do Montador), carregados na 1ª vez que há troca. */
let nomesEx = /** @type {Record<string, string>|null} */ (null);
let carregandoNomes = false;

/** O que está em edição, por caminho de campo (para o salvar global). */
function ler() {
  /** @type {Record<string, any>} */ const r = {};
  const form = (/** @type {string} */ id) => /** @type {any} */ ($(id));
  if (editando.has('perfil-treino') && form('#form-treino-perfil')) Object.assign(r, lerPerfil(form('#form-treino-perfil')));
  if (editando.has('cargas') && form('#form-treino-cargas')) Object.assign(r, lerCargas(form('#form-treino-cargas')));
  if (editando.has('adaptacoes') && form('#form-treino-adapt')) Object.assign(r, lerAdaptacoes(form('#form-treino-adapt')));
  return r;
}

/** Recalcula o 1RM efetivo e a prévia de carga de cada levantamento, ao vivo. */
function atualizarSaidas() {
  const form = $('#form-treino-cargas'); if (!form) return;
  const { [`${CAMPO}.cargas`]: cargas } = lerCargas(form);
  const ref = matrizDe({ [CAMPO]: { cargas } }).cargas.referencia;
  for (const bloco of $$('[data-lev]', form)) {
    const r = ref[/** @type {string} */ (bloco.getAttribute('data-lev'))];
    const saida = /** @type {any} */ (bloco.querySelector('[data-saida]'));
    if (!saida) continue;
    // `continue` e não `return`: o levantamento sem 1RM é o caso comum, e os
    // blocos seguintes ainda precisam recalcular.
    if (!r || !r.rmEfetivo) {
      saida.textContent = 'Sem 1RM — as cargas deste levantamento saem sem número em kg.';
      saida.className = 'mtz-lev-saida mudo';
      continue;
    }
    saida.innerHTML = textoDoLevantamento(r);
    saida.className = `mtz-lev-saida${!r.rm && r.reps > REPS_LIMITE_ESTIMATIVA ? ' alerta' : ''}`;
  }
}

/** Os dois focos no mesmo grupo é erro de clique, e o coach precisa ver antes de salvar. */
function conferirFoco() {
  const form = $('#form-treino-perfil'); if (!form) return;
  const aviso = /** @type {any} */ (form.querySelector('[data-erro-foco]'));
  const p = valor(form, 'focoPrimario');
  if (aviso) aviso.hidden = !(p && p === valor(form, 'focoSecundario'));
}

/** O resumo do Motor com o que está nos formulários agora. */
function atualizarResumo() {
  const el = $('#tr-motor');
  if (el && vistaAtual) el.innerHTML = htmlResumoMotor(matrizDe(vistaCom(vistaAtual, ler())));
}

/**
 * Desenha a aba com a ficha recebida (a ficha com o rascunho por cima). Para o
 * mesmo aluno, só os cards editáveis e o resumo: os de leitura ficam como estão
 * (eles se atualizam quando a aba abre, em `atualizarFixos`).
 * @param {any} v
 */
function desenhar(v) {
  const painel = $('#tab-treino'); if (!painel) return;
  vistaAtual = v;
  const id = String(v.id);
  const zona = $('#treino-editaveis');
  if (painel.dataset.aluno === id && zona) {
    zona.innerHTML = htmlEditaveis(v, { editando, nomes: nomesEx });
    const motor = $('#tr-motor'); if (motor) motor.innerHTML = htmlResumoMotor(matrizDe(v));
  } else {
    painel.innerHTML = htmlAbaTreino(v, { editando, nomes: nomesEx });
    painel.dataset.aluno = id;
    atualizarFixos();
    fixosAgora = true;
  }
  const perfil = $('#form-treino-perfil'); if (perfil) wireForm(perfil);
  atualizarSaidas();
  conferirFoco();
  if (!nomesEx && trocasDe(v).length) carregarNomes();
}

/**
 * Os cards de leitura, com a ficha do banco (uma avaliação lançada na outra aba
 * entra no gráfico), levando junto a meta digitada e não salva.
 */
function atualizarFixos() {
  const zona = $('#treino-fixos');
  if (!zona || !estado.alunoAtual) return;
  const tipo = /** @type {any} */ ($('#meta-tipo')), alvo = /** @type {any} */ ($('#meta-alvo'));
  const meta = tipo && alvo ? { tipo: tipo.value, alvo: alvo.value } : null;
  const a = db.obter(String(estado.alunoAtual.id)) || estado.alunoAtual;
  estado.alunoAtual = a;
  zona.innerHTML = htmlFixos(a);
  renderMetasCoach(a);
  if (meta) {
    const t = /** @type {any} */ ($('#meta-tipo')), v = /** @type {any} */ ($('#meta-alvo'));
    if (t && [...(t.options || [])].some((o) => o.value === meta.tipo)) t.value = meta.tipo;
    if (v) v.value = meta.alvo;
  }
  carregarGastoSemana(a);
  carregarCargasForca(a);
}

/** Busca os nomes dos exercícios (só quando há troca para mostrar) e troca o id pelo nome. */
async function carregarNomes() {
  if (carregandoNomes) return;
  carregandoNomes = true;
  try {
    const { EXERCICIO_POR_ID } = await import('../../compartilhado/dados/exercicios.js?v=24');
    nomesEx = Object.fromEntries(Object.entries(EXERCICIO_POR_ID).map(([id, e]) => [id, /** @type {any} */ (e).nome]));
  } catch (e) {
    console.warn('Catálogo de exercícios:', /** @type {any} */ (e)?.message || e);
    carregandoNomes = false;
    return;
  }
  for (const s of $$('#tab-treino [data-ex]')) {
    const el = /** @type {any} */ (s);
    el.textContent = nomeDoExercicio(el.dataset.ex, nomesEx);
  }
}

/**
 * Abre (ou fecha) a edição de um card e redesenha a aba. Exportado para os
 * testes, que não clicam.
 * @param {string} card @param {boolean} [sim]
 */
export function editarCard(card, sim = true) {
  if (sim) editando.add(card); else editando.delete(card);
  redesenharAberta();
}

/**
 * Abre a aba Treino com um card já em edição — o ✎ do card Perfil da aba Geral.
 * @param {string} card
 */
export function editarNaAbaTreino(card) {
  editando.add(card);
  emit(EVENTOS.ABRIR_ABA, 'treino');
  /** @type {any} */ ($(`#card-${card} form select, #card-${card} form input:not([disabled])`))?.focus();
}

/** A aba Treino está na tela? */
const visivel = () => !!$('#tab-treino')?.classList.contains('active') && !!$('#tela-perfil')?.classList.contains('active');

/** Liga a aba ao salvar global e ao barramento. Chamar uma vez, depois de `iniciarSalvarGlobal`. */
export function iniciarTabTreino() {
  registrarFormulario({ aba: 'treino', desenhar, ler, aposSalvar: () => editando.clear() });
  on(EVENTOS.PERFIL_ABERTO, () => {
    editando.clear();
    const p = $('#tab-treino'); if (p) delete p.dataset.aluno; // perfil reaberto começa limpo
  });
  // O salvar global desenha a aba ANTES deste ouvinte (ele liga primeiro): na
  // primeira abertura o desenho completo já trouxe os cards de leitura.
  on(EVENTOS.ABRIR_ABA, (nome) => {
    if (nome !== 'treino') return;
    if (fixosAgora) fixosAgora = false; else atualizarFixos();
  });
  // Feedback novo pelo Portal (o merge das caixas avisa): com a aba aberta, aparece.
  on(EVENTOS.REGISTROS_MUDARAM, (id) => {
    if (visivel() && estado.alunoAtual && String(estado.alunoAtual.id) === String(id)) atualizarFixos();
  });

  const painel = $('#tab-treino');
  // Depois do ouvinte do salvar global (que registra antes): o 1RM, o aviso de
  // foco e o resumo do Motor acompanham o que o coach digita.
  const aoDigitar = () => { atualizarSaidas(); conferirFoco(); atualizarResumo(); };
  painel?.addEventListener('input', aoDigitar);
  painel?.addEventListener('change', aoDigitar);
  painel?.addEventListener('click', (/** @type {any} */ e) => {
    const alvo = e.target.closest('[data-card], [data-ir-aba]');
    if (!alvo) return;
    if (alvo.dataset.card) {
      const card = alvo.dataset.card;
      editarCard(card, alvo.dataset.modo === 'editar');
      // Abriu para editar: o foco vai para o primeiro campo do card.
      if (alvo.dataset.modo === 'editar') /** @type {any} */ ($(`#card-${card} form select, #card-${card} form input:not([disabled])`))?.focus();
    } else if (alvo.dataset.irAba) {
      emit(EVENTOS.ABRIR_ABA, alvo.dataset.irAba);
    }
  });
}
