// @ts-check
/**
 * O "testemunho" das ações do coach, para a aba Registros (eventos.js).
 *
 * Saiu do `app.js` porque as telas extraídas também registram (salvar a ficha,
 * criar ou apagar avaliação). Depois da gravação, e nunca no lugar dela: o log
 * é testemunha da ação, não condição.
 */
import * as eventos from './eventos.js';
import { resumoFicha } from './registros-ui.js';
import { emit, EVENTOS } from './estado.js';
import { resumoAnamnese, resumoParq, parqRaso } from './saude.js';

/**
 * Registra o que o coach acabou de fazer.
 * @param {string} tipo @param {any} a a ficha @param {string} resumo @param {any} [extra]
 */
export function reg(tipo, a, resumo, extra = {}) {
  if (!a) return;
  eventos.registrar(eventos.novoEvento({ tipo, origem: 'gestao', aluno: a, em: Date.now(), resumo, ...extra }));
  // A aba Registros aberta mostra a linha na hora, sem reabrir.
  emit(EVENTOS.REGISTROS_MUDARAM, String(a.id));
}

/**
 * Registra um evento financeiro já montado (financeiro-aluno.js: eventoPagamento,
 * eventoPagamentoDesfeito, eventoLancamento).
 * @param {any} a @param {{ tipo: string, resumo: string }} ev
 */
export function regFinanceiro(a, ev) {
  reg(ev.tipo, a, ev.resumo);
}

/** "Ficha editada · Telefone, Plano" — só quando algo mudou de verdade. @param {any} antes @param {any} depois */
export function regFicha(antes, depois) {
  const campos = eventos.camposAlterados(antes, depois);
  if (campos.length) reg('ficha-editada', { ...antes, ...depois }, resumoFicha(campos), { campos });
}

/*
 * Anamnese e PAR-Q comparam campo a campo DENTRO da seção, e não a seção
 * inteira: "Ficha editada · Anamnese" não diria o que mudou, e comparar o
 * objeto aninhado como texto acusaria edição só porque a nuvem devolveu as
 * chaves em outra ordem. Só os nomes vão para o log — os valores são dado de
 * saúde e moram na ficha, não numa segunda cópia.
 */

/** "Anamnese editada · Sono (h/noite), Medicamentos" @param {any} antes a ficha @param {any} nova a anamnese salva */
export function regAnamnese(antes, nova) {
  const campos = eventos.camposAlterados(antes && antes.anamnese, nova);
  if (campos.length) reg('ficha-editada', { ...antes, anamnese: nova }, resumoAnamnese(campos), { campos: campos.map((k) => 'anamnese.' + k) });
}

/** "PAR-Q editado · Pergunta 3, Data da triagem" @param {any} antes a ficha @param {any} novo o PAR-Q salvo */
export function regParq(antes, novo) {
  const campos = eventos.camposAlterados(parqRaso(antes && antes.parq), parqRaso(novo));
  if (campos.length) reg('ficha-editada', { ...antes, parq: novo }, resumoParq(campos), { campos: campos.map((k) => 'parq.' + k) });
}
