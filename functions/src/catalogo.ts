/**
 * CATÁLOGO DE EXERCÍCIOS — a memória que faz a lousa ficar barata com o uso.
 *
 * Mora em `coaches/{uid}/catalogoExercicios/{chave}`. Sob `coaches/{uid}` de
 * propósito: a regra `match /coaches/{uid}/{sub=**}` do `firestore.rules` já
 * cobre esse caminho, então a coleção nasce protegida e sem publicar regra nova.
 * Uma coleção na raiz exigiria regra própria — e uma regra nova é uma chance
 * nova de deixar a base aberta.
 *
 * ── Por que por coach, e não global ──────────────────────────────────────────
 * "Remada" no box de um coach pode ser a máquina, e no de outro o ergômetro. Um
 * catálogo global faria o cadastro de um coach mudar o treino do outro em
 * silêncio. O custo é cada conta aprender do zero — que é barato, porque
 * aprender é de graça: acontece como efeito de uma leitura que ia acontecer.
 *
 * ── O que é "conhecer" um exercício ──────────────────────────────────────────
 * Ter GRUPAMENTOS e IMPLEMENTO. Os dois, porque os dois alimentam o dashboard:
 * grupamento vira barra por grupo muscular, implemento vira fatia da rosca de
 * variabilidade. Saber metade e chutar o resto no caminho rápido produziria um
 * gráfico errado sem nada na tela dizendo que foi chute.
 */

import { perfilDe } from './taxonomia.js';
import { MUSCULOS_LABEL } from './lousa.js';

export type ItemCatalogo = {
  /** Nome canônico — o que vai para o treino. */
  nome: string;
  /** Rótulos de `MUSCULOS_LABEL`. */
  grupamentos: string[];
  implemento: string;
  /** De onde veio: 'taxonomia' (código) ou 'ia' (aprendido numa leitura). */
  origem: 'taxonomia' | 'ia';
  /** ISO. Só para o coach saber quando o catálogo aprendeu aquilo. */
  aprendidoEm?: string;
};

/**
 * A chave do documento no Firestore.
 *
 * Normaliza acento, caixa e hífen para que "Wall Ball", "wall ball" e
 * "Wall-Ball" sejam UM item, e não três que aprendem separado. Restringe a
 * `[a-z0-9-]` porque id de documento não pode ter `/` e não deveria depender do
 * que o coach digitou.
 */
export function chaveDe(nome: string): string {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** Um item é utilizável no caminho rápido? Ver o cabeçalho sobre "conhecer". */
export function itemUtil(item: ItemCatalogo | null | undefined): item is ItemCatalogo {
  if (!item) return false;
  const validos = new Set<string>(MUSCULOS_LABEL as readonly string[]);
  return Array.isArray(item.grupamentos)
    && item.grupamentos.length > 0
    && item.grupamentos.every((g) => validos.has(g))
    && typeof item.implemento === 'string'
    && item.implemento.trim().length > 0;
}

/**
 * O item que a TAXONOMIA conhece, se conhecer.
 *
 * A taxonomia é o catálogo de fábrica: vale para toda conta, desde a primeira
 * leitura, e não precisa ser aprendida. O catálogo do Firestore fica por cima
 * dela — se o coach tem um item gravado com o mesmo nome, o dele vence, porque
 * é sobre o galpão DELE.
 */
export function daTaxonomia(nome: string): ItemCatalogo | null {
  const p = perfilDe(nome);
  if (!p) return null;
  return {
    nome: p.nome,
    grupamentos: [...new Set([...p.primarios, ...p.secundarios])],
    implemento: p.implemento,
    origem: 'taxonomia',
  };
}

/**
 * Resolve uma lista de nomes contra taxonomia + catálogo.
 *
 * Devolve o que deu para resolver e o que faltou, SEM chutar: quem não está em
 * lugar nenhum volta em `desconhecidos`, e é o que a IA vai classificar.
 *
 * @param gravados o que veio do Firestore, por chave
 */
export function resolver(
  nomes: string[],
  gravados: Map<string, ItemCatalogo>,
): { conhecidos: Map<string, ItemCatalogo>; desconhecidos: string[] } {
  const conhecidos = new Map<string, ItemCatalogo>();
  const desconhecidos: string[] = [];
  for (const nome of nomes) {
    const chave = chaveDe(nome);
    if (!chave) continue;
    if (conhecidos.has(chave) || desconhecidos.includes(nome)) continue;
    // O catálogo do coach vence a taxonomia — ver `daTaxonomia`.
    const doCoach = gravados.get(chave);
    const item = itemUtil(doCoach) ? doCoach : daTaxonomia(nome);
    if (itemUtil(item)) conhecidos.set(chave, item);
    else desconhecidos.push(nome);
  }
  return { conhecidos, desconhecidos };
}

/**
 * O que a IA devolveu, pronto para gravar — ou `null` se veio imprestável.
 *
 * Valida antes de gravar porque o catálogo é PERMANENTE: um grupamento inválido
 * numa resposta ruim ficaria no banco contaminando toda leitura futura daquele
 * exercício, e ninguém revisa um catálogo que se preenche sozinho.
 */
export function itemDaIA(nome: string, cru: unknown): ItemCatalogo | null {
  const o = (cru ?? {}) as Record<string, unknown>;
  const validos = new Set<string>(MUSCULOS_LABEL as readonly string[]);
  const grupamentos = Array.isArray(o.grupamentos)
    ? [...new Set(o.grupamentos.filter((g): g is string => typeof g === 'string' && validos.has(g)))]
    : [];
  const implemento = typeof o.implemento === 'string' ? o.implemento.trim().slice(0, 40) : '';
  if (!grupamentos.length || !implemento) return null;
  return {
    nome: String(nome || '').trim().slice(0, 80),
    grupamentos,
    implemento,
    origem: 'ia',
    aprendidoEm: new Date().toISOString(),
  };
}
