// @ts-check
/**
 * Ponte Montador ↔ catálogo de exercícios da Academia.
 *
 * Constrói o "catálogo efetivo" que o gerador usa: parte do catálogo editável da
 * Academia (app /academia, mesmo Firestore/localStorage) e o enriquece com o
 * catálogo BASE do montador (schema completo: padrão de movimento, nível, tempo,
 * músculos primários/secundários) pelos IDs que batem.
 *
 * Resultado: o que o coach cadastra/edita/remove na Academia passa a valer na
 * geração — exercício apagado some da montagem; exercício novo (com padrão de
 * movimento definido) entra no full body. Sem Academia (offline/vazia) mantém o
 * catálogo base estático.
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 */
import * as academia from '../../academia/db.js';
import { MUSC_MAP } from '../../academia/data/seed.js';
import { EXERCICIO_BASE_POR_ID, aplicarCatalogo } from '../data/exercicios.js';

/** Rótulo legível de músculo (Academia) → chave interna do montador. */
const MUSC_INV = Object.fromEntries(Object.entries(MUSC_MAP).map(([k, v]) => [v, k]));

/** Tag de treino (Academia, MAIÚSCULA) → categoria/modalidade do montador. */
const TAG_INV = {
  'FORÇA': 'forca',
  'HIPERTROFIA': 'hipertrofia',
  'HYROX': 'hyrox',
  'GAP': 'gap',
  'HIIT': 'hiit',
  'CROSS': 'cross',
  'CARDIO': 'hiit', // legado: dados antigos com a tag CARDIO (hoje separada em HIIT/CROSS)
};

/**
 * Converte um exercício da Academia no `Exercicio` do montador, puxando os campos
 * ricos do catálogo base quando o id existe lá. Retorna null se não dá p/ montar
 * (sem padrão de movimento resolvível → o gerador não saberia onde encaixar).
 * @param {any} a  exercício no formato da Academia
 * @returns {Exercicio | null}
 */
function converter(a) {
  const base = EXERCICIO_BASE_POR_ID[a.id];
  const padrao = a.padrao || base?.padrao || '';
  if (!padrao) return null;

  // Categorias: as TAGS da Academia MANDAM na classificação por modalidade (força/
  // hipertrofia/hyrox/hiit/cross/gap) — inclusive nos exercícios semeados. Assim o
  // que o coach marca/desmarca na Academia vale de verdade na geração (ex.: tirar o
  // CROSS de um exercício o remove do WOD). As categorias ESTRUTURAIS (mobilidade/
  // técnica/híbrido) não têm tag na Academia, então são preservadas do catálogo base
  // p/ não quebrar aquecimento/mobilidade.
  const ESTRUTURAIS = ['mobilidade', 'tecnica', 'hibrido'];
  const doTags = [...new Set((a.tags || []).map((t) => TAG_INV[t]).filter(Boolean))];
  const categorias = base
    ? [...new Set([...base.categorias.filter((c) => ESTRUTURAIS.includes(c)), ...doTags])]
    : doTags;

  const musculosPrimarios = base
    ? base.musculosPrimarios.slice()
    : [...new Set((a.musculos || []).map((m) => MUSC_INV[m]).filter(Boolean))];
  const musculosSecundarios = base ? base.musculosSecundarios.slice() : [];

  return {
    id: a.id,
    nome: a.nome || base?.nome || a.id,
    descricao: a.obs || base?.descricao || '',
    padrao,
    musculosPrimarios,
    musculosSecundarios,
    categorias,
    equipamento: Array.isArray(a.equipamentoIds) ? a.equipamentoIds.slice() : (base?.equipamento || []),
    nivel: a.nivel || base?.nivel || 'intermediario',
    tempoMedioSeg: Number.isFinite(a.tempoMedioSeg) ? a.tempoMedioSeg : (base?.tempoMedioSeg ?? 35),
    unilateral: a.unilateral ?? base?.unilateral ?? false,
    cardio: a.cardio ?? base?.cardio ?? false,
    multiarticular: a.multiarticular ?? base?.multiarticular ?? true,
    obs: base?.obs,
  };
}

/**
 * Monta o catálogo efetivo a partir da Academia e o aplica ao gerador.
 * @returns {number} nº de exercícios aplicados (0 = manteve o catálogo base)
 */
export function construirCatalogoEfetivo() {
  const todos = academia.listarExercicios();
  if (!todos.length) { aplicarCatalogo([]); return 0; } // vazio: mantém o base estático
  // Exercício desativado na Academia (ativo:false) some da montagem, sem ser apagado.
  const lista = todos.filter((a) => a.ativo !== false);
  const efetivo = lista.map(converter).filter(Boolean);
  aplicarCatalogo(/** @type {Exercicio[]} */ (efetivo));
  return efetivo.length;
}

/** Puxa o catálogo da nuvem (se logado) antes de aplicar. @param {string} [uid] */
export async function sincronizarCatalogoAcademia(uid) {
  if (uid) { try { await academia.iniciarSync(uid); } catch { /* offline/regra: segue no local */ } }
}
