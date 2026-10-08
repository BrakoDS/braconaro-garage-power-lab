// Versiona os imports da Gestão de Alunos para furar o cache do navegador.
//
// O index.html carrega `main.js?v=N`, mas os módulos que ele importa iam sem
// versão: um navegador com um módulo antigo em cache misturava o arquivo velho
// com o novo. Esta ferramenta põe `?v=N` em todo import que precisa, com UMA
// versão para a Gestão inteira — mudar N a cada deploy obriga o navegador a
// baixar de novo tudo o que mudou de URL.
//
// A regra, por ARQUIVO importado (não por linha), para nunca carregar o mesmo
// arquivo por duas URLs (duas cópias = dois barramentos, dois bancos):
//   - módulo da Gestão (coach/gestao-de-alunos/**)            → ?v=N, sempre;
//   - módulo de compartilhado/ que, no grafo do main.js, só é
//     importado por arquivos da Gestão                        → ?v=N;
//   - módulo de compartilhado/ que outro módulo de
//     compartilhado/ também importa                           → fica como está;
//   - compartilhado/firebase/**                               → fica como está,
//     sempre: guarda a sessão, e a vitrine local troca o config.js pelo da
//     nuvem desligada casando a URL exata (import map). Versionar o config.js
//     apontaria a vitrine para a produção.
// Vale para todo .js da pasta da Gestão, testes inclusive (no Node, o teste e o
// módulo também precisam falar com a mesma cópia). Comentário não é import:
// `@param {import('./x.js').Tipo}` fica intocado.
//
// Uso:  node ferramentas/versionar-gestao.mjs 11
//       (depois: node ferramentas/grafo-modulos.mjs coach/gestao-de-alunos/main.js)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { especificadores } from './grafo-modulos.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GESTAO = 'coach/gestao-de-alunos';
const rel = (abs) => relative(RAIZ, abs).replace(/\\/g, '/');

/** Todos os .js de uma pasta, recursivo. @param {string} dir @returns {string[]} */
function arquivosJs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivosJs(p) : n.endsWith('.js') ? [p] : [];
  });
}

/** Quem importa cada arquivo, no grafo do main.js. @returns {Map<string, Set<string>>} */
function importadores() {
  const quem = new Map();
  const fila = [resolve(RAIZ, GESTAO, 'main.js')], vistos = new Set();
  while (fila.length) {
    const arq = fila.shift();
    if (vistos.has(arq)) continue;
    vistos.add(arq);
    let fonte; try { fonte = readFileSync(arq, 'utf8'); } catch { continue; }
    for (const esp of especificadores(fonte)) {
      const alvo = resolve(dirname(arq), esp.split('?')[0]);
      if (!quem.has(rel(alvo))) quem.set(rel(alvo), new Set());
      quem.get(rel(alvo)).add(rel(arq));
      fila.push(alvo);
    }
  }
  return quem;
}

/** Os arquivos (relativos à raiz) que recebem a versão da Gestão. */
export function versionaveis() {
  const quem = importadores();
  const set = new Set();
  for (const [alvo, de] of quem) {
    if (alvo.startsWith(GESTAO + '/')) set.add(alvo);
    else if (alvo.startsWith('compartilhado/') && !alvo.startsWith('compartilhado/firebase/')
      && [...de].every((d) => d.startsWith(GESTAO + '/'))) set.add(alvo);
  }
  return set;
}

/** Os trechos de comentário de uma fonte, para não mexer neles. @param {string} fonte */
function trechosDeComentario(fonte) {
  const t = [];
  for (const m of fonte.matchAll(/\/\*[\s\S]*?\*\/|(?<![:'"`\\])\/\/[^\n]*/g)) t.push([m.index, m.index + m[0].length]);
  return t;
}

/**
 * Reescreve os imports de uma fonte: alvo versionável ganha `?v=N` (trocando a
 * versão que houver). @param {string} fonte @param {string} arquivo absoluto
 * @param {Set<string>} alvos @param {string} versao
 */
export function versionar(fonte, arquivo, alvos, versao) {
  const comentarios = trechosDeComentario(fonte);
  const emComentario = (i) => comentarios.some(([a, b]) => i >= a && i < b);
  const troca = (inteiro, antes, aspa, esp, depois, i) => {
    if (emComentario(i)) return inteiro;
    const [caminho] = esp.split('?');
    if (!alvos.has(rel(resolve(dirname(arquivo), caminho)))) return inteiro;
    return `${antes}${aspa}${caminho}?v=${versao}${aspa}${depois}`;
  };
  return fonte
    .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2()/g, (m, a, q, e, d, i) => troca(m, a, q, e, d, i))
    .replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2()/g, (m, a, q, e, d, i) => troca(m, a, q, e, d, i))
    .replace(/(\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*\))/g, (m, a, q, e, d, i) => troca(m, a, q, e, d, i));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const versao = process.argv[2];
  if (!/^\d+$/.test(versao || '')) { console.error('uso: node ferramentas/versionar-gestao.mjs <número da versão>'); process.exit(2); }
  const alvos = versionaveis();
  let mudados = 0;
  for (const arq of arquivosJs(resolve(RAIZ, GESTAO))) {
    const antes = readFileSync(arq, 'utf8');
    const depois = versionar(antes, arq, alvos, versao);
    if (depois !== antes) { writeFileSync(arq, depois); mudados++; }
  }
  // A entrada: o index.html carrega o main.js com a mesma versão.
  const index = resolve(RAIZ, GESTAO, 'index.html');
  const html = readFileSync(index, 'utf8');
  const novo = html.replace(/src="\.\/main\.js(\?v=\d+)?"/, `src="./main.js?v=${versao}"`);
  if (novo !== html) { writeFileSync(index, novo); mudados++; }
  const fora = [...importadores().keys()].filter((k) => k.startsWith('compartilhado/') && !alvos.has(k));
  console.log(`✓ versão ${versao}: ${alvos.size} módulos versionados, ${mudados} arquivos reescritos.`);
  console.log(`  compartilhado sem versão (importado também fora da Gestão ou firebase): ${fora.length}`);
  for (const f of fora) console.log(`    ${f}`);
}
