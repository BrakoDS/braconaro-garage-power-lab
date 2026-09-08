/**
 * VERIFICADOR DE CAMINHOS — a rede embaixo da reorganização.
 *
 * Percorre todo `.js`, `.html` e `.webmanifest` do site e confere que cada
 * caminho relativo aponta para um arquivo que existe em disco.
 *
 * Existe por um motivo específico: mover pasta quebra import com um `../` a
 * mais ou a menos, e um import quebrado num arquivo que nenhum teste toca não
 * aparece em lugar nenhum — o coach só descobre abrindo a tela e vendo a página
 * em branco. Os testes cobrem a regra pura; isto cobre a fiação.
 *
 *     node ferramentas/verificar-imports.mjs
 *
 * Sai com 1 e lista o que faltou. Silencioso e 0 quando está tudo certo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Não entram: dependência de terceiro, saída de build, e o método (fora do site). */
const IGNORAR = new Set(['node_modules', '.git', 'lib', 'docs', '.superpowers', '.agents', 'ferramentas']);

/** Externo, âncora, protocolo — não é arquivo nosso e não se resolve em disco. */
const EXTERNO = /^(https?:|data:|mailto:|tel:|blob:|javascript:|#|\/\/)/i;

function arquivos(dir, ext, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(f, ext, acc);
    else if (ext.some((x) => e.name.endsWith(x))) acc.push(f);
  }
  return acc;
}

const rel = (f) => path.relative(RAIZ, f).split(path.sep).join('/');

/** Tira `?v=5` e `#ancora` antes de resolver: `../calc.js?v=5` é o arquivo `../calc.js`. */
const semQuery = (p) => p.split('?')[0].split('#')[0];

/** @type {{onde:string, linha:number, caminho:string, resolvido:string}[]} */
const quebrados = [];
let conferidos = 0;

/**
 * @param {boolean} ehImport  `true` para `from`/`import` de JS, `false` para
 *   `href`/`src` de HTML. A diferença NÃO é cosmética: em JS, um especificador
 *   sem `./` é PACOTE (`node:test`, `firebase-admin`) e não existe em disco; em
 *   HTML não existe pacote, e `aluno/index.html` é um caminho como outro
 *   qualquer. Tratar os dois igual foi um bug real desta ferramenta: ela deixou
 *   passar dois links quebrados na home — justamente os que levam ao Portal do
 *   Aluno e à loja — porque estavam escritos sem `./`.
 */
function conferir(arquivo, caminho, linha, base = path.dirname(arquivo), ehImport = true) {
  const limpo = semQuery(caminho);
  if (!limpo || EXTERNO.test(limpo)) return;
  if (ehImport && !limpo.startsWith('.') && !limpo.startsWith('/')) return;
  conferidos += 1;
  // Caminho começando com `/` é absoluto a partir da RAIZ do site publicado,
  // não do disco — é assim que o navegador resolve, e é assim que os manifests
  // e alguns `href` estão escritos.
  const alvo = limpo.startsWith('/') ? path.join(RAIZ, limpo) : path.resolve(base, limpo);
  const existe = fs.existsSync(alvo)
    // Caminho de diretório (`/aluno/`) vale se houver `index.html` dentro.
    || (limpo.endsWith('/') && fs.existsSync(path.join(alvo, 'index.html')));
  if (!existe) quebrados.push({ onde: rel(arquivo), linha, caminho, resolvido: rel(alvo) });
}

/** Número da linha de um índice de caractere — só para o relatório ser clicável. */
const linhaDe = (txt, i) => txt.slice(0, i).split('\n').length;

for (const f of arquivos(RAIZ, ['.js', '.mjs', '.jsx'])) {
  const src = fs.readFileSync(f, 'utf8');
  // `from '…'`, `import('…')` e `import '…'` — as três formas usadas no projeto.
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"`]([^'"`]+)['"`]/g)) {
    conferir(f, m[1], linhaDe(src, m.index));
  }
}

for (const f of arquivos(RAIZ, ['.html'])) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    conferir(f, m[1], linhaDe(src, m.index), path.dirname(f), false);
  }
}

for (const f of arquivos(RAIZ, ['.webmanifest'])) {
  const src = fs.readFileSync(f, 'utf8');
  let json;
  try { json = JSON.parse(src); } catch { console.error(`! ${rel(f)}: JSON inválido`); process.exitCode = 1; continue; }
  // `start_url`/`scope` são absolutos do site; os ícones podem ser relativos ao manifest.
  for (const chave of ['start_url', 'scope']) {
    if (typeof json[chave] === 'string') conferir(f, json[chave], linhaDe(src, src.indexOf(chave)));
  }
  for (const icone of json.icons || []) {
    if (icone && typeof icone.src === 'string') conferir(f, icone.src, linhaDe(src, src.indexOf(icone.src)));
  }
}

if (quebrados.length) {
  console.error(`\n✗ ${quebrados.length} caminho(s) quebrado(s):\n`);
  for (const q of quebrados) console.error(`  ${q.onde}:${q.linha}  →  ${q.caminho}\n      não existe: ${q.resolvido}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ ${conferidos} caminhos conferidos, nenhum quebrado.`);
