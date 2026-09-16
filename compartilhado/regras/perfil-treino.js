// @ts-check
/**
 * A VERSÃO DO ALUNO = treino base do dia + perfil dele (+ exceção do dia).
 *
 * É a decisão central do Montador v2: a aula é coletiva e o treino é um só, mas
 * cada aluno recebe a prescrição dele. Isso é calculado na hora — na tela do
 * coach e na tela do aluno — e NÃO é gravado por aluno. Só o que o coach muda na
 * mão vira registro. É o que faz o mês inteiro caber: mudar o foco da Ana numa
 * terça reflete nos 20 dias seguintes sem reabrir nada.
 *
 * Módulo puro: sem DOM, sem store, sem Firebase. O catálogo entra por parâmetro
 * (`exercicioPorId`) porque o Portal e o montador chegam nele por caminhos
 * diferentes, e quem manda no volume já feito na semana é quem chama — a regra
 * não vai ao banco.
 *
 * @typedef {Object} Perfil
 * @property {string} [objetivo]    rótulo da ficha ('Hipertrofia')
 * @property {string[]} [foco]      até 2 dos 7 grupos
 * @property {{evitarId: string, substitutoId: string, motivo?: string}[]} [restricoes]
 * @property {Record<string, number>} [metas]  sobrescrita de meta por grupo
 *
 * @typedef {Object} LinhaDoAluno
 * @property {string} id
 * @property {string} nome
 * @property {string} [padrao]
 * @property {string|null} grupo
 * @property {number} series
 * @property {number} seriesBase
 * @property {string} [reps]
 * @property {number} [descansoSeg]
 * @property {string} [tecnica]
 * @property {boolean} travado
 * @property {string[]} motivos   por que esta linha está diferente da turma
 */
import { objetivoDe } from '../config/objetivos.js';
import { contaPorTempo } from '../config/estruturas.js';
import { grupoDoExercicio } from './grupos.js';
import { focoDe, saldoPorGrupo } from './metas-aluno.js';

/** Piso: ninguém faz menos que isto num exercício do dia. */
export const PISO_SERIES = 2;
/** Teto: no máximo tantas séries acima do que a turma faz. */
export const TETO_ACIMA_DO_BASE = 2;

/** Número inteiro >= 0, senão 0. @param {any} v */
const inteiro = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

/** Encaixa um número dentro de [min, max]. */
const entre = (/** @type {number} */ v, /** @type {number} */ min, /** @type {number} */ max) => Math.min(max, Math.max(min, v));

/**
 * Todas as linhas do treino base, achatadas, com o bloco de origem anotado.
 * @param {any} base
 */
function linhasDoBase(base) {
  return (base?.blocos || []).flatMap((b, bi) => (b.exercicios || []).map((l, li) => ({ ...l, _bloco: bi, _linha: li })));
}

/** Chave da linha para casar com a exceção do dia: o id, ou a posição se não houver. */
export function chaveDaLinha(l) {
  return l.id || `pos:${l._bloco ?? 0}:${l._linha ?? 0}`;
}

/**
 * Aplica as restrições fixas do aluno: troca de exercício decidida uma vez na
 * ficha e válida em todo dia que aquele exercício cair.
 * @param {any} l @param {Perfil} perfil @param {(id:string)=>any} exercicioPorId
 */
function aplicarRestricao(l, perfil, exercicioPorId) {
  const r = (perfil?.restricoes || []).find((x) => x && x.evitarId && x.evitarId === l.id);
  if (!r) return { linha: l, motivos: [] };
  const sub = r.substitutoId ? exercicioPorId(r.substitutoId) : null;
  if (!sub) {
    // Restrição sem substituto escolhido: o aluno NÃO faz, e o coach precisa ver
    // isso antes de publicar. Devolver o exercício proibido em silêncio seria pior.
    return { linha: { ...l, restrito: true }, motivos: [`Restrição sem substituto: ${r.motivo || 'evitar ' + l.nome}`] };
  }
  const motivos = [`Troca por restrição${r.motivo ? ` (${r.motivo})` : ''}: ${l.nome} → ${sub.nome}`];
  // O padrão diferente é recusado no cadastro da restrição, porque quebraria o
  // full body. Se um registro antigo passou, o treino continua — com aviso.
  if (l.padrao && sub.padrao && sub.padrao !== l.padrao) motivos.push('Atenção: o substituto tem outro padrão de movimento');
  return {
    linha: {
      ...l,
      id: sub.id, nome: sub.nome, padrao: sub.padrao,
      musculosPrimarios: sub.musculosPrimarios || [],
      musculosSecundarios: sub.musculosSecundarios || [],
    },
    motivos,
  };
}

/**
 * Redistribuição por foco, em SALDO ZERO: o total do aluno é igual ao total do
 * treino base. Tira de onde ele está mais acima da meta semanal dele e põe no
 * grupo em foco.
 *
 * Quem perde não é sorteio nem "o primeiro que não é foco": é o grupo em que
 * AQUELE aluno está mais acima da meta — quem já treinou demais naquela semana.
 *
 * Divergência do spec resolvida aqui: o texto (linha 385) diz "se não houver de
 * onde tirar, não redistribui"; a tabela de casos de borda (linha 564) diz
 * "redistribui o que dá e avisa quanto ficou faltando". Vale a tabela: meio
 * deslocamento ainda ajuda o aluno, e o saldo continua zero de qualquer forma. O
 * aviso diz quantas séries não couberam. (A coluna "Foco perna" do exemplo do
 * spec soma 20 contra 21 do base — erro de conta do exemplo, não da regra.)
 *
 * @param {any[]} linhas  já com restrição aplicada
 * @param {Perfil} perfil
 * @param {Record<string, number>} feitoPorGrupo
 * @returns {{linhas: any[], avisos: string[]}}
 */
function redistribuirPorFoco(linhas, perfil, feitoPorGrupo) {
  const foco = focoDe(perfil);
  if (!foco.length) return { linhas, avisos: [] };

  const podeMexer = (l) => !l.travado && !l.restrito && l.id;
  // O grupo pode vir pronto: o dia publicado para o aluno leva `grupoMuscular`
  // calculado, porque o aparelho dele não tem a lista de músculos do exercício.
  const grupoDe = (l) => l.grupo ?? grupoDoExercicio(l);

  const ganhadores = linhas.filter((l) => podeMexer(l) && foco.includes(grupoDe(l)));
  if (!ganhadores.length) {
    const nomes = foco.join(' e ');
    return { linhas, avisos: [`O treino de hoje não tem ${nomes} — sem redistribuição.`] };
  }

  const saldo = saldoPorGrupo(feitoPorGrupo, perfil);
  // Doadores: fora do foco, ordenados por quem está mais acima da meta. Empate
  // resolvido pelo maior número de séries e depois pela ordem do treino, para a
  // mesma entrada dar sempre a mesma saída.
  const doadores = linhas
    .filter((l) => podeMexer(l) && !foco.includes(grupoDe(l)) && grupoDe(l))
    .sort((a, b) => (saldo[grupoDe(b)] ?? 0) - (saldo[grupoDe(a)] ?? 0) || b.series - a.series || linhas.indexOf(a) - linhas.indexOf(b));

  /** @type {Map<any, number>} */
  const delta = new Map();
  const seriesDe = (l) => inteiro(l.series) + (delta.get(l) || 0);
  let movidas = 0;
  let quis = 0;

  // UMA série por exercício de foco, por dia. É o deslocamento do exemplo do spec
  // (7 exercícios, foco braço: as duas linhas de braço vão de 3 para 4), e é o que
  // faz sentido no dia: quem precisa de braço treina braço de novo na semana, e é
  // a repetição que fecha a meta semanal — não um dia dobrado. O teto de base+2
  // continua checado abaixo como limite duro, para quando a linha já vier deslocada.
  for (const g of ganhadores) {
    if (seriesDe(g) >= inteiro(g.seriesBase ?? g.series) + TETO_ACIMA_DO_BASE) continue;
    quis++;
    const doador = doadores.find((d) => seriesDe(d) > PISO_SERIES);
    if (!doador) continue;
    delta.set(doador, (delta.get(doador) || 0) - 1);
    delta.set(g, (delta.get(g) || 0) + 1);
    movidas++;
  }

  const avisos = [];
  if (!movidas) avisos.push('Não há de onde tirar série sem furar o piso de 2 — todos ficam no número da turma.');
  else if (movidas < quis) avisos.push(`Redistribuição parcial: ${movidas} de ${quis} séries. O resto furaria o piso de 2.`);

  return {
    linhas: linhas.map((l) => (delta.has(l) ? { ...l, series: seriesDe(l) } : l)),
    avisos,
  };
}

/** Desloca reps, descanso e técnica para dentro da faixa do objetivo. */
function aplicarObjetivo(l, obj) {
  if (!obj || !obj.reps) return { linha: l, motivos: [] };
  const [dMin, dMax] = obj.descansoSeg || [];
  const descanso = Number.isFinite(Number(l.descansoSeg)) && dMin !== undefined
    ? entre(Number(l.descansoSeg), dMin, dMax)
    : (dMin ?? l.descansoSeg);
  const mudou = l.reps !== obj.reps || descanso !== l.descansoSeg;
  return {
    linha: { ...l, reps: obj.reps, descansoSeg: descanso, tecnica: obj.tecnica || l.tecnica },
    motivos: mudou ? [`Prescrição de ${obj.label.toLowerCase()}`] : [],
  };
}

/** Aplica o ajuste que o coach fez para aquele aluno naquele dia. */
function aplicarExcecao(l, excecao, exercicioPorId) {
  const ajuste = excecao?.linhas?.[chaveDaLinha(l)];
  if (!ajuste) return { linha: l, motivos: [] };
  const motivos = [];
  let linha = { ...l };
  if (ajuste.exercicioId && ajuste.exercicioId !== l.id) {
    const sub = exercicioPorId(ajuste.exercicioId);
    if (sub) {
      linha = { ...linha, id: sub.id, nome: sub.nome, padrao: sub.padrao, musculosPrimarios: sub.musculosPrimarios || [], musculosSecundarios: sub.musculosSecundarios || [] };
      motivos.push(`Troca do dia: ${l.nome} → ${sub.nome}`);
    }
  }
  if (ajuste.series !== undefined) { linha.series = inteiro(ajuste.series); motivos.push(`Ajuste do dia: ${linha.series} série(s)`); }
  if (ajuste.reps !== undefined) { linha.reps = ajuste.reps; }
  if (ajuste.carga !== undefined) { linha.carga = ajuste.carga; }
  if (ajuste.motivo) motivos.push(ajuste.motivo);
  return { linha, motivos };
}

/**
 * A versão do aluno para o dia.
 *
 * Ordem: restrição fixa → foco (saldo zero) → prescrição do objetivo → exceção do
 * dia. A exceção entra por último porque é a palavra final do coach sobre aquele
 * aluno naquele dia. A linha travada no cadeado pula os três primeiros passos: é
 * o dia em que o coach quer todo mundo junto naquele exercício.
 *
 * Em estrutura de tempo (GAP, HIIT, Hyrox, cross) não há redistribuição de série
 * nem deslocamento de reps: todos fazem os mesmos rounds no mesmo relógio, e
 * prometer outra coisa na tela seria mentir sobre o que acontece na sala. Restam
 * a troca por restrição, a carga e a observação.
 *
 * @param {Object} args
 * @param {any} args.base                    o treino base do dia
 * @param {Perfil} [args.perfil]             a ficha do aluno
 * @param {Record<string, number>} [args.feitoPorGrupo]  o que ele já fez na semana
 * @param {any} [args.excecao]               `treinoAluno/{email}.ajustes[dateId]`
 * @param {(id: string) => any} [args.exercicioPorId]    catálogo, por injeção
 * @returns {{linhas: LinhaDoAluno[], total: number, totalBase: number, avisos: string[], porTempo: boolean}}
 */
export function versaoDoAluno({ base, perfil = {}, feitoPorGrupo = {}, excecao = null, exercicioPorId = () => null }) {
  const porTempo = contaPorTempo(base?.estrutura);
  const originais = linhasDoBase(base);
  const avisos = [];

  // 1. restrição fixa
  /** @type {any[]} */
  const comRestricao = [];
  /** @type {Map<any, string[]>} */
  const motivosPorLinha = new Map();
  for (const l of originais) {
    const base0 = { ...l, seriesBase: inteiro(l.series), grupo: l.grupo ?? grupoDoExercicio(l), motivos: [] };
    if (l.travado) { comRestricao.push(base0); continue; } // cadeado ignora o perfil inteiro
    const { linha, motivos } = aplicarRestricao(base0, perfil, exercicioPorId);
    comRestricao.push(linha);
    if (motivos.length) motivosPorLinha.set(linha, motivos);
  }

  // 2. foco — só onde série quer dizer série
  let linhas = comRestricao;
  if (!porTempo) {
    const r = redistribuirPorFoco(linhas, perfil, feitoPorGrupo);
    // `redistribuirPorFoco` devolve cópias das linhas que mudaram; os motivos
    // acompanham a linha nova, senão o aviso se perde no caminho.
    linhas = r.linhas.map((nova, i) => {
      const antiga = comRestricao[i];
      const m = motivosPorLinha.get(antiga) || [];
      if (nova !== antiga && nova.series !== antiga.series) {
        m.push(nova.series > antiga.series ? `Foco: +${nova.series - antiga.series} série` : `Cedeu ${antiga.series - nova.series} série ao foco`);
      }
      motivosPorLinha.set(nova, m);
      return nova;
    });
    avisos.push(...r.avisos);
  } else if (focoDe(perfil).length) {
    avisos.push('Dia por tempo: todos fazem os mesmos rounds. O foco não redistribui aqui.');
  }

  // 3. objetivo e 4. exceção do dia
  const obj = objetivoDe(perfil?.objetivo);
  const finais = linhas.map((l) => {
    let motivos = motivosPorLinha.get(l) || [];
    let linha = l;
    if (!l.travado && !porTempo) {
      const r = aplicarObjetivo(linha, obj);
      linha = r.linha; motivos = [...motivos, ...r.motivos];
    }
    const e = aplicarExcecao(linha, excecao, exercicioPorId);
    linha = e.linha; motivos = [...motivos, ...e.motivos];
    if (l.travado) motivos = [...motivos, 'Igual para a turma (linha travada)'];
    const { _bloco, _linha, ...limpa } = linha;
    return { ...limpa, series: inteiro(linha.series), motivos };
  });

  if (excecao?.observacao) avisos.push(excecao.observacao);

  const total = finais.reduce((s, l) => s + (l.restrito ? 0 : l.series), 0);
  const totalBase = originais.reduce((s, l) => s + inteiro(l.series), 0);
  return { linhas: finais, total, totalBase, avisos, porTempo };
}
