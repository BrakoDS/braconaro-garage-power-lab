/**
 * O CATÁLOGO INTEIRO — força (`catalogo-base.ts`), só HIIT (`catalogo-hiit.ts`)
 * e só Cross (`catalogo-cross.ts`) num mapa só. É o que o `seed-catalogo.ts`
 * grava e o que os testes usam como "o catálogo de produção".
 *
 * Um id em dois arquivos é erro: no Firestore, um apagaria o outro.
 */
import { CATALOGO_BASE } from './catalogo-base';
import { CATALOGO_CROSS } from './catalogo-cross';
import { CATALOGO_HIIT } from './catalogo-hiit';
import type { ItemCatalogo } from './modelo-box';

const partes: Readonly<Record<string, ItemCatalogo>>[] = [CATALOGO_BASE, CATALOGO_HIIT, CATALOGO_CROSS];
const vistos = new Set<string>();
for (const parte of partes) {
  for (const id of Object.keys(parte)) {
    if (vistos.has(id)) throw new Error(`Id em dois catálogos: ${id}.`);
    vistos.add(id);
  }
}

export const CATALOGO_COMPLETO: Readonly<Record<string, ItemCatalogo>> = Object.assign({}, ...partes);
