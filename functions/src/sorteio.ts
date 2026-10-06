/**
 * O sorteio da semana do box: RNG pequeno e reproduzível, o mesmo do
 * `coach/montador-de-treino/core/gerador.js`. Mora aqui porque o gerador H e o
 * do HIIT usam os dois, e um importar o outro só para isso faria um ciclo.
 */

/** Mesmo mulberry32 do `gerador.js`: RNG pequeno e reproduzível. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mesmo FNV-1a do `gerador.js`. */
export function hashSeed(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function embaralhar<T>(lista: readonly T[], rng: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
