/**
 * Confere o Cross e o Hyrox do box sem rede e sem emulador.
 *
 *     npm run checar:cross
 *
 * Cobre o catálogo do Cross (`cross` nos itens e `catalogo-cross.ts`), as
 * estações do Hyrox (`catalogo-hyrox.ts`), a prescrição (RX, Scaled, formato,
 * nível), a conta de equipamento MISTA do WOD (`conta-cross.ts`), os dois
 * geradores (formato, padrões, cardio, rodízio, substituta, determinismo), a
 * validação do pedido de salvar, a publicação, a reconferência e a semana inteira.
 */
import { CATALOGO_COMPLETO } from './catalogo-completo';
import { CATALOGO_CROSS } from './catalogo-cross';
import { CORRIDA_HYROX, DADOS_ESTACAO_HYROX, MUSCULOS_CORRIDA_HYROX, MUSCULOS_HYROX } from './catalogo-hyrox';
import { blocosDoWod, catalogoDoHyrox, lerRegistroCross, lerRegistroHyrox, seriesDaTecnica } from './volume-cross-hyrox';
import {
  CATEGORIAS_FOCO, ESTACOES_HYROX, FORMATOS_CROSS, FORMATOS_HYROX, NIVEIS_HYROX, PADROES_CROSS, REGRA_FORMATO_CROSS,
  REGRA_FORMATO_HYROX,
  type DiaSemana, type FormatoCross, type ItemCatalogo, type RecursoBox, type RecursoCross,
} from './modelo-box';
import {
  aplicarInventario, arredondarPrescricao, contaDaSemana, diasComConteudoGravado, intervaloDaSemana, lerCross, lerDias,
  lerExercicioCatalogo, lerHyrox, lerInventario, lerItemCatalogo, montarHyrox, movimentoCross, problemasParaPublicar,
  reconferirSemana, tecnicaDoWod, volumeDaSessao,
} from './semana-box';
import { diasPassadosAlterados } from './edicao-box';
import { bloqueiaCross, conflitosDoCross, conteudoTravado, opcoesDoCross, opcoesDoHyrox } from './edicao-cross';
import { alunosPorMovimento, consumoCross, contarCross } from './conta-cross';
import { gerarCross, type ContextoCross } from './gerador-cross';
import { gerarHyrox } from './gerador-hyrox';
import { crossDaSemana, gerarSemana, hyroxDaSemana } from './gerador-box';
import { MAX_CARACTERES_ESTRATEGIA, nomeCurto, quebrarSeries } from './estrategia-cross';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Os problemas MENOS o "dia sem aula precisa do motivo": as semanas de teste aqui têm só terça e quinta. */
const semOMotivo = (p: string[]) => p.filter((x) => !x.includes('dia sem aula precisa do motivo'));

const catalogo = new Map<string, ItemCatalogo>(Object.entries(CATALOGO_COMPLETO));
const INV = lerInventario(undefined);
const LIMITES = INV.limitesAtivos;
const LIM_CROSS = LIMITES as Record<RecursoCross, number>;
const SEMENTES = Array.from({ length: 300 }, (_, i) => `2026-W42:Cross:${i}`);
const doCross = [...catalogo].filter(([, i]) => i.cross).map(([id]) => id);
const comBarra = new Set(doCross.filter((id) => consumoCross(catalogo.get(id)!).barraOlimpica));

const ctx = (o: Partial<ContextoCross> = {}): ContextoCross => ({
  catalogo, limites: { ...LIM_CROSS }, alunosPorAula: 6, semente: '2026-W42:Cross:0', ...o,
});
/** Um WOD com movimentos do catálogo real, calculado. */
const wod = (formato: FormatoCross, ids: string[]) => ({
  formato, movimentos: ids.map((id) => movimentoCross(id, catalogo.get(id) as ItemCatalogo & { cross: NonNullable<ItemCatalogo['cross']> }, formato)),
});
const erro = (r: object) => ('erro' in r ? String((r as { erro: string }).erro) : '');

/* ───────────────────────────── catálogo ───────────────────────────── */

console.log('\nCatálogo do Cross');
{
  const tortos = Object.entries(CATALOGO_COMPLETO).filter(([, item]) => !lerItemCatalogo(item)).map(([id]) => id);
  ok(!tortos.length, 'todo item do catálogo completo é lido pelo servidor', tortos.join(', '));
  ok(doCross.length >= 30, `o pool do Cross tem ${doCross.length} movimentos (≥ 30)`);
  for (const p of PADROES_CROSS) {
    const n = doCross.filter((id) => catalogo.get(id)!.cross!.padrao === p).length;
    ok(n >= 2, `padrão ${p}: ${n} movimentos (≥ 2, para o rodízio ter opção)`);
  }
  ok(Object.values(CATALOGO_CROSS).every((i) => i.instancia === null && !i.hiit && i.cross),
    'catalogo-cross.ts: só itens sem instância, sem HIIT e com cross');
  ok(Object.keys(CATALOGO_CROSS).every((id) => !lerExercicioCatalogo(CATALOGO_CROSS[id])),
    'item só de Cross NÃO entra no catálogo de força (o bloco H nunca o vê)');
  ok(comBarra.size >= 7, `${comBarra.size} movimentos de barra olímpica (os aprovados, do chão)`);
  ok([...comBarra].every((id) => catalogo.get(id)!.cross!.carga), 'todo movimento de barra tem carga RX/Scaled');

  const base = { nome: 'X', musculoPrincipal: ['core'], musculosSecundarios: [], equipamentos: ['peso_corporal'], adaptacoes: {} };
  const cross = { padrao: 'core', unidade: 'reps', rx: 10 };
  ok(lerItemCatalogo({ ...base, cross })?.instancia === null, 'sem instância e com cross = só Cross');
  ok(lerItemCatalogo({ ...base }) === null, 'sem instância, sem hiit e sem cross: torto');
  ok(lerItemCatalogo({ ...base, cross: { ...cross, padrao: 'dancar' } }) === null, 'padrão desconhecido: torto');
  ok(lerItemCatalogo({ ...base, cross: { ...cross, unidade: 'voltas' } }) === null, 'unidade desconhecida: torto');
  ok(lerItemCatalogo({ ...base, cross: { ...cross, rx: 0 } }) === null, 'RX zero: torto');
  ok(lerItemCatalogo({ ...base, cross: { ...cross, carga: { rx: '40 kg' } } }) === null, 'carga sem o Scaled: torto');
  ok(lerItemCatalogo({ ...base, cross: { ...cross, consumoPorAluno: { sled: 1 } } }) === null, 'consumo de recurso que não é do Cross: torto');
  ok(lerItemCatalogo({ ...base, instancia: 'agachar', cross })?.cross?.rx === 10, 'item de força com cross mantém os dois');

  ok(igual(consumoCross(catalogo.get('farmer_carry_kb')!), { kettlebell: 2 }), 'farmer: 2 kettlebells por aluno');
  ok(igual(consumoCross(catalogo.get('power_clean')!), { barraOlimpica: 1 }), 'power clean: 1 barra por aluno');
  ok(igual(consumoCross(catalogo.get('wall_ball_shot')!), { wallBall: 1 }), 'wall ball: 1 bola por aluno');
  ok(igual(consumoCross(catalogo.get('corrida')!), {}), 'corrida: nenhum equipamento');
}

/* ───────────────────────────── prescrição ───────────────────────────── */

console.log('\nPrescrição (RX, Scaled e formato)');
{
  ok(arredondarPrescricao(10.5, 'reps') === 11 && arredondarPrescricao(37.5, 'reps') === 40, 'reps: inteiro até 20, de 5 em 5 depois');
  ok(arredondarPrescricao(15, 'metros') === 15 && arredondarPrescricao(70, 'metros') === 70 && arredondarPrescricao(140, 'metros') === 150,
    'metros: de 5 em 5 até 50, de 10 em 10 até 100, de 50 em 50 depois');
  ok(arredondarPrescricao(21.4, 'calorias') === 21 && arredondarPrescricao(18, 'segundos') === 20, 'calorias inteiras; segundos de 5 em 5');
  ok(arredondarPrescricao(0.2, 'reps') === 1 && arredondarPrescricao(1, 'metros') === 5, 'nunca zero');

  const swing = (f: FormatoCross) => wod(f, ['kb_swing']).movimentos[0];
  ok(swing('AMRAP').rx === 15 && swing('AMRAP').scaled === 11, 'AMRAP: RX = RX-base (15), Scaled −30% (11)');
  ok(swing('EMOM').rx === 9 && swing('EMOM').scaled === 6, 'EMOM: RX × 0,6 (9), Scaled 6');
  ok(swing('Chipper').rx === 30 && swing('Chipper').scaled === 20, 'Chipper: RX × 2 (cap de 15 min com a Técnica antes), Scaled 21 → 20');
  const kb = swing('AMRAP');
  ok(igual(kb.carga, { rx: '16/12 kg', scaled: '12/8 kg' }), 'a carga RX/Scaled vem do catálogo');
  ok(wod('AMRAP', ['afundo_kb']).movimentos[0].porLado && !kb.porLado, 'unilateral: a quantidade é por lado');
  ok(wod('AMRAP', ['corrida']).movimentos[0].rx === 200 && wod('AMRAP', ['corrida']).movimentos[0].scaled === 150, 'corrida: 200 m RX, 150 m Scaled');
}

/* ───────────────────────────── conta mista ───────────────────────────── */

console.log('\nEquipamento do WOD (regra mista)');
{
  ok(alunosPorMovimento('AMRAP', 6, 3) === 2 && alunosPorMovimento('Chipper', 6, 5) === 2, 'escalonado: a turma se divide pelos movimentos (6 ÷ 3 = 2)');
  ok(alunosPorMovimento('EMOM', 6, 3) === 6, 'EMOM: a turma inteira no mesmo movimento');

  const duas = contarCross(wod('AMRAP', ['corrida', 'power_clean', 'thruster_barra']), LIM_CROSS, 6);
  ok(!duas.alertas.length && duas.consumo.barraOlimpica === 4, 'AMRAP com 2 movimentos de barra, turma de 6: 2 + 2 = 4 barras, cabe');
  const tres = contarCross(wod('AMRAP', ['power_clean', 'thruster_barra', 'sdhp_barra']), LIM_CROSS, 6);
  ok(tres.alertas.length === 1 && tres.alertas[0].usado === 6 && tres.alertas[0].exercicios.length === 3,
    'AMRAP com 3 movimentos de barra: 6 barras de 4, UM alerta com os 3 movimentos');
  const emom = contarCross(wod('EMOM', ['corrida', 'wall_ball_shot', 'abdominal_supra']), LIM_CROSS, 6);
  ok(emom.alertas.length === 1 && emom.alertas[0].usado === 6 && emom.alertas[0].recurso === 'wallBall',
    'EMOM com wall ball, turma de 6: 6 bolas no mesmo minuto, o box tem 4 → alerta');
  ok(!contarCross(wod('EMOM', ['corrida', 'wall_ball_shot', 'abdominal_supra']), LIM_CROSS, 4).alertas.length, 'o mesmo EMOM com turma de 4: cabe');
  const emom2 = contarCross(wod('EMOM', ['corrida', 'power_clean', 'thruster_barra']), LIM_CROSS, 4);
  ok(!emom2.alertas.length && emom2.consumo.barraOlimpica === 4,
    'no EMOM os movimentos NÃO somam: 2 movimentos de barra, turma de 4 = 4 barras (minutos diferentes)');
  const sandbag = contarCross(wod('AMRAP', ['corrida', 'sandbag_clean', 'flexao']), LIM_CROSS, 6);
  ok(sandbag.alertas.some((a) => a.recurso === 'sandbag' && a.usado === 2), 'sandbag no AMRAP com turma de 6: 2 alunos, 1 sandbag → alerta');
  ok(!contarCross(wod('AMRAP', ['corrida', 'sandbag_clean', 'flexao']), LIM_CROSS, 3).alertas.length, 'o mesmo com turma de 3: 1 aluno por movimento, cabe');
}

/* ───────────────────────────── gerador do WOD ───────────────────────────── */

console.log('\nGerador do WOD');
{
  const todos = SEMENTES.map((semente) => gerarCross(ctx({ semente })));
  const fora = todos.filter((g) => {
    const [min, max] = REGRA_FORMATO_CROSS[g.wod.formato].movimentos;
    return g.wod.movimentos.length < min || g.wod.movimentos.length > max;
  });
  ok(!fora.length, `${SEMENTES.length} sorteios: a quantidade de movimentos é sempre a do formato`);
  ok(todos.every((g) => g.wod.movimentos[0].padrao === 'cardio'), 'o WOD sempre abre com um cardio');
  ok(todos.every((g) => new Set(g.wod.movimentos.map((m) => m.padrao)).size === g.wod.movimentos.length), 'nenhum WOD repete padrão');
  ok(todos.every((g) => !g.alertas.length && !g.avisos.length), 'com o inventário de fábrica e turma de 6: nenhum alerta, nenhum aviso');
  const formatos = new Set(todos.map((g) => g.wod.formato));
  ok(formatos.size === FORMATOS_CROSS.length, 'os 4 formatos aparecem');
  const padroes = new Set(todos.flatMap((g) => g.wod.movimentos.map((m) => m.padrao)));
  ok(padroes.size === PADROES_CROSS.length, 'todos os padrões aparecem (o sorteio não fica preso ao padrão com mais itens)');
  const usados = new Set(todos.flatMap((g) => g.wod.movimentos.map((m) => m.exercicioId)));
  ok(usados.size >= doCross.length - 3, `${usados.size} de ${doCross.length} movimentos aparecem em ${SEMENTES.length} sorteios`);
  ok(todos.some((g) => g.wod.movimentos.some((m) => comBarra.has(m.exercicioId))), 'a barra olímpica entra no sorteio');
  ok(todos.filter((g) => g.wod.formato === 'EMOM').every((g) => !g.wod.movimentos.some((m) => comBarra.has(m.exercicioId) || m.exercicioId === 'wall_ball_shot')),
    'EMOM com turma de 6: nunca barra (4) nem wall ball (4) — a turma inteira no mesmo minuto');

  const tempoOk = todos.every(({ wod: w }) => {
    if (w.formato === 'AMRAP') return w.rodadas === null && w.minutos >= 12 && w.minutos <= 15;
    if (w.formato === 'For Time') return w.rodadas !== null && w.minutos === Math.min(15, w.rodadas * 4);
    if (w.formato === 'EMOM') return w.rodadas !== null && w.minutos === w.rodadas * w.movimentos.length && w.minutos >= 12 && w.minutos <= 15;
    return w.rodadas === null && w.minutos === 15;
  });
  ok(tempoOk, 'tempo, com a Técnica antes (aula de 60 min): AMRAP 12–15; For Time 3 ou 4 rodadas, cap 12 ou 15; EMOM 12–15; Chipper 15');
  ok(todos.every(({ wod: w }) => w.minutos <= 15), 'nenhum WOD passa de 15 min');
  ok(todos.some(({ wod: w }) => w.formato === 'For Time' && w.rodadas === 4 && w.minutos === 15),
    'For Time de 4 rodadas com cap 15, como a aula de 06/10');

  const a = gerarCross(ctx({ semente: 's1' }));
  ok(igual(a, gerarCross(ctx({ semente: 's1' }))), 'determinístico: mesma semente, mesmo WOD');
  ok(!igual(a.wod, gerarCross(ctx({ semente: 's2' })).wod), 'outra semente, outro WOD');

  // Rodízio: formato e movimentos da semana anterior.
  let semFormatoRepetido = true;
  const repeticoes: string[] = [];
  for (const semente of SEMENTES.slice(0, 100)) {
    const antes = gerarCross(ctx({ semente: `${semente}:antes` }));
    const depois = gerarCross(ctx({ semente, semanaPassada: { formato: antes.wod.formato, ids: new Set(antes.cru.movimentos.map((m) => m.exercicioId)) } }));
    if (depois.wod.formato === antes.wod.formato) semFormatoRepetido = false;
    const rep = depois.cru.movimentos.filter((m) => antes.cru.movimentos.some((x) => x.exercicioId === m.exercicioId));
    repeticoes.push(...rep.map((m) => `${depois.wod.formato}:${m.exercicioId}`));
  }
  ok(semFormatoRepetido, 'rodízio: o formato nunca repete o da semana anterior (100 pares)');
  ok(!repeticoes.length, 'rodízio: nenhum movimento repete o WOD da semana anterior (100 pares)', repeticoes.join(', '));

  // O EMOM exige equipamento para a turma INTEIRA no mesmo minuto: com 6
  // alunos, air bike e cordas (2 de cada) não cabem. Os cardios sem
  // equipamento (shuttle run, polichinelo, high knees, mountain climber,
  // aprovados em 06/10/2026) é que dão variedade a ele.
  const emoms = SEMENTES.map((semente) => gerarCross(ctx({ semente }))).filter((g) => g.wod.formato === 'EMOM');
  const cardiosEmom = new Set(emoms.map((g) => g.wod.movimentos[0].exercicioId));
  ok(emoms.length > 0 && !['air_bike_sprint', 'pular_corda', 'corda_naval'].some((id) => cardiosEmom.has(id)),
    'EMOM com turma de 6: nunca air bike nem cordas (2 de cada)');
  ok(cardiosEmom.size >= 4, `EMOM com turma de 6: o cardio varia (${[...cardiosEmom].join(', ')})`);

  // Rodízio é REGRA, não só ordem: com todos os cardios menos um na semana
  // anterior, o WOD usa o cardio novo, mesmo que ele seja o último da fila.
  // (Fora do EMOM, onde o cardio com equipamento não cabe: o formato da
  // semana anterior vai para o fim da fila, então passada = EMOM o tira.)
  const cardios = doCross.filter((id) => catalogo.get(id)!.cross!.padrao === 'cardio');
  for (const novo of cardios) {
    const passada = new Set(cardios.filter((id) => id !== novo));
    const g = gerarCross(ctx({ semente: `cardio:${novo}`, semanaPassada: { formato: 'EMOM', ids: passada } }));
    ok(g.wod.movimentos[0].exercicioId === novo, `só ${novo} é cardio novo: é ele que abre o WOD`);
  }

  // Sem opção nova, repete o MÍNIMO — com aviso. Catálogo com a corrida como
  // único cardio, e a semana anterior com corrida E kettlebell swing: a
  // corrida tem de voltar, o swing não (há outros padrões). Sem a regra do
  // mínimo, a busca pegaria o swing sempre que o padrão "quadril" saísse
  // cedo no sorteio (o terra não cabe no EMOM com 6).
  const soUmCardio = new Map([...catalogo].filter(([id, i]) => i.cross?.padrao !== 'cardio' || id === 'corrida'));
  const repetiu = gerarCross(ctx({ catalogo: soUmCardio, semanaPassada: { formato: null, ids: new Set(['corrida']) } }));
  ok(repetiu.wod.movimentos[0].exercicioId === 'corrida' && repetiu.avisos.some((x) => x.includes('repete')),
    'único cardio do catálogo estava na semana anterior: volta, com aviso');
  const minimo = SEMENTES.map((semente) =>
    gerarCross(ctx({ catalogo: soUmCardio, semente, semanaPassada: { formato: null, ids: new Set(['corrida', 'kb_swing']) } })));
  ok(minimo.every((g) => g.cru.movimentos.every((m) => m.exercicioId !== 'kb_swing') && g.avisos.filter((a) => a.includes('repete')).length === 1),
    `corrida + swing na semana anterior, só a corrida como cardio (${minimo.length} sorteios): repete só a corrida, nunca o swing`);

  // Inventário apertado.
  const semBarra = SEMENTES.slice(0, 100).map((semente) => gerarCross(ctx({ semente, limites: { ...LIM_CROSS, barraOlimpica: 0 } })));
  ok(semBarra.every((g) => !g.wod.movimentos.some((m) => comBarra.has(m.exercicioId)) && !g.alertas.length),
    'barras em manutenção (0): nenhum movimento de barra, nenhum alerta');
  const turmaGrande = SEMENTES.slice(0, 100).map((semente) => gerarCross(ctx({ semente, alunosPorAula: 12 })));
  ok(turmaGrande.every((g) => !g.alertas.length), 'turma de 12: o gerador ainda acha WOD que cabe (100 sorteios)');

  // Sem combinação que caiba: monta e alerta.
  const zero = Object.fromEntries(Object.keys(LIM_CROSS).map((r) => [r, 0])) as Record<RecursoCross, number>;
  const soEquipado = new Map([...catalogo].filter(([, i]) => i.cross && Object.keys(consumoCross(i)).length));
  const apertado = gerarCross(ctx({ catalogo: soEquipado, limites: zero }));
  ok(apertado.wod.movimentos.length >= 3 && apertado.alertas.length > 0 && apertado.avisos.some((x) => x.includes('inventário')),
    'nada cabe no inventário: o WOD sai inteiro, com alerta e aviso');
  // Catálogo sem cardio: sai incompleto, com aviso.
  const semCardio = new Map([...catalogo].filter(([, i]) => i.cross?.padrao !== 'cardio'));
  const incompleto = gerarCross(ctx({ catalogo: semCardio }));
  ok(incompleto.avisos.some((x) => x.includes('não fecha')), 'catálogo sem cardio: aviso de que não fecha');
}

/* ───────────────────────────── Hyrox ───────────────────────────── */

console.log('\nEstações e formatos do Hyrox');
{
  ok(igual(ESTACOES_HYROX.map((e) => DADOS_ESTACAO_HYROX[e].n), [1, 2, 3, 4, 5, 6, 7, 8]), 'as 8 estações, na ordem da prova');
  ok(ESTACOES_HYROX.every((e) => {
    const p = DADOS_ESTACAO_HYROX[e].prescricao;
    return p.iniciante < p.intermediario && p.intermediario < p.avancado && p.avancado <= p.competicao;
  }), 'a prescrição sobe com o nível');
  ok(DADOS_ESTACAO_HYROX.burpee_broad_jump.substituta === null && ESTACOES_HYROX.filter((e) => DADOS_ESTACAO_HYROX[e].substituta).length === 7,
    'toda estação com equipamento tem substituta; o Burpee Broad Jump não precisa');
  ok(ESTACOES_HYROX.every((e) => {
    const d = DADOS_ESTACAO_HYROX[e];
    return !d.substituta || !Object.keys(d.recursos).some((r) => r in d.substituta!.recursos);
  }), 'a substituta não usa nenhum equipamento da original');
  for (const f of FORMATOS_HYROX) {
    const est = REGRA_FORMATO_HYROX[f].estacoes;
    ok(typeof est === 'number' ? est === 4 : est.length >= 4, `${f}: ${typeof est === 'number' ? `sorteia ${est}` : `${est.length} estações fixas`}`);
  }

  const prova = montarHyrox('prova', ESTACOES_HYROX.map((estacao) => ({ estacao, substituta: false })));
  ok(prova.estacoes.length === 8 && prova.rodadas === 1, 'prova: 8 estações, 1 rodada');
  ok(igual(NIVEIS_HYROX.map((n) => prova.corrida[n].metros), [100, 300, 500, 1000]), 'prova: corrida 100/300/500/1000 m por nível');
  ok(prova.estacoes[7].prescricao.intermediario === 50 && prova.estacoes[7].nome === 'Wall ball', 'prova: wall ball 50 no intermediário');
  const metade = montarHyrox('metadeA', ESTACOES_HYROX.slice(0, 4).map((estacao) => ({ estacao, substituta: false })));
  ok(igual(NIVEIS_HYROX.map((n) => metade.corrida[n].metros), [200, 600, 1000, 2000]), 'metade A: corrida dobrada');
  ok(CORRIDA_HYROX.iniciante.bikeSeg === 48 && metade.corrida.iniciante.bikeSeg === 95,
    'metade A: a air bike dobra junto (48 s → 96 → 95 s, de 5 em 5)');
  const comp = montarHyrox('compromised', [{ estacao: 'sled_push', substituta: false }, { estacao: 'wall_ball', substituta: false }]);
  ok(comp.estacoes[0].prescricao.intermediario === 15 && comp.estacoes[1].prescricao.intermediario === 25 && comp.rodadas === 2,
    'compromised: metade da estação (sled 30 → 15 m, wall ball 50 → 25), 2 rodadas');
  const sub = montarHyrox('prova', ESTACOES_HYROX.map((estacao) => ({ estacao, substituta: estacao === 'remo' })));
  ok(sub.estacoes[4].nome === 'Air bike' && sub.estacoes[4].tipo === 'calorias' && sub.estacoes[4].base === 'Rowing' && sub.estacoes[4].substituta,
    'substituta: nome, tipo e prescrição dela; a base continua a da prova');
}

console.log('\nGerador do Hyrox');
{
  const todos = SEMENTES.map((s) => gerarHyrox({ limites: LIMITES, semente: s.replace('Cross', 'Hyrox') }));
  ok(new Set(todos.map((g) => g.hyrox.formato)).size === 4, 'os 4 formatos aparecem');
  ok(todos.every((g) => !g.alertas.length && !g.avisos.length), 'inventário de fábrica: nenhum alerta, nenhuma substituta');
  const comps = todos.filter((g) => g.hyrox.formato === 'compromised');
  ok(comps.every((g) => g.hyrox.estacoes.length === 4 && g.hyrox.estacoes.every((e, i, l) => i === 0 || l[i - 1].n < e.n)),
    'compromised: 4 estações distintas, na ordem da prova');
  ok(new Set(comps.map((g) => g.hyrox.estacoes.map((e) => e.estacao).join())).size > 10, 'compromised: as estações variam');
  ok(todos.every((g) => igual((lerHyrox(g.cru, 'quinta') as { hyrox?: unknown }).hyrox, g.hyrox)),
    'o que o gerador manda passa na validação do salvar e volta igual');

  let semRepetir = true;
  for (const [i, s] of SEMENTES.slice(0, 100).entries()) {
    const antes = todos[i].hyrox.formato;
    if (gerarHyrox({ limites: LIMITES, semente: `${s}:depois`, semanaPassada: { formato: antes, estacoes: new Set() } }).hyrox.formato === antes) semRepetir = false;
  }
  ok(semRepetir, 'rodízio: o formato nunca repete o da semana anterior (100 pares)');
  const semente = SEMENTES.find((s) => gerarHyrox({ limites: LIMITES, semente: s, semanaPassada: { formato: 'prova', estacoes: new Set() } }).hyrox.formato === 'compromised')!;
  const evita = gerarHyrox({ limites: LIMITES, semente, semanaPassada: { formato: 'prova', estacoes: new Set(ESTACOES_HYROX.slice(0, 4)) } });
  ok(evita.hyrox.formato === 'compromised' && evita.hyrox.estacoes.every((e) => e.n >= 5),
    'compromised depois de um Hyrox com as estações 1–4: sorteia as 5–8');

  const prova = (limites: Partial<Record<RecursoBox, number>>) => {
    const s = SEMENTES.find((x) => gerarHyrox({ limites: LIMITES, semente: x }).hyrox.formato === 'prova')!;
    return gerarHyrox({ limites, semente: s });
  };
  const semSled = prova({ ...LIMITES, sled: 0 });
  ok(semSled.hyrox.estacoes.filter((e) => e.substituta).map((e) => e.estacao).join() === 'sled_push,sled_pull',
    'sled em manutenção: Sled Push e Sled Pull vão para a substituta');
  ok(!semSled.alertas.length && semSled.avisos.length === 2, 'sled em manutenção: sem alerta, com 2 avisos');
  const nada = prova({ ...LIMITES, sled: 0, trx: 0 });
  const pull = nada.alertas.find((a) => a.estacao === 'sled_pull');
  ok(!!pull && !pull.temSubstituta && nada.avisos.some((a) => a.includes('não há substituta')),
    'sled e TRX parados: o Sled Pull fica, com alerta e SEM oferecer substituta (ela também não cabe)');
  ok(igual(gerarHyrox({ limites: LIMITES, semente: 'x' }), gerarHyrox({ limites: LIMITES, semente: 'x' })), 'determinístico');
}

/* ───────────────────────────── salvar ───────────────────────────── */

console.log('\nValidação do pedido de salvar');
{
  const mov = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId }));
  const amrap = lerCross({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'kb_swing', 'flexao']) }, catalogo, 'terca');
  ok('cross' in amrap && amrap.cross.minutos === 16 && amrap.cross.rodadas === null && amrap.cross.movimentos[1].rx === 15,
    'AMRAP válido: minutos do pedido, prescrição calculada pelo servidor');
  const emom = lerCross({ formato: 'EMOM', minutos: 99, rodadas: 5, movimentos: mov(['corrida', 'kb_swing', 'flexao']) }, catalogo, 'terca');
  ok('cross' in emom && emom.cross.minutos === 15, 'EMOM: os minutos são movimentos × rodadas (o pedido não manda)');
  const injetado = lerCross({ formato: 'AMRAP', minutos: 16, movimentos: [{ exercicioId: 'kb_swing', rx: 500, nome: 'outro' }] }, catalogo, 'terca');
  ok('cross' in injetado && injetado.cross.movimentos[0].rx === 15 && injetado.cross.movimentos[0].nome === 'Kettlebell swing',
    'RX e nome vindos do pedido são ignorados');
  ok(erro(lerCross({ formato: 'Tabata', minutos: 16, movimentos: [] }, catalogo, 'terca')).includes('formato'), 'formato desconhecido: erro');
  ok(erro(lerCross({ formato: 'For Time', minutos: 16, movimentos: mov(['corrida']) }, catalogo, 'terca')).includes('rodadas'), 'For Time sem rodadas: erro');
  ok(erro(lerCross({ formato: 'AMRAP', minutos: 2, movimentos: mov(['corrida']) }, catalogo, 'terca')).includes('minutos'), 'AMRAP com 2 minutos: erro');
  ok(erro(lerCross({ formato: 'AMRAP', minutos: 16, movimentos: mov(['supino_smith']) }, catalogo, 'terca')).includes('não é movimento de Cross'),
    'exercício sem cross: erro');
  ok(erro(lerCross({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'corrida']) }, catalogo, 'terca')).includes('duas vezes'), 'movimento repetido: erro');
  ok(erro(lerCross({ formato: 'Chipper', minutos: 20, movimentos: mov(doCross.slice(0, 7)) }, catalogo, 'terca')).includes('até 6'), '7 movimentos: erro');

  const est = (ids: string[], sub: string[] = []) => ids.map((estacao) => ({ estacao, substituta: sub.includes(estacao) }));
  ok('hyrox' in lerHyrox({ formato: 'prova', estacoes: est([...ESTACOES_HYROX], ['sled_push']) }, 'quinta'), 'prova com uma substituta: válido');
  ok(erro(lerHyrox({ formato: 'prova', estacoes: est([...ESTACOES_HYROX].reverse()) }, 'quinta')).includes('nessa ordem'), 'prova fora de ordem: erro');
  ok(erro(lerHyrox({ formato: 'metadeB', estacoes: est(ESTACOES_HYROX.slice(0, 4)) }, 'quinta')).includes('nessa ordem'), 'metade B com as estações 1–4: erro');
  ok(erro(lerHyrox({ formato: 'compromised', estacoes: est(ESTACOES_HYROX.slice(0, 3)) }, 'quinta')).includes('4 estações'), 'compromised com 3: erro');
  ok(erro(lerHyrox({ formato: 'compromised', estacoes: est(['wall_ball', 'remo', 'skierg', 'sled_push']) }, 'quinta')).includes('ordem da prova'),
    'compromised fora da ordem da prova: erro');
  ok(erro(lerHyrox({ formato: 'prova', estacoes: est([...ESTACOES_HYROX], ['burpee_broad_jump']) }, 'quinta')).includes('não tem substituta'),
    'substituta no Burpee Broad Jump: erro');
  ok(erro(lerHyrox({ formato: 'meia', estacoes: [] }, 'quinta')).includes('formato'), 'formato desconhecido: erro');

  const wodCru = { formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'kb_swing', 'flexao']) };
  ok(erro(lerDias({ segunda: { treinos: ['H1'], cross: wodCru } }, catalogo)).includes('só dia com Cross'), 'WOD em dia sem Cross na grade: erro');
  ok(erro(lerDias({ terca: { treinos: ['Cross'], hyrox: { formato: 'prova', estacoes: est([...ESTACOES_HYROX]) } } }, catalogo)).includes('só dia com Hyrox'),
    'Hyrox em dia sem Hyrox na grade: erro');
  const lido = lerDias({ terca: { treinos: ['Cross', 'H1'], cross: wodCru } }, catalogo);
  ok('dias' in lido && lido.dias.terca.cross?.formato === 'AMRAP' && lido.dias.quinta.hyrox === null, 'terça com WOD: válido; quinta sem Hyrox fica null');
  ok(erro(lerDias({ segunda: { treinos: ['H1'], blocoPrincipal: [{ exercicioId: 'power_clean', series: 3, repeticoes: '5' }] } }, catalogo)).includes('só de Cross'),
    'movimento só de Cross no bloco de força: erro');

  // Preservação: o pedido sem a chave mantém o gravado; com null, apaga.
  const gravados = { terca: { cross: { formato: 'AMRAP' } }, quinta: { hyrox: { formato: 'prova' } }, sexta: { hiit: { estacoes: [] } } };
  const pedido = { terca: { treinos: ['Cross', 'H1'] }, quinta: { treinos: ['Hyrox'], hyrox: null }, sexta: { treinos: ['H3', 'HIIT'], hiit: { novo: true } } };
  const preservado = diasComConteudoGravado(pedido, gravados) as Record<string, Record<string, unknown>>;
  ok(igual(preservado.terca.cross, gravados.terca.cross), 'salvar sem cross: o WOD gravado fica');
  ok(preservado.quinta.hyrox === null, 'salvar com hyrox: null apaga o Hyrox');
  ok(igual(preservado.sexta.hiit, { novo: true }), 'cada chave em separado: o HIIT novo do pedido vale');
}

/* ───────────────────────────── publicar e reconferir ───────────────────────────── */

console.log('\nPublicação e reconferência');
{
  const mov = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId }));
  const semana = (cross: unknown, hyrox: unknown = null) => {
    const r = lerDias({ terca: { treinos: ['Cross'], cross }, quinta: { treinos: ['Hyrox'], hyrox } }, catalogo);
    if ('erro' in r) throw new Error(r.erro);
    return r.dias;
  };
  const curto = semana({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'kb_swing']) });
  ok(problemasParaPublicar(curto, []).some((p) => p.includes('tem 2 de 3 movimentos')), 'AMRAP com 2 movimentos: não publica');
  const legado = semana(null, null);
  ok(!semOMotivo(problemasParaPublicar(legado, [])).length, 'semana de antes do gerador (Cross e Hyrox sem conteúdo): publica');

  const barra = { formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'power_clean', 'thruster_barra']) };
  const doc = { dias: semana(barra, { formato: 'metadeA', estacoes: ESTACOES_HYROX.slice(0, 4).map((estacao) => ({ estacao })) }) };
  const ok6 = reconferirSemana(doc, INV.limitesAtivos, 6)!;
  ok(!ok6.alertasCross.length && !ok6.alertasHyrox.length && !semOMotivo(ok6.problemasParaPublicar).length, 'WOD com 2 barras e turma de 6: cabe');
  const t9 = reconferirSemana(doc, INV.limitesAtivos, 9)!;
  const t9wod = t9.alertasCross.filter((a) => !a.bloco);
  ok(t9wod.length === 1 && t9wod[0].usado === 6 && igual(t9wod[0].dias, ['terca']),
    'turma sobe para 9: 3 alunos por movimento × 2 barras = 6 de 4 → alerta no WOD');
  const t9tec = t9.alertasCross.filter((a) => a.bloco === 'tecnica');
  ok(t9tec.length === 1 && t9tec[0].usado === 5 && igual(t9tec[0].exercicios, ['power_clean']),
    'e na Técnica / Força: 9 alunos em duplas = 5 barras de 4 → alerta da técnica');
  ok(t9.problemasParaPublicar.some((p) => p.includes('na Técnica / Força') && p.includes('duplas revezando')), 'a mensagem da técnica diz que é em duplas');
  ok(t9.problemasParaPublicar.some((p) => p.includes('3 alunos por movimento') && p.includes('Power clean')), 'a mensagem explica a conta');
  const semSled = reconferirSemana(doc, { ...INV.limitesAtivos, sled: 0 }, 6)!;
  ok(semSled.alertasHyrox.length === 2 && semSled.alertasHyrox.every((a) => a.temSubstituta),
    'sled em manutenção depois de gerado: alerta no Sled Push e no Sled Pull, com substituta');
  ok(semSled.problemasParaPublicar.some((p) => p.includes('Sled Push') && p.includes('troque pela substituta')), 'a mensagem oferece a substituta');
  const comSub = { dias: semana(barra, { formato: 'metadeA', estacoes: ESTACOES_HYROX.slice(0, 4).map((estacao) => ({ estacao, substituta: estacao.startsWith('sled') })) }) };
  ok(!reconferirSemana(comSub, { ...INV.limitesAtivos, sled: 0 }, 6)!.alertasHyrox.length, 'com as substitutas: sem alerta');

  const velho = lerInventario({ equipamentos: { smith: { total: 2 } } });
  ok(velho.limitesAtivos.barraOlimpica === 4 && velho.limitesAtivos.sled === 1, 'inventário gravado antes do Cross: barras e sled com os números de fábrica');
  const novo = aplicarInventario(INV, { barraOlimpica: { total: 4, emManutencao: 2 } });
  ok('inventario' in novo && novo.inventario.limitesAtivos.barraOlimpica === 2, 'inventário aceita barras (4 − 2 em manutenção = 2)');
}

/* ───────────────────────────── a semana inteira ───────────────────────────── */

console.log('\nA semana inteira (gerarSemana)');
{
  const gerar = (semanaId: string, anterior: unknown, variacao = 0) =>
    gerarSemana({ semanaId, catalogo, limites: INV.limitesAtivos, diasDaSemanaAnterior: anterior, variacao, alunosPorAula: 6 });
  const w43 = gerar('2026-W43', null);
  const comCross = (Object.keys(w43.dias) as DiaSemana[]).filter((d) => w43.dias[d].cross);
  const comHyrox = (Object.keys(w43.dias) as DiaSemana[]).filter((d) => w43.dias[d].hyrox);
  ok(igual(comCross, ['terca']) && igual(comHyrox, ['quinta']), 'WOD só na terça, Hyrox só na quinta');
  ok(!w43.alertasCross.length && !w43.alertasHyrox.length, 'inventário de fábrica: sem alerta de Cross nem de Hyrox');
  const problemas = problemasParaPublicar(w43.dias, w43.alertas, w43.alertasHiit, 6, w43.alertasCross, w43.alertasHyrox);
  ok(!problemas.length, 'a semana gerada publica', problemas.join(' | '));
  ok(igual(w43, gerar('2026-W43', null)), 'determinística');
  ok(!igual(w43.dias.terca.cross, gerar('2026-W43', null, 1).dias.terca.cross), '"Sortear de novo" (variação 1) muda o WOD');
  ok(igual(w43.dias.segunda.blocoPrincipal, gerar('2026-W43', null).dias.segunda.blocoPrincipal), 'o bloco H não muda por causa do Cross');

  // 30 semanas encadeadas: rodízio de formato e de movimentos, sem alerta.
  let anterior: unknown = null;
  let falhou = '';
  for (let i = 0; i < 30 && !falhou; i++) {
    const id = `2027-W${String(i + 1).padStart(2, '0')}`;
    const r = gerar(id, anterior);
    const antesC = crossDaSemana(anterior);
    const antesH = hyroxDaSemana(anterior);
    const c = r.dias.terca.cross!;
    const repetiu = c.movimentos.filter((m) => antesC.ids.has(m.exercicioId));
    if (c.formato === antesC.formato) falhou = `${id}: formato do Cross repetiu`;
    else if (repetiu.length) falhou = `${id}: ${repetiu.map((m) => m.nome).join(', ')} repetiu no Cross`;
    else if (r.dias.quinta.hyrox!.formato === antesH.formato) falhou = `${id}: formato do Hyrox repetiu`;
    else if (r.alertasCross.length || r.alertasHyrox.length) falhou = `${id}: alerta com o inventário de fábrica`;
    anterior = r.dias;
  }
  ok(!falhou, '30 semanas encadeadas: formato e movimentos nunca repetem a semana anterior, nenhum alerta', falhou);
}

/* ───────────────────────────── Técnica / Força ───────────────────────────── */

console.log('\nTécnica / Força (o bloco antes do WOD)');
{
  const focos = doCross.filter((id) => catalogo.get(id)!.cross!.tecnica);
  ok(focos.length === 15, `${focos.length} movimentos servem de foco`);
  for (const c of CATEGORIAS_FOCO) {
    const n = focos.filter((id) => catalogo.get(id)!.cross!.tecnica!.categoria === c).length;
    ok(n >= 2, `categoria ${c}: ${n} movimentos`);
  }
  ok(!focos.some((id) => catalogo.get(id)!.cross!.padrao === 'cardio'), 'cardio nunca é foco');
  ok(focos.every((id) => [10, 12].includes(catalogo.get(id)!.cross!.tecnica!.minutos)), 'todo bloco tem 10 ou 12 min (decisão do coach)');
  const pc = catalogo.get('power_clean')!.cross!.tecnica!;
  ok(pc.tipo === 'tecnica' && pc.dinamica.startsWith('EMOM 10 min: 3 power cleans por minuto') && pc.objetivo.includes('Recepção rápida'),
    'power clean calibrado pela aula de 06/10: EMOM 10 min, 3 por minuto, recepção rápida');

  const base = { nome: 'X', musculoPrincipal: ['core'], musculosSecundarios: [], equipamentos: ['peso_corporal'], adaptacoes: {}, instancia: null };
  const t = { categoria: 'ginastica', tipo: 'skill', minutos: 10, dinamica: 'EMOM 10 min', objetivo: 'Qualidade' };
  const comT = (tecnica: object) => lerItemCatalogo({ ...base, cross: { padrao: 'core', unidade: 'reps', rx: 10, tecnica } });
  ok(comT(t)?.cross?.tecnica?.tipo === 'skill', 'técnica válida é lida');
  ok(comT({ ...t, categoria: 'cardio' }) === null, 'categoria desconhecida: torto');
  ok(comT({ ...t, minutos: 0 }) === null, 'minutos fora da faixa: torto');
  ok(comT({ ...t, objetivo: '' }) === null, 'sem objetivo: torto');

  // A escolha do foco: olímpico > barra > kettlebell > ginástica.
  const t1 = tecnicaDoWod(['corrida', 'flexao', 'kb_swing', 'terra_barra_livre', 'power_clean'], catalogo)!;
  ok(t1.exercicioId === 'power_clean' && t1.tipo === 'tecnica' && t1.minutos === 10, 'olímpico vence: power clean');
  ok(igual(t1.alternativas.map((a) => a.exercicioId), ['flexao', 'kb_swing', 'terra_barra_livre']), 'as outras opções de foco, na ordem do WOD');
  ok(tecnicaDoWod(['corrida', 'flexao', 'kb_swing', 'terra_barra_livre'], catalogo)!.exercicioId === 'terra_barra_livre', 'sem olímpico: barra');
  ok(tecnicaDoWod(['corrida', 'flexao', 'kb_swing'], catalogo)!.exercicioId === 'kb_swing', 'sem barra: kettlebell');
  ok(tecnicaDoWod(['corrida', 'flexao', 'abdominal_supra'], catalogo)!.exercicioId === 'flexao', 'só ginástica: ginástica');
  ok(tecnicaDoWod(['corrida', 'flexao', 'power_clean'], catalogo, 'flexao')!.exercicioId === 'flexao', 'o foco escolhido pelo coach vale');
  ok(tecnicaDoWod(['corrida', 'flexao', 'power_clean'], catalogo, 'corrida')!.exercicioId === 'power_clean', 'escolha que não serve de foco: volta à prioridade');
  ok(tecnicaDoWod(['corrida', 'abdominal_supra', 'burpee'], catalogo) === null, 'nenhum serve de foco: null');

  // O gerador.
  const todos = SEMENTES.map((semente) => gerarCross(ctx({ semente })));
  ok(todos.every((g) => g.wod.tecnica && g.cru.tecnica?.exercicioId === g.wod.tecnica.exercicioId), `${SEMENTES.length} sorteios: todo WOD tem Técnica / Força`);
  ok(todos.every((g) => {
    const cats = g.wod.movimentos.map((m) => catalogo.get(m.exercicioId)!.cross!.tecnica?.categoria).filter(Boolean) as string[];
    const melhor = Math.min(...cats.map((c) => CATEGORIAS_FOCO.indexOf(c as never)));
    return CATEGORIAS_FOCO.indexOf(g.wod.tecnica!.categoria) === melhor;
  }), 'o foco é sempre o da categoria mais à frente no WOD');
  ok(new Set(todos.map((g) => g.wod.tecnica!.categoria)).size === 4, 'as 4 categorias aparecem como foco');
  ok(todos.every((g) => !g.alertas.length), 'inventário de fábrica, turma de 6: a técnica cabe (3 barras em duplas)');
  const duasBarras = SEMENTES.slice(0, 150).map((semente) => gerarCross(ctx({ semente, limites: { ...LIM_CROSS, barraOlimpica: 2 } })));
  ok(duasBarras.every((g) => g.wod.tecnica && !g.alertas.length), '2 barras ativas: a técnica nunca é de barra (precisaria de 3), e nada passa do limite');
  ok(duasBarras.some((g) => g.wod.movimentos.some((m) => comBarra.has(m.exercicioId))), '…mas a barra ainda entra no WOD (2 por movimento)');
  const semFoco = new Map([...catalogo].filter(([, i]) => !i.cross?.tecnica));
  const g0 = gerarCross(ctx({ catalogo: semFoco }));
  ok(g0.wod.tecnica === null && g0.avisos.some((a) => a.includes('sem movimento para a Técnica')), 'catálogo sem foco: técnica null, com aviso');

  // A validação do salvar.
  const mov = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId }));
  const wodCru = { formato: 'AMRAP', minutos: 14, movimentos: mov(['corrida', 'flexao', 'power_clean']) };
  const auto = lerCross(wodCru, catalogo, 'terca');
  ok('cross' in auto && auto.cross.tecnica?.exercicioId === 'power_clean', 'sem escolha no pedido: o servidor escolhe pela prioridade');
  const pedido = lerCross({ ...wodCru, tecnica: { exercicioId: 'flexao', dinamica: 'outra coisa' } }, catalogo, 'terca');
  ok('cross' in pedido && pedido.cross.tecnica?.exercicioId === 'flexao' && pedido.cross.tecnica.dinamica.startsWith('EMOM 10 min: 5–8 flexões'),
    'foco escolhido no pedido vale; dinâmica e objetivo saem do catálogo');
  ok(erro(lerCross({ ...wodCru, tecnica: { exercicioId: 'kb_swing' } }, catalogo, 'terca')).includes('movimento do WOD'), 'foco fora do WOD: erro');
  ok(erro(lerCross({ ...wodCru, tecnica: { exercicioId: 'corrida' } }, catalogo, 'terca')).includes('não tem bloco'), 'foco sem técnica no catálogo: erro');
  const semTecnica = lerDias({ terca: { treinos: ['Cross'], cross: { formato: 'AMRAP', minutos: 14, movimentos: mov(['corrida', 'abdominal_supra', 'burpee']) } } }, catalogo);
  ok('dias' in semTecnica && semTecnica.dias.terca.cross?.tecnica === null
    && problemasParaPublicar(semTecnica.dias, []).some((p) => p.includes('não tem movimento para a Técnica / Força')),
    'WOD sem foco: não publica');
  const legado = lerDias({ terca: { treinos: ['Cross'], cross: { formato: 'AMRAP', minutos: 14, movimentos: mov(['corrida', 'flexao', 'kb_swing']) } } }, catalogo);
  if ('dias' in legado) delete legado.dias.terca.cross!.tecnica;
  ok('dias' in legado && !problemasParaPublicar(legado.dias, []).some((p) => p.includes('Técnica')), 'WOD gravado antes do bloco (sem a chave): não trava');
}

/* ───────────────────────────── Estratégia do Coach ───────────────────────────── */

console.log('\nEstratégia do Coach (a ponte entre a Técnica / Força e o WOD)');
{
  const focos = doCross.filter((id) => catalogo.get(id)!.cross!.tecnica);
  ok(focos.every((id) => /^[a-zà-ú]/.test(catalogo.get(id)!.cross!.tecnica!.chave ?? '') && !/[.;]$/.test(catalogo.get(id)!.cross!.tecnica!.chave!)),
    `os ${focos.length} focos têm chave, em minúscula e sem ponto final (entra no meio da frase)`);
  const base = { nome: 'X', musculoPrincipal: ['core'], musculosSecundarios: [], equipamentos: ['peso_corporal'], adaptacoes: {}, instancia: null };
  const t = { categoria: 'ginastica', tipo: 'skill', minutos: 10, dinamica: 'EMOM 10', objetivo: 'Prancha.' };
  const comT = (tecnica: object) => lerItemCatalogo({ ...base, cross: { padrao: 'core', unidade: 'reps', rx: 10, tecnica } });
  ok(comT({ ...t, chave: 'mantenha a prancha' })?.cross?.tecnica?.chave === 'mantenha a prancha' && comT({ ...t, chave: '' }) === null,
    'catálogo: chave lida; chave vazia é inválida');

  const estr = (formato: string, ids: string[], extra: object = {}) => {
    const r = lerCross({ formato, minutos: 15, rodadas: 4, movimentos: ids.map((exercicioId) => ({ exercicioId })), ...extra }, catalogo, 'terca');
    return 'cross' in r ? r.cross.estrategia ?? null : null;
  };
  const textoBom = (s: string | null) => !!s && s.length <= MAX_CARACTERES_ESTRATEGIA && s.endsWith('.')
    && !/undefined|null|\$\{|\s{2}|\s[,.]/.test(s) && s.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length >= 3;
  const ruins: string[] = [];
  for (const id of focos) for (const formato of FORMATOS_CROSS) {
    const s = estr(formato, ['corrida', id, 'abdominal_supra'], { tecnica: { exercicioId: id } });
    if (!textoBom(s) || !s!.includes(catalogo.get(id)!.cross!.tecnica!.chave!)) ruins.push(`${id}/${formato}: ${s}`);
  }
  ok(!ruins.length, `${focos.length} focos × 4 formatos: 3 frases, até ${MAX_CARACTERES_ESTRATEGIA} caracteres, com a chave do foco`, ruins[0]);

  // O exemplo do coach: força de thruster, AMRAP com squat jump e corda naval.
  const thruster = estr('AMRAP', ['corda_naval', 'agachamento_salto', 'thruster_barra']) ?? '';
  ok(thruster.includes('nas pernas e nos ombros') && thruster.includes('battle ropes') && thruster.includes('agachamento com salto')
    && thruster.includes('deixe o quadril lançar a barra'), 'thruster + squat jump + corda naval: alerta pernas e ombros e manda usar o quadril', thruster);
  const alivio = estr('AMRAP', ['air_bike_sprint', 'flexao', 'remada_unilateral_kb']) ?? '';
  ok(/O resto do WOD puxa mais|Os outros movimentos pegam mais/.test(alivio) && !alivio.includes('dos ombros'),
    'foco de ombro com o resto em pernas e costas: frase de alívio, sem citar o ombro', alivio);
  ok(quebrarSeries(12) === '5-4-3' && quebrarSeries(16) === '7-5-4' && quebrarSeries(10) === '5-3-2', 'quebra das séries: 12 → 5-4-3');
  ok((estr('Chipper', ['corrida', 'power_clean', 'box_jump', 'flexao_pike', 'farmer_carry_kb']) ?? '').includes('16 reps em 7-5-4'),
    'Chipper com 16 power cleans: sugere 7-5-4');
  ok(!/reps em/.test(estr('For Time', ['corrida', 'desenvolvimento_unilateral_kb', 'goblet_squat']) ?? 'reps em'),
    'foco unilateral ou com menos de 10 reps: sem sugestão de quebra');
  ok(nomeCurto('Remada no TRX') === 'remada no TRX' && nomeCurto('Battle ropes (corda naval)') === 'battle ropes', 'nome curto: sem parênteses, sigla mantida');

  // Acompanha as trocas e não aceita texto do pedido.
  const ids = ['corrida', 'flexao', 'power_clean'];
  const a = estr('AMRAP', ids);
  ok(a === estr('AMRAP', ids), 'mesmo WOD, mesmo texto (salvar de novo não muda)');
  ok(a !== estr('AMRAP', ids, { tecnica: { exercicioId: 'flexao' } }) && (estr('AMRAP', ids, { tecnica: { exercicioId: 'flexao' } }) ?? '').includes('prancha'),
    'trocar o foco reescreve a estratégia');
  ok(a !== estr('AMRAP', ['corrida', 'kb_swing', 'power_clean']), 'trocar um movimento reescreve a estratégia');
  ok(estr('AMRAP', ids, { estrategia: 'texto do cliente' }) === a, 'a estratégia do pedido é ignorada: sempre do servidor');
  ok(estr('AMRAP', ['corrida', 'abdominal_supra', 'burpee']) === null, 'WOD sem foco: estratégia null');
  const semChave = new Map([...catalogo].map(([id, i]) => [id, i.cross?.tecnica
    ? { ...i, cross: { ...i.cross, tecnica: { ...i.cross.tecnica, chave: undefined } } } : i] as [string, ItemCatalogo]));
  const r = lerCross({ formato: 'AMRAP', minutos: 15, movimentos: ids.map((exercicioId) => ({ exercicioId })) }, semChave, 'terca');
  ok('cross' in r && textoBom(r.cross.estrategia ?? null) && r.cross.estrategia!.includes('recepção rápida da barra'),
    'foco sem chave no catálogo (seed antigo): usa o objetivo');

  // O gerador.
  const todos = SEMENTES.map((semente) => gerarCross(ctx({ semente })));
  ok(todos.every((g) => textoBom(g.wod.estrategia ?? null) && g.wod.estrategia!.toLowerCase().includes(nomeCurto(g.wod.tecnica!.nome).toLowerCase())),
    `${SEMENTES.length} sorteios: todo WOD tem estratégia que cita o foco`);
  ok(todos.every((g) => {
    const r2 = lerCross(g.cru, catalogo, 'terca');
    return 'cross' in r2 && r2.cross.estrategia === g.wod.estrategia;
  }), 'gerar e salvar dão o MESMO texto');
  const textos = new Set(todos.map((g) => g.wod.estrategia));
  ok(textos.size >= SEMENTES.length * 0.5, `variedade: ${textos.size} textos diferentes em ${SEMENTES.length} sorteios`);
  ok(todos.some((g) => g.wod.estrategia!.includes('O cansaço vai aparecer')) && todos.some((g) => g.wod.estrategia!.includes('Atenção '))
    && todos.some((g) => /puxa mais|pegam mais/.test(g.wod.estrategia!)), 'as versões de fadiga e de alívio aparecem');
}

/* ───────────────────────────── edição manual ───────────────────────────── */

console.log('\nTroca manual no WOD');
{
  const mov = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId }));
  const semana = (cross: unknown, hyrox: unknown = null) => {
    const r = lerDias({ terca: { treinos: ['Cross', 'H1'], cross }, quinta: { treinos: ['Hyrox'], hyrox } }, catalogo);
    if ('erro' in r) throw new Error(r.erro);
    return r.dias;
  };
  // AMRAP: corrida (cardio) · power clean (olímpico) · flexão (empurrar) · KB swing (quadril).
  const dias = semana({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'power_clean', 'flexao', 'kb_swing']) });
  const base = { dias, catalogo, limites: LIM_CROSS, alunosPorAula: 6, semanaPassada: new Set(['burpee']) };
  const c = (posicao: number, exercicioId: string) => conflitosDoCross({ ...base, posicao, exercicioId })!;

  ok(c(3, 'kb_swing').noWod && bloqueiaCross(c(3, 'kb_swing')), 'movimento que já está no WOD: bloqueia');
  ok(c(3, 'terra_barra_livre').padraoRepetido === 'Kettlebell swing' && bloqueiaCross(c(3, 'terra_barra_livre')),
    'padrão de outro movimento (terra × swing, os dois quadril): bloqueia e diz qual');
  ok(c(1, 'air_bike_sprint').padraoRepetido === null && !bloqueiaCross(c(1, 'air_bike_sprint')), 'cardio por cardio na posição do cardio: livre');
  ok(c(1, 'goblet_squat').tiraOCardio && bloqueiaCross(c(1, 'goblet_squat')), 'tirar o único cardio: bloqueia');
  ok(c(3, 'air_bike_sprint').padraoRepetido === 'Corrida (rua)', 'um segundo cardio no lugar da flexão: padrão repetido');
  const duasBarras = c(3, 'push_press');
  ok(!duasBarras.equipamento.length, 'flexão → push press: 2 + 2 = 4 barras com turma de 6, cabe');
  const tresBarras = conflitosDoCross({ ...base, alunosPorAula: 9, posicao: 3, exercicioId: 'push_press' })!;
  ok(igual(tresBarras.equipamento, ['barraOlimpica']) && bloqueiaCross(tresBarras), 'com turma de 9: 3 + 3 = 6 barras de 4, bloqueia por equipamento');
  ok(c(3, 'burpee').semanaAnterior && !bloqueiaCross(c(3, 'burpee')), 'rodízio quebrado: aviso, não bloqueia');
  ok(c(9, 'burpee') === null && c(1, 'supino_smith') === null, 'posição que não existe, ou exercício sem cross: null');

  const op = opcoesDoCross({ ...base, posicao: 3 })!;
  ok(op.vaga.posicao === 3 && op.vaga.atual.exercicioId === 'flexao' && igual(op.vaga.dias, ['terca']) && op.vaga.formato === 'AMRAP',
    'a vaga: posição, movimento atual, formato e o dia');
  ok(!op.opcoes.some((x) => x.exercicioId === 'flexao') && op.opcoes.length === doCross.length - 1, 'lista o pool do Cross, menos o movimento atual');
  const grupo = (x: (typeof op.opcoes)[number]) => (x.bloqueada ? 2 : x.conflitos.semanaAnterior ? 1 : 0);
  ok(op.opcoes.every((x, i, l) => i === 0 || grupo(l[i - 1]) <= grupo(x)), 'ordem: livres, rodízio, bloqueados');
  ok(op.opcoes.find((x) => !x.bloqueada)?.padrao === 'empurrar', 'dentro dos livres, o mesmo padrão da vaga primeiro');
  ok(opcoesDoCross({ ...base, dias: semana(null), posicao: 1 }) === null, 'semana sem WOD: null');

  // Técnica / Força na troca: WOD com a flexão como ÚNICO foco (ginástica).
  const soFlexao = semana({ formato: 'AMRAP', minutos: 14, movimentos: mov(['corrida', 'flexao', 'agachamento_livre']) });
  const baseF = { ...base, dias: soFlexao };
  const cf = (posicao: number, exercicioId: string, alunosPorAula = 6) =>
    conflitosDoCross({ ...baseF, posicao, exercicioId, alunosPorAula })!;
  ok(cf(2, 'burpee').tiraATecnica && bloqueiaCross(cf(2, 'burpee')), 'trocar o único foco por um que não serve: bloqueia (tira a técnica)');
  ok(!cf(2, 'flexao_pike').tiraATecnica && !bloqueiaCross(cf(2, 'flexao_pike')), 'trocar o foco por outro foco: livre');
  // O foco FICA enquanto estiver no WOD (o coach não vê o foco mudar sozinho);
  // só quando ele mesmo sai é que o substituto (ou outro) vira o foco.
  ok(!cf(3, 'goblet_squat').viraFoco && !bloqueiaCross(cf(3, 'goblet_squat')), 'trocar outro movimento: o foco (flexão) fica');
  ok(cf(2, 'flexao_pike').viraFoco, 'trocar o foco por outro que serve: ele vira o foco (só informa)');
  const pushPress9 = cf(2, 'push_press', 9);
  ok(igual(pushPress9.equipamento, ['barraOlimpica']) && bloqueiaCross(pushPress9),
    'com turma de 9, a barra vira foco: 5 barras em duplas de 4 → bloqueia por equipamento da técnica');
  ok(!cf(2, 'push_press', 6).equipamento.length && cf(2, 'push_press', 6).viraFoco, 'com turma de 6: 3 barras em duplas, cabe');

  // A troca escolhida passa no salvar, com a prescrição recalculada.
  const trocado = lerCross({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'power_clean', 'push_press', 'kb_swing']) }, catalogo, 'terca');
  ok('cross' in trocado && trocado.cross.movimentos[2].rx === 10 && trocado.cross.movimentos[2].carga?.rx === '40/30 kg',
    'a troca salva: push press com RX e carga do catálogo');
}

console.log('\nTroca manual no Hyrox');
{
  const estacoes = ESTACOES_HYROX.slice(0, 4).map((estacao) => ({ estacao, substituta: estacao === 'sled_pull' }));
  const r = lerDias({ quinta: { treinos: ['Hyrox'], hyrox: { formato: 'metadeA', estacoes } } }, catalogo);
  if ('erro' in r) throw new Error(r.erro);
  const push = opcoesDoHyrox({ dias: r.dias, estacao: 'sled_push', limites: LIMITES })!;
  ok(push.vaga.n === 2 && !push.vaga.atual.substituta && push.opcoes.length === 1 && push.opcoes[0].substituta
    && push.opcoes[0].nome.startsWith('Plate push') && !push.opcoes[0].bloqueada,
    'Sled Push (original): a opção é a substituta, livre');
  const pull = opcoesDoHyrox({ dias: r.dias, estacao: 'sled_pull', limites: LIMITES })!;
  ok(pull.vaga.atual.substituta && pull.vaga.atual.nome === 'Remada no TRX' && !pull.opcoes[0].substituta && pull.opcoes[0].nome.startsWith('Sled Pull'),
    'Sled Pull na substituta: a opção é voltar à estação da prova');
  const semSled = opcoesDoHyrox({ dias: r.dias, estacao: 'sled_pull', limites: { ...LIMITES, sled: 0 } })!;
  ok(semSled.opcoes[0].bloqueada && igual(semSled.opcoes[0].equipamento, ['sled']), 'sled em manutenção: voltar ao Sled Pull bloqueia, e diz o recurso');
  const burpee = opcoesDoHyrox({ dias: r.dias, estacao: 'burpee_broad_jump', limites: LIMITES })!;
  ok(burpee.opcoes.length === 0, 'Burpee Broad Jump: sem substituta, sem opção');
  ok(opcoesDoHyrox({ dias: r.dias, estacao: 'wall_ball', limites: LIMITES }) === null, 'estação fora do formato (wall ball na metade A): null');
}

console.log('\nTrava de semana publicada e conta única');
{
  const mov = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId }));
  const montar = (cross: unknown, hyrox: unknown) => {
    const r = lerDias({ terca: { treinos: ['Cross', 'H1'], cross }, quinta: { treinos: ['Hyrox'], hyrox } }, catalogo);
    if ('erro' in r) throw new Error(r.erro);
    return r.dias;
  };
  const prova = { formato: 'prova', estacoes: ESTACOES_HYROX.map((estacao) => ({ estacao })) };
  const antes = montar({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'kb_swing', 'flexao']) }, prova);
  const outroWod = montar({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'kb_swing', 'flexao_pike']) }, prova);
  const outroHyrox = montar({ formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'kb_swing', 'flexao']) },
    { formato: 'prova', estacoes: ESTACOES_HYROX.map((estacao) => ({ estacao, substituta: estacao === 'remo' })) });
  const datas = intervaloDaSemana('2026-W42')!.datas;
  ok(igual(diasPassadosAlterados(antes, outroWod, datas, datas.quarta), ['terca']), 'trocar o WOD com a terça no passado: a terça trava');
  ok(igual(diasPassadosAlterados(antes, outroHyrox, datas, datas.sexta), ['quinta']), 'trocar estação do Hyrox com a quinta no passado: a quinta trava');
  ok(!diasPassadosAlterados(antes, outroHyrox, datas, datas.quarta).length, 'quinta ainda não passou: livre');
  const legado = montar(null, null);
  const { cross: _cross, hyrox: _hyrox, ...semChave } = legado.terca;
  ok(!diasPassadosAlterados({ ...legado, terca: semChave }, legado, datas, datas.sabado).length,
    'semana de antes do Cross (sem a chave) × cross: null — mesmo retrato, não trava');
  ok(conteudoTravado(antes, 'cross', datas, datas.quarta) && !conteudoTravado(antes, 'hyrox', datas, datas.quarta),
    'na quarta: o WOD (terça) travado, o Hyrox (quinta) não');

  const conta = contaDaSemana(antes, { ...INV.limitesAtivos, sled: 0 }, 6);
  ok(conta.alertasHyrox.length === 2 && conta.problemasParaPublicar.some((p) => p.includes('Sled Push')),
    'contaDaSemana junta os alertas do Hyrox nos problemas para publicar');
  const doc = { dias: antes };
  ok(igual(reconferirSemana(doc, { ...INV.limitesAtivos, sled: 0 }, 6), conta), 'a reconferência do inventário dá a MESMA conta');
}

/* ───────────────────────────── volume do Cross e do Hyrox ───────────────────────────── */

console.log('\nVolume do Cross e do Hyrox (séries equivalentes)');
{
  const mov = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId }));
  const wodDe = (cru: object) => {
    const r = lerCross(cru, catalogo, 'terca');
    if ('erro' in r) throw new Error(r.erro);
    return r.cross;
  };
  const series = (r: ReturnType<typeof lerRegistroCross>) => ('erro' in r ? {} : r.series);
  const vol = (s: Record<string, number>) => volumeDaSessao(s, catalogo);

  // O catálogo: o número fixo da técnica (decisão do coach).
  const focos = doCross.filter((id) => catalogo.get(id)!.cross!.tecnica);
  ok(focos.every((id) => {
    const t = catalogo.get(id)!.cross!.tecnica!;
    return t.seriesEquivalentes === (t.tipo === 'forca' ? 5 : 3);
  }), `os ${focos.length} focos têm séries equivalentes: força 5, técnica e skill 3`);
  const base = { nome: 'X', musculoPrincipal: ['core'], musculosSecundarios: [], equipamentos: ['peso_corporal'], adaptacoes: {}, instancia: null };
  const t0 = { categoria: 'ginastica', tipo: 'skill', minutos: 10, dinamica: 'EMOM 10', objetivo: 'Prancha.' };
  const comT = (tecnica: object) => lerItemCatalogo({ ...base, cross: { padrao: 'core', unidade: 'reps', rx: 10, tecnica } });
  ok(comT({ ...t0, seriesEquivalentes: 4 })?.cross?.tecnica?.seriesEquivalentes === 4 && comT({ ...t0, seriesEquivalentes: 0 }) === null,
    'catálogo: séries equivalentes lidas (1 a 10)');

  // A aula de calibração: técnica de power clean + For Time 4 rodadas (corrida, power clean, swing, burpee).
  const calibracao = wodDe({ formato: 'For Time', minutos: 15, rodadas: 4, movimentos: mov(['corrida', 'power_clean', 'kb_swing', 'burpee']) });
  const prescrito = lerRegistroCross({ comoPrescrito: true }, calibracao, catalogo);
  ok(igual(series(prescrito), { power_clean: 5, corrida: 1, kb_swing: 2, burpee: 2 }),
    'fiz como prescrito: técnica 3 + power clean 4 × 0,5; corrida 4 × 0,25 (cardio); swing e burpee 4 × 0,5', JSON.stringify(series(prescrito)));
  const v = vol(series(prescrito));
  ok(v.posterior_coxa === 8 && v.quadriceps === 8 && v.gluteo === 7.5,
    'volume da aula: posterior 8, quadríceps 8, glúteo 7,5 (a conta da proposta)', JSON.stringify(v));
  ok(igual(series(lerRegistroCross({}, calibracao, catalogo)), { power_clean: 5, corrida: 1, kb_swing: 2, burpee: 2 }),
    'sem detalhe: o prescrito (RX e Scaled contam igual)');
  ok(igual(series(lerRegistroCross({ rodadas: 2, tecnicaSeries: 1 }, calibracao, catalogo)), { power_clean: 2, corrida: 0.5, kb_swing: 1, burpee: 1 }),
    'parou na 2ª rodada e fez 1 série da técnica');
  ok(igual(series(lerRegistroCross({ rodadas: 9, tecnicaSeries: 9 }, calibracao, catalogo)), series(prescrito)),
    'acima do prescrito é cortado, como as séries da força');
  const comoPrescritoIgnoraDetalhe = lerRegistroCross({ comoPrescrito: true, rodadas: 1 }, calibracao, catalogo);
  ok(!('erro' in comoPrescritoIgnoraDetalhe) && comoPrescritoIgnoraDetalhe.registro.comoPrescrito && comoPrescritoIgnoraDetalhe.registro.blocos === 4,
    '"fiz como prescrito" vence o detalhe');

  // Formatos.
  const amrap = wodDe({ formato: 'AMRAP', minutos: 15, movimentos: mov(['corrida', 'power_clean', 'kb_swing']) });
  ok(igual(blocosDoWod(amrap), { prescrito: 5, maximo: 7 }), 'AMRAP 15 min: como prescrito = 5 rodadas (minutos ÷ 3), teto 7 (minutos ÷ 2)');
  ok(series(lerRegistroCross({ rodadas: 30 }, amrap, catalogo)).kb_swing === 3.5, 'AMRAP: 30 rodadas lançadas viram o teto (7 × 0,5)');
  const emom = wodDe({ formato: 'EMOM', rodadas: 3, movimentos: mov(['corrida', 'power_clean', 'kb_swing', 'flexao']) });
  ok(series(lerRegistroCross({ comoPrescrito: true }, emom, catalogo)).kb_swing === 1.5, 'EMOM 3 voltas: 3 blocos × 0,5');
  const chipper = wodDe({ formato: 'Chipper', minutos: 15, movimentos: mov(['corrida', 'power_clean', 'kb_swing', 'flexao', 'agachamento_livre']) });
  ok(igual(series(lerRegistroCross({ comoPrescrito: true }, chipper, catalogo)), { power_clean: 4, corrida: 0.5, kb_swing: 1, flexao: 1, agachamento_livre: 1 }),
    'Chipper: 2 blocos por movimento (o fator 2 das repetições)');
  ok(igual(series(lerRegistroCross({ chipperAte: 2 }, chipper, catalogo)), { power_clean: 4, corrida: 0.5 }), 'Chipper: parou no 2º movimento');

  // Adaptações: só as do catálogo; o volume vai para o que o aluno FEZ.
  const comTerra = wodDe({ formato: 'For Time', minutos: 15, rodadas: 4, movimentos: mov(['corrida', 'terra_barra_livre', 'flexao']) });
  const adaptado = lerRegistroCross({ adaptacoes: { terra_barra_livre: 'elevacao_pelvica' } }, comTerra, catalogo);
  ok(series(adaptado).elevacao_pelvica === 2, 'lombar: a elevação pélvica (adaptação do catálogo) recebe os blocos do WOD do terra (4 × 0,5)');
  ok(series(adaptado).terra_barra_livre === 5, 'o terra fica só com a técnica (5): os blocos do WOD foram para a adaptação');
  ok('erro' in lerRegistroCross({ adaptacoes: { terra_barra_livre: 'supino_smith' } }, comTerra, catalogo), 'adaptação fora do catálogo: erro');
  ok('erro' in lerRegistroCross({ adaptacoes: { kb_swing: 'ponte_gluteo' } }, comTerra, catalogo), 'movimento fora do WOD: erro');
  ok('erro' in lerRegistroCross({ rodadas: 1.5 }, comTerra, catalogo) && 'erro' in lerRegistroCross(null, comTerra, catalogo), 'rodadas quebradas ou sem registro: erro');
  ok(seriesDaTecnica({ tecnica: { ...comTerra.tecnica!, exercicioId: 'nao_existe' } }, catalogo) === 5, 'foco sem número no catálogo: o padrão do tipo');

  // Hyrox.
  const hy = (formato: Parameters<typeof montarHyrox>[0], estacoes: string[], sub: string[] = []) =>
    montarHyrox(formato, estacoes.map((estacao) => ({ estacao, substituta: sub.includes(estacao) })) as Parameters<typeof montarHyrox>[1]);
  const hseries = (r: ReturnType<typeof lerRegistroHyrox>) => ('erro' in r ? {} : r.series);
  const prova = hy('prova', [...ESTACOES_HYROX]);
  const sp = hseries(lerRegistroHyrox({ comoPrescrito: true }, prova));
  ok(ESTACOES_HYROX.every((e) => sp[`hyrox:${e}`] === 1) && sp['hyrox:corrida'] === 2, 'prova: 8 estações × 1,0 e 8 corridas × 0,25');
  const comp = hy('compromised', ['skierg', 'remo', 'wall_ball', 'sled_push']);
  const sc = hseries(lerRegistroHyrox({ comoPrescrito: true }, comp));
  ok(sc['hyrox:skierg'] === 1 && sc['hyrox:corrida'] === 2, 'compromised: 2 rodadas × metade da estação = 1; 8 corridas');
  const metA = hy('metadeA', ['skierg', 'sled_push', 'sled_pull', 'burpee_broad_jump']);
  ok(hseries(lerRegistroHyrox({ comoPrescrito: true }, metA))['hyrox:corrida'] === 2, 'metade A: corrida dobrada conta dobrado (4 × 0,25 × 2)');
  const comSub = hy('prova', [...ESTACOES_HYROX], ['sled_pull', 'remo']);
  const ss = hseries(lerRegistroHyrox({ estacoesFeitas: 5, corridaNaBike: true }, comSub));
  ok(ss['hyrox:sled_pull:substituta'] === 1 && ss['hyrox:remo:substituta'] === 1 && !ss['hyrox:wall_ball'] && ss['hyrox:air_bike'] === 1.25,
    'substitutas e air bike: o volume vai para o que foi feito; parou na 5ª estação', JSON.stringify(ss));
  const vh = volumeDaSessao(ss, catalogoDoHyrox());
  // Costas: SkiErg (principal 1) + remada no TRX (principal 1) + air bike no lugar do remo (secundário 0,5) + a bike das corridas (0,5 × 1,25).
  // Bíceps: só a remada no TRX (secundário 0,5) — o sled pull da prova não foi feito.
  ok(vh.costas === 3.125 && vh.biceps === 0.5, 'músculos das substitutas: remada no TRX e air bike', JSON.stringify(vh));
  ok('erro' in lerRegistroHyrox({ corridaNaBike: 'sim' }, prova), 'bike: sim ou não');

  // As substitutas que já são exercício do catálogo têm os MESMOS músculos de lá.
  const igualAo = (m: { musculoPrincipal: string[]; musculosSecundarios: string[] }, id: string) =>
    igual(m.musculoPrincipal, catalogo.get(id)!.musculoPrincipal) && igual(m.musculosSecundarios, catalogo.get(id)!.musculosSecundarios);
  ok(igualAo(MUSCULOS_HYROX.skierg.substituta!, 'corda_naval') && igualAo(MUSCULOS_HYROX.sled_pull.substituta!, 'remada_trx')
    && igualAo(MUSCULOS_HYROX.remo.substituta!, 'air_bike_sprint') && igualAo(MUSCULOS_HYROX.farmers_carry.substituta!, 'farmer_carry_kb')
    && igualAo(MUSCULOS_HYROX.sandbag_lunges.substituta!, 'afundo_kb') && igualAo(MUSCULOS_HYROX.wall_ball.substituta!, 'thruster_halteres')
    && igualAo(MUSCULOS_HYROX.wall_ball.estacao, 'wall_ball_shot')
    && igualAo(MUSCULOS_CORRIDA_HYROX.corrida, 'corrida') && igualAo(MUSCULOS_CORRIDA_HYROX.bike, 'air_bike_sprint'),
  'Hyrox: substitutas, wall ball, corrida e air bike com os músculos do catálogo');
  ok(ESTACOES_HYROX.every((e) => MUSCULOS_HYROX[e].estacao.musculoPrincipal.length > 0)
    && ESTACOES_HYROX.every((e) => !!MUSCULOS_HYROX[e].substituta === !!DADOS_ESTACAO_HYROX[e].substituta),
  'toda estação tem músculo principal; toda substituta do catálogo do Hyrox tem os seus');
}

console.log(falhas ? `\n✗ Cross/Hyrox: ${falhas} falha(s).` : '\n✓ Cross/Hyrox: tudo certo.');
process.exit(falhas ? 1 : 0);
