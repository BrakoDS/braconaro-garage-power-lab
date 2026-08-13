// @ts-check
/**
 * EDIÇÃO DE UM DIA JÁ SALVO.
 *
 * Até aqui o coach só podia trocar exercício ANTES de salvar: depois que o treino
 * entrava no histórico, a única saída era regerar o dia inteiro. Este módulo opera
 * sobre o SNAPSHOT (o formato gravado), não sobre o treino vivo do gerador.
 *
 * A diferença importa: o snapshot guarda o exercício congelado (nome, cargas por
 * nível, reps), não a referência do catálogo. Para recalcular volume e viabilidade
 * é preciso resolver cada id de volta no catálogo — e os snapshots antigos não têm
 * todos os campos, então há queda para o que está gravado.
 *
 * Só o formato PLANO (`exercicios[]`, de Força e Hipertrofia) é editável. Hyrox,
 * HIIT, GAP, Híbrido e Murph são estruturas próprias, onde trocar uma peça
 * descaracteriza o formato.
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 */
import { EXERCICIOS, EXERCICIO_POR_ID, serveModalidade } from '../data/exercicios.js';
import { verificarViabilidade } from './viabilidade.js';
import { calcularVolume } from './volume.js';
import { variantesNivel } from './niveis.js';

/** O dia salvo aceita edição de exercício? Só o formato plano. @param {any} snap */
export function diaEditavel(snap) {
  return Boolean(snap && Array.isArray(snap.exercicios) && snap.exercicios.length
    && !snap.hyrox && !snap.hiit && !snap.gap && !snap.hibrido && !snap.murph);
}

/**
 * Resolve um item do snapshot de volta num `Exercicio` utilizável pelo volume e
 * pela viabilidade. Prefere o catálogo (dados completos e atuais); se o exercício
 * saiu do catálogo desde que o treino foi salvo, usa o que ficou gravado.
 * @param {any} item
 * @returns {Exercicio}
 */
function comoExercicio(item) {
  const doCatalogo = EXERCICIO_POR_ID[item.id];
  if (doCatalogo) return doCatalogo;
  return /** @type {any} */ ({
    id: item.id, nome: item.nome, padrao: item.padrao,
    equipamento: item.equipamento || [],
    musculosPrimarios: item.musculosPrimarios || [],
    musculosSecundarios: item.musculosSecundarios || [],
    categorias: [], nivel: 'intermediario', tempoMedioSeg: 40,
  });
}

/**
 * Tamanho da turma do dia. Passou a ser gravado no snapshot; para os treinos
 * salvos antes disso, deriva do que existe: `tamanhoGrupo` é `ceil(nAlunos / K)`,
 * então `tamanhoGrupo × K` recupera o valor com erro de no máximo K−1.
 * @param {any} snap
 */
export function alunosDoDia(snap) {
  if (Number.isFinite(snap?.nAlunos)) return snap.nAlunos;
  const k = snap?.exercicios?.length || 1;
  const grupo = snap?.viabilidade?.tamanhoGrupo || 1;
  return Math.max(1, grupo * k);
}

/**
 * Candidatos para trocar o exercício da posição `indice`.
 *
 * `livre: false` repete a regra do card recém-gerado — mesmo padrão de movimento,
 * mesma modalidade, aparelho que comporta a turma — para não furar o full body.
 * `livre: true` abre o catálogo e etiqueta o custo de cada escolha, deixando a
 * decisão com quem está na aula.
 *
 * @param {any} snap @param {number} indice @param {{livre?: boolean}} [opcoes]
 * @returns {{exercicio: Exercicio, viavel: boolean, naModalidade: boolean, mudaPadrao: boolean}[]}
 */
export function alternativasDoDia(snap, indice, opcoes = {}) {
  if (!diaEditavel(snap) || !snap.exercicios[indice]) return [];
  const alvo = snap.exercicios[indice];
  const nAlunos = alunosDoDia(snap);
  const usados = new Set(snap.exercicios.map((e) => e.id));
  const outros = snap.exercicios.filter((_, i) => i !== indice).map(comoExercicio);
  const k = snap.exercicios.length;
  const naoMobilidadePura = (e) => !(e.categorias.length === 1 && e.categorias[0] === 'mobilidade');

  return EXERCICIOS
    .filter((e) => !usados.has(e.id) && naoMobilidadePura(e))
    .filter((e) => (opcoes.livre ? true : e.padrao === alvo.padrao && serveModalidade(e, snap.modalidade)))
    .map((e) => ({
      exercicio: e,
      viavel: verificarViabilidade([...outros, e], nAlunos, k).ok,
      naModalidade: serveModalidade(e, snap.modalidade),
      mudaPadrao: e.padrao !== alvo.padrao,
    }))
    // No modo restrito a viabilidade é um filtro (é o que "viável" significa);
    // no livre ela vira etiqueta, porque o coach pode organizar o rodízio à mão.
    .filter((c) => (opcoes.livre ? true : c.viavel));
}

/**
 * Troca o exercício da posição `indice` e devolve um snapshot NOVO.
 *
 * Recalcula o que a troca de fato muda — cargas por nível, volume por padrão e
 * viabilidade de aparelho — e preserva o que é do slot, não do exercício: séries,
 * reps, descanso e a técnica avançada que o coach tenha atribuído ali.
 *
 * @param {any} snap @param {number} indice @param {Exercicio} novo
 * @returns {any} snapshot atualizado (não muta o original)
 */
export function trocarExercicioDoDia(snap, indice, novo) {
  if (!diaEditavel(snap) || !snap.exercicios[indice] || !novo) return snap;
  const antigo = snap.exercicios[indice];

  const exercicios = snap.exercicios.map((e, i) => {
    if (i !== indice) return e;
    return {
      ...e,
      id: novo.id, nome: novo.nome, padrao: novo.padrao, equipamento: novo.equipamento,
      musculosPrimarios: novo.musculosPrimarios || [],
      musculosSecundarios: novo.musculosSecundarios || [],
      niveis: variantesNivel(novo, e.seriesRef, snap.modalidade),
      // reps, descansoSeg, seriesRef e tecnica são do SLOT — sobrevivem à troca.
    };
  });

  const comoEx = exercicios.map(comoExercicio);
  const itens = exercicios.map((e, i) => ({ exercicio: comoEx[i], series: e.seriesRef }));
  const vol = calcularVolume(itens);
  const viab = verificarViabilidade(comoEx, alunosDoDia(snap), comoEx.length);

  return {
    ...snap,
    exercicios,
    volPorPadrao: vol.porPadrao,
    viabilidade: { ok: viab.ok, tamanhoGrupo: viab.tamanhoGrupo },
    // Marca que o dia foi tocado à mão depois de gerado — o card mostra, e sem
    // isso não haveria como distinguir um treino gerado de um gerado-e-editado.
    editadoEm: new Date().toISOString(),
    trocas: [...(snap.trocas || []), { indice, de: antigo.nome, para: novo.nome }],
  };
}
