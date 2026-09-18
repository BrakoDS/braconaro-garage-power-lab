// @ts-check
/**
 * ABA "MATRIZ" DA FICHA DO ALUNO — onde o coach preenche o que faz o treino
 * coletivo virar a prescrição daquele aluno.
 *
 * É a tela que faltava: `compartilhado/regras/matriz-individualizacao.js`
 * definia a matriz e o Montador Híbrido já a lia, mas ela só existia se alguém
 * criasse o documento na mão no console do Firestore. Sem esta aba, a
 * individualização era um recurso que ninguém conseguia usar.
 *
 * ── Onde a matriz é gravada, e por que aqui ──────────────────────────────────
 * No PRÓPRIO documento do aluno, via `db.atualizar` — o mesmo `gestao/{uid}`
 * que o resto desta tela já escreve. Não numa coleção separada. Dois motivos:
 *
 *   1. `separarParaGravar()` devolve DOIS destinos: `topo` (nível, objetivo,
 *      foco, frequência — campos que já existiam e que o Portal e o montador já
 *      leem) e `matriz` (só o que é novo). Se a matriz morasse noutro
 *      documento, metade do formulário gravaria num lugar e metade noutro.
 *   2. O Montador Híbrido lê `gestao/{uid}` direto. Uma cópia noutra coleção
 *      seria uma segunda verdade sobre o mesmo aluno, e a cópia venceria por
 *      acidente no dia em que alguém esquecesse de sincronizar.
 *
 * ── O que esta tela NÃO edita ────────────────────────────────────────────────
 * `matriz.historico` (as correções de volume da semana). Ele é preenchido pelo
 * fluxo da semana, tem validade de sete dias e some sozinho — um campo desses
 * num formulário de cadastro convida o coach a digitar um número que vence na
 * segunda-feira seguinte. A leitura passa por aqui intacta, como veio.
 */
import * as db from './db.js';
import {
  CAMPO, matrizDe, separarParaGravar, e1rm, cargaDe1RM, resumoDeAdaptacoes, rotulo,
  OPCOES_NIVEL, FASES, LEVANTAMENTOS, ZONAS_RIR, REGIOES_LESAO, GRAVIDADES,
  REGRAS_IMPACTO, REGRAS_TRACAO, RESTRICOES_MOBILIDADE, GRUPOS_COM_ROTULO,
} from '../../compartilhado/regras/matriz-individualizacao.js';
import { OBJETIVO_LABELS } from '../../compartilhado/config/objetivos.js';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s, r = document) => /** @type {any} */ (r.querySelector(s));
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/**
 * Acima disto a estimativa de 1RM deixa de valer — para Epley e para qualquer
 * outra fórmula. O módulo de regras deixa a decisão de avisar para quem chama
 * (ver o comentário de `e1rm`); é aqui que ela é tomada, porque é aqui que o
 * coach está digitando e ainda dá para ele refazer o teste com menos repetições.
 */
const REPS_LIMITE_ESTIMATIVA = 12;

/** Percentual usado só na PRÉVIA de carga de trabalho ao lado do 1RM. */
const PCT_PREVIA = 70;

const opcoes = (lista, atual, vazio = '—') =>
  `<option value="">${esc(vazio)}</option>` +
  lista.map(([v, r]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(r)}</option>`).join('');

const opcoesTexto = (lista, atual, vazio = '—') =>
  `<option value="">${esc(vazio)}</option>` +
  lista.map((v) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(v)}</option>`).join('');

/* ------------------------------------------------------------------ *
 * Marcação
 * ------------------------------------------------------------------ */

/** Uma linha de lesão. `i` é só para o `name` ficar único dentro do formulário. */
function linhaLesao(l = { regiao: '', gravidade: 'leve', desde: '', obs: '' }) {
  return `
  <div class="mtz-lesao" data-lesao>
    <select data-campo="regiao" aria-label="Região da lesão">${opcoes(REGIOES_LESAO, l.regiao, 'Região…')}</select>
    <select data-campo="gravidade" aria-label="Gravidade">${opcoes(GRAVIDADES, l.gravidade, '')}</select>
    <input type="date" data-campo="desde" value="${esc(l.desde)}" aria-label="Desde quando" />
    <input type="text" data-campo="obs" value="${esc(l.obs)}" placeholder="Observação (ex.: menisco)" aria-label="Observação" />
    <button class="btn danger btn-sm" type="button" data-remover-lesao aria-label="Remover lesão">✕</button>
  </div>`;
}

/**
 * Bloco de um levantamento de referência.
 *
 * Todo placeholder numérico leva "ex.:" na frente, de propósito. Com três blocos
 * iguais empilhados, um placeholder "90" num campo vazio fica logo abaixo de um
 * "90" DE VERDADE no bloco anterior — e a única diferença visual é o tom do
 * cinza. O coach leria o supino como preenchido e a carga dele sairia sem kg
 * sem que ninguém entendesse por quê.
 */
function blocoLevantamento(id, nomeLevantamento, r) {
  return `
  <div class="mtz-lev" data-lev="${esc(id)}">
    <h5>${esc(nomeLevantamento)}</h5>
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
 * O formulário inteiro.
 * @param {any} m o retorno de `matrizDe(aluno)`
 */
function formHTML(m) {
  const ref = m.cargas.referencia;
  return `
  <div class="mtz-resumo" data-resumo></div>

  <form id="form-matriz" class="mtz">

    <section class="mtz-sec">
      <h4>Perfil e fase</h4>
      <p class="mtz-ajuda">
        <b>Objetivo</b> é o que o aluno quer e não muda de mês em mês. <b>Fase</b> é o bloco em que
        ele está agora — quem treina para emagrecer pode passar seis semanas num bloco de força.
      </p>
      <div class="mtz-grid">
        <label>Nível<select name="nivel">${opcoes(OPCOES_NIVEL, m.perfil.nivel)}</select></label>
        <label>Objetivo<select name="objetivo">${opcoesTexto(OBJETIVO_LABELS, m.perfil.objetivo)}</select></label>
        <label>Fase atual<select name="fase">${opcoes(FASES, m.perfil.fase)}</select></label>
        <label>Treinos por semana<input type="number" min="1" max="7" name="freqVezes" value="${esc(m.perfil.freqVezes)}" /></label>
        <label>Foco primário<select name="focoPrimario">${opcoes(GRUPOS_COM_ROTULO, m.perfil.focoPrimario)}</select></label>
        <label>Foco secundário<select name="focoSecundario">${opcoes(GRUPOS_COM_ROTULO, m.perfil.focoSecundario)}</select></label>
      </div>
      <p class="mtz-erro" data-erro-foco hidden>Os dois focos estão no mesmo grupo — o secundário será ignorado.</p>
    </section>

    <section class="mtz-sec">
      <h4>Cargas de referência</h4>
      <p class="mtz-ajuda">
        Preencha <b>peso e repetições</b> do teste e o 1RM sai estimado (Epley). Se você mediu a
        máxima de verdade, digite em <b>1RM medido</b> — ela ganha da estimativa.
        Só estes três levantamentos balizam carga no Montador: leg press não puxa do 1RM de
        agachamento, porque a alavanca é outra e o número sairia preciso e errado.
      </p>
      ${LEVANTAMENTOS.map(([id, nome]) => blocoLevantamento(id, nome, ref[id])).join('')}

      <div class="mtz-grid">
        <label>Zona de RIR habitual<select name="rir">${opcoes(ZONAS_RIR, m.cargas.rir)}</select></label>
        <label>Airbike · RPM<input type="text" inputmode="numeric" name="rpm" value="${m.cargas.airbike.rpm ?? ''}" placeholder="ex.: 60" /></label>
        <label>Airbike · cal/min<input type="text" inputmode="decimal" name="calPorMin" value="${m.cargas.airbike.calPorMin ?? ''}" placeholder="ex.: 12" /></label>
      </div>
      <label class="mtz-full">Observação da Airbike
        <input type="text" name="airbikeObs" value="${esc(m.cargas.airbike.obs)}" placeholder="ex.: manter cadência no metcon" /></label>
    </section>

    <section class="mtz-sec">
      <h4>Adaptações</h4>
      <p class="mtz-ajuda">
        Estas três regras são o que o sistema <b>executa sozinho</b> no dia da aula. A lista de
        lesões abaixo é o contexto para você — ela aparece na ficha, mas não troca exercício por
        conta própria.
      </p>
      <div class="mtz-grid">
        <label>Impacto (salto, corrida, burpee)<select name="impacto">${opcoes(REGRAS_IMPACTO, m.adaptacoes.impacto, '')}</select></label>
        <label>Tração (barra, puxada)<select name="tracao">${opcoes(REGRAS_TRACAO, m.adaptacoes.tracao, '')}</select></label>
      </div>

      <fieldset class="mtz-check">
        <legend>Restrições de mobilidade</legend>
        ${RESTRICOES_MOBILIDADE.map(([v, r]) => `
          <label class="mtz-chk"><input type="checkbox" name="mobilidade" value="${esc(v)}"
            ${m.adaptacoes.mobilidade.includes(v) ? 'checked' : ''} /> ${esc(r)}</label>`).join('')}
      </fieldset>

      <div class="mtz-lesoes">
        <div class="mtz-lesoes-top">
          <span>Lesões e restrições articulares</span>
          <button class="btn ghost btn-sm" type="button" id="mtz-add-lesao">+ Adicionar</button>
        </div>
        <div data-lista-lesoes>${m.adaptacoes.lesoes.map(linhaLesao).join('')}</div>
        <p class="mtz-vazio" data-lesoes-vazio ${m.adaptacoes.lesoes.length ? 'hidden' : ''}>Nenhuma lesão registrada.</p>
      </div>

      <label class="mtz-full">Observação geral das adaptações
        <input type="text" name="adaptacoesObs" value="${esc(m.adaptacoes.obs)}" placeholder="ex.: evitar carga axial alta" /></label>
    </section>

    <div class="form-actions">
      <button class="btn" type="submit">Salvar matriz</button>
      <span class="saved-flag" data-saved>Salvo ✓</span>
    </div>
  </form>`;
}

/* ------------------------------------------------------------------ *
 * Leitura do formulário
 * ------------------------------------------------------------------ */

/**
 * O formulário de volta no formato de `Matriz`.
 *
 * Não limpa nem valida nada: quem faz isso é `separarParaGravar`, que já sabe
 * descartar valor fora do vocabulário e número que não é número. Duplicar a
 * limpeza aqui criaria duas regras para o mesmo campo, e um dia elas
 * discordariam.
 *
 * `historico` volta como veio — esta tela não o edita (ver o cabeçalho).
 */
function lerForm(form, original) {
  const v = (nome) => $(`[name="${nome}"]`, form)?.value ?? '';
  /** @type {any} */
  const referencia = {};
  for (const bloco of $$('[data-lev]', form)) {
    const id = bloco.getAttribute('data-lev');
    referencia[id] = {
      kg: $('[data-campo=kg]', bloco).value,
      reps: $('[data-campo=reps]', bloco).value,
      rm: $('[data-campo=rm]', bloco).value,
      medidoEm: $('[data-campo=medidoEm]', bloco).value,
    };
  }
  return {
    versao: original.versao,
    perfil: {
      nivel: v('nivel'), objetivo: v('objetivo'), fase: v('fase'),
      focoPrimario: v('focoPrimario'), focoSecundario: v('focoSecundario'), freqVezes: v('freqVezes'),
    },
    cargas: {
      referencia,
      rir: v('rir'),
      airbike: { rpm: v('rpm'), calPorMin: v('calPorMin'), obs: v('airbikeObs') },
    },
    adaptacoes: {
      lesoes: $$('[data-lesao]', form).map((el) => ({
        regiao: $('[data-campo=regiao]', el).value,
        gravidade: $('[data-campo=gravidade]', el).value,
        desde: $('[data-campo=desde]', el).value,
        obs: $('[data-campo=obs]', el).value,
      })),
      impacto: v('impacto'),
      tracao: v('tracao'),
      mobilidade: $$('input[name=mobilidade]:checked', form).map((c) => c.value),
      obs: v('adaptacoesObs'),
    },
    historico: original.historico,
    atualizadoEm: original.atualizadoEm,
  };
}

/* ------------------------------------------------------------------ *
 * Montagem
 * ------------------------------------------------------------------ */

/**
 * Monta a aba na ficha do aluno.
 *
 * @param {any} aluno a ficha vinda de `db.obter`
 * @param {{aoSalvar?: (aluno: any) => void}} [opcoes] avisa a tela-mãe (ela
 *        republica o Portal e atualiza o cabeçalho do perfil)
 */
export function montar(aluno, { aoSalvar } = {}) {
  const alvo = $('#tab-matriz');
  if (!alvo || !aluno) return;

  const original = matrizDe(aluno);
  alvo.innerHTML = formHTML(original);
  const form = $('#form-matriz', alvo);

  /** Recalcula o 1RM efetivo e a prévia de carga, ao vivo. */
  function atualizarSaidas() {
    for (const bloco of $$('[data-lev]', form)) {
      const kg = $('[data-campo=kg]', bloco).value;
      const reps = $('[data-campo=reps]', bloco).value;
      const rm = $('[data-campo=rm]', bloco).value;
      const saida = $('[data-saida]', bloco);
      const estimado = e1rm(kg, reps);
      const efetivo = Number(String(rm).replace(',', '.')) > 0 ? Number(String(rm).replace(',', '.')) : estimado;

      // `continue` e não `return`: o levantamento sem 1RM é o caso comum (a
      // maioria das fichas tem só um dos três medido), e um `return` aqui
      // deixaria os blocos seguintes sem recalcular — o coach digitaria o supino
      // e o campo do terra ficaria parado no valor antigo.
      if (!efetivo) {
        saida.textContent = 'Sem 1RM — as cargas deste levantamento saem sem número em kg.';
        saida.className = 'mtz-lev-saida mudo';
        continue;
      }

      const origem = rm ? '1RM medido' : 'estimado por Epley';
      const trabalho = cargaDe1RM(efetivo, PCT_PREVIA);
      const repsNum = Number(String(reps).replace(',', '.'));
      // Acima de 12 repetições a estimativa deixa de valer para qualquer
      // fórmula. Avisar aqui é o que dá ao coach a chance de refazer o teste com
      // menos reps, em vez de a carga da aula sair de um número que não
      // significa nada.
      const alerta = !rm && repsNum > REPS_LIMITE_ESTIMATIVA
        ? ` · <b>acima de ${REPS_LIMITE_ESTIMATIVA} reps a estimativa perde a validade — meça a máxima</b>`
        : '';
      saida.innerHTML = `1RM: <b>${efetivo} kg</b> (${origem}) · ${PCT_PREVIA}% ≈ <b>${trabalho} kg</b>${alerta}`;
      saida.className = `mtz-lev-saida${alerta ? ' alerta' : ''}`;
    }
  }

  /** Repete o resumo do topo — o que o Motor vai fazer diferente com este aluno. */
  function atualizarResumo(m) {
    const r = resumoDeAdaptacoes(m);
    const el = $('[data-resumo]', alvo);
    const fase = rotulo(FASES, m.perfil.fase);
    const partes = [
      fase ? `Fase: <b>${esc(fase)}</b>` : '',
      m.perfil.focoPrimario ? `Foco: <b>${esc(rotulo(GRUPOS_COM_ROTULO, m.perfil.focoPrimario))}</b>` : '',
      m.cargas.rir ? `RIR <b>${esc(m.cargas.rir)}</b>` : '',
    ].filter(Boolean).join(' · ');
    el.innerHTML = r || partes
      ? `<span class="mtz-resumo-tag">O Motor vai aplicar</span> ${[partes, esc(r)].filter(Boolean).join(' · ')}`
      : '<span class="mtz-resumo-tag mudo">Sem individualização</span> este aluno recebe o treino da turma como está.';
  }

  /** Os dois focos no mesmo grupo é erro de clique, e o coach precisa ver antes de salvar. */
  function conferirFoco() {
    const p = $('[name=focoPrimario]', form).value;
    const s = $('[name=focoSecundario]', form).value;
    $('[data-erro-foco]', form).hidden = !(p && p === s);
  }

  form.addEventListener('input', () => { atualizarSaidas(); conferirFoco(); });
  form.addEventListener('change', () => { atualizarSaidas(); conferirFoco(); });

  $('#mtz-add-lesao', form).addEventListener('click', () => {
    $('[data-lista-lesoes]', form).insertAdjacentHTML('beforeend', linhaLesao());
    $('[data-lesoes-vazio]', form).hidden = true;
  });

  form.addEventListener('click', (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('[data-remover-lesao]');
    if (!b) return;
    b.closest('[data-lesao]')?.remove();
    $('[data-lesoes-vazio]', form).hidden = $$('[data-lesao]', form).length > 0;
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const editada = lerForm(form, original);
    const { topo, matriz } = separarParaGravar(editada);
    // Os dois destinos num `atualizar` só: `db.atualizar` faz `Object.assign` no
    // documento do aluno, então topo e matriz caem cada um no seu lugar, e a
    // gravação na nuvem acontece uma vez.
    db.atualizar(aluno.id, { ...topo, [CAMPO]: matriz });

    const salvo = db.obter(aluno.id);
    atualizarResumo(matrizDe(salvo));
    const flag = $('[data-saved]', form);
    flag.classList.add('show');
    setTimeout(() => flag.classList.remove('show'), 1600);
    if (aoSalvar) aoSalvar(salvo);
  });

  atualizarSaidas();
  atualizarResumo(original);
  conferirFoco();
}
