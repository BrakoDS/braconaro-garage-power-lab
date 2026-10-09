// @ts-check
/**
 * O "testemunho" das ações do coach, para a aba Registros (eventos.js).
 *
 * Saiu do `app.js` porque as telas extraídas também registram (salvar a ficha,
 * criar ou apagar avaliação). Depois da gravação, e nunca no lugar dela: o log
 * é testemunha da ação, não condição.
 */
import * as eventos from './eventos.js?v=11';
import { resumoFicha } from './registros-ui.js?v=11';
import { emit, EVENTOS } from './estado.js?v=11';
import { resumoAnamnese, resumoParq, parqRaso } from './saude.js?v=11';

/**
 * Registra o que o coach acabou de fazer — e avisa o barramento.
 *
 * 'acao-registrada' leva a ação inteira (`{ tipo, aluno, evento, dados }`): é
 * por ela que a automação sabe que um pagamento acabou de entrar. `dados` é o
 * fato em campos (o mês e o valor de um pagamento) e não vai para o log.
 * @param {string} tipo @param {any} a a ficha @param {string} resumo @param {any} [extra]
 * @param {Record<string, any>} [dados]
 */
export function reg(tipo, a, resumo, extra = {}, dados) {
  if (!a) return;
  const ev = eventos.novoEvento({ tipo, origem: 'gestao', aluno: a, em: Date.now(), resumo, ...extra });
  eventos.registrar(ev);
  // A aba Registros aberta mostra a linha na hora, sem reabrir.
  emit(EVENTOS.REGISTROS_MUDARAM, String(a.id));
  emit(EVENTOS.ACAO_REGISTRADA, { tipo, aluno: a, evento: ev, dados });
}

/**
 * Registra um evento financeiro já montado (financeiro-aluno.js: eventoPagamento,
 * eventoPagamentoDesfeito, eventoLancamento).
 * @param {any} a @param {import('./financeiro-aluno.js').EventoFinanceiro} ev
 */
export function regFinanceiro(a, ev) {
  reg(ev.tipo, a, ev.resumo, {}, ev.dados);
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
