// @ts-check
/**
 * BUSCA DE ALUNO PARA REPOSIÇÃO — o modal do "+ Aluno extra".
 *
 * Overlay PRÓPRIO (não é o `#modal-app` de `compartilhado/ui/dialogo.js`), mas
 * usando as MESMAS classes de moldura (`.modal-bg`, `.modal`, `.modal-hd`…)
 * para o visual não divergir. É o mesmo arranjo de
 * `coach/montador-de-treino/ui/pesquisa-modal.js`, e pelo mesmo motivo: o
 * diálogo compartilhado resolve num clique de botão, e aqui a escolha acontece
 * ao clicar num item de uma lista que muda a cada tecla — não cabe no contrato
 * dele sem forçar.
 *
 * ── A lista não esconde quem já está numa turma ──────────────────────────────
 * Ele aparece desabilitado, dizendo em que horário está. Sumir com o nome faria
 * o coach procurar um aluno que existe, não achar, e concluir que ele não está
 * cadastrado — quando o que acontece é que ele já está na aula das 7h.
 */
import { buscarAlunos, horaLegivel } from '../core/turmas.js';
import { esc } from './render-treino.js';

/** Acima disto a lista vira rolagem infinita e para de ajudar. */
const MAX_RESULTADOS = 40;

/**
 * Abre a busca e resolve com o aluno escolhido, ou `null` se fechou sem escolher.
 *
 * @param {{alunos: any[], turmas: any[], horario: string}} args
 * @returns {Promise<any|null>}
 */
export function escolherAluno({ alunos, turmas, horario }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'modal-bg';
    fundo.innerHTML = `
      <div class="modal largo" role="dialog" aria-modal="true" aria-labelledby="bal-titulo">
        <div class="modal-hd">
          <h3 id="bal-titulo">Aluno extra · ${esc(horario ? horaLegivel(horario) : 'sem horário')}</h3>
          <button class="modal-x" type="button" data-fechar aria-label="Fechar">×</button>
        </div>
        <div class="modal-bd">
          <p class="mut bal-ajuda">
            Busca em <b>toda a base ativa</b>, ignorando o dia e o horário da ficha —
            é assim que se acha quem vem repor uma aula que perdeu.
          </p>
          <input id="bal-termo" class="bal-termo" type="search" autocomplete="off"
            placeholder="Digite o nome…" aria-label="Buscar aluno pelo nome" />
          <ul class="bal-lista" id="bal-lista"></ul>
        </div>
        <div class="modal-ft">
          <button class="btn ghost" type="button" data-fechar>Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(fundo);
    document.body.style.overflow = 'hidden'; // trava o scroll do fundo

    const lista = /** @type {HTMLElement} */ (fundo.querySelector('#bal-lista'));
    const termo = /** @type {HTMLInputElement} */ (fundo.querySelector('#bal-termo'));

    function fechar(aluno) {
      document.removeEventListener('keydown', aoTeclar);
      fundo.remove();
      document.body.style.overflow = '';
      resolve(aluno || null);
    }

    function aoTeclar(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); fechar(null); }
    }

    function desenhar() {
      const achados = buscarAlunos(alunos, termo.value, turmas);
      if (!achados.length) {
        lista.innerHTML = `<li class="bal-vazio">Nenhum aluno ativo com esse nome.
          Cadastre em <a href="../gestao-de-alunos/index.html">Gestão de Alunos</a>.</li>`;
        return;
      }
      const corte = achados.slice(0, MAX_RESULTADOS);
      lista.innerHTML = corte.map(({ aluno, ondeEsta }) => `
        <li>
          <button class="bal-item" type="button" data-aluno="${esc(aluno.id)}"
            ${ondeEsta ? 'disabled' : ''}>
            <span class="bal-nome">${esc(aluno.nome || aluno.id)}</span>
            <span class="ex-chip mudo">${esc(aluno.nivel || 'sem nível')}</span>
            ${ondeEsta ? `<span class="bal-onde">já está ${esc(ondeEsta)}</span>` : '<span class="bal-add">+ encaixar</span>'}
          </button>
        </li>`).join('')
        + (achados.length > corte.length
          ? `<li class="bal-vazio">e mais ${achados.length - corte.length} — refine o nome.</li>`
          : '');
    }

    lista.addEventListener('click', (ev) => {
      const b = /** @type {HTMLElement} */ (ev.target).closest('[data-aluno]');
      if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
      const id = b.getAttribute('data-aluno');
      fechar(alunos.find((a) => a.id === id) || null);
    });

    for (const x of fundo.querySelectorAll('[data-fechar]')) {
      x.addEventListener('click', () => fechar(null));
    }
    // Clique no fundo fecha; clique dentro do painel, não.
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(null); });
    document.addEventListener('keydown', aoTeclar);
    termo.addEventListener('input', desenhar);

    desenhar();
    termo.focus();
  });
}
