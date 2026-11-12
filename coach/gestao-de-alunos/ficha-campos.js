// @ts-check
/**
 * A ficha gravada POR CAMPO — as regras puras da escrita segura
 * (Fase 1 · etapa 1, PLANO-FASE1-ETAPA1.md).
 *
 * Antes, a Gestão regravava a ficha inteira na nuvem a cada edição: o que o
 * servidor tivesse gravado nela nesse meio-tempo (o Pix que deu baixa, o
 * check-in da uGym) sumia. Agora quem grava diz QUAIS campos mudou, e só eles
 * vão para a nuvem:
 *
 *   - um campo comum é gravado inteiro (`telefone`, `consumos`);
 *   - um mapa desce até a chave (`pagamentos › 2026-11`, `atestados › 2026-11-04`):
 *     a baixa de um mês não regrava os outros meses;
 *   - a lista de presenças é um CONJUNTO: grava "entrou este dia" e "saiu este
 *     dia", e quem aplica soma sobre o que está na nuvem — a presença que o
 *     servidor marcou não some porque o coach marcou outra.
 *
 * Usado pela fila da Gestão (db-cache.js), pela porta do Firestore
 * (db-firestore.js), pela porta de memória dos testes (db-memoria.js) e pelo
 * servidor (functions/src/caixas-servico.ts, que roda ESTE arquivo).
 *
 * Puro: nada de Firebase, nada de storage.
 */
import { canonico } from './db-migracao.js?v=40';

/** Campos da ficha que só o servidor escreve: não descem para o cache nem sobem dele. */
export const FICHA_RESERVADOS = Object.freeze(['atualizadoEm']);

/**
 * Listas da ficha gravadas como conjunto (ordenado). As outras listas são
 * valores inteiros — `consumos` e `diasTreino` só o coach escreve.
 */
export const CONJUNTOS = Object.freeze(['presencas']);

/** Até onde a diferença desce nos mapas: o campo (1) e a chave dentro dele (2). */
export const PROFUNDIDADE = 2;

/**
 * Os campos que o servidor também grava ao aplicar as caixas. Uma edição da
 * fila antiga (sem a lista de campos) só SOMA neles — nunca apaga nem troca o
 * que a nuvem tem (`converterLegada`).
 */
export const CAMPOS_DO_SERVIDOR = Object.freeze(['pagamentos', 'pixPagos', 'recebimentos', 'presencas', 'presencaHoras', 'atestados', 'faltas', 'remarcacoes']);

/**
 * @typedef {string[]} Caminho  o caminho de um campo: ['telefone'] ou ['pagamentos', '2026-11']
 * @typedef {{ mais: any[], menos: any[] }} Delta  o que entrou e o que saiu de um conjunto
 * @typedef {{ campos: Caminho[], conjuntos: Record<string, Delta> }} Diferenca
 * @typedef {{ caminho: Caminho, valor?: any, apagar?: true }} Escrita  um campo a gravar (ou a tirar)
 */

const ehMapa = (/** @type {any} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);
const copia = (/** @type {any} */ v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const soTextos = (/** @type {any} */ v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const chaveDe = (/** @type {string[]} */ c) => JSON.stringify(c);

/** A ficha sem o que é do servidor e da nuvem (`atualizadoEm`, `emailNorm`). @param {Record<string, any>} f */
export function soDoBox(f) {
  const { atualizadoEm: _t, emailNorm: _n, ...resto } = f || {};
  return resto;
}

/**
 * O que mudou de `antes` para `depois`, em caminhos de campo.
 * @param {Record<string, any>|null|undefined} antes @param {Record<string, any>|null|undefined} depois
 * @returns {Diferenca}
 */
export function diferencasDaFicha(antes, depois) {
  const a = antes || {}, d = depois || {};
  /** @type {Caminho[]} */ const campos = [];
  /** @type {Record<string, Delta>} */ const conjuntos = {};
  const descer = (/** @type {Caminho} */ caminho, /** @type {any} */ x, /** @type {any} */ y) => {
    if (canonico(x) === canonico(y)) return;
    if (caminho.length < PROFUNDIDADE && ehMapa(x) && ehMapa(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) descer([...caminho, k], x[k], y[k]);
      return;
    }
    campos.push(caminho);
  };
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (FICHA_RESERVADOS.includes(k)) continue;
    if (CONJUNTOS.includes(k) && soTextos(d[k]) && (a[k] === undefined || soTextos(a[k]))) {
      const velho = new Set(a[k] || []), novo = new Set(d[k]);
      const mais = [...novo].filter((v) => !velho.has(v));
      const menos = [...velho].filter((v) => !novo.has(v));
      if (mais.length || menos.length) conjuntos[k] = { mais, menos };
      continue;
    }
    descer([k], a[k], d[k]);
  }
  // Em ordem: a mesma edição dá a mesma lista, venha de onde vier a ordem das chaves.
  campos.sort((x, y) => (chaveDe(x) < chaveDe(y) ? -1 : chaveDe(x) > chaveDe(y) ? 1 : 0));
  return { campos, conjuntos };
}

/** Há algo na diferença? @param {Diferenca} dif */
export const temDiferenca = (dif) => dif.campos.length > 0 || Object.keys(dif.conjuntos).length > 0;

/**
 * O valor de um caminho: `{ valor }`, ou `{ apagar: true }` quando o campo não
 * existe (ou o pai não é um mapa).
 * @param {Record<string, any>} obj @param {Caminho} caminho
 * @returns {{ valor: any } | { apagar: true }}
 */
export function valorEm(obj, caminho) {
  let v = /** @type {any} */ (obj);
  for (const k of caminho) {
    if (!ehMapa(v) || !(k in v) || v[k] === undefined) return { apagar: true };
    v = v[k];
  }
  return { valor: v };
}

/**
 * Grava um caminho num objeto (alterando-o): cria os mapas do meio e troca o
 * que não for mapa no caminho.
 * @param {Record<string, any>} obj @param {Caminho} caminho @param {{ valor?: any, apagar?: true }} v
 */
export function colocar(obj, caminho, v) {
  let alvo = obj;
  for (const k of caminho.slice(0, -1)) {
    if (!ehMapa(alvo[k])) {
      if (v.apagar) return; // nada a apagar debaixo de algo que não é mapa
      alvo[k] = {};
    }
    alvo = alvo[k];
  }
  const ultimo = caminho[caminho.length - 1];
  if (v.apagar) delete alvo[ultimo];
  else alvo[ultimo] = copia(v.valor);
}

/**
 * Um conjunto depois do delta, ordenado e sem repetição.
 * @param {unknown} atual @param {Partial<Delta>} delta
 */
export function aplicarConjunto(atual, delta) {
  const s = new Set(Array.isArray(atual) ? atual : []);
  for (const x of delta.mais || []) s.add(x);
  for (const x of delta.menos || []) s.delete(x);
  return [...s].sort();
}

/* ============================================================
   A fila de envio
   ============================================================ */

/**
 * @typedef {{ op: 'set'|'delete', t?: string, inteira?: true, campos?: Caminho[], conjuntos?: Record<string, Delta> }} Entrada
 *   inteira: a ficha ainda não existe na nuvem (ou volta a existir) — sobe inteira;
 *   campos/conjuntos: o que mudou desde o último envio confirmado.
 *   Uma entrada de ficha sem `inteira` e sem `campos` é da fila ANTIGA (Gestão v29).
 */

/** É uma entrada de ficha da fila antiga (sem a lista de campos)? @param {Entrada|undefined} e */
export const ehLegada = (e) => !!e && e.op === 'set' && !e.inteira && !Array.isArray(e.campos);

const unicos = (/** @type {any[]} */ xs) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];

/**
 * Junta uma mudança nova com a que já esperava na fila para a mesma ficha.
 * @param {Entrada|undefined} velha
 * @param {{ inteira?: boolean } & Partial<Diferenca>} nova
 * @returns {Entrada}
 */
export function juntarEntrada(velha, nova) {
  // Ficha nova (ou recriada): sobe inteira até a nuvem confirmar.
  if (nova.inteira || (velha && (velha.op === 'delete' || velha.inteira))) return { op: 'set', inteira: true };
  if (ehLegada(velha)) return { op: 'set' }; // segue antiga: a conversão (contra a nuvem) cobre tudo
  const campos = unicos([...((velha && velha.campos) || []), ...(nova.campos || [])]);
  /** @type {Record<string, Delta>} */ const conjuntos = {};
  const nomes = new Set([...Object.keys((velha && velha.conjuntos) || {}), ...Object.keys(nova.conjuntos || {})]);
  for (const k of nomes) {
    const v = ((velha && velha.conjuntos) || {})[k] || { mais: [], menos: [] };
    const n = (nova.conjuntos || {})[k] || { mais: [], menos: [] };
    const mais = unicos([...v.mais.filter((x) => !n.menos.includes(x)), ...n.mais]);
    const menos = unicos([...v.menos.filter((x) => !n.mais.includes(x)), ...n.menos]);
    if (mais.length || menos.length) conjuntos[k] = { mais, menos };
  }
  return { op: 'set', campos, conjuntos };
}

/**
 * A ficha que a tela vê: a da nuvem, com o que está pendente aqui por cima.
 * @param {Record<string, any>} nuvem @param {Record<string, any>} local @param {Entrada} entrada
 */
export function sobrepor(nuvem, local, entrada) {
  const r = copia(nuvem) || {};
  for (const c of entrada.campos || []) colocar(r, c, valorEm(local, c));
  for (const [k, d] of Object.entries(entrada.conjuntos || {})) r[k] = aplicarConjunto(r[k], d);
  return r;
}

/**
 * Uma entrada da fila antiga vira a lista de campos, comparando a ficha local
 * com a da nuvem. Nos campos que o servidor também grava, a edição antiga só
 * SOMA: entra a chave (ou o dia) que a nuvem não tem; o que a nuvem tem fica
 * como está — pode ser o Pix ou o check-in que o servidor aplicou depois.
 * @param {Record<string, any>} local @param {Record<string, any>} nuvem
 * @returns {Entrada}
 */
export function converterLegada(local, nuvem) {
  const dif = diferencasDaFicha(nuvem, local);
  const soma = (/** @type {Caminho} */ c) => 'apagar' in valorEm(nuvem, c) && 'valor' in valorEm(local, c);
  const campos = dif.campos.filter((c) => !CAMPOS_DO_SERVIDOR.includes(c[0]) || soma(c));
  /** @type {Record<string, Delta>} */ const conjuntos = {};
  for (const [k, d] of Object.entries(dif.conjuntos)) if (d.mais.length) conjuntos[k] = { mais: d.mais, menos: [] };
  return { op: 'set', campos, conjuntos };
}

/* ============================================================
   A gravação (o que a porta do banco faz com uma entrada)
   ============================================================ */

/**
 * As escritas de uma atualização por campo sobre a ficha que ESTÁ na nuvem
 * (`atual`). Pai ausente na nuvem não atrapalha (o Firestore cria o mapa), mas
 * pai que existe e não é mapa (`null`, um texto) não tem onde descer: aí o
 * campo sobe inteiro. Conjunto sobe já somado sobre o da nuvem.
 * @param {Record<string, any>} atual a ficha na nuvem agora
 * @param {Record<string, any>} dados a ficha local inteira (de onde saem os valores)
 * @param {{ campos?: Caminho[], conjuntos?: Record<string, Delta> }} entrada
 * @returns {Escrita[]}
 */
export function escritasDaAtualizacao(atual, dados, entrada) {
  /** @type {Map<string, Escrita>} */ const porCaminho = new Map();
  for (const c of entrada.campos || []) {
    const pai = c.length > 1 ? valorEm(atual, c.slice(0, -1)) : null;
    const alvo = pai && 'valor' in pai && !ehMapa(pai.valor) ? c.slice(0, 1) : c;
    porCaminho.set(chaveDe(alvo), { caminho: alvo, ...valorEm(dados, alvo) });
  }
  // Um caminho de cima (o campo inteiro) cobre os de baixo: o Firestore recusa os dois juntos.
  const inteiros = new Set([...porCaminho.values()].filter((e) => e.caminho.length === 1).map((e) => e.caminho[0]));
  const escritas = [...porCaminho.values()].filter((e) => e.caminho.length === 1 || !inteiros.has(e.caminho[0]));
  for (const [k, d] of Object.entries(entrada.conjuntos || {})) {
    if (inteiros.has(k)) continue;
    escritas.push({ caminho: [k], valor: aplicarConjunto(atual[k], d) });
  }
  return escritas;
}

/**
 * A ficha depois das escritas (para a porta de memória e para o servidor
 * conferir o resultado antes de gravar).
 * @param {Record<string, any>} atual @param {Escrita[]} escritas
 */
export function aplicarEscritas(atual, escritas) {
  const r = copia(atual) || {};
  for (const e of escritas) colocar(r, e.caminho, e);
  return r;
}

/**
 * A ficha inteira sobre uma que já existe na nuvem (ficha "nova" cuja criação
 * já tinha subido, ou fila antiga sem a ficha na nuvem): os mapas se mesclam
 * (como o `merge: true` do Firestore) e o conjunto só soma.
 * @param {Record<string, any>} atual @param {Record<string, any>} dados
 */
export function mesclarInteira(atual, dados) {
  const r = copia(atual) || {};
  for (const [k, v] of Object.entries(dados || {})) {
    if (CONJUNTOS.includes(k) && soTextos(v)) r[k] = aplicarConjunto(r[k], { mais: v });
    else if (ehMapa(v) && ehMapa(r[k])) r[k] = { ...r[k], ...copia(v) };
    else r[k] = copia(v);
  }
  return r;
}
