// @ts-check
/**
 * Cache local da Gestão de Alunos (v2) — o lado "local-first" da camada de dados.
 *
 * No `localStorage`, normalizado como a nuvem v2:
 *
 *   braconaro_gestao_v2       { meta, alunos: {id: ficha}, avaliacoes: {id: [...]}, feedbacks: {id: [...]} }
 *   braconaro_gestao_v2_fila  { 'alunos/001': {op:'set', t}, 'alunos/001/avaliacoes/2': {op:'delete', t}, 'meta': {...} }
 *
 * Quem consulta recebe o aluno "gordo" de sempre (ficha + `avaliacoes[]` +
 * `feedbacks[]` dentro), então os consumidores do `db.js` não percebem a troca.
 * Quem grava entrega o aluno gordo inteiro; o cache compara documento a
 * documento com o que tinha e marca na fila SÓ o que mudou.
 *
 * Fila: o caminho, a operação e um token. O dado não vai na fila — sai do
 * cache na hora do envio, sempre a versão mais nova. O token existe para o
 * envio não limpar uma entrada que mudou enquanto o lote estava no ar.
 *
 * Puro: o armazenamento é injetado (testes passam um falso). Nenhum Firebase.
 */
import { fatiarAluno, idsDosFeedbacks, canonico, CAMPO_EMAIL_NORM, SCHEMA_V2 } from './db-migracao.js?v=11';

/** Chave do blob v1 — lida uma vez, na primeira abertura do v2 neste aparelho. Nunca mais gravada. */
export const CHAVE_V1 = 'braconaro_gestao_alunos_v1';
export const CHAVE = 'braconaro_gestao_v2';
export const CHAVE_FILA = 'braconaro_gestao_v2_fila';
export const CAMINHO_META = 'meta';
/** Campos do documento raiz que são da migração/servidor, não do box: não descem para o cache nem sobem dele. */
const META_RESERVADOS = ['schema', 'migradoEm', 'migracao', 'alunos'];

/**
 * @typedef {Record<string, any>} Dados
 * @typedef {{ meta: Dados, alunos: Record<string, Dados>, avaliacoes: Record<string, any[]>, feedbacks: Record<string, any[]> }} Estado
 * @typedef {Record<string, { op: 'set'|'delete', t: string }>} Fila
 * @typedef {{ tipo: 'set', caminho: string[], dados: Dados } | { tipo: 'delete', caminho: string[] } | { tipo: 'meta', dados: Dados }} Operacao
 */

const limpo = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const vazio = () => /** @type {Estado} */ ({ meta: { seq: 0 }, alunos: {}, avaliacoes: {}, feedbacks: {} });
const token = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** A ficha como a tela conhece: sem o `emailNorm`, que é coisa da nuvem. @param {Dados} f */
function semEmailNorm(f) {
  const { [CAMPO_EMAIL_NORM]: _n, ...resto } = f || {};
  return resto;
}

/** Só os campos do box no documento raiz. @param {Dados|null|undefined} raiz */
export function metaDoBox(raiz) {
  const m = {};
  for (const [k, v] of Object.entries(raiz || {})) if (!META_RESERVADOS.includes(k)) m[k] = v;
  return m;
}

const porNum = (x, y) => (x.num || 0) - (y.num || 0);
const maisRecente = (x, y) => (y.criadoEm || 0) - (x.criadoEm || 0);

/* ============================================================
   Conversões para o formato do cache
   ============================================================ */

/**
 * Blob v1 (o `localStorage` antigo, ou o documento raiz antes da migração) → Estado.
 * Nada é descartado além do que não tem id para servir de chave.
 * @param {Dados} blobBruto
 * @returns {Estado}
 */
export function estadoDeBlobV1(blobBruto) {
  const blob = limpo(blobBruto) || {};
  const e = vazio();
  e.meta = metaDoBox(blob);
  if (typeof e.meta.seq !== 'number') e.meta.seq = Number(e.meta.seq) || 0;
  for (const a of Array.isArray(blob.alunos) ? blob.alunos : []) {
    if (!a || typeof a !== 'object' || a.id == null || a.id === '') continue;
    const id = String(a.id);
    if (e.alunos[id]) { console.warn(`Gestão: aluno ${id} repetido no blob — fica o primeiro (como o obter() do v1).`); continue; }
    const { avaliacoes, feedbacks, ...ficha } = a;
    e.alunos[id] = { ...ficha, id };
    if (avaliacoes !== undefined) e.avaliacoes[id] = avaliacoes;
    if (feedbacks !== undefined) e.feedbacks[id] = feedbacks;
  }
  return e;
}

/**
 * O que veio das subcoleções da nuvem → Estado.
 * @param {Dados|null} raiz o documento meta
 * @param {{ fichas: Map<string, Dados>, avaliacoes: Map<string, Map<string, Dados>>, feedbacks: Map<string, Map<string, Dados>> }} sub
 * @returns {Estado}
 */
export function estadoDeSubcolecoes(raiz, sub) {
  const e = vazio();
  e.meta = { seq: 0, ...metaDoBox(raiz) };
  for (const [id, f] of sub.fichas) {
    e.alunos[id] = { ...semEmailNorm(f), id };
    e.avaliacoes[id] = [...(sub.avaliacoes.get(id)?.values() || [])].sort(porNum);
    const fbs = [...(sub.feedbacks.get(id)?.values() || [])];
    if (fbs.length) e.feedbacks[id] = fbs.sort(maisRecente);
  }
  return e;
}

/* ============================================================
   Mescla: nuvem × o que está pendente aqui
   ============================================================ */

/**
 * Pares [id do documento, item] de uma lista de filhos. Avaliação sem número
 * não vira documento (não sobe), mas também não some: vai em `semId`.
 * @param {'avaliacoes'|'feedbacks'} tipo @param {any[]|undefined} lista
 */
function paresDeFilhos(tipo, lista) {
  const arr = Array.isArray(lista) ? lista : [];
  if (tipo === 'avaliacoes') {
    const pares = [], semId = [];
    for (const av of arr) {
      if (av && Number.isInteger(av.num) && av.num >= 1) pares.push([String(av.num), av]);
      else semId.push(av);
    }
    return { pares, semId };
  }
  const ids = idsDosFeedbacks(arr);
  return { pares: arr.map((fb, i) => [ids[i], fb]).filter(([, fb]) => fb && typeof fb === 'object'), semId: [] };
}

/**
 * A nuvem vence, menos onde a fila diz que há edição local ainda não enviada.
 * Documento por documento: a ficha, cada avaliação, cada feedback, e o meta.
 * @param {Estado} local @param {Estado} nuvem @param {Fila} fila
 * @returns {Estado}
 */
export function mesclar(local, nuvem, fila) {
  const e = vazio();
  e.meta = CAMINHO_META in fila ? local.meta : nuvem.meta;
  const ids = new Set([...Object.keys(nuvem.alunos), ...Object.keys(local.alunos)]);
  for (const id of ids) {
    const p = `alunos/${id}`;
    const ficha = p in fila ? local.alunos[id] : nuvem.alunos[id];
    if (!ficha) continue; // apagado aqui (pendente) ou apagado na nuvem por outro aparelho
    e.alunos[id] = ficha;
    for (const tipo of /** @type {const} */ (['avaliacoes', 'feedbacks'])) {
      const n = nuvem[tipo][id], l = local[tipo][id];
      if (n === undefined && l === undefined) continue;
      const doc = new Map(paresDeFilhos(tipo, n).pares);
      const loc = paresDeFilhos(tipo, l);
      const locMap = new Map(loc.pares);
      const prefixo = `${p}/${tipo}/`;
      for (const k of Object.keys(fila)) {
        if (!k.startsWith(prefixo)) continue;
        const cid = k.slice(prefixo.length);
        if (locMap.has(cid)) doc.set(cid, locMap.get(cid)); else doc.delete(cid);
      }
      e[tipo][id] = [...doc.values(), ...loc.semId].sort(tipo === 'avaliacoes' ? porNum : maisRecente);
    }
  }
  return e;
}

/* ============================================================
   O cache
   ============================================================ */

/**
 * @param {{ storage?: Pick<Storage, 'getItem'|'setItem'> }} [opts]
 */
export function criarCache({ storage = globalThis.localStorage } = {}) {
  const lerJSON = (/** @type {string} */ k) => { try { return JSON.parse(storage.getItem(k) || ''); } catch { return null; } };
  const salvar = (/** @type {Estado} */ e) => storage.setItem(CHAVE, JSON.stringify(e));
  const salvarFila = (/** @type {Fila} */ f) => storage.setItem(CHAVE_FILA, JSON.stringify(f));

  /**
   * O estado inteiro, recém-lido (cópia: mexer nele não mexe no cache).
   * Na primeira vez neste aparelho, converte o blob v1 — sem marcar nada como
   * pendente: a nuvem já tem esses dados, e o login traz a versão dela.
   * @returns {Estado}
   */
  function estado() {
    const e = lerJSON(CHAVE);
    if (e && typeof e === 'object' && e.alunos && typeof e.alunos === 'object') {
      return { meta: e.meta || { seq: 0 }, alunos: e.alunos, avaliacoes: e.avaliacoes || {}, feedbacks: e.feedbacks || {} };
    }
    const v1 = lerJSON(CHAVE_V1);
    if (v1 && Array.isArray(v1.alunos)) {
      const conv = estadoDeBlobV1(v1);
      salvar(conv);
      return conv;
    }
    return vazio();
  }

  /** @returns {Fila} */
  function fila() {
    const f = lerJSON(CHAVE_FILA);
    return f && typeof f === 'object' ? f : {};
  }

  /** @param {[string, 'set'|'delete'][]} entradas */
  function marcar(entradas) {
    if (!entradas.length) return;
    const f = fila();
    for (const [caminho, op] of entradas) f[caminho] = { op, t: token() };
    salvarFila(f);
  }

  /** O aluno gordo, ou null. @param {Estado} e @param {string} id */
  function gordo(e, id) {
    const f = e.alunos[id];
    if (!f) return null;
    const a = { ...f };
    if (id in e.avaliacoes) a.avaliacoes = e.avaliacoes[id];
    if (id in e.feedbacks) a.feedbacks = e.feedbacks[id];
    return a;
  }

  /** Os documentos de um aluno do estado, por id. @param {Estado} e @param {string} id */
  function documentos(e, id) {
    const a = gordo(e, id);
    if (!a) return null;
    const f = fatiarAluno(a);
    return { f, avaliacoes: new Map(f.avaliacoes.map((x) => [x.id, x.dados])), feedbacks: new Map(f.feedbacks.map((x) => [x.id, x.dados])) };
  }

  /**
   * O que mudou entre duas versões de um aluno, em caminhos da fila.
   * @param {string} id @param {ReturnType<typeof documentos>} antes @param {ReturnType<typeof documentos>} depois
   * @returns {[string, 'set'|'delete'][]}
   */
  function diferencas(id, antes, depois) {
    const p = `alunos/${id}`;
    /** @type {[string, 'set'|'delete'][]} */ const out = [];
    if (!depois) {
      if (!antes) return out;
      for (const tipo of /** @type {const} */ (['avaliacoes', 'feedbacks'])) for (const cid of antes[tipo].keys()) out.push([`${p}/${tipo}/${cid}`, 'delete']);
      out.push([p, 'delete']);
      return out;
    }
    if (!antes || canonico(antes.f.ficha) !== canonico(depois.f.ficha)) out.push([p, 'set']);
    for (const tipo of /** @type {const} */ (['avaliacoes', 'feedbacks'])) {
      for (const [cid, d] of depois[tipo]) {
        const velho = antes && antes[tipo].get(cid);
        if (!velho || canonico(velho) !== canonico(d)) out.push([`${p}/${tipo}/${cid}`, 'set']);
      }
      if (antes) for (const cid of antes[tipo].keys()) if (!depois[tipo].has(cid)) out.push([`${p}/${tipo}/${cid}`, 'delete']);
    }
    return out;
  }

  return {
    estado,
    fila,

    /** @param {string} id */
    obter(id) {
      const a = gordo(estado(), String(id));
      return a ? semEmailNorm(a) : null;
    },

    /** Todos os alunos gordos, na ordem do cache. */
    todos() {
      const e = estado();
      return Object.keys(e.alunos).map((id) => semEmailNorm(/** @type {Dados} */ (gordo(e, id))));
    },

    /** O meta do box (seq, produtos, feriados…). */
    meta() { return estado().meta; },

    /**
     * Grava o aluno gordo inteiro e marca na fila só os documentos que mudaram.
     * @param {Dados} alunoGordo
     */
    gravarAluno(alunoGordo) {
      const a = limpo(alunoGordo);
      const id = String(a.id);
      const e = estado();
      const antes = documentos(e, id);
      const { avaliacoes, feedbacks, [CAMPO_EMAIL_NORM]: _n, ...ficha } = a;
      e.alunos[id] = { ...ficha, id };
      if (avaliacoes !== undefined) e.avaliacoes[id] = avaliacoes; else delete e.avaliacoes[id];
      if (feedbacks !== undefined) e.feedbacks[id] = feedbacks; else delete e.feedbacks[id];
      const depois = documentos(e, id);
      if (depois && depois.f.problemas.length) console.warn('Gestão: parte deste aluno não sobe para a nuvem (fica só neste aparelho):', depois.f.problemas);
      salvar(e);
      marcar(diferencas(id, antes, depois));
    },

    /** Apaga o aluno, as avaliações e os feedbacks dele. @param {string} id */
    removerAluno(id) {
      const e = estado();
      const antes = documentos(e, String(id));
      delete e.alunos[id]; delete e.avaliacoes[id]; delete e.feedbacks[id];
      salvar(e);
      marcar(diferencas(String(id), antes, null));
    },

    /** Mescla campos no meta (`undefined` tira o campo). @param {Dados} patch */
    gravarMeta(patch) {
      const e = estado();
      const m = { ...e.meta };
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete m[k]; else m[k] = limpo(v); }
      e.meta = m;
      salvar(e);
      marcar([[CAMINHO_META, 'set']]);
    },

    /** Põe TUDO na fila — para semear uma nuvem vazia com o que está aqui. */
    marcarTudo() {
      const e = estado();
      /** @type {[string, 'set'|'delete'][]} */ const out = [[CAMINHO_META, 'set']];
      for (const id of Object.keys(e.alunos)) out.push(...diferencas(id, null, documentos(e, id)));
      marcar(out);
    },

    /**
     * Adota o estado da nuvem, preservando o que está pendente na fila.
     * @param {Estado} nuvem
     */
    adotar(nuvem) {
      salvar(mesclar(estado(), nuvem, fila()));
    },

    /**
     * A operação de envio de um caminho da fila, com o dado de AGORA. Documento
     * que não existe mais no cache vira delete, qualquer que seja a op marcada.
     * @param {string} caminho
     * @returns {Operacao|null} null = caminho inválido (descartar)
     */
    operacaoDe(caminho) {
      const e = estado();
      if (caminho === CAMINHO_META) return { tipo: 'meta', dados: { ...metaDoBox(e.meta), schema: SCHEMA_V2 } };
      const p = caminho.split('/');
      if (p[0] !== 'alunos' || !(p.length === 2 || (p.length === 4 && (p[2] === 'avaliacoes' || p[2] === 'feedbacks')))) return null;
      const docs = documentos(e, p[1]);
      const dados = !docs ? null : p.length === 2 ? docs.f.ficha : docs[/** @type {'avaliacoes'|'feedbacks'} */ (p[2])].get(p[3]);
      return dados ? { tipo: 'set', caminho: p, dados } : { tipo: 'delete', caminho: p };
    },

    /**
     * Tira da fila o que foi confirmado pela nuvem — só se não mudou de novo
     * enquanto o lote estava no ar (o token é outro, então fica).
     * @param {Fila} enviados
     */
    confirmar(enviados) {
      const f = fila();
      for (const [k, v] of Object.entries(enviados)) if (f[k] && v && f[k].t === v.t) delete f[k];
      salvarFila(f);
    },

    /** O blob no formato v1 (para o backup e para quem ouvia o `aoGravar`). */
    comoBlobV1() {
      const e = estado();
      const alunos = Object.keys(e.alunos).map((id) => semEmailNorm(/** @type {Dados} */ (gordo(e, id))));
      return { ...e.meta, alunos };
    },
  };
}
