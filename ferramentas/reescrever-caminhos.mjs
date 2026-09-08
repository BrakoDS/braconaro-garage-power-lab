/**
 * REESCRITOR DE CAMINHOS — conserta os imports depois de um `git mv`.
 *
 * Não adivinha `../`: para cada caminho relativo QUEBRADO, procura em disco um
 * arquivo com o mesmo nome-base e reescreve o caminho para ele. Se achar mais de
 * um candidato, PARA e pede desempate em vez de escolher sozinho — é onde um
 * script desses estraga tudo em silêncio.
 *
 *     node ferramentas/reescrever-caminhos.mjs --ver      só mostra o que faria
 *     node ferramentas/reescrever-caminhos.mjs --aplicar  reescreve
 *
 * Depois de aplicar, LEIA O DIFF. E rode `verificar-imports.mjs`, que é quem
 * diz se sobrou algo quebrado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IGNORAR = new Set(['node_modules', '.git', 'lib', 'docs', '.superpowers', '.agents', 'ferramentas']);
const aplicar = process.argv.includes('--aplicar');

function listar(dir, ext, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) listar(f, ext, acc);
    else if (ext.some((x) => e.name.endsWith(x))) acc.push(f);
  }
  return acc;
}

const rel = (f) => path.relative(RAIZ, f).split(path.sep).join('/');
const todos = listar(RAIZ, ['.js', '.mjs', '.jsx', '.html', '.webmanifest']);

/** nome-base → todos os arquivos com esse nome. É a base do desempate. */
const porNome = {};
for (const f of listar(RAIZ, ['.js', '.mjs', '.jsx', '.css', '.html', '.json', '.webmanifest', '.png', '.ico', '.jpg', '.webp', '.svg'])) {
  (porNome[path.basename(f)] ??= []).push(f);
}

/**
 * Arquivos que mudaram de NOME, não só de pasta. O casamento por nome-base não
 * consegue seguir uma renomeação — some o candidato e o script para. Este mapa
 * é a ponte, e é de propósito explícito: renomear arquivo é decisão, não
 * detalhe, e quem vier depois precisa ver a lista.
 */
const RENOMEADOS = {
  'cloud-config.js': 'compartilhado/firebase/config.js',
};

/**
 * Pastas que mudaram de lugar. Resolver por AQUI é melhor que por nome-base:
 * existem oito `index.html` e dois `db.js` no site, e escolher um deles pelo
 * nome seria exatamente o chute caro que este script se recusa a dar. Com o
 * mapa, `../alunos/index.html` vira um caminho único e verificável.
 */
const PASTAS = {
  'aluno/': 'painel-do-aluno/',
  'alunos/': 'coach/gestao-de-alunos/',
  'montador/': 'coach/montador-de-treino/',
  'academia/': 'coach/academia/',
  'loja-gestao/': 'coach/gestao-garage-store/',
  'loja/': 'garage-store/',
};

/** Aplica o mapa de pastas a um caminho relativo à RAIZ. Devolve o mesmo caminho se nada casar. */
function aplicarMapa(doRepo) {
  for (const [de, para] of Object.entries(PASTAS)) {
    if (doRepo === de.slice(0, -1)) return para.slice(0, -1);
    if (doRepo.startsWith(de)) return para + doRepo.slice(de.length);
  }
  return doRepo;
}

/**
 * Onde este arquivo MORAVA antes da mudança. É a peça que faltava: um caminho
 * relativo escrito num arquivo foi calculado a partir da pasta ANTIGA dele, e
 * resolvê-lo a partir da pasta nova dá um alvo que nunca existiu. Ex.: o
 * `../coach/index.html` do montador foi escrito quando ele estava em
 * `montador/` — resolver de `coach/montador-de-treino/` daria `coach/coach/`.
 */
function origem(doRepo) {
  for (const [de, para] of Object.entries(PASTAS)) {
    if (doRepo.startsWith(para)) return de + doRepo.slice(para.length);
  }
  return doRepo;
}

const semQuery = (p) => p.split('?')[0].split('#')[0];
const query = (p) => p.slice(semQuery(p).length);

let trocas = 0;
const ambiguos = [];
const semCandidato = [];

for (const arquivo of todos) {
  const src = fs.readFileSync(arquivo, 'utf8');
  let novo = src;

  /** Todos os caminhos citados neste arquivo, com o texto exato para substituir. */
  const citados = new Set();
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"`]([^'"`]+)['"`]/g)) citados.add(m[1]);
  // `href`/`src` só em HTML e manifest. Dentro de `.js` eles são fragmento de
  // HTML em template literal, e o caminho ali é relativo à PÁGINA que renderiza
  // o fragmento — não ao módulo. Reescrever pelo caminho do módulo daria um
  // endereço errado com cara de certo. Ver `--links-em-js` do verificador.
  if (!arquivo.endsWith('.js') && !arquivo.endsWith('.mjs') && !arquivo.endsWith('.jsx')) {
    for (const m of src.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) citados.add(m[1]);
  }

  /** Este arquivo, de volta ao lugar de onde os caminhos dele foram escritos. */
  const arquivoAntigo = origem(rel(arquivo));

  for (const citado of citados) {
    const limpo = semQuery(citado);
    if (!limpo.startsWith('.')) continue;                 // só relativo; absoluto e pacote ficam de fora
    const alvo = path.resolve(path.dirname(arquivo), limpo);
    if (fs.existsSync(alvo)) continue;                    // já aponta certo

    const base = path.basename(limpo);
    // 1º e melhor: resolve o caminho a partir da pasta ANTIGA deste arquivo e
    // aplica o mapa. É determinístico — nada de escolher entre oito index.html.
    const antesDoRepo = path.posix.normalize(path.posix.join(path.posix.dirname(arquivoAntigo), limpo));
    const depois = path.join(RAIZ, aplicarMapa(antesDoRepo));
    const candidatos = fs.existsSync(depois) ? [depois]
      : RENOMEADOS[base] ? [path.join(RAIZ, RENOMEADOS[base])]
      : (porNome[base] || []);
    if (candidatos.length === 0) { semCandidato.push(`${rel(arquivo)}  →  ${citado}`); continue; }
    if (candidatos.length > 1) {
      ambiguos.push(`${rel(arquivo)}  →  ${citado}\n      candidatos: ${candidatos.map(rel).join(' | ')}`);
      continue;
    }
    let destino = path.relative(path.dirname(arquivo), candidatos[0]).split(path.sep).join('/');
    if (!destino.startsWith('.')) destino = `./${destino}`;
    destino += query(citado);

    // Substitui só dentro de aspas, para não acertar a mesma string em prosa.
    const antes = novo;
    for (const asp of ['\'', '"', '`']) novo = novo.split(asp + citado + asp).join(asp + destino + asp);
    if (novo !== antes) { trocas += 1; console.log(`  ${rel(arquivo)}\n    ${citado}\n    → ${destino}`); }
  }

  if (novo !== src && aplicar) fs.writeFileSync(arquivo, novo, 'utf8');
}

if (semCandidato.length) { console.error(`\n! ${semCandidato.length} caminho(s) sem nenhum arquivo correspondente — resolva à mão:`); for (const s of semCandidato) console.error('  ' + s); }
if (ambiguos.length) { console.error(`\n! ${ambiguos.length} caminho(s) AMBÍGUOS — mais de um arquivo com esse nome. Não escolhi por você:`); for (const s of ambiguos) console.error('  ' + s); }

console.log(`\n${aplicar ? '✓ aplicadas' : '(simulação)'} ${trocas} troca(s).`);
if (ambiguos.length || semCandidato.length) process.exit(1);
