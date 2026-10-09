// @ts-check
/**
 * A reavaliação física do aluno: quando vence e como as telas mostram.
 *
 * Mora fora das telas porque a lista (anel no card, contadores) e o perfil
 * (anel na foto grande) precisam dizer a MESMA coisa sobre o mesmo aluno —
 * duas cópias da regra divergiriam no primeiro ajuste. Puro.
 */
import { hoje } from './formato.js?v=12';

/**
 * Situação da próxima avaliação do aluno (pela avaliação mais recente).
 * @param {any} a @param {string} [hojeIso]
 * @returns {{ tipo: 'sem'|'atrasada'|'avencer'|'emdia', dias?: number }}
 */
export function statusAvaliacao(a, hojeIso = hoje()) {
  const avs = (a.avaliacoes || []).filter((x) => x.dataRealizada);
  if (!avs.length) return { tipo: 'sem' };
  const ultima = avs.reduce((m, x) => (x.dataRealizada > m.dataRealizada ? x : m), avs[0]);
  if (!ultima.dataProxima) return { tipo: 'sem' };
  const dias = Math.round((new Date(ultima.dataProxima + 'T00:00:00').getTime() - new Date(hojeIso + 'T00:00:00').getTime()) / 86400000);
  if (dias < 0) return { tipo: 'atrasada', dias: -dias };
  if (dias <= 7) return { tipo: 'avencer', dias };
  return { tipo: 'emdia', dias };
}

/** O aluno está inativo? (pendente não é inativo: é matrícula a acertar.) @param {any} a */
export const ehInativo = (a) => String(a.status || 'ativo').toLowerCase() === 'inativo';

/**
 * A reavaliação COMO A LISTA MOSTRA: inativo não está devendo reavaliação a
 * ninguém — não ganha anel, nem selo, nem entra nos contadores. A data continua
 * na ficha; se ele voltar, a pendência volta junto.
 * @param {any} a @param {string} [hojeIso]
 * @returns {{ tipo: 'inativo'|'sem'|'atrasada'|'avencer'|'emdia', dias?: number }}
 */
export function reavaliacaoNaLista(a, hojeIso = hoje()) {
  return ehInativo(a) ? { tipo: 'inativo' } : statusAvaliacao(a, hojeIso);
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * O selo de reavaliação, ou ''.
 * @param {{ tipo: string, dias?: number }} s
 */
export function seloReavaliacao(s) {
  if (s.tipo === 'atrasada') return `<span class="ac-chip ac-chip-bad" title="A reavaliação passou da data">Reavaliação atrasada · ${plural(s.dias || 0, 'dia', 'dias')}</span>`;
  if (s.tipo === 'avencer') return `<span class="ac-chip ac-chip-warn" title="Reavaliação nos próximos 7 dias">Reavaliar ${s.dias === 0 ? 'hoje' : `em ${plural(s.dias || 0, 'dia', 'dias')}`}</span>`;
  return '';
}
