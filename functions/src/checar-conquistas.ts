/**
 * Confere o motor de conquistas sem rede e sem emulador.
 *
 *     npm run checar:conquistas
 *
 * Três garantias:
 *  1. PARIDADE: `gamificacao.ts` (cópia do app) dá o mesmo resultado que o
 *     original do site, `compartilhado/regras/gamificacao.js`, sobre os mesmos
 *     dados. É o que impede o servidor de conceder medalha que a tela do site
 *     não concederia (e vice-versa).
 *  2. XP: toda medalha tem valor em `XP_POR_MEDALHA`, e os valores batem com o
 *     `ACHIEVEMENTS_CATALOG` do Portal React (quando o repositório dele está ao lado).
 *  3. LÓGICA do motor: contexto, acúmulo de medalhas, soma de XP, fuso.
 *
 * Original do site ou Portal ausentes (clone parcial): avisa e pula aquela
 * parte, sem falhar — mesmo comportamento do `npm run paridade` do app.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as jogo from './gamificacao';
import {
  calcularConquistas, contextoDoAluno, desbloqueiosValidos, mudou, noFusoDoBox,
  DATA_DE_CORTE, FUSO_DO_BOX, INICIO_DO_MARCO_ZERO_MS, XP_POR_MEDALHA,
} from './conquistas';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}

// O `tsc` (module commonjs) troca `import()` por `require()`, que não carrega o
// ESM do site em todas as versões do Node. Assim o `import()` sobrevive intacto.
const importarEsm = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

/* ---------- datas de teste, relativas a hoje ---------- */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasAtras = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
/** Dia 1º de `n` meses atrás: sempre exatamente `n` meses de casa, sem o transbordo de "30 de fevereiro". */
const mesesAtrasMs = (n: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.getTime();
};

/** Um aluno "cheio": 5 semanas seguidas, um treino pesado e uma semana de 3000+ kcal. */
const presencas = [0, 1, 2, 7, 9, 14, 16, 21, 28].map(diasAtras);
const gastos: jogo.Gasto[] = [
  { data: diasAtras(0), calorias: 650 },
  { data: diasAtras(1), calorias: '1.050' },
  { data: diasAtras(2), calorias: 1200 },
  { data: diasAtras(3), calorias: 400 },
  { data: diasAtras(40), calorias: null },
];

const contextos: Array<[string, jogo.ContextoMedalhas]> = [
  ['aluno sem nada', {}],
  ['aluno no meio do caminho', {
    total: 12, mes: 10, semana: 3, streak: 4, nAvaliacoes: 1, desafios: 1, desAgua: 1, desAcucar: 0,
    meses: 3, calMaxTreino: 520, calMaxSemana: 2100, feedbacks: 1,
  }],
  ['aluno veterano', {
    total: 130, mes: 14, semana: 5, streak: 9, nAvaliacoes: 4, desafios: 6, desAgua: 2, desAcucar: 1,
    meses: 13, calMaxTreino: 1100, calMaxSemana: 3400, feedbacks: 12,
  }],
];

async function paridadeComOSite(): Promise<void> {
  console.log('\nParidade com compartilhado/regras/gamificacao.js');
  const caminho = resolve(__dirname, '..', '..', 'compartilhado', 'regras', 'gamificacao.js');
  if (!existsSync(caminho)) {
    console.log(`  ! original do site não encontrado em ${caminho} — parte pulada.`);
    return;
  }
  type Site = {
    diasTreino: typeof jogo.diasTreino;
    streakSemanas: typeof jogo.streakSemanas;
    contadores: typeof jogo.contadores;
    mesesDesde: typeof jogo.mesesDesde;
    maxCaloriasTreino: typeof jogo.maxCaloriasTreino;
    maxCaloriasSemana: typeof jogo.maxCaloriasSemana;
    medalhas: (ctx: jogo.ContextoMedalhas) => Array<{ id: string; ok: boolean }>;
  };
  const site = (await importarEsm(pathToFileURL(caminho).href)) as Site;

  const diasMeu = jogo.diasTreino(presencas, gastos);
  ok(JSON.stringify(diasMeu) === JSON.stringify(site.diasTreino(presencas, gastos)), 'dias de treino idênticos');
  ok(jogo.streakSemanas(diasMeu) === site.streakSemanas(diasMeu), 'streak idêntico', String(jogo.streakSemanas(diasMeu)));
  ok(JSON.stringify(jogo.contadores(diasMeu)) === JSON.stringify(site.contadores(diasMeu)), 'contadores idênticos');
  ok(jogo.maxCaloriasTreino(gastos) === site.maxCaloriasTreino(gastos), 'maior treino em kcal idêntico');
  ok(jogo.maxCaloriasSemana(gastos) === site.maxCaloriasSemana(gastos), 'maior semana em kcal idêntica');
  ok(jogo.mesesDesde(mesesAtrasMs(7)) === site.mesesDesde(mesesAtrasMs(7)), 'meses de casa idênticos');

  for (const [nome, ctx] of contextos) {
    const meu = jogo.medalhas(ctx).filter((m) => m.id !== jogo.MEDALHA_DO_APP);
    const dele = site.medalhas(ctx);
    ok(
      JSON.stringify(meu.map((m) => [m.id, m.ok])) === JSON.stringify(dele.map((m) => [m.id, m.ok])),
      `medalhas idênticas — ${nome}`,
    );
  }
  ok(!site.medalhas({}).some((m) => m.id === jogo.MEDALHA_DO_APP), 'a medalha do app continua só no app');
}

function tabelaDeXp(): void {
  console.log('\nTabela de XP');
  const ids = jogo.medalhas({}).map((m) => m.id);
  const semValor = ids.filter((id) => !(id in XP_POR_MEDALHA));
  ok(semValor.length === 0, 'toda medalha tem XP', semValor.join(', '));
  const sobrando = Object.keys(XP_POR_MEDALHA).filter((id) => !ids.includes(id));
  ok(sobrando.length === 0, 'nenhum XP para medalha inexistente', sobrando.join(', '));
  ok(Object.values(XP_POR_MEDALHA).every((xp) => Number.isInteger(xp) && xp > 0), 'XP inteiro e positivo');

  const catalogo = resolve(__dirname, '..', '..', '..', 'portal-aluno-web', 'src', 'lib', 'achievementsCatalog.ts');
  if (!existsSync(catalogo)) {
    console.log(`  ! catálogo do Portal não encontrado em ${catalogo} — comparação pulada.`);
    return;
  }
  const texto = readFileSync(catalogo, 'utf8');
  const doPortal = new Map(
    [...texto.matchAll(/id:\s*'([^']+)'[^}]*?xpReward:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])] as const),
  );
  ok(doPortal.size === ids.length, `o Portal tem as ${ids.length} medalhas`, `encontradas: ${doPortal.size}`);
  const diferentes = ids.filter((id) => doPortal.get(id) !== XP_POR_MEDALHA[id]);
  ok(diferentes.length === 0, 'XP igual ao ACHIEVEMENTS_CATALOG do Portal',
    diferentes.map((id) => `${id}: aqui ${XP_POR_MEDALHA[id]}, Portal ${doPortal.get(id)}`).join('; '));
}

/** O Portal recorta o streak do Header com a mesma data: se divergirem, a tela e as medalhas discordam. */
function corteNoPortal(): void {
  console.log('\nMarco zero no Portal');
  const arquivo = resolve(__dirname, '..', '..', '..', 'portal-aluno-web', 'src', 'lib', 'gamificacao.ts');
  if (!existsSync(arquivo)) {
    console.log(`  ! ${arquivo} não encontrado — comparação pulada.`);
    return;
  }
  const doPortal = readFileSync(arquivo, 'utf8').match(/DATA_DE_CORTE\s*=\s*'([^']+)'/)?.[1];
  ok(doPortal === DATA_DE_CORTE, `mesma data de corte no Portal (${DATA_DE_CORTE})`, `Portal: ${doPortal}`);
}

function logicaDoMotor(): void {
  console.log('\nContexto do aluno');
  const vazio = contextoDoAluno({});
  ok(vazio.total === 0 && vazio.streak === 0 && vazio.meses === 0 && vazio.usouApp === false,
    'sem documentos: tudo zero, sem quebrar');
  const lixo = contextoDoAluno({
    portal: { presencas: 'x', avaliacoes: [null, 3, {}], pagamentos: [], feedbacksCount: 'abc' },
    gastoTreinos: { gastos: [null, 'texto', 4] },
    desafios: { concluidos: {} },
  });
  ok(lixo.total === 0 && lixo.nAvaliacoes === 0 && lixo.feedbacks === 0 && lixo.desafios === 0,
    'documento editado à mão com lixo não quebra');

  // Datas a partir do marco zero (o checar roda depois de 01/10/2026) e de antes dele.
  const HOJE = diasAtras(0);
  const DEPOIS = [DATA_DE_CORTE, '2026-10-02', '2026-10-05'];
  const ANTES = ['2026-08-03', '2026-09-15', '2026-09-30'];

  const ctx = contextoDoAluno({
    portal: {
      presencas: [...ANTES, DEPOIS[0], DEPOIS[1]],
      avaliacoes: [{ dataRealizada: '2026-01-10' }, { dataRealizada: '2026-10-03' }, { semData: true }],
      criadoEm: mesesAtrasMs(7),
      pagamentos: { '2026-08': { pago: true }, '2026-09': { pago: true }, '2026-10': { pago: true } },
      feedbacksCount: '3',
    },
    gastoTreinos: {
      gastos: [
        { data: '2026-09-20', calorias: 1500 },
        { data: DEPOIS[1], calorias: 520 },
        { data: DEPOIS[2], calorias: '610' },
        { calorias: 2000 },
      ],
    },
    desafios: {
      concluidos: [
        { categoria: 'agua', em: Date.parse('2026-10-04T12:00:00-03:00') },
        { categoria: 'acucar', semana: '2026-10-05' },
        { categoria: 'agua', em: Date.parse('2026-09-28T12:00:00-03:00') },
        { categoria: 'outro', semana: '2026-09-21' },
      ],
    },
    rotinas: { primeiroAcessoApp: Date.parse('2026-06-01T10:00:00-03:00') },
  });
  ok(ctx.total === 3, 'total: só dias a partir de 01/10, sem repetir (presença e treino no mesmo dia contam 1)', String(ctx.total));
  ok(ctx.calMaxTreino === 610, 'calorias: o treino de 1.500 kcal de setembro e o sem data são ignorados', String(ctx.calMaxTreino));
  ok(ctx.desafios === 2 && ctx.desAgua === 1 && ctx.desAcucar === 1, 'desafios: só os concluídos a partir de 01/10 (pelo `em` ou, sem ele, pela semana)');
  ok(ctx.feedbacks === 3, 'feedbacks entram como estão (contador sem datas)');

  console.log('\nMarco zero (01/10/2026)');
  ok(INICIO_DO_MARCO_ZERO_MS === Date.parse('2026-10-01T03:00:00Z'), 'o corte é 00:00 de 01/10 em São Paulo (03:00 UTC)');
  const soAntigo = contextoDoAluno({
    portal: { presencas: ANTES, avaliacoes: [{ dataRealizada: '2025-11-02' }] },
    gastoTreinos: { gastos: ANTES.map((data) => ({ data, calorias: 1200 })) },
    desafios: { concluidos: [{ categoria: 'agua', em: Date.parse('2026-09-10T08:00:00-03:00') }] },
  });
  ok(soAntigo.total === 0 && soAntigo.streak === 0 && soAntigo.calMaxTreino === 0 && soAntigo.calMaxSemana === 0,
    'aluno só com histórico anterior: frequência, streak e calorias zerados');
  ok(soAntigo.desafios === 0, 'desafio concluído antes do corte não conta');
  const medsAntigo = calcularConquistas(soAntigo, undefined);
  ok(JSON.stringify(medsAntigo.conquistasDesbloqueadas) === JSON.stringify(['aval1']),
    'do passado sobra só a medalha da 1ª avaliação', JSON.stringify(medsAntigo.conquistasDesbloqueadas));
  ok(medsAntigo.xpAtual === XP_POR_MEDALHA.aval1, 'XP do aluno antigo = só a 1ª avaliação', String(medsAntigo.xpAtual));

  console.log('\nExceções mantidas');
  const tresAntigas = contextoDoAluno({
    portal: { avaliacoes: ['2025-03-01', '2025-09-01', '2026-03-01'].map((dataRealizada) => ({ dataRealizada })) },
  });
  ok(tresAntigas.nAvaliacoes === 1, '3 avaliações antigas valem só a 1ª (sem "3 avaliações")', String(tresAntigas.nAvaliacoes));
  ok(ctx.nAvaliacoes === 1, '1 antiga + 1 nova = 1: a antiga não soma com as novas', String(ctx.nAvaliacoes));
  ok(contextoDoAluno({
    portal: { avaliacoes: ['2026-01-01', '2026-10-02', '2026-10-09', '2026-10-20'].map((dataRealizada) => ({ dataRealizada })) },
  }).nAvaliacoes === 3, '3 avaliações a partir do corte liberam "3 avaliações"');
  ok(ctx.usouApp === true, '1º acesso ao app de antes do corte continua valendo');
  ok(contextoDoAluno({ rotinas: { primeiroAcessoApp: Date.parse('2025-01-01') } }).usouApp === true,
    '1º acesso antigo, sem mais nada, também vale');

  console.log('\nMeses de casa');
  const mesesDoCorte = jogo.mesesDesde(INICIO_DO_MARCO_ZERO_MS);
  ok(contextoDoAluno({ portal: { criadoEm: mesesAtrasMs(7) } }).meses === mesesDoCorte,
    'veterano: o tempo de casa conta a partir de 01/10/2026, não da entrada', String(mesesDoCorte));
  ok(contextoDoAluno({ portal: { criadoEm: { toMillis: () => mesesAtrasMs(14) } } }).meses === mesesDoCorte,
    'criadoEm como Timestamp do Firestore, também recortado');
  ok(contextoDoAluno({ portal: { criadoEm: Date.now() } }).meses === 0, 'quem entra depois do corte conta da própria entrada');
  ok(contextoDoAluno({ portal: { pagamentos: { '2026-07': 1, '2026-08': 1, '2026-09': 1 } } }).meses === mesesDoCorte,
    'meses pagos antes de outubro/2026 não contam');
  ok(ctx.meses === Math.max(mesesDoCorte, 1), 'outubro/2026 pago conta como o mês 1', String(ctx.meses));

  console.log('\nAcúmulo e XP');
  const r1 = calcularConquistas(ctx, undefined);
  const esperadas = jogo.medalhas(ctx).filter((m) => m.ok).map((m) => m.id);
  ok(JSON.stringify(r1.conquistasDesbloqueadas) === JSON.stringify(esperadas), 'sem histórico: exatamente as merecidas, na ordem do catálogo');
  ok(r1.xpAtual === esperadas.reduce((s, id) => s + XP_POR_MEDALHA[id], 0), 'XP = soma do XP das medalhas', String(r1.xpAtual));

  const depoisDoCorte = { ultimaAtualizacao: `${HOJE}T12:00:00-03:00` };
  const r2 = calcularConquistas({}, { ...depoisDoCorte, conquistasDesbloqueadas: ['streak8', 'concedida_pelo_coach', 'streak8', 42] });
  ok(r2.conquistasDesbloqueadas.includes('streak8'), 'medalha ganha depois do corte não se perde quando a regra deixa de valer');
  ok(r2.conquistasDesbloqueadas.includes('concedida_pelo_coach'), 'id desconhecido gravado depois do corte é mantido');
  ok(r2.conquistasDesbloqueadas.filter((id) => id === 'streak8').length === 1, 'sem ids repetidos');
  ok(r2.xpAtual === XP_POR_MEDALHA.streak8, 'id desconhecido não soma XP', String(r2.xpAtual));
  ok(r2.conquistasDesbloqueadas.at(-1) === 'concedida_pelo_coach', 'desconhecidos vão para o fim');

  // O documento de teste criado à mão no console: 00:39 UTC de 01/10 ainda é 30/09 em São Paulo.
  const doTesteManual = { xpAtual: 1250, conquistasDesbloqueadas: ['primeiro', 'streak4'], ultimaAtualizacao: '2026-10-01T00:39:21Z' };
  ok(desbloqueiosValidos(doTesteManual).length === 0, 'documento gravado antes do corte é descartado');
  ok(calcularConquistas({}, doTesteManual).xpAtual === 0, 'e o recálculo começa do zero (1.250 XP de teste somem)');
  ok(desbloqueiosValidos({ conquistasDesbloqueadas: ['primeiro'] }).length === 0, 'sem ultimaAtualizacao conta como antigo');

  const gravado = { ...r1, ...depoisDoCorte };
  ok(!mudou(gravado, calcularConquistas(ctx, gravado)), 'recalcular sem novidade não regrava');
  ok(mudou({ ...gravado, xpAtual: 1250 }, r1), 'XP editado à mão é corrigido');
  ok(mudou(undefined, r1), 'documento inexistente é criado');

  console.log('\nFuso');
  const tzAntes = process.env.TZ;
  const dia = noFusoDoBox(() => new Date('2026-10-01T01:00:00Z').getDate());
  ok(dia === 30, `01/10 01:00 UTC ainda é 30/09 em ${FUSO_DO_BOX}`, String(dia));
  ok(process.env.TZ === tzAntes, 'o fuso do processo volta ao que era');
}

async function main(): Promise<void> {
  // Os dois lados rodam no mesmo processo e no mesmo fuso: a comparação não depende dele.
  await paridadeComOSite();
  tabelaDeXp();
  corteNoPortal();
  logicaDoMotor();

  console.log(falhas === 0 ? '\n✓ Motor de conquistas conferido.\n' : `\n✗ ${falhas} verificação(ões) falharam.\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
