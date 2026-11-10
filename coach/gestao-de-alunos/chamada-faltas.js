// @ts-check
/**
 * A falta "não veio" que a chamada da Lousa grava (Fase 1 · etapa 2, parte A).
 *
 * Ao "Fechar chamada", a Lousa guarda em `lousa/{dia}/chamadas/{hora}` quem veio
 * (`presentes`) e quem faltou (`faltaram`). Quem veio ganha o check-in pela caixa
 * `checkinsLousa`; quem faltou, até aqui, não ganhava nada: a falta era deduzida
 * quando o dia passava. Agora o SERVIDOR grava a falta na ficha, no mesmo formato
 * que a Gestão já usa para o no-show do coach (`faltas[diaPlanejado]`, tipo
 * 'no-show', de presenca-regras.js), com `origem: 'lousa'` — a marca que permite
 * achar (e desfazer) só as que nasceram aqui.
 *
 * Puro, como o resto das regras: recebe a ficha e DEVOLVE o que gravar e a linha
 * do log, ou o motivo de não gravar. O servidor executa ESTE arquivo
 * (functions/src/caixas.ts); quem fala com o banco é functions/src/caixas-servico.ts.
 *
 * NÃO GRAVA a falta quando o aluno:
 *   - avisou: "Não irei", atestado ou crédito de exceção naquela aula;
 *   - já tem presença no dia (a uGym chegou antes, por exemplo);
 *   - não tinha aula nesse dia e horário (o dia é de outra turma, ou de nenhuma);
 *   - estava num dia de box fechado, ou a ficha está inativa;
 *   - já tem a falta desta aula (rodar de novo não repete).
 * Quem estava de REPOSIÇÃO e não veio perde o crédito (`noShowReposicao`).
 *
 * CORRIGIR É FECHAR DE NOVO: quem passa de "faltou" para "veio" ganha o check-in
 * pela caixa, e a regra "a presença ganha da falta" (`semFalta` em
 * checkin-regras.js) tira a falta — qualquer que seja a origem dela. Por isso a
 * falta da chamada NÃO apaga a troca de dia (`remarcacoes`) da aula, ao contrário
 * do no-show do coach: sem a troca, o check-in corrigido não acharia a aula.
 */
import { aulasDoDia, marcarNoShow, noShowReposicao } from './presenca-regras.js?v=30';

/** A marca da falta que nasceu na chamada da Lousa. */
export const ORIGEM_FALTA = 'lousa';

/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** O e-mail como chave: sem espaço nem maiúscula. @param {unknown} e */
const chaveDoEmail = (e) => String(e || '').trim().toLowerCase();

/**
 * Quem a chamada manda marcar como falta: os `faltaram` que NÃO estão também em
 * `presentes` (fechar de novo grava as duas listas inteiras; quem foi corrigido
 * para "veio" só aparece em `presentes`, e a lista antiga não vale mais). Sem
 * repetição, na ordem da chamada.
 * @param {{ presentes?: unknown, faltaram?: unknown } | null | undefined} chamada
 * @returns {string[]}
 */
export function emailsQueFaltaram(chamada) {
  const lista = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const vieram = new Set(lista(chamada && chamada.presentes).map(chaveDoEmail));
  const vistos = new Set();
  /** @type {string[]} */
  const out = [];
  for (const e of lista(chamada && chamada.faltaram)) {
    const k = chaveDoEmail(e);
    if (vieram.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    out.push(e);
  }
  return out;
}

/**
 * @typedef {{ acao: 'falta', tipo: 'titular' | 'reposicao', chave: string, patch: Record<string, any>,
 *   log: { tipo: string, resumo: string, extra: Record<string, any> } }} FaltaDaChamada
 * @typedef {{ acao: 'nada', motivo: string }} SemFalta
 */

/**
 * O que a chamada faz com UM aluno que ficou em "faltaram".
 * @param {any} a a ficha
 * @param {{ dia: string, hora: string, em: number, hoje: string, fechados?: string[] }} o
 *   dia/hora: da chamada; em: o instante da gravação; hoje: o dia no relógio do box
 * @returns {FaltaDaChamada | SemFalta}
 */
export function faltaDaChamada(a, { dia, hora, em, hoje, fechados = [] }) {
  if (!a) return { acao: 'nada', motivo: 'sem ficha' };
  if ((a.status || 'ativo') === 'inativo') return { acao: 'nada', motivo: 'ficha inativa' };
  if (dia > hoje) return { acao: 'nada', motivo: 'chamada de um dia que ainda não chegou' };
  if (fechados.includes(dia)) return { acao: 'nada', motivo: 'box fechado nesse dia' };
  if ((a.presencas || []).includes(dia)) return { acao: 'nada', motivo: 'já tem presença nesse dia' };

  const aulas = aulasDoDia([a], dia, { hoje, fechados }).filter((x) => x.hora === hora);
  if (!aulas.length) return { acao: 'nada', motivo: 'sem aula dele nesse dia e horário' };

  /** @type {SemFalta} */
  let nada = { acao: 'nada', motivo: 'sem aula dele nesse dia e horário' };
  for (const aula of aulas) {
    // 'confirmado' (a aula é hoje) ou falta calculada (o dia passou): nada lançado ainda.
    // Todo o resto é uma resposta que já existe: aviso, crédito, atestado, falta, reposição resolvida.
    if (aula.status !== 'confirmado' && !aula.automatica) {
      nada = { acao: 'nada', motivo: aula.tipo === 'reposicao' ? 'reposição já resolvida (no-show, desmarcada ou fechada)' : aula.status === 'desmarcou-no-prazo' || aula.status === 'atestado' || aula.credito
        ? 'avisou (crédito, atestado ou exceção nessa aula)' : 'já tem resposta registrada nessa aula' };
      continue;
    }
    if (aula.tipo === 'reposicao') {
      const r = noShowReposicao(a, aula.chave, { em });
      if (!r) continue;
      const v = r.patch.atestados[aula.chave];
      const atestados = { [aula.chave]: { ...v, reposicao: { ...v.reposicao, noShowOrigem: ORIGEM_FALTA } } };
      return {
        acao: 'falta', tipo: 'reposicao', chave: aula.chave,
        patch: { atestados: { ...(a.atestados || {}), ...atestados } },
        log: { tipo: r.log.tipo, resumo: `Pela chamada da Lousa: ${r.log.resumo}`, extra: { ...(r.log.extra || {}), dia, chave: `falta:${a.id}:${dia}`, origem: ORIGEM_FALTA } },
      };
    }
    const r = marcarNoShow(a, aula.chave, { em });
    if ('recusa' in r) { nada = { acao: 'nada', motivo: r.recusa.texto }; continue; }
    const faltas = { ...(a.faltas || {}), [aula.chave]: { ...r.patch.faltas[aula.chave], origem: ORIGEM_FALTA } };
    return {
      acao: 'falta', tipo: 'titular', chave: aula.chave,
      // Só `faltas`: a troca de dia fica (ver o cabeçalho) e a presença não existe (conferida acima).
      patch: { faltas },
      log: {
        tipo: r.log.tipo,
        resumo: `Pela chamada da Lousa: não veio (no-show) · aula de ${ddmm(dia)} ${hora}`,
        extra: { ...(r.log.extra || {}), dia, origem: ORIGEM_FALTA },
      },
    };
  }
  return nada;
}
