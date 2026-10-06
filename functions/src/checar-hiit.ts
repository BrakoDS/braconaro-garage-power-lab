/**
 * Confere o HIIT do box sem rede e sem emulador.
 *
 *     npm run checar:hiit
 *
 * Cobre o catálogo do HIIT (`catalogo-hiit.ts` e o `hiit` do `catalogo-base.ts`),
 * o inventário com os recursos do HIIT e o tamanho da turma, e o gerador
 * (`gerador-hiit.ts`): a matemática dos 4 slots com unilateral, o limite de
 * equipamento por exercício e por slot somando as estações, a repetição no
 * dia, o rodízio e o determinismo.
 */
import { CATALOGO_BASE } from './catalogo-base';
import { CATALOGO_HIIT } from './catalogo-hiit';
import {
  ESTACOES_HIIT, NOME_ESTACAO_HIIT, PROTOCOLO_HIIT, RECURSOS_HIIT, SLOTS_POR_ESTACAO,
  type EstacaoHiit, type EstacaoProgramada, type ExercicioSoHiit, type ItemCatalogo, type RecursoHiit,
} from './modelo-box';
import { aplicarInventario, lerExercicioCatalogo, lerInventario, lerItemCatalogo } from './semana-box';
import { gerarSemana } from './gerador-box';
import {
  alunosPorEstacao, consumoPorAluno, contarHiit, gerarHiit, slotsDe, type ContextoHiit, type HiitGerado,
} from './gerador-hiit';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const catalogo = new Map<string, ItemCatalogo>([...Object.entries(CATALOGO_BASE), ...Object.entries(CATALOGO_HIIT)]);
const INV = lerInventario(undefined);
const LIMITES = INV.limitesAtivos as Record<RecursoHiit, number>;
const SEMENTES = Array.from({ length: 200 }, (_, i) => `2026-W42:HIIT:${i}`);

/** Contexto com o catálogo real e o inventário de fábrica. */
const ctx = (o: Partial<ContextoHiit> = {}): ContextoHiit => ({
  catalogo, limites: { ...LIMITES }, alunosPorAula: 6, semente: '2026-W42:HIIT:0', ...o,
});

/** Ids distintos do HIIT. */
const idsDe = (h: { estacoes: readonly EstacaoProgramada[] }) => [...new Set(h.estacoes.flatMap((e) => e.slots.map((s) => s.exercicioId)))];
const estacao = (h: HiitGerado, e: EstacaoHiit) => h.estacoes.find((x) => x.estacao === e)!;
/** Slot (1–4) de um exercício na sua estação. */
const slotDe = (h: HiitGerado, id: string) => {
  for (const e of h.estacoes) {
    const i = e.slots.findIndex((s) => s.exercicioId === id);
    if (i >= 0) return i + 1;
  }
  return 0;
};

/** Item forjado para os testes de slot e equipamento. */
function forjado(nome: string, estacao: EstacaoHiit, o: { uni?: boolean; equip?: ExercicioSoHiit['equipamentos'][number] } = {}): ExercicioSoHiit {
  return {
    nome, instancia: null, musculoPrincipal: ['core'], musculosSecundarios: [], adaptacoes: {},
    equipamentos: [o.equip ?? 'peso_corporal'], hiit: { estacoes: [estacao] },
    ...(o.uni ? { unilateral: true } : {}),
  };
}
/** Catálogo forjado: cada estação com a lista dada; o que faltar ganha 4 bilaterais de peso corporal. */
function catalogoForjado(por: Partial<Record<EstacaoHiit, Record<string, ExercicioSoHiit>>>): Map<string, ItemCatalogo> {
  const m = new Map<string, ItemCatalogo>();
  for (const e of ESTACOES_HIIT) {
    const itens = por[e] ?? Object.fromEntries([1, 2, 3, 4].map((i) => [`${e}_${i}`, forjado(`${e} ${i}`, e)]));
    for (const [id, item] of Object.entries(itens)) m.set(id, item);
  }
  return m;
}

console.log('\nCatálogo do HIIT');
{
  const soHiit = Object.keys(CATALOGO_HIIT);
  ok(soHiit.every((id) => /^[a-z0-9_]+$/.test(id)), 'ids em snake_case');
  const repetidos = soHiit.filter((id) => id in CATALOGO_BASE);
  ok(!repetidos.length, 'nenhum id nos dois catálogos (o seed recusaria)', repetidos.join(', '));
  const tortos = [...catalogo.entries()].filter(([, item]) => !lerItemCatalogo(item)).map(([id]) => id);
  ok(!tortos.length, 'todo item (força e HIIT) passa na leitura do servidor', tortos.join(', '));
  ok(soHiit.every((id) => lerExercicioCatalogo(CATALOGO_HIIT[id]) === null),
    'exercício só de HIIT NÃO entra no catálogo de força (o bloco H nunca o vê)');
  const forcaComHiit = Object.entries(CATALOGO_BASE).filter(([, i]) => i.hiit).map(([id]) => id);
  ok(forcaComHiit.length === 8 && forcaComHiit.every((id) => lerExercicioCatalogo(CATALOGO_BASE[id])?.hiit),
    'os 8 de força que também servem ao HIIT continuam no catálogo de força, com o hiit', forcaComHiit.join(', '));

  // A migração do Montador antigo está completa: os 28 ids com categoria 'hiit'.
  const antigos = [
    'flexao', 'thruster_wallball', 'flexao_trx', 'remada_trx', 'agachamento_salto', 'goblet_squat', 'agachamento_livre',
    'skater', 'box_step_up', 'box_jump', 'wall_ball_shot', 'agachamento_trx', 'ponte_gluteo', 'kb_swing',
    'abdominal_supra', 'abdominal_infra', 'abdominal_remador', 'russian_twist', 'abdominal_bicicleta', 'prancha',
    'prancha_lateral', 'mountain_climber', 'fallout_trx', 'air_bike_sprint', 'corda_naval', 'corrida_100m',
    'high_knees', 'polichinelo',
  ];
  const faltando = antigos.filter((id) => !catalogo.get(id)?.hiit);
  ok(!faltando.length, 'os 28 exercícios de HIIT do Montador antigo estão no catálogo, com estação', faltando.join(', '));

  const fora = gerarHiit(ctx()).foraPorEquipamento.map((f) => f.exercicioId);
  for (const e of ESTACOES_HIIT) {
    const bilaterais = [...catalogo.entries()].filter(([id, i]) => i.hiit?.estacoes.includes(e) && !i.unilateral && !fora.includes(id));
    ok(bilaterais.length >= SLOTS_POR_ESTACAO, `${NOME_ESTACAO_HIIT[e]}: ${bilaterais.length} bilaterais viáveis (fecha os 4 slots sem depender de unilateral)`);
  }
  ok([...catalogo.values()].some((i) => i.hiit && i.unilateral && i.equipamentos.includes('kettlebell')), 'há unilateral de kettlebell para o sorteio');

  const base = { nome: 'X', musculoPrincipal: ['core'], musculosSecundarios: [], equipamentos: ['peso_corporal'], adaptacoes: {} };
  ok(lerItemCatalogo({ ...base, instancia: null, hiit: { estacoes: ['hiit_legs'] } }) === null, 'estação desconhecida (hiit_legs) torna o item torto');
  ok(lerItemCatalogo({ ...base, instancia: null, hiit: { estacoes: [] } }) === null, 'hiit sem estação é torto');
  ok(lerItemCatalogo({ ...base, instancia: null, unilateral: 'sim', hiit: { estacoes: ['core'] } }) === null, 'unilateral que não é booleano é torto');
  ok(lerItemCatalogo({ ...base, instancia: null, hiit: { estacoes: ['core'], consumoPorAluno: { kettlebell: 1.5 } } }) === null,
    'consumo por aluno fracionado é torto');
  ok(lerItemCatalogo({ ...base, instancia: null, hiit: { estacoes: ['core'], consumoPorAluno: { esteira: 1 } } }) === null,
    'consumo de recurso desconhecido é torto');
  ok(lerItemCatalogo({ ...base, instancia: null }) === null, 'sem instância E sem hiit não serve a nada: torto');
  ok(lerItemCatalogo({ ...base, hiit: { estacoes: ['core'] } })?.instancia === null, 'sem o campo instância e com hiit = só HIIT');
}

console.log('\nInventário com o HIIT');
{
  ok(igual(RECURSOS_HIIT.map((r) => INV.limitesAtivos[r]), [10, 4, 4, 2, 2, 1, 2, 2, 4]),
    'sem documento: kettlebell 10, wall ball 4, caixote 4, corda naval 2, corda de pular 2, sandbag 1, air bike 2, TRX 2, halteres 4');
  ok(INV.alunosPorAula === 6, 'turma padrão = 6 alunos');
  ok(INV.equipamentos.kettlebell.observacao.includes('22 kg') && INV.equipamentos.wallBall.observacao.includes('14 lb'),
    'os pesos de kettlebell e wall ball vêm na observação de fábrica');

  const antigo = lerInventario({ equipamentos: { smith: { total: 2, emManutencao: 1, observacao: 'cabo' } } });
  ok(antigo.limitesAtivos.smith === 1 && antigo.limitesAtivos.airbike === 2 && antigo.alunosPorAula === 6,
    'inventário gravado antes do HIIT mantém o do H e ganha o HIIT de fábrica');
  ok(lerInventario({ equipamentos: { kettlebell: { total: 10, observacao: '' } } }).equipamentos.kettlebell.observacao === '',
    'observação apagada pelo coach fica apagada (não volta a de fábrica)');
  ok(lerInventario({ alunosPorAula: 0 }).alunosPorAula === 6 && lerInventario({ alunosPorAula: 8 }).alunosPorAula === 8,
    'turma gravada torta volta ao padrão; válida é lida');

  const r = aplicarInventario(INV, { airbike: { emManutencao: 1, observacao: 'corrente' } }, 8);
  ok('inventario' in r && r.inventario.limitesAtivos.airbike === 1 && r.inventario.alunosPorAula === 8,
    'air bike em manutenção e turma de 8 no mesmo salvamento');
  const manter = aplicarInventario({ ...INV, alunosPorAula: 8 }, {});
  ok('inventario' in manter && manter.inventario.alunosPorAula === 8, 'turma ausente no pedido mantém a atual');
  ok('erro' in aplicarInventario(INV, {}, 0) && 'erro' in aplicarInventario(INV, {}, 2.5) && 'erro' in aplicarInventario(INV, {}, 41),
    'turma 0, fracionada ou acima de 40 é erro');
  ok('erro' in aplicarInventario(INV, { sandbag: { total: 1, emManutencao: 2 } }), 'manutenção > total vale para o HIIT também');
}

console.log('\nMatemática da turma e dos slots');
{
  ok(igual([1, 4, 5, 6, 8, 9, 12].map(alunosPorEstacao), [1, 1, 2, 2, 2, 3, 3]), 'alunos por estação = turma ÷ 4, para cima (6 → 2)');
  ok(slotsDe(CATALOGO_HIIT.afundo_kb) === 2 && slotsDe(CATALOGO_HIIT.burpee) === 1, 'unilateral ocupa 2 slots; bilateral, 1');
  ok(igual(consumoPorAluno(CATALOGO_HIIT.goblet_squat), { kettlebell: 1 }), 'kettlebell: 1 por aluno');
  ok(igual(consumoPorAluno(CATALOGO_HIIT.burpee), {}), 'peso corporal não consome nada');
  const duplo = { ...forjado('Front squat com 2 KB', 'pernas', { equip: 'kettlebell' }), hiit: { estacoes: ['pernas' as const], consumoPorAluno: { kettlebell: 2 } } };
  ok(igual(consumoPorAluno(duplo), { kettlebell: 2 }), 'consumoPorAluno do catálogo vence o 1 por aluno');
}

console.log('\nOs 4 slots, em 200 sorteios do catálogo real');
{
  const todos = SEMENTES.map((semente) => gerarHiit(ctx({ semente })));
  ok(todos.every((h) => h.estacoes.length === 4 && igual([...h.estacoes.map((e) => e.estacao)].sort(), [...ESTACOES_HIIT].sort())),
    'sempre as 4 estações, cada uma uma vez');
  ok(todos.every((h) => h.estacoes.every((e) => e.slots.length === SLOTS_POR_ESTACAO)), 'toda estação fecha EXATAMENTE 4 slots');
  const ladoErrado = todos.some((h) => h.estacoes.some((e) => e.slots.some((s, i) => {
    const uni = !!catalogo.get(s.exercicioId)!.unilateral;
    if (!uni) return s.lado !== null;
    return s.lado === 'D' ? e.slots[i + 1]?.exercicioId !== s.exercicioId || e.slots[i + 1]?.lado !== 'E'
      : e.slots[i - 1]?.exercicioId !== s.exercicioId || e.slots[i - 1]?.lado !== 'D';
  })));
  ok(!ladoErrado, 'unilateral = lado D e lado E em slots seguidos; bilateral sem lado');
  ok(todos.some((h) => h.estacoes.some((e) => e.slots.some((s) => s.lado))), 'unilateral aparece nos sorteios (a regra é exercitada)');
  ok(todos.every((h) => h.estacoes.every((e) => {
    const contagem = new Map<string, number>();
    e.slots.forEach((s) => contagem.set(s.exercicioId, (contagem.get(s.exercicioId) ?? 0) + 1));
    return [...contagem].every(([id, n]) => n === slotsDe(catalogo.get(id)!));
  })), 'cada exercício ocupa na estação exatamente os slots que deve (1 ou 2)');
  ok(todos.every((h) => idsDe(h).length === h.estacoes.reduce((n, e) => n + new Set(e.slots.map((s) => s.exercicioId)).size, 0)),
    'nenhum exercício repete entre estações');
  ok(todos.every((h) => h.estacoes.every((e) => e.slots.every((s) => catalogo.get(s.exercicioId)!.hiit!.estacoes.includes(e.estacao)))),
    'cada exercício está numa estação que o catálogo permite');
  ok(todos.every((h) => h.estacoes.every((e) => e.protocolo === PROTOCOLO_HIIT && e.nome === NOME_ESTACAO_HIIT[e.estacao])),
    'protocolo e nome da estação em toda estação');
  ok(PROTOCOLO_HIIT === '2 Músicas de Tabata (16 rounds no total). 4x cada exercício.', 'protocolo = o texto ditado pelo coach');
  ok(new Set(todos.map((h) => h.estacoes.map((e) => e.estacao).join())).size > 1, 'a ordem das estações varia entre sorteios');
  ok(todos.every((h) => !h.alertas.length && !h.avisos.length), 'catálogo real + inventário de fábrica: nenhum alerta nem aviso');
}

console.log('\nOs 4 slots com unilateral, em catálogo forjado');
{
  const so = (pernas: Record<string, ExercicioSoHiit>, semente = 's') => gerarHiit(ctx({ catalogo: catalogoForjado({ pernas }), semente }));
  const doisUni = so({ u1: forjado('U1', 'pernas', { uni: true }), u2: forjado('U2', 'pernas', { uni: true }) });
  ok(igual(estacao(doisUni, 'pernas').slots.map((s) => s.lado), ['D', 'E', 'D', 'E']), '2 unilaterais = 4 slots (D, E, D, E)');

  let semUniNoFim = true;
  let fechou = true;
  for (const semente of SEMENTES.slice(0, 50)) {
    const h = so({ u: forjado('U', 'pernas', { uni: true }), b1: forjado('B1', 'pernas'), b2: forjado('B2', 'pernas') }, semente);
    const p = estacao(h, 'pernas').slots;
    if (p.length !== 4 || new Set(p.map((s) => s.exercicioId)).size !== 3) fechou = false;
    if (p[3]?.lado === 'D') semUniNoFim = false;
  }
  ok(fechou, '1 unilateral + 2 bilaterais = 4 slots, nos 50 sorteios');
  ok(semUniNoFim, 'unilateral nunca começa no último slot (não sobra lado E de fora)');

  const tresUni = so({ a: forjado('A', 'pernas', { uni: true }), b: forjado('B', 'pernas', { uni: true }), c: forjado('C', 'pernas', { uni: true }) });
  ok(estacao(tresUni, 'pernas').slots.length === 4 && new Set(estacao(tresUni, 'pernas').slots.map((s) => s.exercicioId)).size === 2,
    '3 unilaterais disponíveis: entram só 2 (o terceiro não cabe)');

  const naoFecha = so({ u: forjado('U', 'pernas', { uni: true }), b: forjado('B', 'pernas') });
  ok(estacao(naoFecha, 'pernas').slots.length === 3 && naoFecha.avisos.some((a) => a.includes('Pernas') && a.includes('faltam 1')),
    '1 unilateral + 1 bilateral = 3 slots: a estação fica incompleta e vira aviso', naoFecha.avisos.join(' | '));
  ok(estacao(naoFecha, 'core').slots.length === 4, 'a estação que não fecha não derruba as outras');
}

console.log('\nEquipamento por exercício (alunos por estação × consumo)');
{
  const todos = SEMENTES.map((semente) => gerarHiit(ctx({ semente })));
  ok(todos.every((h) => !idsDe(h).includes('sandbag_clean')), 'turma de 6 (2 por estação): clean com sandbag nunca entra (2 sandbags, o box tem 1)');
  const f = todos[0].foraPorEquipamento.find((x) => x.exercicioId === 'sandbag_clean');
  ok(f?.recurso === 'sandbag' && f.precisa === 2 && f.limite === 1, 'e fica registrado em foraPorEquipamento (precisa 2, limite 1)', JSON.stringify(f));
  ok(todos.every((h) => h.alunosPorEstacao === 2), 'alunosPorEstacao = 2 no resultado');

  const turma4 = SEMENTES.map((semente) => gerarHiit(ctx({ semente, alunosPorAula: 4 })));
  ok(turma4.some((h) => idsDe(h).includes('sandbag_clean')) && turma4.every((h) => !h.foraPorEquipamento.length),
    'turma de 4 (1 por estação): o sandbag volta ao sorteio');

  const umaBike = SEMENTES.map((semente) => gerarHiit(ctx({ semente, limites: { ...LIMITES, airbike: 1 } })));
  ok(umaBike.every((h) => !idsDe(h).includes('air_bike_sprint')) && todos.some((h) => idsDe(h).includes('air_bike_sprint')),
    'uma air bike em manutenção: air bike sai do HIIT (entrava com as 2)');

  const turma9 = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ semente, alunosPorAula: 9 })));
  ok(turma9.every((h) => !['flexao_trx', 'remada_trx', 'agachamento_trx', 'fallout_trx', 'air_bike_sprint', 'corda_naval', 'pular_corda']
    .some((id) => idsDe(h).includes(id))), 'turma de 9 (3 por estação): tudo que só tem 2 unidades sai (TRX, bike, cordas)');
  ok(turma9.every((h) => !h.alertas.length && h.estacoes.every((e) => e.slots.length === 4)), 'e o HIIT ainda fecha, sem alerta');
}

console.log('\nEquipamento entre estações (mesmo slot, mesma hora)');
{
  const todos = SEMENTES.map((semente) => gerarHiit(ctx({ semente })));
  const estourou = todos.find((h) => contarHiit(h.estacoes, catalogo, LIMITES, 6).alertas.length);
  ok(!estourou, 'nos 200 sorteios, nenhum slot passa do limite somando as 4 estações');
  ok(todos.every((h) => RECURSOS_HIIT.every((r) => (h.consumo[r] ?? 0) <= LIMITES[r])), 'consumo de pico ≤ limite em todo recurso');

  // Pernas e Superiores OBRIGADAS a usar um TRX cada (só 4 opções, uma de TRX):
  // 2 alunos × 2 estações = 4 TRX se caírem no mesmo slot; o box tem 2.
  const trx = (estacao: EstacaoHiit) => Object.fromEntries([
    [`${estacao}_trx`, forjado(`TRX ${estacao}`, estacao, { equip: 'trx' })],
    ...[1, 2, 3].map((i) => [`${estacao}_${i}`, forjado(`${estacao} ${i}`, estacao)]),
  ]) as Record<string, ExercicioSoHiit>;
  const cat = catalogoForjado({ pernas: trx('pernas'), superiores: trx('superiores') });
  const resultados = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ catalogo: cat, semente })));
  ok(resultados.every((h) => slotDe(h, 'pernas_trx') && slotDe(h, 'superiores_trx') && slotDe(h, 'pernas_trx') !== slotDe(h, 'superiores_trx')),
    'dois exercícios de TRX em estações diferentes nunca caem no mesmo slot');
  ok(resultados.every((h) => !h.alertas.length && h.consumo.trx === 2), 'e o pico de TRX fica em 2');

  // Impossível: 4 TRX obrigatórios em Pernas E em Superiores, com 3 TRX no box.
  const soTrx = (estacao: EstacaoHiit) => Object.fromEntries([1, 2, 3, 4].map((i) => [`${estacao}_trx${i}`, forjado(`TRX ${i}`, estacao, { equip: 'trx' })]));
  const impossivel = gerarHiit(ctx({
    catalogo: catalogoForjado({ pernas: soTrx('pernas'), superiores: soTrx('superiores') }), limites: { ...LIMITES, trx: 3 },
  }));
  ok(impossivel.estacoes.every((e) => e.slots.length === 4), 'sem combinação possível, o HIIT sai completo mesmo assim (o rascunho existe)');
  ok(impossivel.alertas.length === 4 && impossivel.alertas.every((a) => a.recurso === 'trx' && a.usado === 4 && a.limite === 3 && a.slot !== null),
    'e com um alerta por slot: 4 TRX, limite 3', JSON.stringify(impossivel.alertas));
  ok(impossivel.avisos.some((a) => a.includes('inventário')), 'e com o aviso de que não coube');

  const manual = [
    { slots: [{ exercicioId: 'flexao_trx' }, { exercicioId: 'burpee' }] },
    { slots: [{ exercicioId: 'remada_trx' }, { exercicioId: 'sandbag_clean' }] },
  ];
  const conta = contarHiit(manual, catalogo, LIMITES, 6);
  ok(conta.alertas.some((a) => a.recurso === 'trx' && a.slot === 1 && a.usado === 4 && igual(a.exercicios, ['flexao_trx', 'remada_trx'])),
    'contarHiit: dois TRX no slot 1 = alerta do slot 1 (4 de 2)');
  ok(conta.alertas.filter((a) => a.recurso === 'sandbag').length === 1 && conta.alertas.find((a) => a.recurso === 'sandbag')!.slot === null,
    'contarHiit: sandbag sozinho estoura = um alerta sem slot');
  ok(conta.consumo.trx === 4 && conta.consumo.sandbag === 2, 'contarHiit: consumo de pico por recurso');
}

console.log('\nRepetição no dia, rodízio e determinismo');
{
  const semana = gerarSemana({ semanaId: '2026-W42', catalogo: new Map(Object.entries(CATALOGO_BASE)), limites: { ...lerInventario(undefined).limitesAtivos }, diasDaSemanaAnterior: null });
  const h3 = new Set(semana.dias.sexta.blocoPrincipal.map((e) => e.exercicioId));
  // Força os exercícios do H3 a "quererem" entrar: catálogo com o H3 inteiro marcado para HIIT.
  const cat = new Map(catalogo);
  for (const id of h3) cat.set(id, { ...cat.get(id)!, hiit: { estacoes: ['pernas', 'superiores'] } } as ItemCatalogo);
  const comH3 = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ catalogo: cat, semente, proibidos: h3 })));
  ok(comH3.every((h) => !idsDe(h).some((id) => h3.has(id))), `nenhum exercício do H3 do dia (${[...h3].join(', ')}) entra no HIIT`);
  const semProibir = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ catalogo: cat, semente })));
  ok(semProibir.some((h) => idsDe(h).some((id) => h3.has(id))), 'sem a lista de proibidos eles entrariam (o teste não é vazio)');

  const w41 = gerarHiit(ctx({ semente: '2026-W41:HIIT:0' }));
  const w42 = gerarHiit(ctx({ semente: '2026-W42:HIIT:0', semanaPassada: new Set(idsDe(w41)) }));
  ok(!idsDe(w42).some((id) => idsDe(w41).includes(id)), 'rodízio: nenhum exercício do HIIT da semana anterior, com o catálogo real');
  const pobre = catalogoForjado({ core: { c1: forjado('C1', 'core'), c2: forjado('C2', 'core'), c3: forjado('C3', 'core'), c4: forjado('C4', 'core'), c5: forjado('C5', 'core') } });
  const passada = new Set(['c1', 'c2', 'c3']);
  const rod = gerarHiit(ctx({ catalogo: pobre, semanaPassada: passada }));
  const core = new Set(estacao(rod, 'core').slots.map((s) => s.exercicioId));
  ok(core.has('c4') && core.has('c5') && [...core].filter((id) => passada.has(id)).length === 2,
    'rodízio com pouca opção: usa as novas primeiro e repete só o que falta');
  ok(rod.avisos.filter((a) => a.includes('repete o HIIT da semana anterior')).length === 2, 'e cada repetição vira aviso');

  ok(igual(gerarHiit(ctx()), gerarHiit(ctx())), 'mesma semente, mesmo catálogo, mesmo inventário → mesmo HIIT');
  ok(new Set(SEMENTES.slice(0, 10).map((semente) => JSON.stringify(gerarHiit(ctx({ semente })).estacoes))).size > 1,
    'outra semente (variação) → outro HIIT');
  const ordemCatalogo = new Map([...catalogo.entries()].reverse());
  ok(igual(gerarHiit(ctx({ catalogo: ordemCatalogo })), gerarHiit(ctx())), 'a ordem em que o Firestore devolve o catálogo não muda o sorteio');
}

console.log(falhas ? `\n✗ ${falhas} verificação(ões) falharam.\n` : '\n✓ HIIT: tudo certo.\n');
process.exitCode = falhas ? 1 : 0;
