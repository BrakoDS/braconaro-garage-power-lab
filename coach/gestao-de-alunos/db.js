// @ts-check
/**
 * Camada de dados da Gestão de Alunos — a fachada.
 *
 * A API é a MESMA de sempre (listar, obter, criar, atualizar, remover,
 * avaliações, produtos, feriados, iniciarSync, aoGravar, enviarAgora): o app da
 * Gestão, os montadores, o painel do coach, Mensagens e Recordes importam este
 * arquivo e não sabem o que tem atrás.
 *
 * Atrás, desde a v2 (docs/superpowers/specs/2026-10-06-refatoracao-gestao-design.md):
 *  - `db-cache.js`  o `localStorage`, normalizado por documento, e a fila do que falta subir;
 *  - `db-sync.js`   login, migração do blob v1, carga da nuvem, envio da fila;
 *  - `db-firestore.js` a única parte que fala com o Firestore (carregada só com login).
 *
 * Continua local-first: toda função aqui é síncrona e responde do cache; a
 * nuvem vem atrás.
 */
import { criarCache } from './db-cache.js?v=11';
import { criarSync } from './db-sync.js?v=11';

const cache = criarCache();

/**
 * Um id por aparelho, para a trava da migração saber quem é quem (duas abas do
 * mesmo navegador são o mesmo aparelho, e podem retomar a trava uma da outra).
 */
function idDoAparelho() {
  try {
    const k = 'braconaro_aparelho';
    let id = localStorage.getItem(k);
    if (!id) { id = `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; localStorage.setItem(k, id); }
    return id;
  } catch { return 'sem-storage'; }
}

const sync = criarSync({
  cache,
  aparelho: idDoAparelho(),
  abrirPorta: async (uid) => (await import('./db-firestore.js?v=11')).portaFirestore(uid),
});

let _aoGravar = null;
/** Registra um callback chamado a cada gravação local (ex.: publicar o Portal do Aluno). */
export function aoGravar(cb) { _aoGravar = cb; }

/** Depois de toda gravação: agenda a nuvem e avisa quem ouve. */
function gravou() {
  sync.agendarEnvio();
  if (_aoGravar) { try { _aoGravar(cache.comoBlobV1()); } catch {} }
}

/**
 * Envia já o que está pendente, sem esperar os 800 ms. Para quem precisa que a
 * nuvem esteja em dia AGORA — o "Criar acesso" confere no servidor se o e-mail
 * está numa ficha, e a ficha acabou de ser salva.
 */
export async function enviarAgora() {
  await sync.enviarAgora();
}

/**
 * Liga a sincronização na nuvem — chamar após o login, com o uid do coach.
 * Resolve com o modo em que ficou: 'v2' (sincronizando), 'local' (a nuvem ainda
 * está no formato antigo e a migração não terminou: os dados ficam aqui e sobem
 * depois) ou undefined (sem nuvem). Falha de rede/regra não quebra: segue local.
 * @param {string} uid
 * @param {() => void} [aoAtualizar] chamado quando os dados da nuvem chegam
 * @returns {Promise<'v2'|'local'|'desligado'|undefined>}
 */
export async function iniciarSync(uid, aoAtualizar) {
  try {
    const fs = await import('./db-firestore.js?v=11');
    if (!fs.cloudAtivo() || !uid) return undefined;
    return await sync.iniciar(uid, aoAtualizar);
  } catch (e) {
    console.warn('Sincronização na nuvem indisponível — usando dados locais.', e?.code || e);
    return sync.modo();
  }
}

/** O modo da sincronização agora ('desligado' | 'local' | 'v2'). */
export function modoSync() { return sync.modo(); }

/** Tudo, no formato do blob antigo (`{ seq, produtos, feriados, alunos[] }`) — para backup. */
export function comoBlob() { return cache.comoBlobV1(); }

/* ---------- API ---------- */

/**
 * Catálogo de consumíveis do box (energético, dose de pré-treino, o que vier).
 *
 * Mora no meta do coach, e não num arquivo de configuração: é o coach que
 * acrescenta produto, e mexer em código para cadastrar um energético novo não é
 * opção. Vai junto na sincronização, então o celular e o computador mostram a
 * mesma lista.
 */
const PRODUTOS_PADRAO = [
  { id: 'energetico', nome: 'Energético', preco: 10 },
  { id: 'pre_meia', nome: '1/2 Dose Pré-Treino', preco: 1.5 },
  { id: 'pre_inteira', nome: '1 Dose Pré-Treino', preco: 3 },
];

/** @returns {{id:string, nome:string, preco:number}[]} */
export function listarProdutos() {
  const m = cache.meta();
  // Lista vazia é uma escolha do coach (ele apagou tudo) e precisa ser
  // respeitada; ausente é banco novo, e aí entram os três que o box já vende.
  return Array.isArray(m.produtos) ? m.produtos : PRODUTOS_PADRAO.slice();
}

/** @param {{id:string, nome:string, preco:number}[]} lista */
export function salvarProdutos(lista) {
  cache.gravarMeta({ produtos: lista });
  gravou();
}

/** @returns {any[]} todos os alunos (mais recentes primeiro) */
export function listar() {
  return cache.todos().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

/** @param {string} id */
export function obter(id) {
  return cache.obter(id);
}

/** Cria um aluno e retorna o registro (com ID gerado). @param {any} dados */
export function criar(dados) {
  let id = (dados.id || '').toString().trim();
  if (id) {
    if (cache.obter(id)) return null; // ID já existe
  } else {
    // Pula número já usado por um ID digitado à mão ("004"): no v1 isso criava
    // dois alunos com o mesmo ID; aqui sobrescreveria a ficha do outro.
    let seq = Number(cache.meta().seq) || 0;
    do { seq += 1; id = String(seq).padStart(3, '0'); } while (cache.obter(id));
    cache.gravarMeta({ seq });
  }
  const aluno = { status: 'ativo', avaliacoes: [], criadoEm: Date.now(), ...dados, id };
  cache.gravarAluno(aluno);
  gravou();
  return cache.obter(id);
}

/** Atualiza campos de um aluno. @param {string} id @param {any} dados */
export function atualizar(id, dados) {
  const a = cache.obter(id);
  if (!a) return null;
  Object.assign(a, dados);
  cache.gravarAluno(a);
  gravou();
  return cache.obter(id);
}

/** Remove um aluno. @param {string} id */
export function remover(id) {
  cache.removerAluno(id);
  // Quem tinha a conta acertada por ele volta a pagar a própria: um vínculo
  // apontando para uma ficha que não existe mais some do painel do coach — o
  // dependente aparece devendo zero e nunca mais entra numa cobrança.
  for (const a of cache.todos()) {
    if (a.pagoPor && a.pagoPor.id === id) cache.gravarAluno({ ...a, pagoPor: null });
  }
  gravou();
}

/** Adiciona uma avaliação (numeração automática). @param {string} id @param {any} av */
export function addAvaliacao(id, av) {
  const a = cache.obter(id);
  if (!a) return null;
  a.avaliacoes = a.avaliacoes || [];
  const num = (a.avaliacoes.reduce((m, x) => Math.max(m, x.num || 0), 0) || 0) + 1;
  const aval = { num, criadoEm: Date.now(), ...av };
  a.avaliacoes.push(aval);
  cache.gravarAluno(a);
  gravou();
  return aval;
}

/** Remove uma avaliação pelo número. @param {string} id @param {number} num */
export function removerAvaliacao(id, num) {
  const a = cache.obter(id);
  if (!a || !a.avaliacoes) return;
  a.avaliacoes = a.avaliacoes.filter((x) => x.num !== num);
  cache.gravarAluno(a);
  gravou();
}

/* ---------- Feriados: o box abriu ou não? ---------- */
/**
 * O coach decide, feriado a feriado, se abriu. A lista de feriados é lei (vem de
 * `compartilhado/regras/feriados.js`); esta parte é a realidade do box, que só
 * ele sabe — em alguns feriados abre, em outros não.
 *
 * Guardado como mapa `{ 'YYYY-MM-DD': false }`, e SÓ os dias marcados como
 * fechados entram. Um feriado sem decisão nenhuma continua contando presença
 * normalmente: o padrão é "abriu", porque o silêncio não pode apagar falta de
 * quem realmente não veio.
 * @returns {Record<string, boolean>}
 */
export function feriadosDoBox() {
  const m = cache.meta();
  return (m.feriados && typeof m.feriados === 'object') ? m.feriados : {};
}

/** Os dias em que o box NÃO abriu — é o que `semanaDoAluno` recebe em `fechados`. */
export function diasFechados() {
  return Object.entries(feriadosDoBox()).filter(([, abriu]) => abriu === false).map(([iso]) => iso);
}

/**
 * Marca se o box abriu num feriado. `null` limpa a decisão (volta ao padrão).
 * @param {string} iso @param {boolean|null} abriu
 */
export function marcarFeriado(iso, abriu) {
  const feriados = { ...feriadosDoBox() };
  if (abriu === null) delete feriados[iso];
  else feriados[iso] = !!abriu;
  cache.gravarMeta({ feriados });
  gravou();
}
