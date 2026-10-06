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
  DIAS_SEMANA, ESTACOES_HIIT, INVENTARIO_PADRAO, NOME_ESTACAO_HIIT, RECURSOS_FIXOS_HIIT, PROTOCOLO_HIIT, RECURSOS_HIIT, SLOTS_POR_ESTACAO,
  type DiaSemana, type EstacaoHiit, type EstacaoProgramada, type ExercicioCatalogo, type ExercicioSoHiit, type ItemCatalogo, type RecursoHiit,
} from './modelo-box';
import {
  aplicarInventario, diasComConteudoGravado, intervaloDaSemana, lerDias, lerExercicioCatalogo, lerInventario, lerItemCatalogo,
  lerHiit, problemasParaPublicar, reconferirSemana,
} from './semana-box';
import { conflitosDaTroca, diasPassadosAlterados } from './edicao-box';
import {
  diasDoHiit, estacoesComTroca, estacoesDaSemana, hiitTravado, opcoesDoHiit, type ConflitosHiit, type OpcoesDoHiit,
} from './edicao-hiit';
import { gerarSemana, idsDoHiit } from './gerador-box';
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
/** Só os de força: o que a troca do bloco H enxerga. */
const catalogoForca = new Map([...catalogo].filter((par): par is [string, ExercicioCatalogo] => par[1].instancia !== null));
/** A opção não tem conflito nenhum? */
const temAlgum = (c: ConflitosHiit) => c.noHiit || c.tamanhoDiferente || c.semanaAnterior
  || c.equipamento.length > 0 || c.fixoEmOutraEstacao.length > 0 || c.noBlocoDoDia.length > 0;
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

/** Catálogo forjado: a estação com um exercício do equipamento dado e n de peso corporal. */
const com = (estacao: EstacaoHiit, equip: 'wall_ball' | 'trx', n = 3) => Object.fromEntries([
  [`${estacao}_${equip}`, forjado(`${equip} ${estacao}`, estacao, { equip })],
  ...Array.from({ length: n }, (_, i) => [`${estacao}_${i + 1}`, forjado(`${estacao} ${i + 1}`, estacao)]),
]) as Record<string, ExercicioSoHiit>;

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
  const estourou = todos.find((h) => contarHiit(h.estacoes, LIMITES, 6).alertas.length);
  ok(!estourou, 'nos 200 sorteios, nenhum slot passa do limite somando as 4 estações');
  ok(todos.every((h) => RECURSOS_HIIT.every((r) => (h.consumo[r] ?? 0) <= LIMITES[r])), 'consumo de pico ≤ limite em todo recurso');

  // Soma por slot, com um recurso que NÃO é fixo (wall ball, 2 no box): Pernas
  // e Superiores obrigadas a usar uma wall ball cada (só 4 opções, uma com ela).
  // 2 alunos × 2 estações = 4 bolas se caírem no mesmo slot.
  const duasBolas = catalogoForjado({ pernas: com('pernas', 'wall_ball'), superiores: com('superiores', 'wall_ball') });
  const resultados = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ catalogo: duasBolas, semente, limites: { ...LIMITES, wallBall: 2 } })));
  ok(resultados.every((h) => slotDe(h, 'pernas_wall_ball') && slotDe(h, 'superiores_wall_ball')
    && slotDe(h, 'pernas_wall_ball') !== slotDe(h, 'superiores_wall_ball')),
    'soma por slot: duas estações com wall ball (2 no box) nunca no mesmo slot');
  ok(resultados.every((h) => !h.alertas.length && h.consumo.wallBall === 2), 'e o pico de wall ball fica em 2');

  // Impossível pela soma: 4 wall balls obrigatórias em Pernas E em Superiores, com 3 no box.
  const soBola = (estacao: EstacaoHiit) => Object.fromEntries([1, 2, 3, 4].map((i) => [`${estacao}_bola${i}`, forjado(`Bola ${i}`, estacao, { equip: 'wall_ball' })]));
  const impossivel = gerarHiit(ctx({
    catalogo: catalogoForjado({ pernas: soBola('pernas'), superiores: soBola('superiores') }), limites: { ...LIMITES, wallBall: 3 },
  }));
  ok(impossivel.estacoes.every((e) => e.slots.length === 4), 'sem combinação possível, o HIIT sai completo mesmo assim (o rascunho existe)');
  ok(impossivel.alertas.length === 4 && impossivel.alertas.every((a) => a.recurso === 'wallBall' && a.usado === 4 && a.limite === 3 && a.slot !== null),
    'e com um alerta por slot: 4 wall balls, limite 3', JSON.stringify(impossivel.alertas));
  ok(impossivel.avisos.some((a) => a.includes('inventário')), 'e com o aviso de que não coube');
}

console.log('\nTRX fixo no espaço: uma estação por HIIT');
{
  const usamTrx = (h: HiitGerado) => h.estacoes.filter((e) => e.slots.some((x) => x.consumoPorAluno.trx)).map((e) => e.estacao);
  const todos = SEMENTES.map((semente) => gerarHiit(ctx({ semente })));
  ok(igual(RECURSOS_FIXOS_HIIT, ['trx']), 'o TRX é o recurso fixo (decisão do coach)');
  ok(todos.every((h) => usamTrx(h).length <= 1), 'catálogo real, 200 sorteios: o TRX nunca aparece em duas estações',
    todos.map(usamTrx).filter((x) => x.length > 1).map((x) => x.join('+')).slice(0, 3).join(' | '));
  ok(todos.some((h) => usamTrx(h).length === 1), 'e o TRX continua entrando no HIIT (a regra não o expulsa)');
  ok(todos.every((h) => !h.alertas.length), 'sem alerta');

  // Pernas e Superiores com um exercício de TRX cada, mas com alternativa: só uma fica com o TRX.
  const comAlternativa = catalogoForjado({ pernas: com('pernas', 'trx', 4), superiores: com('superiores', 'trx', 4) });
  const alt = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ catalogo: comAlternativa, semente })));
  ok(alt.every((h) => usamTrx(h).length <= 1 && !h.alertas.length), 'duas estações querendo o TRX, com alternativa: só uma fica com ele');
  ok(alt.some((h) => slotDe(h, 'pernas_trx')) && alt.some((h) => slotDe(h, 'superiores_trx')),
    'e qual estação fica com o TRX varia com o sorteio');

  // A MESMA estação pode ter dois exercícios de TRX (em slots diferentes: 2 alunos cada, 2 TRX).
  const doisNaMesma = catalogoForjado({
    pernas: { a: forjado('TRX A', 'pernas', { equip: 'trx' }), b: forjado('TRX B', 'pernas', { equip: 'trx' }), c: forjado('C', 'pernas'), d: forjado('D', 'pernas') },
  });
  const mesma = gerarHiit(ctx({ catalogo: doisNaMesma }));
  ok(!!slotDe(mesma, 'a') && !!slotDe(mesma, 'b') && !mesma.alertas.length, 'dois exercícios de TRX na MESMA estação podem (o espaço é um só)');

  // Impossível: Pernas e Superiores só têm exercícios com TRX.
  const soTrx = (estacao: EstacaoHiit) => Object.fromEntries([1, 2, 3, 4].map((i) => [`${estacao}_trx${i}`, forjado(`TRX ${i}`, estacao, { equip: 'trx' })]));
  const preso = gerarHiit(ctx({ catalogo: catalogoForjado({ pernas: soTrx('pernas'), superiores: soTrx('superiores') }), limites: { ...LIMITES, trx: 8 } }));
  const espacial = preso.alertas.filter((a) => a.estacoes);
  ok(espacial.length === 1 && espacial[0].recurso === 'trx' && espacial[0].usado === 2 && espacial[0].limite === 1
    && igual([...espacial[0].estacoes!].sort(), ['pernas', 'superiores']),
    'sem saída: o HIIT sai com UM alerta espacial (TRX em Pernas e Superiores)', JSON.stringify(preso.alertas));
  ok(preso.avisos.some((a) => a.includes('inventário')), 'e com o aviso de que não coube');
}

{
  const slot = (id: string) => ({ exercicioId: id, consumoPorAluno: consumoPorAluno(catalogo.get(id)!) });
  const manual = [
    { slots: [slot('flexao_trx'), slot('burpee')] },
    { slots: [slot('remada_trx'), slot('sandbag_clean')] },
  ];
  const conta = contarHiit(manual, LIMITES, 6);
  ok(conta.alertas.some((a) => a.recurso === 'trx' && a.slot === 1 && a.usado === 4 && igual(a.exercicios, ['flexao_trx', 'remada_trx'])),
    'contarHiit: dois TRX no slot 1 = alerta do slot 1 (4 de 2)');
  ok(conta.alertas.filter((a) => a.recurso === 'sandbag').length === 1 && conta.alertas.find((a) => a.recurso === 'sandbag')!.slot === null,
    'contarHiit: sandbag sozinho estoura = um alerta sem slot');
  ok(conta.consumo.trx === 4 && conta.consumo.sandbag === 2, 'contarHiit: consumo de pico por recurso');
  const separados = contarHiit([
    { estacao: 'superiores', slots: [slot('flexao_trx'), slot('burpee')] },
    { estacao: 'core', slots: [slot('prancha'), slot('fallout_trx')] },
  ], LIMITES, 6);
  ok(separados.alertas.length === 1 && igual(separados.alertas[0].estacoes, ['superiores', 'core'])
    && igual(separados.alertas[0].exercicios, ['flexao_trx', 'fallout_trx']) && separados.alertas[0].slot === null,
    'contarHiit: TRX em Superiores (slot 1) e Core (slot 2) — slots diferentes, mas alerta espacial', JSON.stringify(separados.alertas));
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
  // 3 bilaterais novos + 1 unilateral novo + 1 repetido: só "2 novos + unilateral"
  // fecha sem repetir — e é o que tem de sair, em qualquer sorteio.
  const comUni = catalogoForjado({
    core: {
      n1: forjado('N1', 'core'), n2: forjado('N2', 'core'), n3: forjado('N3', 'core'),
      u: forjado('U', 'core', { uni: true }), r: forjado('R', 'core'),
    },
  });
  const giros = SEMENTES.slice(0, 50).map((semente) => gerarHiit(ctx({ catalogo: comUni, semente, semanaPassada: new Set(['r']) })));
  ok(giros.every((g) => !idsDe(g).includes('r') && idsDe(g).includes('u') && !g.avisos.length),
    'rodízio vale para a estação inteira: prefere fechar com o unilateral novo a repetir a semana anterior');

  ok(igual(gerarHiit(ctx()), gerarHiit(ctx())), 'mesma semente, mesmo catálogo, mesmo inventário → mesmo HIIT');
  ok(new Set(SEMENTES.slice(0, 10).map((semente) => JSON.stringify(gerarHiit(ctx({ semente })).estacoes))).size > 1,
    'outra semente (variação) → outro HIIT');
  const ordemCatalogo = new Map([...catalogo.entries()].reverse());
  ok(igual(gerarHiit(ctx({ catalogo: ordemCatalogo })), gerarHiit(ctx())), 'a ordem em que o Firestore devolve o catálogo não muda o sorteio');
}

console.log('\nA semana com o HIIT (gerar, salvar, publicar, reconferir)');
{
  const LIM_H = { ...INVENTARIO_PADRAO };
  const w41 = gerarSemana({ semanaId: '2026-W41', catalogo, limites: LIM_H, diasDaSemanaAnterior: null });
  const w42 = gerarSemana({ semanaId: '2026-W42', catalogo, limites: LIM_H, diasDaSemanaAnterior: w41.dias });
  ok(igual(DIAS_SEMANA.filter((d) => w42.dias[d].hiit), ['sexta', 'sabado']), 'só sexta e sábado (os dias de HIIT da grade) têm estações');
  ok(igual(w42.dias.sexta.hiit, w42.dias.sabado.hiit), 'o MESMO HIIT nos dois dias');
  const h = w42.dias.sabado.hiit!;
  ok(h.estacoes.length === 4 && h.estacoes.every((e) => e.slots.length === 4 && e.protocolo === PROTOCOLO_HIIT),
    '4 estações × 4 slots, com o protocolo');
  ok(h.estacoes.every((e) => e.slots.every((x) => x.nome && x.consumoPorAluno)), 'cada slot gravado com nome e consumo por aluno');
  const h3 = new Set(w42.dias.sexta.blocoPrincipal.map((e) => e.exercicioId));
  ok(![...idsDoHiit(w42.dias)].some((id) => h3.has(id)), 'o HIIT não repete o H3 do dia');
  ok(![...idsDoHiit(w42.dias)].some((id) => idsDoHiit(w41.dias).has(id)), 'rodízio: nada do HIIT da W41 volta na W42');
  ok(!w42.alertasHiit.length && igual(w42.hiitFora.map((f) => f.exercicioId), ['sandbag_clean']),
    'sem alerta; só o clean com sandbag fica fora (turma de 6)');
  ok(!w42.avisos.some((a) => a.startsWith('HIIT:')), 'sem aviso do HIIT');
  ok(problemasParaPublicar(w42.dias, w42.alertas, w42.alertasHiit).length === 0, 'a semana gerada publica direto');
  ok(igual(gerarSemana({ semanaId: '2026-W42', catalogo, limites: LIM_H, diasDaSemanaAnterior: w41.dias }), w42), 'determinístico');
  const outra = gerarSemana({ semanaId: '2026-W42', catalogo, limites: LIM_H, diasDaSemanaAnterior: w41.dias, variacao: 1 });
  ok(!igual(outra.dias.sabado.hiit, h), '`variacao` sorteia outro HIIT');
  const so4 = gerarSemana({ semanaId: '2026-W42', catalogo, limites: LIM_H, diasDaSemanaAnterior: null, alunosPorAula: 4 });
  ok(!so4.hiitFora.length, 'turma de 4: nada fica fora por equipamento');

  // Reconferência (inventário salvo): a mesma conta, sem catálogo, a partir do gravado.
  const gravada = JSON.parse(JSON.stringify({ dias: w42.dias }));
  const igualAntes = reconferirSemana(gravada, LIM_H, 6)!;
  ok(!igualAntes.alertasHiit.length && !igualAntes.problemasParaPublicar.length, 'mesmo inventário e turma: nada muda');
  const usados = RECURSOS_HIIT.filter((r) => h.estacoes.some((e) => e.slots.some((x) => x.consumoPorAluno[r])));
  ok(usados.length > 0, `o HIIT de teste usa equipamento (${usados.join(', ')})`);
  const zerado = reconferirSemana(gravada, { ...LIM_H, ...Object.fromEntries(RECURSOS_HIIT.map((r) => [r, 0])) }, 6)!;
  ok(zerado.alertasHiit.length > 0 && zerado.alertasHiit.every((a) => igual(a.dias, ['sexta', 'sabado'])),
    'equipamento do HIIT todo em manutenção: alerta, UMA vez, com sexta e sábado');
  ok(zerado.problemasParaPublicar.some((p) => p.startsWith('sexta e sábado: ')), 'e vira motivo para não publicar');
  const r0 = usados[0];
  const turmaGrande = 4 * (LIMITES[r0] + 1);
  const cresceu = reconferirSemana(gravada, LIM_H, turmaGrande)!;
  ok(cresceu.alertasHiit.some((a) => a.recurso === r0), `turma de ${turmaGrande}: ${r0} passa do limite na reconferência`);
  const semHiit = reconferirSemana({ dias: { ...gravada.dias, sexta: { ...gravada.dias.sexta, hiit: null }, sabado: { ...gravada.dias.sabado, hiit: undefined } } }, LIM_H, 6)!;
  ok(!semHiit.alertasHiit.length && !semHiit.problemasParaPublicar.length, 'semana de antes do gerador (dia de HIIT sem estações) não trava');

  // lerDias: o pedido manda só ids; lado, nome, protocolo e consumo saem do servidor.
  const cru = (x: typeof h) => ({ estacoes: x.estacoes.map((e) => ({ estacao: e.estacao, slots: e.slots.map((y) => ({ exercicioId: y.exercicioId })) })) });
  const ler = (hiit: unknown, treinos = ['HIIT'], cat: ReadonlyMap<string, ItemCatalogo> = catalogo) => lerDias({ sabado: { treinos, hiit } }, cat);
  const relido = ler(cru(h));
  ok('dias' in relido && igual(relido.dias.sabado.hiit, h), 'o HIIT relido só dos ids sai igual ao gerado');
  const erro = (r: ReturnType<typeof ler>) => ('erro' in r ? r.erro : '');
  ok(erro(ler(cru(h), ['Cross'])).includes('só dia com HIIT'), 'estações em dia sem HIIT: erro');
  ok(erro(ler({ estacoes: cru(h).estacoes.slice(0, 3) })).includes('4 estações'), '3 estações: erro');
  const dobrada = cru(h);
  dobrada.estacoes[1] = { ...dobrada.estacoes[1], estacao: dobrada.estacoes[0].estacao };
  ok(erro(ler(dobrada)).includes('duas vezes'), 'estação repetida: erro');
  const pernas = (slots: string[]) => ({ estacoes: cru(h).estacoes.map((e) => (e.estacao === 'pernas' ? { estacao: 'pernas', slots: slots.map((exercicioId) => ({ exercicioId })) } : e)) });
  ok(erro(ler(pernas(['burpee']))).includes('não é da estação Pernas'), 'exercício de outra estação: erro');
  ok(erro(ler(pernas(['afundo_kb', 'agachamento_livre']))).includes('unilateral e ocupa 2 slots'), 'unilateral sem o segundo lado: erro');
  ok(erro(ler(pernas(['agachamento_livre', 'afundo_kb']))).includes('unilateral'), 'unilateral no último slot ocupado sem par: erro');
  ok(erro(ler(pernas(['supino_smith']))).includes('não é exercício de HIIT'), 'exercício de força sem hiit: erro');
  const uni = ler(pernas(['afundo_kb', 'afundo_kb', 'agachamento_livre', 'goblet_squat']));
  ok('dias' in uni && igual(uni.dias.sabado.hiit!.estacoes.find((e) => e.estacao === 'pernas')!.slots.map((x) => x.lado), ['D', 'E', null, null]),
    'unilateral em 2 slots seguidos vira lado D e lado E');
  const duasEstacoes = new Map(catalogo);
  duasEstacoes.set('burpee', { ...CATALOGO_HIIT.burpee, hiit: { estacoes: ['pernas', 'cardio'] } });
  const comBurpee = cru(h);
  comBurpee.estacoes = comBurpee.estacoes.map((e) => (e.estacao === 'pernas' || e.estacao === 'cardio' ? { ...e, slots: [{ exercicioId: 'burpee' }] } : e));
  ok(erro(ler(comBurpee, ['HIIT'], duasEstacoes)).includes('aparece duas vezes no HIIT'), 'o mesmo exercício em duas estações: erro');
  ok(erro(lerDias({ segunda: { treinos: ['H1'], blocoPrincipal: [{ exercicioId: 'burpee', series: 3, repeticoes: '10' }] } }, catalogo)).includes('só de HIIT'),
    'exercício só de HIIT no bloco de força: erro');

  const incompleta = ler(pernas(['agachamento_livre', 'goblet_squat', 'kb_swing']));
  ok('dias' in incompleta && problemasParaPublicar(incompleta.dias, []).some((p) => p.includes('Pernas do HIIT tem 3 de 4 slots')),
    'rascunho aceita estação incompleta; publicar não');
  // Repetição no dia: o agachamento no TRX no H3 E no HIIT da sexta.
  const repete = lerDias({
    sexta: {
      treinos: ['H3', 'HIIT'],
      blocoPrincipal: [{ exercicioId: 'agachamento_trx', series: 4, repeticoes: '8-12' }],
      hiit: pernas(['agachamento_trx', 'goblet_squat', 'kb_swing', 'agachamento_livre']),
    },
  }, catalogo);
  ok('dias' in repete && problemasParaPublicar(repete.dias, []).some((p) => p.includes('Agachamento no TRX está no bloco do H3 e no HIIT')),
    'o mesmo exercício no H3 e no HIIT do dia: não publica');

  // A troca manual do bloco H manda os dias SEM o hiit: o servidor preserva o gravado.
  const pedido = JSON.parse(JSON.stringify(w42.dias));
  for (const d of DIAS_SEMANA) delete pedido[d].hiit;
  const preservado = diasComConteudoGravado(pedido, w42.dias) as Record<string, { hiit?: unknown }>;
  ok(igual(preservado.sabado.hiit, w42.dias.sabado.hiit) && igual(preservado.sexta.hiit, w42.dias.sexta.hiit),
    'troca manual do H (pedido sem hiit) mantém o HIIT gravado');
  const relidoPedido = lerDias(preservado, catalogo);
  ok('dias' in relidoPedido && igual(relidoPedido.dias.sabado.hiit, h), 'e a semana salva continua com o mesmo HIIT');
  const apagar = diasComConteudoGravado({ ...pedido, sabado: { ...pedido.sabado, hiit: null } }, w42.dias) as Record<string, { hiit?: unknown }>;
  ok(apagar.sabado.hiit === null, '`hiit: null` no pedido apaga de propósito');

  // Trava de semana publicada: o HIIT de um dia que passou também não muda.
  const datas = intervaloDaSemana('2026-W42')!.datas;
  const depois = JSON.parse(JSON.stringify(w42.dias));
  depois.sabado.hiit = outra.dias.sabado.hiit;
  ok(igual(diasPassadosAlterados(w42.dias, depois, datas, '2026-10-19'), ['sabado']), 'mudar o HIIT de um dia que passou é pego pela trava');
  const legado = JSON.parse(JSON.stringify(w42.dias));
  for (const d of DIAS_SEMANA) delete legado[d].hiit;
  const comNull = JSON.parse(JSON.stringify(legado));
  for (const d of DIAS_SEMANA) comNull[d].hiit = null;
  ok(!diasPassadosAlterados(legado, comNull, datas, '2026-10-19').length, 'hiit ausente e hiit null são o mesmo dia (semana antiga salva de novo)');
}

console.log('\nTroca manual do HIIT (edicao-hiit)');
{
  // Uma semana montada à mão para controlar cada conflito. O H3 da sexta e do
  // sábado tem a ponte de glúteo (que também é de HIIT, Pernas).
  const cru = (porEstacao: Record<string, string[]>) => ({
    estacoes: Object.entries(porEstacao).map(([estacao, ids]) => ({ estacao, slots: ids.map((exercicioId) => ({ exercicioId })) })),
  });
  const montar = (porEstacao: Record<string, string[]>) => {
    const h = lerHiit(cru(porEstacao), catalogo, 'sabado');
    if ('erro' in h) throw new Error(h.erro);
    const dia = (papelH3: 'principal' | 'alternativa') => ({
      treinos: papelH3 === 'principal' ? ['H3', 'HIIT'] : ['HIIT', 'H3'],
      sessaoForca: { sessao: 'H3', papel: papelH3, nome: 'Consolidação Full Body' },
      blocoPrincipal: [{ exercicioId: 'ponte_gluteo', nome: 'Ponte de glúteo no chão' }],
      hiit: h.hiit,
    });
    return { segunda: { treinos: ['H1'], sessaoForca: { sessao: 'H1' }, blocoPrincipal: [] }, sexta: dia('principal'), sabado: dia('alternativa') };
  };
  const BASE = {
    pernas: ['kb_swing', 'agachamento_livre', 'afundo_reverso', 'afundo_reverso'],
    core: ['fallout_trx', 'abdominal_supra', 'abdominal_bicicleta', 'abdominal_remador'],
    superiores: ['thruster_wallball', 'flexao', 'flexao_pike', 'thruster_halteres'],
    cardio: ['burpee', 'polichinelo', 'high_knees', 'mountain_climber'],
  };
  const dias = montar(BASE);
  const op = (o: { estacao: string; slot: number; limites?: Record<RecursoHiit, number>; passada?: string[]; d?: unknown }) => opcoesDoHiit({
    dias: o.d ?? dias, estacao: o.estacao, slot: o.slot, catalogo, limites: o.limites ?? LIMITES, alunosPorAula: 6,
    semanaPassada: new Set(o.passada ?? []),
  })!;
  const de = (r: OpcoesDoHiit, id: string) => r.opcoes.find((x) => x.exercicioId === id)!;

  const kb = op({ estacao: 'pernas', slot: 1 });
  ok(igual(kb.vaga, { estacao: 'pernas', nome: 'Pernas', slots: [1], unilateral: false, dias: ['sexta', 'sabado'], atual: { exercicioId: 'kb_swing', nome: 'Kettlebell swing' } }),
    'a vaga: Pernas, slot 1, o kettlebell swing, valendo para sexta e sábado', JSON.stringify(kb.vaga));
  ok(kb.opcoes.every((x) => catalogo.get(x.exercicioId)!.hiit!.estacoes.includes('pernas')) && !de(kb, 'kb_swing'),
    'só exercícios de Pernas, sem o atual');
  ok(!de(kb, 'goblet_squat').bloqueada && !temAlgum(de(kb, 'goblet_squat').conflitos), 'goblet: livre');
  ok(de(kb, 'agachamento_livre').conflitos.noHiit && de(kb, 'agachamento_livre').bloqueada, 'já no HIIT (slot 2): bloqueado');
  ok(de(kb, 'afundo_kb').conflitos.tamanhoDiferente && de(kb, 'afundo_kb').bloqueada, 'unilateral no lugar de bilateral: tamanho diferente, bloqueado');
  ok(igual(de(kb, 'sandbag_clean').conflitos.equipamento, [{ recurso: 'sandbag', usado: 2, limite: 1, slot: null }]) && de(kb, 'sandbag_clean').bloqueada,
    'sandbag para 2 alunos com 1 no box: bloqueado');
  ok(igual(de(kb, 'agachamento_trx').conflitos.fixoEmOutraEstacao, [{ recurso: 'trx', estacoes: ['core'] }]) && de(kb, 'agachamento_trx').bloqueada,
    'TRX com o Core já no TRX: bloqueado pela regra espacial');
  ok(igual(de(kb, 'ponte_gluteo').conflitos.noBlocoDoDia, [{ sessao: 'H3', dias: ['sexta', 'sabado'] }]) && de(kb, 'ponte_gluteo').bloqueada,
    'ponte de glúteo está no H3 do dia: bloqueado');
  ok(!de(kb, 'wall_ball_shot').bloqueada, 'wall ball shot com 4 bolas no box: livre (2 + 2 no slot 1)');
  const poucasBolas = op({ estacao: 'pernas', slot: 1, limites: { ...LIMITES, wallBall: 2 } });
  ok(igual(de(poucasBolas, 'wall_ball_shot').conflitos.equipamento, [{ recurso: 'wallBall', usado: 4, limite: 2, slot: 1 }]),
    'com 2 bolas: o thruster de Superiores no mesmo slot soma 4 — bloqueado pela soma do slot');

  const rod = op({ estacao: 'pernas', slot: 1, passada: ['goblet_squat'] });
  ok(de(rod, 'goblet_squat').conflitos.semanaAnterior && !de(rod, 'goblet_squat').bloqueada, 'rodízio quebrado: aviso, não bloqueia');
  const grupos = rod.opcoes.map((x) => (x.bloqueada ? 2 : x.conflitos.semanaAnterior ? 1 : 0));
  ok(igual(grupos, [...grupos].sort((a, b) => a - b)), 'ordem: livres, rodízio, bloqueados');

  const uniD = op({ estacao: 'pernas', slot: 3 });
  const uniE = op({ estacao: 'pernas', slot: 4 });
  ok(igual(uniD.vaga.slots, [3, 4]) && uniD.vaga.unilateral && igual(uniE.vaga, uniD.vaga), 'unilateral: tocar no D ou no E é a mesma vaga (slots 3 e 4)');
  ok(!de(uniD, 'afundo_kb').bloqueada && de(uniD, 'goblet_squat').conflitos.tamanhoDiferente, 'unilateral troca por unilateral; bilateral fica bloqueado');

  const trocado = estacoesComTroca(estacoesDaSemana(dias)!, 'pernas', 3, 2, 'afundo_kb');
  const relido = lerHiit({ estacoes: trocado }, catalogo, 'sabado');
  ok('hiit' in relido && igual(relido.hiit.estacoes[0].slots.map((x) => [x.exercicioId, x.lado]),
    [['kb_swing', null], ['agachamento_livre', null], ['afundo_kb', 'D'], ['afundo_kb', 'E']]),
  'a troca do unilateral ocupa os dois slots e o servidor aceita (D e E)');
  ok(op({ estacao: 'pernas', slot: 1, d: { sexta: { treinos: ['HIIT'] } } }) === null && op({ estacao: 'pernas', slot: 9 }) === null,
    'semana sem HIIT ou vaga que não existe: null');

  const datas = { segunda: '2026-10-19', terca: '2026-10-20', quarta: '2026-10-21', quinta: '2026-10-22', sexta: '2026-10-23', sabado: '2026-10-24' } as Record<DiaSemana, string>;
  ok(!hiitTravado(dias, datas, '2026-10-23') && hiitTravado(dias, datas, '2026-10-24'), 'trava: na sexta ainda dá; no sábado a sexta já passou');
  ok(igual(diasDoHiit(dias), ['sexta', 'sabado']), 'o HIIT da semana está na sexta e no sábado');

  // O bônus: a troca do H3 enxerga o HIIT do dia.
  const h3 = conflitosDaTroca({
    dias, sessao: 'H3', posicao: 1, exercicioId: 'fallout_trx', catalogo: catalogoForca, limites: { ...INVENTARIO_PADRAO }, semanaPassada: new Set(),
  });
  ok(igual(h3.noHiit, ['sexta', 'sabado']), 'H3 → exercício que já está no HIIT do dia: conflito "no HIIT" (sexta e sábado)');
  const h1 = conflitosDaTroca({
    dias, sessao: 'H1', posicao: 1, exercicioId: 'fallout_trx', catalogo: catalogoForca, limites: { ...INVENTARIO_PADRAO }, semanaPassada: new Set(),
  });
  ok(igual(h1.noHiit, []), 'H1 (segunda, sem HIIT): sem esse conflito');
}

console.log(falhas ? `\n✗ ${falhas} verificação(ões) falharam.\n` : '\n✓ HIIT: tudo certo.\n');
process.exitCode = falhas ? 1 : 0;
