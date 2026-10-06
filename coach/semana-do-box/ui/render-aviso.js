// @ts-check
/**
 * A janela do aviso de um dia sem aula (feriado, recesso, evento), como STRING
 * — sem DOM, para o teste rodar no Node. Vai dentro do `painel()` de
 * `compartilhado/ui/dialogo.js`; quem lê o que o coach escolheu é
 * `dia-sem-aula.js`.
 */
import { MAX_TEXTO_AVISO, TIPOS_AVISO } from '../core/vista.js';
import { esc } from './render.js';

/**
 * O formulário: o tipo (um rádio por motivo) e o texto livre, com o contador.
 * @param {{tipo?: string, texto?: string} | null | undefined} aviso o atual, para editar
 * @param {string} explicacao o que acontece ao confirmar (uma frase)
 */
export function renderFormAviso(aviso, explicacao) {
  const tipo = TIPOS_AVISO.some((t) => t.id === aviso?.tipo) ? aviso?.tipo : TIPOS_AVISO[0].id;
  const texto = aviso?.texto ?? '';
  return `<div class="aviso-form">
    <p class="mut">${esc(explicacao)}</p>
    <fieldset>
      <legend>Motivo</legend>
      <div class="aviso-tipos">${TIPOS_AVISO.map((t) => `
        <label><input type="radio" name="aviso-tipo" value="${esc(t.id)}"${t.id === tipo ? ' checked' : ''} />
          ${esc(t.icone)} ${esc(t.nome)}</label>`).join('')}
      </div>
    </fieldset>
    <div class="field">
      <label for="aviso-texto">O que o aluno lê <span class="mut">(opcional)</span></label>
      <textarea id="aviso-texto" maxlength="${MAX_TEXTO_AVISO}"
        placeholder="Ex.: Recesso de fim de ano — voltamos dia 05/01. Ou: Murph no sábado, 8h na praça.">${esc(texto)}</textarea>
      <p class="aviso-conta mut" id="aviso-conta">${texto.length}/${MAX_TEXTO_AVISO}</p>
    </div>
  </div>`;
}
