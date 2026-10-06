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
import { CORRIDA_HYROX, DADOS_ESTACAO_HYROX } from './catalogo-hyrox';
import {
  ESTACOES_HYROX, FORMATOS_CROSS, FORMATOS_HYROX, NIVEIS_HYROX, PADROES_CROSS, REGRA_FORMATO_CROSS, REGRA_FORMATO_HYROX,
  type DiaSemana, type FormatoCross, type ItemCatalogo, type RecursoBox, type RecursoCross,
} from './modelo-box';
import {
  aplicarInventario, arredondarPrescricao, diasComConteudoGravado, lerCross, lerDias, lerExercicioCatalogo, lerHyrox,
  lerInventario, lerItemCatalogo, montarHyrox, movimentoCross, problemasParaPublicar, reconferirSemana,
} from './semana-box';
import { alunosPorMovimento, consumoCross, contarCross } from './conta-cross';
import { gerarCross, type ContextoCross } from './gerador-cross';
import { gerarHyrox } from './gerador-hyrox';
import { crossDaSemana, gerarSemana, hyroxDaSemana } from './gerador-box';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
  ok(swing('Chipper').rx === 40 && swing('Chipper').scaled === 30, 'Chipper: RX × 2,5 (37,5 → 40), Scaled 30');
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
    if (w.formato === 'AMRAP') return w.rodadas === null && w.minutos >= 12 && w.minutos <= 20;
    if (w.formato === 'For Time') return w.rodadas !== null && w.minutos === w.rodadas * 4;
    if (w.formato === 'EMOM') return w.rodadas !== null && w.minutos === w.rodadas * w.movimentos.length && w.minutos >= 12 && w.minutos <= 20;
    return w.rodadas === null && w.minutos === 20;
  });
  ok(tempoOk, 'tempo: AMRAP 12–20 min; For Time 4 min por rodada; EMOM movimentos × rodadas entre 12 e 20; Chipper 20');

  const a = gerarCross(ctx({ semente: 's1' }));
  ok(igual(a, gerarCross(ctx({ semente: 's1' }))), 'determinístico: mesma semente, mesmo WOD');
  ok(!igual(a.wod, gerarCross(ctx({ semente: 's2' })).wod), 'outra semente, outro WOD');

  // Rodízio: formato e movimentos da semana anterior.
  // No EMOM com turma de 6, o ÚNICO cardio que cabe é a corrida (air bike,
  // corda de pular e corda naval: 2 de cada). Então, depois de um WOD com
  // corrida, o EMOM repete a corrida — com aviso — e SÓ ela.
  let semFormatoRepetido = true;
  const repeticoes: string[] = [];
  let repeticaoSemAviso = false;
  for (const semente of SEMENTES.slice(0, 100)) {
    const antes = gerarCross(ctx({ semente: `${semente}:antes` }));
    const depois = gerarCross(ctx({ semente, semanaPassada: { formato: antes.wod.formato, ids: new Set(antes.cru.movimentos.map((m) => m.exercicioId)) } }));
    if (depois.wod.formato === antes.wod.formato) semFormatoRepetido = false;
    const rep = depois.cru.movimentos.filter((m) => antes.cru.movimentos.some((x) => x.exercicioId === m.exercicioId));
    for (const m of rep) {
      repeticoes.push(`${depois.wod.formato}:${m.exercicioId}`);
      if (!depois.avisos.some((a) => a.includes('repete'))) repeticaoSemAviso = true;
    }
  }
  ok(semFormatoRepetido, 'rodízio: o formato nunca repete o da semana anterior (100 pares)');
  ok(repeticoes.every((r) => r === 'EMOM:corrida'), 'rodízio: só repete a corrida no EMOM, o único cardio que cabe com 6 alunos (100 pares)',
    repeticoes.join(', '));
  ok(!repeticaoSemAviso, 'toda repetição sai com aviso');
  // Repete o MÍNIMO: EMOM depois de um WOD com corrida E kettlebell swing. A
  // corrida tem de voltar (único cardio), mas o swing não: há outros padrões.
  // Sem a regra do mínimo, a busca pegaria o swing sempre que o padrão
  // "quadril" saísse cedo no sorteio (o terra não cabe no EMOM com 6).
  const sementesEmom = SEMENTES.filter((s) => gerarCross(ctx({ semente: s, semanaPassada: { formato: 'AMRAP', ids: new Set() } })).wod.formato === 'EMOM');
  const minimo = sementesEmom.map((semente) =>
    gerarCross(ctx({ semente, semanaPassada: { formato: 'AMRAP', ids: new Set(['corrida', 'kb_swing']) } })));
  ok(minimo.length > 10 && minimo.every((g) => g.cru.movimentos.every((m) => m.exercicioId !== 'kb_swing')),
    `EMOM depois de corrida + swing (${minimo.length} sorteios): repete só a corrida, nunca o swing`);

  // Rodízio é REGRA, não só ordem: com todos os cardios menos um na semana
  // anterior, o WOD usa o cardio novo, mesmo que ele seja o último da fila.
  // (Fora do EMOM — que só aceita a corrida com 6 alunos: o formato da
  // semana anterior vai para o fim da fila, então passada = EMOM o tira.)
  const cardios = doCross.filter((id) => catalogo.get(id)!.cross!.padrao === 'cardio');
  for (const novo of cardios) {
    const passada = new Set(cardios.filter((id) => id !== novo));
    const g = gerarCross(ctx({ semente: `cardio:${novo}`, semanaPassada: { formato: 'EMOM', ids: passada } }));
    ok(g.wod.movimentos[0].exercicioId === novo, `só ${novo} é cardio novo: é ele que abre o WOD`);
  }
  const emomCorrida = SEMENTES.map((semente) => gerarCross(ctx({ semente }))).filter((g) => g.wod.formato === 'EMOM');
  ok(emomCorrida.length > 0 && emomCorrida.every((g) => g.wod.movimentos[0].exercicioId === 'corrida'),
    'EMOM com turma de 6: abre sempre com a corrida (o resto do cardio é 2 de cada)');
  ok(SEMENTES.slice(0, 100).map((semente) => gerarCross(ctx({ semente, alunosPorAula: 2 })))
    .filter((g) => g.wod.formato === 'EMOM').some((g) => g.wod.movimentos[0].exercicioId !== 'corrida'),
    'EMOM com turma de 2: os outros cardios voltam');
  // Sem opção nova, repete — com aviso.
  const soUmCardio = new Map([...catalogo].filter(([id, i]) => i.cross?.padrao !== 'cardio' || id === 'corrida'));
  const repetiu = gerarCross(ctx({ catalogo: soUmCardio, semanaPassada: { formato: null, ids: new Set(['corrida']) } }));
  ok(repetiu.wod.movimentos[0].exercicioId === 'corrida' && repetiu.avisos.some((x) => x.includes('repete')),
    'único cardio do catálogo estava na semana anterior: volta, com aviso');

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
  ok(!problemasParaPublicar(legado, []).length, 'semana de antes do gerador (Cross e Hyrox sem conteúdo): publica');

  const barra = { formato: 'AMRAP', minutos: 16, movimentos: mov(['corrida', 'power_clean', 'thruster_barra']) };
  const doc = { dias: semana(barra, { formato: 'metadeA', estacoes: ESTACOES_HYROX.slice(0, 4).map((estacao) => ({ estacao })) }) };
  const ok6 = reconferirSemana(doc, INV.limitesAtivos, 6)!;
  ok(!ok6.alertasCross.length && !ok6.alertasHyrox.length && !ok6.problemasParaPublicar.length, 'WOD com 2 barras e turma de 6: cabe');
  const t9 = reconferirSemana(doc, INV.limitesAtivos, 9)!;
  ok(t9.alertasCross.length === 1 && t9.alertasCross[0].usado === 6 && igual(t9.alertasCross[0].dias, ['terca']),
    'turma sobe para 9: 3 alunos por movimento × 2 barras = 6 de 4 → alerta');
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
    // A única repetição aceita: a corrida no EMOM (ver o gerador do WOD).
    const repetiu = c.movimentos.filter((m) => antesC.ids.has(m.exercicioId) && !(c.formato === 'EMOM' && m.exercicioId === 'corrida'));
    if (c.formato === antesC.formato) falhou = `${id}: formato do Cross repetiu`;
    else if (repetiu.length) falhou = `${id}: ${repetiu.map((m) => m.nome).join(', ')} repetiu no Cross`;
    else if (r.dias.quinta.hyrox!.formato === antesH.formato) falhou = `${id}: formato do Hyrox repetiu`;
    else if (r.alertasCross.length || r.alertasHyrox.length) falhou = `${id}: alerta com o inventário de fábrica`;
    anterior = r.dias;
  }
  ok(!falhou, '30 semanas encadeadas: formato e movimentos não repetem a semana anterior (fora a corrida no EMOM), nenhum alerta', falhou);
}

console.log(falhas ? `\n✗ Cross/Hyrox: ${falhas} falha(s).` : '\n✓ Cross/Hyrox: tudo certo.');
process.exit(falhas ? 1 : 0);
