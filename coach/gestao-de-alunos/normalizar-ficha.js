// @ts-check
/**
 * A arrumação da ficha quando o coach salva
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md, item 4).
 *
 * Roda dentro do salvar global (ui-salvar-global.js), na mesma gravação: a
 * ficha que o coach edita sai arrumada, sem gravação em massa nem script de
 * migração — as que ninguém abre ficam como estão, e os leitores já lidam com
 * os dois formatos. Nenhum campo muda de nome.
 *
 *  - `freqHorario` (UMA hora para a semana toda, o formato antigo) vira a hora
 *    de cada dia marcado que ainda não tem a sua, em `horarios`. É o que o
 *    formulário de dias já mostrava ao abrir — gravar só confirma. O
 *    `freqHorario` continua na ficha: o Portal e o app ainda o usam de reserva.
 *  - `idade` deixa de ser guardada quando há `nascimento`: ela é calculada
 *    (`idadeDoAluno`, `calc.idadeDe`) e o número gravado envelhecia — fazia
 *    aniversário e a ficha continuava dizendo a idade do cadastro. Sem
 *    nascimento, a `idade` fica: é o único dado que existe.
 *
 * Puro.
 */
import { horaParaInput } from './util/formato.js?v=27';

/**
 * O que arrumar numa ficha.
 * @param {any} a a ficha como vai ficar depois da gravação
 * @returns {{ patch: Record<string, any>, remover: string[] }}
 *   patch: os campos a gravar junto; remover: os campos a tirar da ficha
 */
export function normalizarFicha(a) {
  /** @type {Record<string, any>} */ const patch = {};
  /** @type {string[]} */ const remover = [];

  const antiga = horaParaInput(a && a.freqHorario);
  const dias = Array.isArray(a && a.diasTreino) ? a.diasTreino : [];
  const horas = a && a.horarios && typeof a.horarios === 'object' && !Array.isArray(a.horarios) ? a.horarios : {};
  if (antiga && dias.some((d) => !horas[d])) {
    const novo = { ...horas };
    for (const d of dias) if (!novo[d]) novo[d] = antiga;
    patch.horarios = novo;
  }

  if (a && String(a.nascimento || '').trim() && 'idade' in a) remover.push('idade');

  return { patch, remover };
}
