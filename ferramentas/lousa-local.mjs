/**
 * O MONTADOR HÍBRIDO RODANDO NA SUA MÁQUINA, SEM NUVEM E SEM GASTAR OPENAI.
 *
 *     node ferramentas/lousa-local.mjs
 *     # abre http://127.0.0.1:8765/__local/
 *
 * POR QUE ISTO EXISTE: as quatro telas da ferramenta dependem de Cloud
 * Functions que só existem depois de `firebase deploy`, e a leitura da lousa
 * gasta uma chamada paga à OpenAI a cada clique. Sem este arquivo, a única
 * forma de ver a ferramenta funcionando é publicar tudo e pagar por cada teste
 * — o que faz ninguém testar, que é como se descobre um bug de layout em
 * produção.
 *
 * Aqui o servidor devolve o site normal, mas com um `importmap` que troca
 * `cloud/chamadas.js`, o login do Firebase e a lista de alunos por DUBLÊS com
 * dados de exemplo. A ferramenta roda inteira: desenhar no quadro, reconhecer,
 * a prévia comparativa, os alertas com troca em um clique, a prévia por aluno e
 * o dashboard com os três gráficos. Nada sai da máquina.
 *
 * O QUE ISTO **NÃO** TESTA, e por isso não substitui um teste de verdade:
 * a leitura da lousa pela IA (o dublê devolve um treino fixo), as regras do
 * Firestore, e a gravação em lote. Isso só o deploy responde — ver o README da
 * ferramenta.
 *
 * A página do harness é GERADA a partir do `index.html` de verdade, em memória,
 * a cada requisição. É de propósito: uma cópia do HTML aqui dentro divergiria da
 * tela real no primeiro ajuste, e o harness passaria a testar uma ferramenta que
 * não existe mais.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORTA) || 8765;
const APP = '/coach/montador-hibrido';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------------ *
 * Os dublês
 * ------------------------------------------------------------------ */

const TREINO_EXEMPLO = {
  sistema: 'Hipertrofia',
  titulo: 'Full Body A — segunda pesada',
  blocos: [
    { id: 'A', nome: 'Mobilidade', exercicios: [
      { nome: 'Mobilidade de Quadril', bloco: 'A', series: 1, reps: '40s', implemento: '', grupamentos: [], observacao: '' },
      { nome: 'Gato-Camelo', bloco: 'A', series: 1, reps: '30s', implemento: 'Colchonete', grupamentos: ['Core/Abdômen'], observacao: '' },
    ] },
    { id: 'B', nome: 'Aquecimento', exercicios: [
      { nome: 'Airbike', bloco: 'B', series: 1, reps: '3min', implemento: 'Airbike', grupamentos: ['Quadríceps'], observacao: 'ritmo leve' },
    ] },
    { id: 'C', nome: 'Força', exercicios: [
      { nome: 'Agachamento Livre', bloco: 'C', series: 4, reps: '8-12', implemento: 'Barra', grupamentos: ['Quadríceps', 'Glúteo'], observacao: 'RIR 2 · 90s de descanso' },
      { nome: 'Supino Reto', bloco: 'C', series: 4, reps: '10', implemento: 'Barra', grupamentos: ['Peito', 'Tríceps'], observacao: 'RIR 1' },
      { nome: 'Puxada Alta Pegada Aberta', bloco: 'C', series: 3, reps: '12', implemento: 'Cabo', grupamentos: ['Costas', 'Bíceps'], observacao: '' },
    ] },
    { id: 'D', nome: 'Metcon', exercicios: [
      { nome: 'Swing de Kettlebell', bloco: 'D', series: 3, reps: '20', implemento: 'Kettlebell', grupamentos: ['Glúteo', 'Posterior de coxa'], observacao: 'máximo no tempo' },
      { nome: 'Burpee', bloco: 'D', series: 3, reps: 'AMRAP 8min', implemento: 'Peso corporal', grupamentos: ['Peito'], observacao: 'sem pausa' },
    ] },
  ],
  estimativaSeries: 20,
  // As duas trocas que as regras globais do box fazem — é aqui que dá para
  // conferir se a prévia mostra o que foi substituído e por quê.
  substituicoes: [
    { de: 'Pull-ups', para: 'Puxada Alta Pegada Aberta', regra: 'Pull-up ➔ Puxada Alta Pegada Aberta (regra global do box)' },
    { de: 'Corrida 800m', para: 'Airbike', regra: 'Corrida ➔ Airbike (regra global do box)' },
  ],
  avisos: ['O descanso do bloco D estava ilegível na lousa — confirme antes de salvar.'],
};

const DUBLE_CHAMADAS = `
// Dublê de cloud/chamadas.js — gerado por ferramentas/lousa-local.mjs. Nenhuma rede.
const TREINO = ${JSON.stringify(TREINO_EXEMPLO, null, 2)};

/** Atraso de propósito: é ele que mostra o botão desabilitado e o "Lendo a lousa…". */
const demora = (ms = 700) => new Promise((r) => setTimeout(r, ms));

export async function parseWorkoutLousa({ textInput, canvasImageBase64 }) {
  await demora();
  if (!textInput && !canvasImageBase64) throw new Error('A lousa está vazia — escreva o treino ou desenhe no quadro.');
  console.info('[local] parseWorkoutLousa', { caracteres: (textInput || '').length, temDesenho: !!canvasImageBase64 });
  return { treino: structuredClone(TREINO), restantes: 39 };
}

export async function checkWorkoutVariability() {
  await demora();
  return {
    alertas: [
      { tipo: 'duplicacao', severidade: 'alta', alvo: 'Agachamento Livre',
        titulo: 'Agachamento Livre repetido em menos de 72h',
        detalhe: 'Já entrou há 46h (Full Body B). O grupo não teve tempo de recuperar.',
        sugestoes: [
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Halter', de: 'Barra', para: 'Halter' },
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Cabo', de: 'Barra', para: 'Cabo' },
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Anilha', de: 'Barra', para: 'Anilha' },
          { acao: 'manter', rotulo: 'Manter a escolha do coach', de: 'Agachamento Livre', para: 'Agachamento Livre' },
        ] },
      { tipo: 'saturacao', severidade: 'media', alvo: 'Barra',
        titulo: 'Barra em 66% dos exercícios da semana',
        detalhe: '8 de 12 exercícios usam Barra. Acima de 60% vira fila de estação na aula e estímulo repetido.',
        sugestoes: [
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Halter', de: 'Barra', para: 'Halter' },
          { acao: 'manter', rotulo: 'Manter a escolha do coach', de: 'Barra', para: 'Barra' },
        ] },
      { tipo: 'redundancia', severidade: 'media', alvo: 'Quadríceps',
        titulo: 'Quadríceps concentra 48% das séries da semana',
        detalhe: '19 de 40 séries caem em Quadríceps. O resto do corpo está ficando para trás no ciclo.',
        sugestoes: [
          { acao: 'trocar-exercicio', rotulo: 'Trocar um exercício de Quadríceps por outro padrão', de: 'Quadríceps', para: '' },
          { acao: 'manter', rotulo: 'Manter — é foco proposital do ciclo', de: 'Quadríceps', para: 'Quadríceps' },
        ] },
    ],
    resumo: { treinosNaJanela: 4, exerciciosNaJanela: 24, seriesNaJanela: 71,
      usoPorImplemento: { Barra: 8, Halter: 5, Kettlebell: 3 } },
  };
}

/**
 * Três alunos com três situações diferentes de propósito: a Ana tem lesão COM
 * substituto (troca), o João tem lesão SEM substituto (sai da ficha, com aviso)
 * e não tem e-mail (não chega ao Portal), e a Bia não tem 1RM (carga sem kg).
 */
export async function distributeWorkoutToStudents({ studentIds, dryRun }) {
  await demora();
  const PERFIS = {
    a1: { nome: 'Ana Prado', email: 'ana@exemplo.com', nivel: 'iniciante', caso: 'lesao-com-substituto' },
    a2: { nome: 'João Vieira', email: '', nivel: 'intermediario', caso: 'lesao-sem-substituto' },
    a3: { nome: 'Bia Toledo', email: 'bia@exemplo.com', nivel: 'avancado', caso: 'sem-1rm' },
  };
  const fichas = studentIds.map((id) => {
    const p = PERFIS[id] || { nome: id, email: '', nivel: 'intermediario', caso: 'normal' };
    const linhas = [
      { bloco: 'C', blocoNome: 'Força',
        nome: p.caso === 'lesao-com-substituto' ? 'Leg Press' : 'Agachamento Livre',
        series: 4, reps: '8-12', implemento: 'Barra', observacao: 'RIR 2',
        cargaKg: p.caso === 'sem-1rm' ? null : 62.5,
        percentual: p.caso === 'sem-1rm' ? null : 0.63,
        motivos: [
          ...(p.caso === 'lesao-com-substituto' ? ['Troca por restrição (joelho direito): Agachamento Livre ➔ Leg Press'] : []),
          ...(p.caso === 'sem-1rm' ? [] : ['Carga por 1RM: 63% de 100kg = 62.5kg']),
        ] },
      { bloco: 'C', blocoNome: 'Força', nome: 'Supino Reto', series: 4, reps: '10',
        implemento: 'Barra', observacao: 'RIR 1', cargaKg: null, percentual: null, motivos: [] },
    ];
    const removidos = p.caso === 'lesao-sem-substituto'
      ? [{ nome: 'Burpee', motivo: 'Restrição (lombar) sem substituto cadastrado na matriz' }] : [];
    return {
      alunoId: id, nome: p.nome, email: p.email, nivel: p.nivel, linhas, removidos,
      avisos: [
        ...(removidos.length ? ['1 exercício(s) fora da ficha por restrição sem substituto — cadastre a troca na matriz do aluno.'] : []),
        ...(p.caso === 'sem-1rm' ? ['Sem 1RM registrado: as cargas saem como orientação da lousa, sem número em kg.'] : []),
      ],
    };
  });
  console.info('[local] distributeWorkoutToStudents', { dryRun, alunos: fichas.length });
  return { fichas, gravadas: dryRun ? 0 : fichas.length, semMatriz: [], dryRun: !!dryRun };
}

export async function salvarLousa(_uid, dados) {
  await demora(200);
  console.info('[local] salvarLousa (nada foi gravado)', dados.dateId);
  return 'treino-local-1';
}
/**
 * Um mês de treinos para o Calendário ter o que desenhar.
 *
 * Espalhados de propósito em segunda, quarta e sexta, com duas aulas num mesmo
 * dia (manhã e noite) e sistemas diferentes — é o que faz aparecer na tela o
 * chip duplo, as quatro cores da legenda e a diferença entre o treino passado
 * (cadeado) e o de hoje/futuro (clicável).
 *
 * NOTA DE ESCAPE: este código vive dentro de um template literal do servidor,
 * então toda interpolação leva barra invertida (\${...}) e todo \\n precisa de
 * DUAS — uma para o template, outra para o dublê. Sem isso o Node resolve a
 * variável cedo demais, ou a quebra de linha vira quebra de verdade e parte a
 * string ao meio. Quem pega isso é a validação de sintaxe do arquivo SERVIDO,
 * não a do servidor: o servidor está sempre válido, o que quebra é o que ele
 * gera.
 */
export async function listarLousas(_uid, inicio, fim) {
  await demora(250);
  const SISTEMAS = ['Hipertrofia', 'HIIT', 'GAP', 'Hyrox'];
  const iso = (d) => d.toISOString().slice(0, 10);
  const out = [];
  // Varre a faixa que a tela pediu e põe treino nas segundas, quartas e sextas.
  for (let d = new Date(inicio + 'T12:00:00Z'); iso(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (![1, 3, 5].includes(dow)) continue;
    const dateId = iso(d);
    const sistema = SISTEMAS[(d.getUTCDate() + dow) % SISTEMAS.length];
    const treino = structuredClone(TREINO);
    treino.sistema = sistema;
    treino.titulo = sistema + ' · ' + dateId.slice(8) + '/' + dateId.slice(5, 7);
    out.push({
      workoutId: 'w-' + dateId + '-a', dateId, classTime: '07:00', treino,
      textoOriginal: 'A — Mobilidade\\n  Mobilidade de quadril · 40s\\n\\nC — Força\\n  Agachamento livre · 4x8-12 · RIR 2',
      geradoEm: dateId + 'T10:00:00.000Z',
    });
    // Sexta tem a segunda turma, à noite — é o caso que um mapa de um treino por
    // dia esconderia.
    if (dow === 5) {
      const noite = structuredClone(TREINO);
      noite.sistema = 'HIIT';
      noite.titulo = 'HIIT · turma da noite';
      out.push({ workoutId: 'w-' + dateId + '-b', dateId, classTime: '20:00', treino: noite,
        textoOriginal: '', geradoEm: dateId + 'T22:00:00.000Z' });
    }
  }
  console.info('[local] listarLousas', { inicio, fim, treinos: out.length });
  return out;
}

export async function lerConsolidado(_uid, chave) {
  await demora(150);
  const ehMes = !chave.includes('W');
  const f = ehMes ? 4 : 1;
  // Variação por semana para a linha do mês não sair reta.
  const jitter = ehMes ? 1 : (1 + (Number(chave.slice(-2)) % 3) * 0.18);
  const n = (v) => Math.round(v * f * jitter);
  return {
    chave, periodo: ehMes ? 'mes' : 'semana',
    inicio: '2026-09-14', fim: ehMes ? '2026-09-30' : '2026-09-20',
    treinos: n(4), totalSeries: n(42),
    porGrupo: { peito: n(8), costas: n(11), ombro: n(4), braco: n(6), perna: n(16), gluteo: n(9), core: n(5) },
    metas: { peito: 10 * f, costas: 10 * f, ombro: 10 * f, braco: 10 * f, perna: 10 * f, gluteo: 10 * f, core: 10 * f },
    porImplemento: { Barra: n(14), Halter: n(9), Kettlebell: n(6), Cabo: n(5), Airbike: n(3), Colchonete: n(2), Anilha: n(1), TRX: n(1) },
    percentualImplemento: {}, porSistema: { Hipertrofia: n(2), HIIT: n(1), Hyrox: n(1) },
    atualizadoEm: new Date().toISOString(),
  };
}
export async function lerMatriz() { return null; }
export async function salvarMatriz() {}
`;

const DUBLE_CLOUD = `
// Dublê do login do Firebase — gerado por ferramentas/lousa-local.mjs.
export function usuario() { return { uid: 'coach-local', email: 'coach@local' }; }
export function cloudAtivo() { return true; }
export async function sessaoAtual() { return usuario(); }
export async function login() { return usuario(); }
export async function criarConta() { return usuario(); }
export async function resetarSenha() {}
export async function carregarParaStore() { return true; }
export function conectarStore() {}
export async function iniciar() {}
export async function sair() {}
`;

const DUBLE_GESTAO = `
// Dublê da Gestão de Alunos — gerado por ferramentas/lousa-local.mjs.
// Os ids a1/a2/a3 são os que o dublê da distribuição conhece; os outros caem no
// caso "normal", que serve para ver a turma com mais de três selecionados.
export function listar() {
  return [
    { id: 'a1', nome: 'Ana Prado', nivel: 'iniciante', status: 'ativo' },
    { id: 'a2', nome: 'João Vieira', nivel: 'intermediario', status: 'ativo' },
    { id: 'a3', nome: 'Bia Toledo', nivel: 'avancado', status: 'ativo' },
    { id: 'a4', nome: 'Carlos Menezes', nivel: 'intermediario', status: 'ativo' },
    { id: 'a5', nome: 'Duda Ferraz', nivel: 'iniciante', status: 'ativo' },
    { id: 'a6', nome: 'Eduardo Lima', nivel: 'avancado', status: 'ativo' },
    { id: 'a7', nome: 'Fernanda Rocha', nivel: 'intermediario', status: 'ativo' },
    { id: 'a8', nome: 'Gabriel Souza', nivel: 'intermediario', status: 'ativo' },
    { id: 'a9', nome: 'Helena Dias', nivel: 'iniciante', status: 'inativo' },
  ];
}
export async function iniciarSync() {}
export function atualizar() {}
export function aoGravar() {}
`;

/** O index.html de verdade, com os dublês no lugar da rede e sem o login. */
function gerarHarness() {
  const html = fs.readFileSync(path.join(RAIZ, 'coach/montador-hibrido/index.html'), 'utf8');
  const importmap = `  <script type="importmap">
  {
    "imports": {
      "${APP}/cloud/chamadas.js": "/__local/duble-chamadas.js",
      "/compartilhado/firebase/cloud.js": "/__local/duble-cloud.js",
      "/coach/gestao-de-alunos/db.js": "/__local/duble-gestao.js"
    }
  }
  </script>
`;
  return html
    .replace('<link rel="stylesheet" href="./app.css?v=1" />', `${importmap}  <link rel="stylesheet" href="${APP}/app.css" />`)
    .replace('<link rel="manifest" href="./manifest.webmanifest" />', '')
    // Entra direto: o gate depende do Firebase Auth de verdade, que não existe aqui.
    .replace('<script type="module" src="./ui/gate.js?v=1"></script>', `<div style="position:fixed;bottom:10px;right:12px;z-index:99;background:#FFC700;color:#1a1300;
      font:600 11px system-ui;padding:5px 10px;border-radius:999px">MODO LOCAL · sem nuvem, sem OpenAI</div>
    <script type="module">
      document.getElementById('gate').style.display = 'none';
      document.querySelector('main').removeAttribute('hidden');
      document.querySelector('.topbar').removeAttribute('hidden');
      await import('${APP}/ui/app.js');
      window.__pronto = true;
    </script>`);
}

/**
 * A GESTÃO DE ALUNOS em modo local — para testar a aba "Matriz".
 *
 * Aqui basta UM dublê: `config.js` com `CLOUD_ATIVO = false`. Com ele desligado,
 * o app inteiro cai sozinho no caminho local que ele já tem — a porta usa a
 * senha simples, `portal-sync` desiste na primeira linha, `db.iniciarSync` não
 * conecta, e todo o resto (o `db.js` de verdade, o localStorage, o formulário)
 * roda exatamente como em produção. Dublar três módulos daria o mesmo resultado
 * testando menos código real.
 */
const DUBLE_CONFIG = `
// Dublê de config.js — gerado por ferramentas/lousa-local.mjs.
export const CLOUD_ATIVO = false;
export const firebaseConfig = {};
`;

/** Alunos de exemplo, semeados no localStorage antes do app subir. */
const ALUNOS_EXEMPLO = [
  { id: '001', nome: 'Ana Prado', email: 'ana@exemplo.com', nivel: 'iniciante', objetivo: 'Hipertrofia',
    status: 'ativo', freqVezes: '3', foco: ['perna'], criadoEm: 1757000000000,
    matrizIndividualizacao: {
      versao: 1,
      perfil: { fase: 'forca' },
      cargas: {
        referencia: {
          agachamento: { kg: 90, reps: 5, rm: null, medidoEm: '2026-09-01' },
          supino: { kg: null, reps: null, rm: 70, medidoEm: '2026-08-20' },
          terra: { kg: null, reps: null, rm: null, medidoEm: '' },
        },
        rir: '2-3',
        airbike: { rpm: 60, calPorMin: 12, obs: '' },
      },
      adaptacoes: {
        lesoes: [{ regiao: 'joelho', gravidade: 'moderada', desde: '2026-08-01', obs: 'menisco' }],
        impacto: 'converter_airbike', tracao: 'puxada_alta', mobilidade: ['tornozelo'],
        obs: 'evitar carga axial alta',
      },
      historico: { semanaId: '', correcoes: {}, atualizadoEm: 0 },
      atualizadoEm: 1757000000000,
    } },
  { id: '002', nome: 'João Vieira', email: '', nivel: 'intermediario', objetivo: 'Condicionamento',
    status: 'ativo', freqVezes: '4', foco: [], criadoEm: 1757100000000 },
];

/** O index.html da Gestão, sem nuvem e já liberado. */
function gerarHarnessGestao() {
  const html = fs.readFileSync(path.join(RAIZ, 'coach/gestao-de-alunos/index.html'), 'utf8');
  const importmap = `  <script type="importmap">
  { "imports": { "/compartilhado/firebase/config.js": "/__local/duble-config.js" } }
  </script>
`;
  // Script CLÁSSICO, e não módulo: precisa rodar ANTES de `app.js`, e todo
  // módulo é adiado até o documento estar pronto — a semente chegaria depois de
  // o `db.js` já ter lido um localStorage vazio.
  const semente = `  <script>
    try {
      sessionStorage.setItem('braconaro_montador_auth', '1');
      if (!localStorage.getItem('braconaro_gestao_alunos_v1')) {
        localStorage.setItem('braconaro_gestao_alunos_v1', ${JSON.stringify(JSON.stringify({ seq: 2, alunos: ALUNOS_EXEMPLO }))});
      }
    } catch (e) { console.warn('semente local falhou', e); }
  </script>
`;
  return html
    .replace(/<link rel="stylesheet" href="\.\/([^"]+)" \/>/g, '<link rel="stylesheet" href="/coach/gestao-de-alunos/$1" />')
    .replace('<link rel="manifest"', importmap + semente + '  <link rel="manifest"')
    .replace(/<script type="module" src="\.\/app\.js[^"]*"><\/script>/,
      `<div style="position:fixed;bottom:10px;right:12px;z-index:99;background:#f5c518;color:#0a0a0b;
        font:600 11px system-ui;padding:5px 10px;border-radius:999px">MODO LOCAL · sem nuvem</div>
      <script type="module" src="/coach/gestao-de-alunos/app.js"></script>`);
}

const GERADOS = {
  '/__local/': () => ({ corpo: gerarHarness(), tipo: TIPOS['.html'] }),
  '/__local/gestao/': () => ({ corpo: gerarHarnessGestao(), tipo: TIPOS['.html'] }),
  '/__local/duble-config.js': () => ({ corpo: DUBLE_CONFIG, tipo: TIPOS['.js'] }),
  '/__local/duble-chamadas.js': () => ({ corpo: DUBLE_CHAMADAS, tipo: TIPOS['.js'] }),
  '/__local/duble-cloud.js': () => ({ corpo: DUBLE_CLOUD, tipo: TIPOS['.js'] }),
  '/__local/duble-gestao.js': () => ({ corpo: DUBLE_GESTAO, tipo: TIPOS['.js'] }),
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rota = url.pathname === '/__local' ? '/__local/' : url.pathname;
  if (rota === '/__local/gestao') rota = '/__local/gestao/';

  if (GERADOS[rota]) {
    const { corpo, tipo } = GERADOS[rota]();
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(corpo);
    return;
  }
  if (rota === '/') {
    res.writeHead(302, { Location: '/__local/' });
    res.end();
    return;
  }

  // Estático a partir da raiz do repositório. `path.resolve` + a checagem de
  // prefixo barram `../../etc/passwd` — é servidor de desenvolvimento, mas um
  // que serve o disco inteiro por descuido não é aceitável nem aqui.
  const alvo = path.resolve(RAIZ, '.' + decodeURIComponent(rota));
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end('Fora da raiz'); return; }
  fs.readFile(alvo, (erro, dados) => {
    if (erro) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Não encontrado: ' + rota); return; }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(dados);
  });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  Montador Híbrido em MODO LOCAL — sem nuvem, sem OpenAI\n`);
  console.log(`      Lousa do Coach   http://127.0.0.1:${PORTA}/__local/   (abas Lousa e Calendário)`);
  console.log(`      Gestão de Alunos http://127.0.0.1:${PORTA}/__local/gestao/   (aba "Matriz")\n`);
  console.log(`  Ctrl+C para parar.\n`);
});
