// @ts-check
/**
 * O HTML da troca de exercício — a lista de opções e o aviso de conflito —
 * como STRING, para o teste rodar no Node. Os dois vão dentro do `painel()` de
 * `compartilhado/ui/dialogo.js`: todo `[data-acao]` do corpo fecha o modal e
 * devolve o id, que é como `troca.js` sabe o que o coach escolheu.
 */
import { NOME_INSTANCIA, acoesDoConflito, rotuloDias, selosDaOpcao, textoConflitos } from '../core/vista.js';
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
    const travado = o.conflitos.mesmoBloco;
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
