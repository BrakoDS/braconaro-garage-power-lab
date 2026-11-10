// Copia para dentro das Cloud Functions os arquivos de regra da Gestão que o
// servidor executa ao aplicar as caixas (Fase 1 · etapa 1) — os MESMOS
// arquivos que a Gestão roda no navegador, e não um porte.
//
// Por quê: o servidor passou a aplicar na ficha o Pix aprovado, os check-ins da
// uGym e da Lousa, o "Não irei" e a reposição. A regra de cada um já mora na
// Gestão (pix-baixa.js, ugym-merge.js, ausencias-merge.js, e o que eles
// importam). Portar para TypeScript criaria uma segunda versão para divergir;
// copiar na compilação faz o servidor rodar exatamente o código da Gestão.
//
// O deploy das functions sobe só a pasta functions/, então a cópia vai para
// lib/gestao/ (saída da compilação, fora do git), no mesmo caminho relativo de
// origem — os imports entre os arquivos continuam valendo, com o `?v=N` e tudo
// (o Node resolve). Um package.json com "type": "module" faz o Node ler como ESM.
//
// Só os imports RELATIVOS são seguidos: os `import()` do Firebase via CDN ficam
// dentro de funções que o servidor nunca chama (as que falam com o banco do
// navegador).
//
// Uso: node scripts/copiar-regras-gestao.mjs   (o `npm run build` já chama)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FUNCTIONS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = resolve(FUNCTIONS, '..');
const DESTINO = join(FUNCTIONS, 'lib', 'gestao');

/** Os arquivos que o servidor importa (functions/src/caixas.ts). O resto vem pelos imports deles. */
export const ENTRADAS = [
  'coach/gestao-de-alunos/ausencias-merge.js',
  'coach/gestao-de-alunos/ugym-merge.js',
  'coach/gestao-de-alunos/pix-baixa.js',
  'coach/gestao-de-alunos/portal-merge.js',
  'coach/gestao-de-alunos/eventos.js',
  'coach/gestao-de-alunos/ficha-campos.js',
  'coach/gestao-de-alunos/chamada-faltas.js',
  'coach/gestao-de-alunos/creditos-fechamento.js',
];

/** Os especificadores relativos de import/export estático de um arquivo (comentário não conta). */
export function importsRelativos(fonte) {
  const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const achados = [];
  for (const m of semComentario.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) achados.push(m[1]);
  for (const m of semComentario.matchAll(/^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) achados.push(m[1]);
  return achados;
}

/** O fecho dos imports: todos os arquivos (caminho relativo à raiz do repositório) a copiar. */
export function fecho(entradas = ENTRADAS) {
  const vistos = new Set();
  const pilha = [...entradas];
  while (pilha.length) {
    const rel = pilha.pop();
    if (vistos.has(rel)) continue;
    const abs = join(RAIZ, rel);
    if (!existsSync(abs)) throw new Error(`copiar-regras-gestao: ${rel} não existe (import quebrado?)`);
    vistos.add(rel);
    for (const esp of importsRelativos(readFileSync(abs, 'utf8'))) {
      const alvo = relative(RAIZ, resolve(dirname(abs), esp.split('?')[0])).split(sep).join('/');
      if (!vistos.has(alvo)) pilha.push(alvo);
    }
  }
  return [...vistos].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arquivos = fecho();
  rmSync(DESTINO, { recursive: true, force: true });
  for (const rel of arquivos) {
    const alvo = join(DESTINO, rel);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, readFileSync(join(RAIZ, rel)));
  }
  writeFileSync(join(DESTINO, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2) + '\n');
  console.log(`Regras da Gestão copiadas para lib/gestao/: ${arquivos.length} arquivos.`);
}
