// O grafo de módulos ES de uma página: a partir de um arquivo de entrada, segue
// todo `import … from '…'`, `export … from '…'` e `import('…')` com caminho
// relativo e anota, para cada ARQUIVO, as URLs pelas quais ele é carregado.
//
// Por que importa: para o navegador, `estado.js` e `estado.js?v=11` são DOIS
// módulos. Um arquivo carregado por duas URLs vira duas cópias — e um módulo
// com estado (o barramento, o banco, a fila de eventos) se parte em dois.
//
// Uso:  node ferramentas/grafo-modulos.mjs coach/gestao-de-alunos/main.js
//       (sai com erro se algum arquivo é carregado por mais de uma URL)
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Os especificadores relativos de um arquivo JS (estáticos, re-exports e dinâmicos com texto fixo). @param {string} fonte */
export function especificadores(fonte) {
  // Comentários fora: `@typedef {import('./x.js')…}` e exemplos em texto não são imports.
  const sem = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const out = [];
  for (const m of sem.matchAll(/\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1/g)) out.push(m[2]);
  for (const m of sem.matchAll(/\bimport\s*(['"])(\.{1,2}\/[^'"]+)\1/g)) out.push(m[2]); // import './efeito.js'
  for (const m of sem.matchAll(/\bimport\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g)) out.push(m[2]);
  return out;
}

/**
 * Percorre o grafo a partir de `entrada` (caminho relativo à raiz do repo).
 * @returns {Map<string, Set<string>>} arquivo (relativo à raiz) → URLs (caminho + ?query) que o carregam
 */
export function grafo(entrada) {
  /** @type {Map<string, Set<string>>} */
  const urls = new Map();
  const visitados = new Set();
  const fila = [resolve(RAIZ, entrada)];
  urls.set(relative(RAIZ, fila[0]).replace(/\\/g, '/'), new Set(['(entrada)']));
  while (fila.length) {
    const arq = fila.shift();
    if (visitados.has(arq)) continue;
    visitados.add(arq);
    if (!existsSync(arq)) continue;
    for (const esp of especificadores(readFileSync(arq, 'utf8'))) {
      const [caminho, query = ''] = esp.split('?');
      const alvo = resolve(dirname(arq), caminho);
      const chave = relative(RAIZ, alvo).replace(/\\/g, '/');
      if (!urls.has(chave)) urls.set(chave, new Set());
      urls.get(chave).add(`/${chave}${query ? '?' + query : ''}`);
      fila.push(alvo);
    }
  }
  return urls;
}

/** Os arquivos carregados por mais de uma URL. @param {Map<string, Set<string>>} g */
export function duplicados(g) {
  return [...g].filter(([, u]) => u.size > 1).map(([arq, u]) => ({ arq, urls: [...u] }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const entrada = process.argv[2] || 'coach/gestao-de-alunos/main.js';
  const g = grafo(entrada);
  const dup = duplicados(g);
  console.log(`${g.size} módulos no grafo de ${entrada}`);
  for (const d of dup) console.log(`  ✗ ${d.arq} carregado por ${d.urls.length} URLs: ${d.urls.join('  |  ')}`);
  if (dup.length) process.exit(1);
  console.log('✓ cada módulo é carregado por uma URL só.');
}
