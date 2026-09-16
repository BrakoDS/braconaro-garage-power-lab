// @ts-check
/**
 * O TREINO ESTRUTURADO EM CARDS — a marcação compartilhada pela prévia da
 * lousa, pela tela de alertas e pela prévia da turma.
 *
 * Um renderizador só para as três porque elas mostram o MESMO treino: se cada
 * tela desenhasse o seu, o card da prévia e o card da distribuição divergiriam
 * no primeiro ajuste, e o coach aprovaria uma coisa para enviar outra.
 *
 * AS CORES DO CARD SÃO AS DA CANETA, de propósito. O coach escreveu "RIR 2" em
 * vermelho e "3x10" em azul; o card devolve a observação em vermelho e a
 * série/repetição em azul. É o que fecha o ciclo da lousa: ele reconhece o
 * próprio quadro no resultado, em vez de ler uma tabela genérica e ter de
 * conferir campo a campo.
 */
import { COR_BLOCO } from '../core/cores.js';

export const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Os cards de um treino, agrupados por bloco.
 * @param {any} treino
 * @param {{compacto?: boolean}} [opcoes]
 */
export function cardsDoTreino(treino, { compacto = false } = {}) {
  if (!treino?.blocos?.length) return '<p class="previa-vazio">Nenhum exercício reconhecido.</p>';

  const blocos = treino.blocos.map((b) => `
    <article class="bloco" style="--cor-bloco:${COR_BLOCO[b.id] || '#6E7781'}">
      <h5 class="bloco-h"><span class="bloco-id">${esc(b.id)}</span> ${esc(b.nome)}</h5>
      <ul class="bloco-lista">
        ${(b.exercicios || []).map(linhaDoExercicio).join('')}
      </ul>
    </article>`).join('');

  const extras = compacto ? '' : avisosESubstituicoes(treino);
  return `<div class="blocos">${blocos}</div>${extras}`;
}

function linhaDoExercicio(ex) {
  const prescricao = [
    ex.series ? `${ex.series}×` : '',
    esc(ex.reps || ''),
  ].join('').trim();

  return `<li class="ex">
    <div class="ex-topo">
      <span class="ex-nome">${esc(ex.nome)}</span>
      ${prescricao ? `<span class="ex-prescricao">${prescricao}</span>` : ''}
    </div>
    <div class="ex-baixo">
      ${ex.implemento ? `<span class="ex-chip">${esc(ex.implemento)}</span>` : ''}
      ${(ex.grupamentos || []).map((g) => `<span class="ex-chip mudo">${esc(g)}</span>`).join('')}
      ${ex.observacao ? `<span class="ex-obs">${esc(ex.observacao)}</span>` : ''}
    </div>
  </li>`;
}

/**
 * As trocas que as regras globais do box fizeram e o que a leitura não resolveu.
 *
 * Aparece SEMPRE que existe, e nunca escondido atrás de um "ver detalhes": uma
 * substituição silenciosa é a diferença entre o treino que o coach escreveu e o
 * que a turma vai fazer.
 */
function avisosESubstituicoes(treino) {
  const partes = [];

  if (treino.substituicoes?.length) {
    partes.push(`
      <div class="nota nota-troca">
        <b>Regras do box aplicadas</b>
        <ul>${treino.substituicoes.map((s) => `
          <li><s>${esc(s.de)}</s> ➔ <b>${esc(s.para)}</b><small>${esc(s.regra)}</small></li>`).join('')}
        </ul>
      </div>`);
  }

  if (treino.avisos?.length) {
    partes.push(`
      <div class="nota nota-aviso">
        <b>Confira antes de salvar</b>
        <ul>${treino.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      </div>`);
  }

  return partes.join('');
}
