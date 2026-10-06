// @ts-check
/**
 * A janela do aviso de um dia sem aula: abre o `painel()` com o formulário de
 * `render-aviso.js` e devolve o que o coach escolheu. Quem grava é o
 * `app.js` — semana em branco pelo `gerarMatrizSemanalBox`, um dia pelo
 * `salvarSemanaBox` — e o servidor revalida tudo (`lerAviso`).
 */
import { painel } from '../../../compartilhado/ui/dialogo.js';
import { MAX_TEXTO_AVISO } from '../core/vista.js';
import { renderFormAviso } from './render-aviso.js';

/**
 * Pede o motivo e o texto. `null` = o coach fechou sem confirmar.
 * @param {{titulo: string, explicacao: string, ok: string, aviso?: {tipo?: string, texto?: string} | null}} o
 * @returns {Promise<{tipo: string, texto: string} | null>}
 */
export async function pedirAviso({ titulo, explicacao, ok, aviso = null }) {
  const pronto = painel({
    titulo, corpoHTML: renderFormAviso(aviso, explicacao), acoes: [{ id: 'ok', label: ok }], largo: false, fechar: 'Cancelar',
  });
  // O contador de caracteres, enquanto o coach digita.
  const area = /** @type {HTMLTextAreaElement | null} */ (document.querySelector('#aviso-texto'));
  const conta = document.querySelector('#aviso-conta');
  area?.addEventListener('input', () => { if (conta) conta.textContent = `${area.value.length}/${MAX_TEXTO_AVISO}`; });
  area?.focus();

  if ((await pronto) !== 'ok') return null;
  // O painel só se esconde ao fechar: o formulário ainda está no DOM.
  const tipo = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="aviso-tipo"]:checked'))?.value;
  if (!tipo) return null;
  return { tipo, texto: (area?.value ?? '').trim().slice(0, MAX_TEXTO_AVISO) };
}
