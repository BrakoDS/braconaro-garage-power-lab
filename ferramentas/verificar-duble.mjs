// @ts-check
/**
 * O DUBLÊ SERVIDO COMPILA?
 *
 *     node ferramentas/verificar-duble.mjs
 *
 * POR QUE ISTO EXISTE: os dublês de `lousa-local.mjs` vivem dentro de template
 * literals. Uma crase, um `${` ou um `\n` escrito com uma barra a menos quebram
 * o ARQUIVO GERADO — e o servidor continua perfeitamente válido, porque o erro
 * só existe depois da interpolação. Aconteceu três vezes na mesma semana, e as
 * três só apareceram quando o navegador já estava aberto, numa tela em branco.
 *
 * Aqui o arquivo é gerado e passado pelo parser do próprio Node, sem subir
 * servidor nem abrir navegador: um segundo, e a armadilha fica de fora.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = path.join(RAIZ, 'ferramentas', 'lousa-local.mjs');

/** Os nomes das constantes de dublê, extraídos do próprio arquivo. */
const nomes = [...readFileSync(FONTE, "utf8").matchAll(/^export const (DUBLE_\w+) = `/gm)].map((m) => m[1]);
if (!nomes.length) {
  console.error('✗ Nenhuma constante DUBLE_* encontrada — o formato do arquivo mudou?');
  process.exit(1);
}

const mod = await import(`file://${FONTE}?verificar=1`);
let falhas = 0;
for (const nome of nomes) {
  const codigo = mod[nome];
  if (typeof codigo !== 'string') {
    console.log(`  ⚠ ${nome} não é exportado — não dá para verificar daqui.`);
    continue;
  }
  try {
    // `import()` de um data: URL, e não `vm.Script`: os dublês são MÓDULOS (têm
    // `export`), que `vm.Script` recusa. E importar é uma checagem mais forte
    // que compilar — pega também o que só quebra ao executar o topo do módulo.
    await import(`data:text/javascript;base64,${Buffer.from(codigo, 'utf8').toString('base64')}`);
    console.log(`  ✓ ${nome} (${codigo.length} caracteres) compila e carrega`);
  } catch (e) {
    falhas++;
    console.log(`  ✗ ${nome}: ${/** @type {Error} */ (e).message}`);
  }
}
console.log(falhas ? `\n✗ ${falhas} dublê(s) quebrado(s).\n` : '\n✓ Todos os dublês compilam.\n');
process.exitCode = falhas ? 1 : 0;
