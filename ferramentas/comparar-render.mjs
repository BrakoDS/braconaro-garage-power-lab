/**
 * PROVA DE RENDERIZAÇÃO — o site desenha exatamente o mesmo antes e depois.
 *
 * Os testes cobrem a regra pura e o verificador cobre a fiação. Falta a terceira
 * prova: que as TELAS não mudaram. Este script chama as funções de render de
 * verdade para um conjunto fixo de casos e compara com uma referência capturada
 * ANTES de qualquer movimentação de pasta.
 *
 *     node ferramentas/comparar-render.mjs --gravar   grava a referência
 *     node ferramentas/comparar-render.mjs            compara e falha na 1ª diferença
 *
 * Os casos cobrem de propósito os formatos de treino ANTIGOS (dia livre sem
 * `tipo`/`grupo`, híbrido no formato legado): são os que já existem salvos no
 * histórico do coach e no Portal, e é onde uma quebra machucaria de verdade.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCIA = path.join(RAIZ, 'ferramentas', 'render-referencia.json');
const gravar = process.argv.includes('--gravar');

/* Stubs mínimos: os módulos de UI leem `document`/`localStorage` no carregamento
   (o `garantirSeed()` de academia/db.js é quem exige), mas NENHUMA função que
   este script chama toca o DOM. Congelar o relógio evita que uma data no HTML
   faça a comparação falhar por motivo nenhum. */
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {}, contains: () => false }, appendChild() {}, addEventListener() {} }),
  body: { style: {} },
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

/** Caminhos dos módulos — a ÚNICA parte deste arquivo que muda quando as pastas mudam. */
const MODULOS = {
  treinoDia: '../aluno/treino-dia.js',
  render: '../montador/ui/render.js',
  livre: '../montador/core/livre.js',
  hibrido: '../montador/core/hibrido.js',
  pesquisaModal: '../montador/ui/pesquisa-modal.js',
  exercicios: '../montador/data/exercicios.js',
};

const imp = async (chave) => import(new URL(MODULOS[chave], import.meta.url).href);

const { renderTreinoDia } = await imp('treinoDia');
const { renderDiaSalvo } = await imp('render');
const { montarLivre } = await imp('livre');
const { gerarHibrido, volumeHibrido } = await imp('hibrido');
const { formularioExercicioHTML, formularioTecnicaHTML } = await imp('pesquisaModal');
const { EXERCICIOS } = await imp('exercicios');

const porId = (id) => EXERCICIOS.find((e) => e.id === id) || null;
const ID = EXERCICIOS.slice(0, 8).map((e) => e.id);
const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

/* ---------- os dias de teste ---------- */

const diaPlano = {
  dia: 'seg', modalidade: 'hipertrofia', aquecimento: [{ nome: 'Mobilidade', duracaoSeg: 60 }],
  exercicios: [{
    nome: 'Supino', padrao: 'empurrar', reps: '10', descansoSeg: 60,
    niveis: { iniciante: { series: 3, carga: 'leve' }, intermediario: { series: 4, carga: 'média' }, avancado: { series: 5, carga: 'pesada' } },
    tecnica: null,
  }],
  finalizador: null,
};

const { vol, extra } = montarLivre({
  blocos: [
    { tipo: 'series', nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true,
      exercicios: [{ id: ID[0] }, { id: ID[1], linkado: true }, { id: ID[2] }] },
    { tipo: 'wod', nome: 'WOD', formato: 'EMOM', duracaoMin: 16,
      exercicios: [{ id: ID[3], prescricao: '12 reps' }, { id: ID[4], prescricao: '200m' }] },
  ],
  porId,
});
const diaLivre = { dia: 'ter', modalidade: 'hipertrofia', manual: true, volPorPadrao: vol.porPadrao, nAlunos: 8, ...extra };

/** Dia livre SALVO ANTES desta feature: sem `tipo`, sem `grupo`. É o que já existe. */
const diaLivreAntigo = {
  dia: 'qua', modalidade: 'forca', manual: true, volPorPadrao: {}, nAlunos: 8,
  aquecimento: [], tempos: { aquecimentoSeg: 0, principalSeg: 600, totalSeg: 900 },
  livre: { blocos: [{ nome: 'Bloco 1', porNivel: true, exercicios: [{
    nome: 'Agachamento', padrao: 'quadriceps', reps: '8', descansoSeg: 90, seriesRef: 4,
    niveis: { iniciante: { series: 3, carga: 'leve' }, intermediario: { series: 4, carga: 'média' }, avancado: { series: 5, carga: 'pesada' } },
    tecnica: null,
  }] }] },
};

const hib = gerarHibrido({ dia: 'qui', semana: 2, nivel: 'intermediario', nAlunos: 8, seed: 42 });
const diaHibrido = { dia: 'qui', modalidade: 'hibrido', hibrido: hib, volPorPadrao: volumeHibrido(hib.hipertrofia, hib.wod).porPadrao };

const propostaEx = {
  tipo: 'exercicio', nome: 'Muscle up', padrao: 'puxar', musculos: ['Costas'], tags: ['CROSS'],
  equipamentoIds: [], nivel: 'avancado', tempoMedioSeg: 40, multiarticular: true,
  obs: 'Puxada explosiva na argola.', equipamentoFaltante: ['Argolas'], fontes: ['https://exemplo.com'],
};
const propostaTec = { tipo: 'tecnica', nome: 'Rest-pause', resumo: 'Pausa curta.', comoExecutar: '1. Vá à falha.', objetivo: 'Hipertrofia.', fontes: [] };

/* ---------- coleta ---------- */

const saida = {};
const guardar = (chave, fn) => { try { saida[chave] = fn(); } catch (e) { saida[chave] = `ERRO: ${e.message}`; } };

for (const n of NIVEIS) {
  guardar(`aluno.plano.${n}`, () => renderTreinoDia(diaPlano, n));
  guardar(`aluno.livre.${n}`, () => renderTreinoDia(diaLivre, n));
  guardar(`aluno.livreAntigo.${n}`, () => renderTreinoDia(diaLivreAntigo, n));
  guardar(`aluno.hibrido.${n}`, () => renderTreinoDia(diaHibrido, n));
}
guardar('coach.plano', () => renderDiaSalvo(diaPlano, false));
guardar('coach.livre', () => renderDiaSalvo(diaLivre, false));
guardar('coach.livreAntigo', () => renderDiaSalvo(diaLivreAntigo, false));
guardar('coach.hibrido', () => renderDiaSalvo(diaHibrido, false));
guardar('pesquisa.exercicio', () => formularioExercicioHTML({ proposta: propostaEx, equipamentos: [{ id: 'barra', nome: 'Barra' }], restantes: 59, buscou: false }));
guardar('pesquisa.tecnica', () => formularioTecnicaHTML({ proposta: propostaTec, restantes: 59, buscou: true }));
guardar('numeros.livre', () => JSON.stringify({ vol: vol.porPadrao, total: vol.totalSeries, tempos: extra.tempos }));
guardar('numeros.hibrido', () => JSON.stringify({ duracaoSeg: hib.duracaoSeg, wod: hib.wod.duracaoMin, postos: hib.hipertrofia.length }));
guardar('catalogo', () => `${EXERCICIOS.length} exercicios`);

/* ---------- gravar ou comparar ---------- */

if (gravar) {
  fs.writeFileSync(REFERENCIA, JSON.stringify(saida, null, 2), 'utf8');
  console.log(`✓ referência gravada: ${Object.keys(saida).length} casos em ferramentas/render-referencia.json`);
  const erros = Object.entries(saida).filter(([, v]) => String(v).startsWith('ERRO:'));
  if (erros.length) { console.error(`! ${erros.length} caso(s) deram erro AO GRAVAR — a referência está capturando o erro, não o render:`); for (const [k, v] of erros) console.error(`  ${k}: ${v}`); process.exit(1); }
  process.exit(0);
}

if (!fs.existsSync(REFERENCIA)) { console.error('✗ referência não existe. Rode com --gravar ANTES de mover qualquer coisa.'); process.exit(1); }
const ref = JSON.parse(fs.readFileSync(REFERENCIA, 'utf8'));

const chaves = [...new Set([...Object.keys(ref), ...Object.keys(saida)])].sort();
const difs = [];
for (const k of chaves) {
  if (ref[k] === saida[k]) continue;
  if (!(k in ref)) { difs.push(`${k}: caso NOVO, não está na referência`); continue; }
  if (!(k in saida)) { difs.push(`${k}: SUMIU — a referência tem, o render de agora não`); continue; }
  const a = String(ref[k]); const b = String(saida[k]);
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  difs.push(`${k}: diverge no caractere ${i}\n     antes: …${a.slice(Math.max(0, i - 60), i + 60)}…\n     agora: …${b.slice(Math.max(0, i - 60), i + 60)}…`);
}

if (difs.length) { console.error(`\n✗ ${difs.length} caso(s) mudaram de renderização:\n`); for (const d of difs) console.error(`  ${d}\n`); process.exit(1); }
console.log(`✓ ${chaves.length} casos renderizam idêntico à referência.`);
