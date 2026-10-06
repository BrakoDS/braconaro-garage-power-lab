// @ts-check
/**
 * O HTML da troca de exercício — a lista de opções e o aviso de conflito —
 * como STRING, para o teste rodar no Node. Os dois vão dentro do `painel()` de
 * `compartilhado/ui/dialogo.js`: todo `[data-acao]` do corpo fecha o modal e
 * devolve o id, que é como `troca.js` sabe o que o coach escolheu.
 */
import {
  NOME_INSTANCIA, acoesDoConflito, acoesDoConflitoHiit, rotuloDias, rotuloSlots, selosDaOpcao, selosDaOpcaoHiit, textoConflitos,
  NIVEIS_HYROX, NOME_PADRAO_CROSS, NOME_RECURSO, UNIDADE_HYROX, acoesDoConflitoCross, selosDaOpcaoCross, textoSegundos,
} from '../core/vista.js';
import { esc } from './render.js';

/**
 * A lista de opções para uma vaga. Por padrão, só a instância da vaga (mantém a
 * matriz do H); `todas` mostra o catálogo inteiro.
 * @param {{vaga: any, opcoes: any[]}} r resposta de `opcoesTrocaBox`
 * @param {boolean} todas
 */
export function renderOpcoes(r, todas) {
  const { vaga } = r;
  const lista = todas ? r.opcoes : r.opcoes.filter((o) => o.mesmaInstancia);
  const itens = lista.map((o) => {
    const selos = selosDaOpcao(o.conflitos);
    const travado = o.conflitos.mesmoBloco || !!o.conflitos.noHiit?.length;
    return `<li><button class="troca-opcao${selos.length ? ' com-conflito' : ''}" type="button"
        ${travado ? 'disabled aria-disabled="true"' : `data-acao="escolher:${esc(o.exercicioId)}"`}>
      <span class="troca-nome">${esc(o.nome)}</span>
      ${o.mesmaInstancia ? '' : `<span class="troca-inst">${esc(NOME_INSTANCIA[o.instancia] ?? o.instancia)}</span>`}
      ${selos.map((s) => `<span class="troca-selo selo-${esc(s.id)}">${esc(s.rotulo)}</span>`).join('')}
    </button></li>`;
  }).join('');
  return `<p class="dlg-texto">
      <b>${esc(vaga.sessao)} · vaga ${esc(vaga.posicao)}</b> — ${esc(NOME_INSTANCIA[vaga.instancia] ?? vaga.instancia)}
      <span class="mut">· ${esc(rotuloDias(vaga.dias))}</span><br />
      <span class="mut">Hoje: ${esc(vaga.atual?.nome)}</span>
    </p>
    <ul class="troca-lista">${itens || '<li class="mut">Nenhuma outra opção nesta instância.</li>'}</ul>
    <button class="btn ghost troca-filtro" type="button" data-acao="${todas ? 'instancia' : 'todas'}">
      ${todas ? `Só ${esc(NOME_INSTANCIA[vaga.instancia] ?? vaga.instancia)}` : 'Ver todos os exercícios'}
    </button>`;
}

/**
 * O aviso de uma opção com conflito: o que acontece e como seguir. Equipamento
 * acima do limite não oferece "manter" — a semana não publica assim.
 * `fechar` é o rótulo do botão que fecha sem escolher — "Cancelar a troca".
 * @param {{vaga: any}} r @param {any} opcao
 * @returns {{titulo: string, corpoHTML: string, acoes: {id: string, label: string, secundaria?: boolean}[], fechar: string}}
 */
export function renderAvisoTroca(r, opcao) {
  const linhas = textoConflitos(opcao.conflitos, r.vaga.sessao);
  return {
    titulo: `Trocar por ${opcao.nome}?`,
    corpoHTML: `<p class="dlg-texto">${esc(r.vaga.sessao)} · vaga ${esc(r.vaga.posicao)} (${esc(rotuloDias(r.vaga.dias))}):
        <b>${esc(r.vaga.atual?.nome)}</b> → <b>${esc(opcao.nome)}</b></p>
      <ul class="troca-conflitos">${linhas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
    acoes: acoesDoConflito(opcao),
    fechar: 'Cancelar a troca',
  };
}

/* ───────────────────────────── troca no HIIT ───────────────────────────── */

/**
 * A lista de opções para uma vaga do HIIT: só os exercícios da estação (o
 * servidor já filtrou). Bloqueada fica DESABILITADA, com o selo que diz por quê
 * — tamanho, equipamento, TRX em outra estação, H3 do dia, já no HIIT.
 * @param {{vaga: any, opcoes: any[]}} r resposta de `opcoesTrocaHiitBox`
 */
export function renderOpcoesHiit(r) {
  const { vaga } = r;
  const itens = r.opcoes.map((o) => {
    const selos = selosDaOpcaoHiit(o);
    return `<li><button class="troca-opcao${selos.length ? ' com-conflito' : ''}" type="button"
        ${o.bloqueada ? 'disabled aria-disabled="true"' : `data-acao="escolher:${esc(o.exercicioId)}"`}>
      <span class="troca-nome">${esc(o.nome)}</span>
      ${o.unilateral ? '<span class="troca-inst">unilateral (D/E)</span>' : ''}
      ${selos.map((x) => `<span class="troca-selo selo-${esc(x.id)}">${esc(x.rotulo)}</span>`).join('')}
    </button></li>`;
  }).join('');
  const livres = r.opcoes.filter((o) => !o.bloqueada).length;
  return `<p class="dlg-texto">
      <b>${esc(vaga.nome)} · ${esc(rotuloSlots(vaga.slots))}</b>${vaga.unilateral ? ' <span class="mut">(unilateral)</span>' : ''}
      <span class="mut">· ${esc(rotuloDias(vaga.dias))}</span><br />
      <span class="mut">Hoje: ${esc(vaga.atual?.nome)}</span>
    </p>
    <ul class="troca-lista">${itens || '<li class="mut">A estação não tem outro exercício no catálogo.</li>'}</ul>
    ${livres ? '' : '<p class="mut">Nenhuma opção cabe agora: todas esbarram em tamanho, equipamento ou repetição no dia.</p>'}`;
}

/**
 * O aviso de uma opção do HIIT que quebra o rodízio (a única que pergunta).
 * `fechar` é o "Cancelar a troca".
 * @param {{vaga: any}} r @param {any} opcao
 * @returns {{titulo: string, corpoHTML: string, acoes: {id: string, label: string, secundaria?: boolean}[], fechar: string}}
 */
export function renderAvisoHiit(r, opcao) {
  return {
    titulo: `Trocar por ${opcao.nome}?`,
    corpoHTML: `<p class="dlg-texto">${esc(r.vaga.nome)} · ${esc(rotuloSlots(r.vaga.slots))} (${esc(rotuloDias(r.vaga.dias))}):
        <b>${esc(r.vaga.atual?.nome)}</b> → <b>${esc(opcao.nome)}</b></p>
      <ul class="troca-conflitos"><li>Esteve no HIIT da semana passada: quebra o rodízio.</li></ul>`,
    acoes: acoesDoConflitoHiit(opcao),
    fechar: 'Cancelar a troca',
  };
}

/* ───────────────────────────── troca no WOD ───────────────────────────── */

/**
 * A lista de opções para um movimento do WOD: o pool do Cross (o servidor já
 * ordenou: livres, rodízio, bloqueados; o padrão da vaga primeiro). Bloqueada
 * fica DESABILITADA, com o selo que diz por quê.
 * @param {{vaga: any, opcoes: any[]}} r resposta de `opcoesTrocaCrossBox`
 */
export function renderOpcoesCross(r) {
  const { vaga } = r;
  const itens = r.opcoes.map((o) => {
    const selos = selosDaOpcaoCross(o);
    return `<li><button class="troca-opcao${selos.length ? ' com-conflito' : ''}" type="button"
        ${o.bloqueada ? 'disabled aria-disabled="true"' : `data-acao="escolher:${esc(o.exercicioId)}"`}>
      <span class="troca-nome">${esc(o.nome)}</span>
      <span class="troca-inst">${esc(NOME_PADRAO_CROSS[o.padrao] ?? o.padrao)}</span>
      ${selos.map((x) => `<span class="troca-selo selo-${esc(x.id)}">${esc(x.rotulo)}</span>`).join('')}
    </button></li>`;
  }).join('');
  const livres = r.opcoes.filter((o) => !o.bloqueada).length;
  return `<p class="dlg-texto">
      <b>WOD · movimento ${esc(vaga.posicao)}</b> — ${esc(NOME_PADRAO_CROSS[vaga.atual?.padrao] ?? vaga.atual?.padrao ?? '')}
      <span class="mut">· ${esc(vaga.formato)} · ${esc(rotuloDias(vaga.dias))}</span><br />
      <span class="mut">Hoje: ${esc(vaga.atual?.nome)}. A prescrição do novo (RX e Scaled) sai do catálogo, no formato do WOD.</span>
    </p>
    <ul class="troca-lista">${itens || '<li class="mut">O catálogo não tem outro movimento de Cross.</li>'}</ul>
    ${livres ? '' : '<p class="mut">Nenhuma opção cabe agora: todas esbarram em padrão, cardio ou equipamento.</p>'}`;
}

/**
 * O aviso de uma opção do WOD que quebra o rodízio (a única que pergunta).
 * @param {{vaga: any}} r @param {any} opcao
 * @returns {{titulo: string, corpoHTML: string, acoes: {id: string, label: string, secundaria?: boolean}[], fechar: string}}
 */
export function renderAvisoCross(r, opcao) {
  return {
    titulo: `Trocar por ${opcao.nome}?`,
    corpoHTML: `<p class="dlg-texto">WOD · movimento ${esc(r.vaga.posicao)} (${esc(rotuloDias(r.vaga.dias))}):
        <b>${esc(r.vaga.atual?.nome)}</b> → <b>${esc(opcao.nome)}</b></p>
      <ul class="troca-conflitos"><li>Esteve no WOD da semana passada: quebra o rodízio.</li></ul>`,
    acoes: acoesDoConflitoCross(opcao),
    fechar: 'Cancelar a troca',
  };
}

/* ───────────────────────────── troca no Hyrox ───────────────────────────── */

/** '20 · 30 · 40 · 100 m' — a prescrição de prova de uma variante, por nível. @param {{tipo: string, prescricao: any}} v */
function prescricaoPorNivel(v) {
  const valores = NIVEIS_HYROX.map((n) => (v.tipo === 'segundos' ? textoSegundos(v.prescricao?.[n.id]) : String(v.prescricao?.[n.id] ?? '—')));
  return `${valores.join(' · ')}${v.tipo === 'segundos' ? '' : ` ${UNIDADE_HYROX[v.tipo] ?? v.tipo}`}`;
}

/**
 * A troca de uma estação do Hyrox: a outra variante dela (a substituta, ou de
 * volta à da prova). Bloqueada fica DESABILITADA com o equipamento que falta.
 * A prescrição mostrada é a de PROVA; o servidor aplica o formato ao salvar.
 * @param {{vaga: any, opcoes: any[]}} r resposta de `opcoesTrocaHyroxBox`
 */
export function renderOpcoesHyrox(r) {
  const { vaga } = r;
  const niveis = NIVEIS_HYROX.map((n) => n.curto).join(' · ');
  const itens = r.opcoes.map((o) => `<li><button class="troca-opcao${o.bloqueada ? ' com-conflito' : ''}" type="button"
        ${o.bloqueada ? 'disabled aria-disabled="true"' : `data-acao="${o.substituta ? 'substituta' : 'original'}"`}>
      <span class="troca-nome">${o.substituta ? 'Usar a substituta: ' : 'Voltar à estação da prova: '}${esc(o.nome)}</span>
      <span class="troca-presc">${esc(prescricaoPorNivel(o))}</span>
      ${o.carga ? `<span class="mut troca-carga">${esc(o.carga)}</span>` : ''}
      ${(o.equipamento ?? []).map((x) => `<span class="troca-selo selo-equipamento">🔧 sem ${esc(NOME_RECURSO[x]?.um ?? x)} ativo</span>`).join('')}
    </button></li>`).join('');
  return `<p class="dlg-texto">
      <b>Hyrox · estação ${esc(vaga.n)}</b> — ${esc(vaga.base)}
      <span class="mut">· ${esc(rotuloDias(vaga.dias))}</span><br />
      <span class="mut">Hoje: ${esc(vaga.atual?.nome)}${vaga.atual?.substituta ? ' (substituta)' : ''}.
        Prescrição de prova por nível (${esc(niveis)}); o formato da semana é aplicado ao salvar.</span>
    </p>
    <ul class="troca-lista">${itens || '<li class="mut">Esta estação não tem substituta.</li>'}</ul>`;
}
