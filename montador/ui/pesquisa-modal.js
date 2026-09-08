// @ts-check
/**
 * MODAL DE PESQUISA — a tela que aparece quando o coach digita, no Treino
 * Livre, um exercício/mobilidade/técnica que não existe no catálogo do box.
 *
 * `abrirPesquisa({ termo, contexto })` (Task 4 é quem chama isto) devolve uma
 * Promise que resolve com `{ id }` do que foi cadastrado, ou `null` se o coach
 * cancelou. A busca de verdade mora em `pesquisa.js`; este arquivo só desenha a
 * proposta e grava na Academia — quem decide se cadastra é o coach, com um
 * clique em "Cadastrar", nunca automaticamente.
 *
 * POR QUE ESTE MODAL NÃO REUSA `#modal-app`/`dialogo.js`: `confirmar()`/`painel()`
 * resolvem a Promise no primeiro clique em QUALQUER `[data-acao]` do overlay
 * compartilhado — o modelo certo para "confirmar sim/não", errado para esta
 * tela, que precisa sobreviver a um refetch assíncrono ("Pesquisar na
 * internet") sem fechar, e cujos botões internos não podem ser confundidos com
 * um fechamento. Construir um overlay próprio (mesmas classes visuais —
 * `.modal-bg`, `.modal`, `.modal-hd/bd/ft` — então o visual é idêntico ao
 * resto do site) evita esse conflito sem duplicar a lógica de `dialogo.js`
 * para um caso que ela não cobre.
 */
import * as academia from '../../academia/db.js';
import { pesquisarItem } from './pesquisa.js';
import { PADROES, PADRAO_LABEL, MUSCULOS } from '../../compartilhado/config/padroes.js';
import { MUSC_MAP } from '../../academia/data/seed.js';
import { NIVEIS, NIVEL_LABEL } from '../core/niveis.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));

/** Os mesmos 11 músculos que o schema da IA aceita (`MUSCULOS_LABEL` em
 * `functions/src/pesquisa.ts`) — mas construído aqui a partir das fontes REAIS
 * do site (`MUSCULOS` de `config/padroes.js` traduzido pelo `MUSC_MAP` de
 * `academia/data/seed.js`), não copiado à mão: se um músculo for adicionado a
 * `MUSCULOS`, a lista de checkboxes acompanha sozinha. */
const MUSCULOS_LABEL = MUSCULOS.map((m) => MUSC_MAP[m]).filter(Boolean);

const TITULO_CONTEXTO = { exercicio: 'exercício', mobilidade: 'mobilidade', tecnica: 'técnica' };

/* ============================================================================
 * VIEW PURA — recebe dados, devolve string de HTML. Nenhuma função abaixo toca
 * `document`: é o que permite testar a fuga de HTML malicioso (nome, obs,
 * resumo, comoExecutar, objetivo, equipamentoFaltante, fontes — tudo texto que
 * veio da IA e não é escapado no servidor de propósito, ver `pesquisa.ts`) sem
 * precisar de um DOM de verdade.
 * ========================================================================= */

/** Só é link se começar com http(s) — o servidor já filtra por `startsWith('http')`
 * antes de mandar `fontes`, mas confere de novo aqui: é a última linha de defesa
 * antes de um `href` ir para o HTML, e não custa nada mantê-la. */
export const ehUrlSegura = (s) => /^https?:\/\//i.test(String(s || ''));

/** Lista de fontes (URLs que a IA disse ter usado) como links — nunca como
 * `javascript:`/`data:`, mesmo que `ehUrlSegura` tivesse uma falha: uma URL que
 * não passa no teste vira texto simples, não link, e não desaparece (o coach
 * ainda pode copiar/conferir manualmente). */
export function fontesHTML(fontes) {
  const lista = (Array.isArray(fontes) ? fontes : []).filter((f) => typeof f === 'string' && f.trim());
  if (!lista.length) return '';
  const itens = lista.map((f) => (
    ehUrlSegura(f)
      ? `<li><a href="${esc(f)}" target="_blank" rel="noopener">${esc(f)}</a></li>`
      : `<li>${esc(f)}</li>`
  )).join('');
  return `<div class="field full"><label>Fontes</label><ul class="pesq-fontes">${itens}</ul></div>`;
}

/** Aviso de equipamento que o exercício pede e o box não tem — em destaque, ANTES
 * dos campos do formulário: é a decisão do coach (ver Regra 4 do brief), a IA
 * nunca inventa equipamento novo no inventário dele. */
export function equipamentoFaltanteHTML(lista) {
  const itens = (Array.isArray(lista) ? lista : []).filter((s) => typeof s === 'string' && s.trim());
  if (!itens.length) return '';
  return `<div class="pesq-aviso">
    <p><b>⚠ Este exercício costuma pedir equipamento que o box não tem:</b></p>
    <div class="pesq-aviso-chips">${itens.map((s) => `<span class="chip falta">${esc(s)}</span>`).join('')}</div>
    <p class="mut">A pesquisa não cadastra equipamento novo sozinha — decida se quer criar em /academia ou seguir sem ele.</p>
  </div>`;
}

/** `<option>`s de um select a partir de pares [valor, rótulo]. */
function opcoesHTML(pares, atual) {
  return pares.map(([valor, rotulo]) => `<option value="${esc(valor)}"${valor === atual ? ' selected' : ''}>${esc(rotulo)}</option>`).join('');
}

/** Grade de checkboxes (músculos, tags, equipamento) a partir de itens {valor, rotulo}. */
function checklistHTML(campo, itens, marcados) {
  if (!itens.length) return '<p class="mut">Nada cadastrado.</p>';
  const m = new Set(Array.isArray(marcados) ? marcados : []);
  return itens.map((it, i) => {
    const id = `pesq-${campo}-${i}`;
    const marcado = m.has(it.valor);
    return `<label class="pesq-chk${marcado ? ' marcado' : ''}" for="${id}">
      <input type="checkbox" id="${id}" name="${campo}" value="${esc(it.valor)}"${marcado ? ' checked' : ''} />
      <span>${esc(it.rotulo)}</span>
    </label>`;
  }).join('');
}

/** Linha de contexto acima do formulário: quantas pesquisas restam hoje e se
 * esta rodada específica buscou na internet (o coach pediu ou não). */
function infoTopoHTML(restantes, buscou) {
  const chip = buscou ? '<span class="chip acc">Buscou na internet</span> ' : '';
  const txt = Number.isFinite(restantes) ? `Pesquisas restantes: ${restantes}` : '';
  if (!chip && !txt) return '';
  return `<p class="mut pesq-restantes">${chip}${esc(txt)}</p>`;
}

/** Formulário de exercício/mobilidade — Regra 3 do brief: nome, padrão, músculos,
 * tags, equipamento (só do inventário), nível, tempo médio, observação. */
export function formularioExercicioHTML({ proposta: p, equipamentos, restantes, buscou }) {
  const musculosItens = MUSCULOS_LABEL.map((m) => ({ valor: m, rotulo: m }));
  const tagsItens = academia.TAGS.map((t) => ({ valor: t, rotulo: t }));
  const equipItens = (equipamentos || []).map((e) => ({ valor: e.id, rotulo: e.nome }));
  const tempo = Number.isFinite(p.tempoMedioSeg) ? p.tempoMedioSeg : '';
  return `
    ${infoTopoHTML(restantes, buscou)}
    ${equipamentoFaltanteHTML(p.equipamentoFaltante)}
    <div class="pesq-grid">
      <div class="field full"><label for="pesq-nome">Nome</label>
        <input type="text" id="pesq-nome" name="nome" value="${esc(p.nome)}" /></div>
      <div class="field"><label for="pesq-padrao">Padrão de movimento</label>
        <select id="pesq-padrao" name="padrao">${opcoesHTML(PADROES.map((k) => [k, PADRAO_LABEL[k]]), p.padrao)}</select></div>
      <div class="field"><label for="pesq-nivel">Nível</label>
        <select id="pesq-nivel" name="nivel">${opcoesHTML(NIVEIS.map((k) => [k, NIVEL_LABEL[k]]), p.nivel)}</select></div>
      <div class="field"><label for="pesq-tempo">Tempo médio (segundos)</label>
        <input type="number" id="pesq-tempo" name="tempoMedioSeg" min="5" max="600" value="${esc(tempo)}" /></div>
      <div class="field"><label for="pesq-multi">Tipo de movimento</label>
        <select id="pesq-multi" name="multiarticular">${opcoesHTML([['1', 'Composto (várias articulações)'], ['0', 'Isolamento (um músculo só)']], p.multiarticular === false ? '0' : '1')}</select></div>
    </div>
    <div class="field full"><label for="pesq-obs">Observação</label>
      <textarea id="pesq-obs" name="obs" rows="3">${esc(p.obs)}</textarea></div>
    <div class="pesq-chk-grupo"><label>Músculos</label>
      <div class="pesq-chk-lista">${checklistHTML('musculos', musculosItens, p.musculos)}</div></div>
    <div class="pesq-chk-grupo"><label>Tags</label>
      <div class="pesq-chk-lista">${checklistHTML('tags', tagsItens, p.tags)}</div></div>
    <div class="pesq-chk-grupo"><label>Equipamento (só do seu inventário)</label>
      <div class="pesq-chk-lista">${checklistHTML('equipamentoIds', equipItens, p.equipamentoIds)}</div></div>
    ${fontesHTML(p.fontes)}
  `;
}

/** Formulário de técnica — Regra 4 do brief: nome, resumo, como executar, objetivo. */
export function formularioTecnicaHTML({ proposta: p, restantes, buscou }) {
  return `
    ${infoTopoHTML(restantes, buscou)}
    <div class="field full"><label for="pesq-nome">Nome</label>
      <input type="text" id="pesq-nome" name="nome" value="${esc(p.nome)}" /></div>
    <div class="field full"><label for="pesq-resumo">Resumo</label>
      <textarea id="pesq-resumo" name="resumo" rows="2">${esc(p.resumo)}</textarea></div>
    <div class="field full"><label for="pesq-como">Como executar</label>
      <textarea id="pesq-como" name="comoExecutar" rows="6">${esc(p.comoExecutar)}</textarea></div>
    <div class="field full"><label for="pesq-objetivo">Objetivo</label>
      <textarea id="pesq-objetivo" name="objetivo" rows="2">${esc(p.objetivo)}</textarea></div>
    ${fontesHTML(p.fontes)}
  `;
}

export function corpoProcurandoHTML(termo, buscarNaWeb) {
  const aviso = buscarNaWeb
    ? '<p class="pesq-aviso-lento">Isso pode levar de 10 a 20 segundos porque está buscando na internet — a tela não travou.</p>'
    : '<p class="mut">Só um instante…</p>';
  return `<div class="pesq-carregando"><p>Pesquisando “<b>${esc(termo)}</b>”…</p>${aviso}</div>`;
}

export function corpoErroHTML(mensagem) {
  return `<div class="pesq-erro"><p><b>Não deu para pesquisar.</b></p><p>${esc(mensagem || 'Tente de novo.')}</p></div>`;
}

/* ============================================================================
 * MESCLA — pura (sem DOM), mas é a peça central da Regra 6 do brief: refazer a
 * pesquisa com `buscarNaWeb: true` sem jogar fora o que o coach já editou.
 * ========================================================================= */

const CAMPOS_EDITAVEIS = {
  tecnica: ['nome', 'resumo', 'comoExecutar', 'objetivo'],
  exercicio: ['nome', 'padrao', 'musculos', 'tags', 'equipamentoIds', 'nivel', 'tempoMedioSeg', 'multiarticular', 'obs'],
};

/** Compara por valor — inclusive arrays de checkbox, onde ordem não importa. */
function difere(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const norm = (v) => [...new Set(Array.isArray(v) ? v : [])].sort().join('\u0000');
    return norm(a) !== norm(b);
  }
  return a !== b;
}

/**
 * Funde a proposta nova (a que acabou de voltar de `pesquisarItem`) com o que
 * está no formulário AGORA (`atual`), usando `base` — a proposta que gerou
 * aquele formulário na última renderização — como referência do que é "original"
 * vs. "editado". Campo que o coach mexeu (difere de `base`) sobrevive; campo
 * intocado assume o valor da pesquisa nova. `equipamentoFaltante`/`fontes` não
 * são editáveis, então vêm sempre de `nova`.
 * @param {any} base @param {any} atual @param {any} nova
 * @returns {any}
 */
export function mesclarProposta(base, atual, nova) {
  const campos = CAMPOS_EDITAVEIS[nova?.tipo] || [];
  const mesclada = { ...nova };
  for (const c of campos) {
    if (base && atual && difere(atual[c], base[c])) mesclada[c] = atual[c];
  }
  return mesclada;
}

/* ============================================================================
 * DOM — o overlay em si, os estados (procurando/proposta/erro) e a orquestração
 * de rede + gravação. Não há teste automatizado para esta metade: os stubs de
 * Node (~6 linhas, mesmo padrão de `livre.test.js`) não simulam formulário nem
 * clique de verdade. Ver relatório da Task 3 para o que ficou sem cobertura.
 * ========================================================================= */

let montado = false;
function garantirDom() {
  if (montado) return;
  montado = true;
  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div class="modal-bg" id="pesq-modal-bg" hidden>
      <div class="modal largo" role="dialog" aria-modal="true" aria-labelledby="pesq-modal-titulo">
        <div class="modal-hd">
          <h3 id="pesq-modal-titulo"></h3>
          <button class="modal-x" type="button" id="pesq-modal-x" aria-label="Fechar">×</button>
        </div>
        <div class="modal-bd" id="pesq-modal-corpo"></div>
        <div class="modal-ft" id="pesq-modal-acoes"></div>
      </div>
    </div>`;
  document.body.appendChild(/** @type {Node} */ (tpl.querySelector('.modal-bg')));
}

/**
 * Abre o modal de pesquisa para `termo` no `contexto` dado. Chamado pelo Treino
 * Livre (Task 4) quando o coach pede para pesquisar um item que não existe no
 * catálogo. Dispara a via rápida (`buscarNaWeb:false`) imediatamente — o botão
 * "Pesquisar na internet" dentro do modal é quem pede a via lenta.
 * @param {{termo: string, contexto: 'exercicio'|'mobilidade'|'tecnica'}} args
 * @returns {Promise<{id: string} | null>}
 */
export function abrirPesquisa({ termo, contexto }) {
  garantirDom();
  $('#pesq-modal-titulo').textContent = `Pesquisar ${TITULO_CONTEXTO[contexto] || 'item'}`;

  return new Promise((resolve) => {
    const bg = /** @type {HTMLElement} */ ($('#pesq-modal-bg'));
    let resolvido = false;
    /** @param {{id:string}|null} valor */
    const encerrar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      document.removeEventListener('keydown', onEsc);
      bg.removeEventListener('click', onBgClick);
      bg.hidden = true;
      document.body.style.overflow = '';
      resolve(valor);
    };
    const onEsc = (ev) => { if (/** @type {KeyboardEvent} */ (ev).key === 'Escape') encerrar(null); };
    const onBgClick = (ev) => { if (ev.target === bg) encerrar(null); };
    document.addEventListener('keydown', onEsc);
    bg.addEventListener('click', onBgClick);
    $('#pesq-modal-x').onclick = () => encerrar(null);

    // `baseProposta` é a proposta que gerou o formulário atualmente na tela —
    // referência para `mesclarProposta` saber o que o coach editou à mão.
    let baseProposta = /** @type {any} */ (null);

    /** @param {string} tipo */
    function lerFormulario(tipo) {
      const form = /** @type {HTMLFormElement} */ ($('#pesq-form'));
      const val = (nome) => /** @type {HTMLInputElement} */ (form.querySelector(`[name="${nome}"]`))?.value ?? '';
      const marcados = (nome) => Array.from(form.querySelectorAll(`[name="${nome}"]:checked`))
        .map((el) => /** @type {HTMLInputElement} */ (el).value);
      if (tipo === 'tecnica') {
        return { tipo, nome: val('nome'), resumo: val('resumo'), comoExecutar: val('comoExecutar'), objetivo: val('objetivo') };
      }
      return {
        tipo, nome: val('nome'), padrao: val('padrao'), nivel: val('nivel'),
        tempoMedioSeg: Number(val('tempoMedioSeg')) || 0, obs: val('obs'),
        multiarticular: val('multiarticular') !== '0',
        musculos: marcados('musculos'), tags: marcados('tags'), equipamentoIds: marcados('equipamentoIds'),
      };
    }

    function renderProposta(proposta, restantes, buscou, equipamentos) {
      const corpo = proposta.tipo === 'tecnica'
        ? formularioTecnicaHTML({ proposta, restantes, buscou })
        : formularioExercicioHTML({ proposta, equipamentos, restantes, buscou });
      // O aviso de validação vive FORA do <form>: `renderProposta` só é chamado
      // quando chega proposta nova, então um aviso dentro do form sumiria junto
      // com ele — e o coach clicaria em "Cadastrar" de novo sem entender.
      $('#pesq-modal-corpo').innerHTML = `<form id="pesq-form">${corpo}</form><p class="pesq-erro-form" id="pesq-erro-form"></p>`;
      $('#pesq-modal-acoes').innerHTML = `
        <button class="btn ghost" type="button" id="pesq-btn-cancelar">Cancelar</button>
        <button class="btn ghost" type="button" id="pesq-btn-web">Pesquisar na internet</button>
        <button class="btn" type="button" id="pesq-btn-salvar">Cadastrar</button>`;
      $('#pesq-btn-cancelar').onclick = () => encerrar(null);
      $('#pesq-btn-web').onclick = () => buscar(true);
      $('#pesq-btn-salvar').onclick = () => salvar();
      // Realce visual do chip marcado — feito via classe em vez de CSS `:has()`
      // para não depender de suporte recente do navegador à toa.
      $('#pesq-form').querySelectorAll('input[type=checkbox]').forEach((chk) => {
        chk.addEventListener('change', () => {
          const rotulo = chk.closest('label');
          if (rotulo) rotulo.classList.toggle('marcado', /** @type {HTMLInputElement} */ (chk).checked);
        });
      });
    }

    function renderErro(mensagem, buscarNaWeb) {
      $('#pesq-modal-corpo').innerHTML = corpoErroHTML(mensagem);
      $('#pesq-modal-acoes').innerHTML = `
        <button class="btn ghost" type="button" id="pesq-btn-cancelar">Cancelar</button>
        <button class="btn" type="button" id="pesq-btn-tentar">Tentar de novo</button>`;
      $('#pesq-btn-cancelar').onclick = () => encerrar(null);
      $('#pesq-btn-tentar').onclick = () => buscar(buscarNaWeb);
    }

    function salvar() {
      const v = lerFormulario(contexto);
      // Mesma exigência do formulário de /academia: exercício sem NENHUM
      // equipamento fica de fora da conta de viabilidade e escapa da regra do
      // Híbrido, que reconhece peso corporal por `equipamento === ['corporal']`
      // e não por lista vazia. Sem isto, um "muscle up" cadastrado sem marcar
      // nada viraria um exercício que o gerador nunca classifica direito.
      if (contexto !== 'tecnica' && !v.equipamentoIds.length) {
        $('#pesq-erro-form').textContent = 'Marque ao menos um equipamento — use "Peso corporal" se o exercício não usa aparelho.';
        return;
      }
      // Só grava no clique — nunca antes. A proposta é uma sugestão; quem decide é o coach.
      const criado = contexto === 'tecnica'
        ? academia.salvarTecnica({ nome: v.nome, resumo: v.resumo, comoExecutar: v.comoExecutar, objetivo: v.objetivo, ativo: true })
        : academia.salvarExerc({
          nome: v.nome, padrao: v.padrao, musculos: v.musculos, tags: v.tags,
          equipamentoIds: v.equipamentoIds, nivel: v.nivel, tempoMedioSeg: v.tempoMedioSeg,
          multiarticular: v.multiarticular, obs: v.obs, ativo: true,
        });
      encerrar({ id: criado.id });
    }

    async function buscar(buscarNaWeb) {
      // PRIMEIRA COISA, antes de qualquer troca de innerHTML: se já existe um
      // formulário na tela (é um refetch, não a primeira busca), captura o que o
      // coach editou. A ordem aqui não é estilo — `corpoProcurandoHTML` substitui
      // `#pesq-modal-corpo`, e com ele some o `#pesq-form` que `lerFormulario`
      // procura. Ler depois devolvia null e estourava, travando o modal em
      // "Pesquisando…" em toda segunda busca — justamente o caminho normal de uso
      // (a busca rápida acha algo e o coach pede para enriquecer com a web).
      const edicoes = baseProposta ? lerFormulario(contexto) : null;

      $('#pesq-modal-corpo').innerHTML = corpoProcurandoHTML(termo, buscarNaWeb);
      $('#pesq-modal-acoes').innerHTML = `<button class="btn ghost" type="button" id="pesq-btn-cancelar">Cancelar</button>`;
      $('#pesq-btn-cancelar').onclick = () => encerrar(null);
      bg.hidden = false;
      document.body.style.overflow = 'hidden';

      const equipamentos = academia.listarInventario().map((e) => ({ id: e.id, nome: e.nome }));
      try {
        const r = await pesquisarItem({ termo, contexto, equipamentos, buscarNaWeb });
        const proposta = edicoes ? mesclarProposta(baseProposta, edicoes, r.proposta) : r.proposta;
        baseProposta = r.proposta; // a próxima diff compara contra o que a IA respondeu agora, não contra a mesclada
        if (!resolvido) renderProposta(proposta, r.restantes, r.buscou, equipamentos);
      } catch (e) {
        if (!resolvido) renderErro(/** @type {any} */ (e)?.message, buscarNaWeb);
      }
    }

    buscar(false);
  });
}
