/**
 * Confere a regra da semana do box sem rede e sem emulador.
 *
 *     npm run checar:box
 *
 * Cobre `semana-box.ts` (datas, inventário, consumo de equipamento, publicação,
 * volume ponderado, histórico idempotente) e a integridade do `CATALOGO_BASE`
 * que o seed grava.
 */
import { CATALOGO_BASE } from './catalogo-base';
import { chaveSemana } from './volume-agregado';
import {
  DIAS_SEMANA, INSTANCIAS, INVENTARIO_PADRAO, MATRIZ_H, RECURSOS_INVENTARIO,
  type DiaProgramado, type DiaSemana, type ExercicioCatalogo, type Instancia, type RecursoInventario,
} from './modelo-box';
import {
  alertasDaSemana, aplicarInventario, consumoDoDia, historicoComSessao, intervaloDaSemana, lerDias,
  lerExercicioCatalogo, lerInventario, lerSessaoAluno, problemasParaPublicar, semanaAnterior, semanaDoPedido,
  volumeDaSessao,
} from './semana-box';
import { descansoDaVaga, gerarSemana, idsDaSemana, montarBloco } from './gerador-box';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const catalogo = new Map<string, ExercicioCatalogo>(Object.entries(CATALOGO_BASE));

/** O bloco passa de algum limite? */
function excedeAlgum(ids: string[], cat: ReadonlyMap<string, ExercicioCatalogo>, limites: Record<RecursoInventario, number>): boolean {
  const consumo = consumoDoDia(ids.map((exercicioId) => ({ exercicioId, nome: '', series: 0, repeticoes: '', descansoSeg: 0 })), cat);
  return RECURSOS_INVENTARIO.some((r) => (consumo[r] ?? 0) > limites[r]);
}

console.log('\nCatálogo base');
{
  const ids = Object.keys(CATALOGO_BASE);
  ok(ids.every((id) => /^[a-z0-9_]+$/.test(id)), 'ids em snake_case, válidos como id de documento');
  const tortos = ids.filter((id) => !lerExercicioCatalogo(CATALOGO_BASE[id]));
  ok(!tortos.length, 'todo item passa na mesma leitura que o servidor faz', tortos.join(', '));
  const quebradas = ids.flatMap((id) => Object.entries(CATALOGO_BASE[id].adaptacoes)
    .filter(([, alvo]) => !CATALOGO_BASE[alvo!] || alvo === id).map(([k, alvo]) => `${id}.${k} → ${alvo}`));
  ok(!quebradas.length, 'toda adaptação aponta para OUTRO exercício do catálogo', quebradas.join(', '));
  const semInstancia = INSTANCIAS.filter((i) => !ids.some((id) => CATALOGO_BASE[id].instancia === i));
  ok(!semInstancia.length, 'as 7 instâncias têm exercício', semInstancia.join(', '));
  const dupla = ids.filter((id) => CATALOGO_BASE[id].musculoPrincipal.some((m) => CATALOGO_BASE[id].musculosSecundarios.includes(m)));
  ok(!dupla.length, 'nenhum músculo é principal e secundário no mesmo exercício', dupla.join(', '));
}

console.log('\nDatas da semana');
{
  const s = intervaloDaSemana('2026-W41')!;
  ok(s?.datas.segunda === '2026-10-05' && s.datas.sabado === '2026-10-10', '2026-W41 = 05 a 10/10/2026', JSON.stringify(s?.datas));
  ok(new Date(s.inicioMs).toISOString() === '2026-10-05T03:00:00.000Z', 'início = segunda 00:00 em São Paulo');
  ok(new Date(s.fimMs).toISOString() === '2026-10-11T02:59:59.999Z', 'fim = sábado 23:59:59.999 em São Paulo');
  ok(s.anoMes === '2026-10', 'anoMes da segunda');
  ok(intervaloDaSemana('2026-W01')?.datas.segunda === '2025-12-29', 'semana 1 que começa no ano anterior');
  // 2026 começa numa quinta, então tem 53 semanas ISO; 2027 começa numa sexta e tem 52.
  ok(intervaloDaSemana('2026-W53')?.datas.segunda === '2026-12-28', '2026 tem semana 53 (começa numa quinta)');
  ok(intervaloDaSemana('2027-W53') === null, '2027 não tem semana 53');
  ok(intervaloDaSemana('2026-W54') === null && intervaloDaSemana('2026-41') === null && intervaloDaSemana(41) === null,
    'formato torto é recusado');
  let idaEVolta = true;
  for (let w = 1; w <= 52; w++) {
    const id = `2027-W${String(w).padStart(2, '0')}`;
    const i = intervaloDaSemana(id);
    if (!i || chaveSemana(i.datas.sabado) !== id) idaEVolta = false;
  }
  ok(idaEVolta, 'as 52 semanas de 2027: sábado cai na mesma semana ISO');
}

console.log('\nInventário');
{
  const padrao = lerInventario(undefined);
  ok(igual(padrao.limitesAtivos, INVENTARIO_PADRAO), 'sem documento = padrão (smith 2, banco 2, monocross 3, maquinaLegs 1, cavalinho 2)');
  const quebrado = lerInventario({ equipamentos: { smith: { total: 2, emManutencao: 1 }, banco: { total: -1 } } });
  ok(quebrado.limitesAtivos.smith === 1, 'smith com 1 em manutenção = 1 ativo');
  ok(quebrado.limitesAtivos.banco === 2, 'valor torto gravado volta ao padrão');
  const r = aplicarInventario(padrao, { monocross: { emManutencao: 1, observacao: 'cabo rompido' } });
  ok('inventario' in r && r.inventario.limitesAtivos.monocross === 2 && r.inventario.equipamentos.monocross.total === 3,
    'manutenção parcial preserva o total');
  ok('erro' in aplicarInventario(padrao, { esteira: { total: 1 } }), 'recurso desconhecido é erro');
  ok('erro' in aplicarInventario(padrao, { smith: { total: 1, emManutencao: 2 } }), 'manutenção > total é erro');
  ok('erro' in aplicarInventario(padrao, { smith: { total: 1.5 } }), 'total fracionado é erro');
}

const bloco = (ids: string[]) => ids.map((exercicioId) => ({ exercicioId, nome: '', series: 3, repeticoes: '10', descansoSeg: 60 }));
const DIA_OK = [
  'supino_smith', 'remada_cavalinho_fechada', 'agachamento_smith', 'mesa_flexora', 'pallof_press', 'desenvolvimento_halter',
];

console.log('\nDias e consumo de equipamento');
{
  const r = lerDias({ segunda: { treinos: ['H1', 'Cross'], blocoPrincipal: bloco(DIA_OK) } }, catalogo);
  ok('dias' in r, 'semana com um dia montado é aceita como rascunho', 'erro' in r ? r.erro : '');
  if ('dias' in r) {
    const seg = r.dias.segunda;
    ok(seg.cadencia === '3010' && seg.descansos.entreSeriesSeg === 90 && seg.descansos.entreExerciciosSeg === 90,
      'cadência e descanso padrão (os de PRESCRICAO_FORCA)');
    const herda = lerDias({ segunda: { treinos: ['H1'], descansos: { entreSeriesSeg: 100 },
      blocoPrincipal: [{ exercicioId: 'supino_smith', series: 3, repeticoes: '10' }, { exercicioId: 'rdl_halter', series: 3, repeticoes: '10', descansoSeg: 150 }] } }, catalogo);
    ok('dias' in herda && herda.dias.segunda.blocoPrincipal[0].descansoSeg === 100 && herda.dias.segunda.blocoPrincipal[1].descansoSeg === 150,
      'exercício sem descanso herda o do dia; com descanso, fica o dele');
    ok('erro' in lerDias({ segunda: { treinos: ['H1'], blocoPrincipal: [{ exercicioId: 'supino_smith', series: 3, repeticoes: '10', descansoSeg: 601 }] } }, catalogo),
      'descanso de exercício acima de 600 s é recusado');
    ok(seg.blocoPrincipal[0].nome === 'Supino reto no Smith', 'nome vem do catálogo, não do cliente');
    // supino_smith: smith+banco · cavalinho · agachamento: smith · flexora: maquinaLegs · pallof: monocross · desenvolvimento_halter: banco
    ok(igual(seg.consumoEquipamentos, { smith: 2, banco: 2, cavalinho: 1, maquinaLegs: 1, monocross: 1 }),
      'consumo: cada exercício ocupa uma estação de cada recurso', JSON.stringify(seg.consumoEquipamentos));
    ok(DIAS_SEMANA.every((d) => d in r.dias) && r.dias.terca.treinos.length === 0, 'os 6 dias existem; os vazios ficam vazios');
    ok(!alertasDaSemana(r.dias, INVENTARIO_PADRAO).length, 'dentro do inventário padrão, sem alerta');
    const semSmith = { ...INVENTARIO_PADRAO, smith: 1 };
    ok(igual(alertasDaSemana(r.dias, semSmith), [{ dia: 'segunda', recurso: 'smith', usado: 2, limite: 1 }]),
      'um smith em manutenção vira alerta na segunda');
    const p = problemasParaPublicar(r.dias, []);
    ok(p.length === 0, 'semana com só a segunda completa pode publicar', p.join(' | '));
  }

  const legs = consumoDoDia(bloco(['cadeira_extensora', 'mesa_flexora']), catalogo);
  ok(legs.maquinaLegs === 2, 'extensora e flexora no mesmo dia disputam a MESMA maquinaLegs');

  const erro = (entrada: unknown) => { const x = lerDias(entrada, catalogo); return 'erro' in x ? x.erro : ''; };
  ok(!!erro({ domingo: {} }), 'domingo é recusado');
  ok(!!erro({ segunda: { treinos: ['Yoga'] } }), 'modalidade fora da lista é recusada');
  ok(!!erro({ segunda: { treinos: ['H1'], blocoPrincipal: bloco([...DIA_OK, 'rdl_halter']) } }), '7 exercícios é recusado');
  ok(!!erro({ segunda: { treinos: ['H1'], blocoPrincipal: bloco(['nao_existe']) } }), 'exercício fora do catálogo é recusado');
  ok(!!erro({ segunda: { treinos: ['H1'], blocoPrincipal: bloco(['supino_smith', 'supino_smith']) } }), 'exercício repetido é recusado');
  ok(!!erro({ segunda: { treinos: [], blocoPrincipal: bloco(['supino_smith']) } }), 'bloco em dia sem treino é recusado');
  ok(!!erro({ segunda: { treinos: ['H1'], cadencia: '30' } }), 'cadência com menos de 4 dígitos é recusada');
  ok(!!erro({ segunda: { treinos: ['H1'], blocoPrincipal: [{ exercicioId: 'supino_smith', series: 0, repeticoes: '10' }] } }),
    'zero séries é recusado');

  const incompleto = lerDias({ segunda: { treinos: ['H2'], blocoPrincipal: bloco(DIA_OK.slice(0, 4)) } }, catalogo);
  ok('dias' in incompleto && problemasParaPublicar(incompleto.dias, []).length === 1, 'bloco com 4 de 6 salva, mas não publica');
  const vazia = lerDias({}, catalogo);
  ok('dias' in vazia && problemasParaPublicar(vazia.dias, []).some((p) => p.includes('nenhum treino')), 'semana sem treino não publica');
}

console.log('\nVolume e histórico do aluno');
{
  // supino_smith: peito 1,0 · tríceps e ombro 0,5. 4 séries → peito 4, tríceps 2, ombro 2.
  const v = volumeDaSessao({ supino_smith: 4, agachamento_smith: 3 }, catalogo);
  ok(igual(v, { peito: 4, triceps: 2, ombro: 2, quadriceps: 3, gluteo: 1.5, posterior_coxa: 1.5 }),
    'principal 1,0 e secundário 0,5 por série', JSON.stringify(v));
  ok(igual(volumeDaSessao({ supino_smith: 0, inexistente: 3 }, catalogo), {}), 'zero série e exercício desconhecido não somam');

  const r = lerDias({ segunda: { treinos: ['H1'], blocoPrincipal: bloco(DIA_OK) } }, catalogo);
  const dia = ('dias' in r ? r.dias.segunda : null) as DiaProgramado;
  const s = lerSessaoAluno({ exercicios: [
    { exercicioId: 'supino_smith', seriesValidas: 5, pse: 8, rirReportado: 2, comentario: ' pesado ' },
    { exercicioId: 'agachamento_smith', seriesValidas: 2 },
  ] }, dia);
  ok('series' in s && s.series.supino_smith === 3, 'séries acima do prescrito são cortadas no prescrito');
  ok('series' in s && igual(s.feedbacks, [{ exercicioId: 'supino_smith', pse: 8, rirReportado: 2, comentario: 'pesado' }]),
    'feedback só de quem mandou PSE/RIR/comentário');
  ok('erro' in lerSessaoAluno({ exercicios: [{ exercicioId: 'rdl_halter', seriesValidas: 3 }] }, dia), 'exercício fora do dia é recusado');
  ok('erro' in lerSessaoAluno({ exercicios: [{ exercicioId: 'supino_smith', seriesValidas: 3, pse: 11 }] }, dia), 'PSE 11 é recusado');
  ok('erro' in lerSessaoAluno({ exercicios: [] }, dia), 'sessão vazia é recusada');

  const p1 = { sessaoId: '2026-10-05_H1', volume: { peito: 3, triceps: 1.5 } };
  const p2 = { sessaoId: '2026-10-07_H2', volume: { peito: 2 } };
  const h1 = historicoComSessao(null, p1, [{ sessaoId: p1.sessaoId, data: '2026-10-05', exercicioId: 'supino_smith', pse: 8, rirReportado: 2, comentario: '' }]);
  const h2 = historicoComSessao(h1, p2, []);
  ok(igual(h2.volumeAcumulado, { peito: 5, triceps: 1.5 }), 'volume do mês soma as sessões');
  const h3 = historicoComSessao(h2, { ...p1, volume: { peito: 1 } }, []);
  ok(igual(h3.volumeAcumulado, { peito: 3 }) && h3.presencas.length === 2, 'a mesma sessão de novo SUBSTITUI, não soma');
  ok(h3.feedbacks.length === 0, 'e leva junto os feedbacks antigos dela');
}

console.log('\nSessão H, metabólicas e a nova regra de bloco');
{
  const erro = (entrada: unknown) => { const x = lerDias(entrada, catalogo); return 'erro' in x ? x.erro : ''; };
  ok(!!erro({ segunda: { treinos: ['H1', 'H2'] } }), 'dois H no mesmo dia é recusado');
  ok(!!erro({ quinta: { treinos: ['Hyrox'], blocoPrincipal: bloco(['supino_smith']) } }), 'Hyrox sem H não tem bloco principal');
  const r = lerDias({
    terca: { treinos: ['Cross', 'H1'], blocoPrincipal: bloco(DIA_OK) },
    quinta: { treinos: ['Hyrox'] },
  }, catalogo);
  ok('dias' in r, 'Cross com H1 de alternativa + Hyrox sozinho', 'erro' in r ? r.erro : '');
  if ('dias' in r) {
    ok(igual(r.dias.terca.sessaoForca, { sessao: 'H1', papel: 'alternativa', nome: 'Força Base — Agachar/Empurrar' }),
      'terça: H1 sinalizado como alternativa', JSON.stringify(r.dias.terca.sessaoForca));
    ok(r.dias.terca.blocosMetabolicos[0]?.modalidade === 'Cross' && r.dias.terca.blocosMetabolicos[0].papel === 'principal',
      'terça: Cross é a aula principal');
    ok(r.dias.quinta.sessaoForca === null && r.dias.quinta.blocosMetabolicos[0]?.formato === 'For Time',
      'quinta: Hyrox estruturado, sem sessão de força');
    ok(problemasParaPublicar(r.dias, []).length === 0, 'dia só metabólico publica com bloco vazio');
  }
}

console.log('\nSemana e semana anterior a partir do pedido');
{
  ok(semanaDoPedido({ semanaId: '2026-W42' }) === '2026-W42', 'semanaId direto');
  ok(semanaDoPedido({ data: '2026-10-14' }) === '2026-W42', 'qualquer data da semana vira a chave');
  ok(semanaDoPedido({ data: '2026-02-30' }) === null && semanaDoPedido({ data: 'ontem' }) === null && semanaDoPedido({}) === null,
    'data que não existe é recusada');
  ok(semanaAnterior('2026-W42') === '2026-W41', 'anterior de W42 é W41');
  ok(semanaAnterior('2027-W01') === '2026-W53', 'virada de ano: 2027-W01 → 2026-W53');
}

console.log('\nGerador: matriz, grade e rodízio (catálogo base, inventário padrão)');
{
  const w41 = gerarSemana({ semanaId: '2026-W41', catalogo, limites: { ...INVENTARIO_PADRAO }, diasDaSemanaAnterior: null });
  const instanciasDe = (dia: DiaSemana) => w41.dias[dia].blocoPrincipal.map((e) => catalogo.get(e.exercicioId)!.instancia);
  ok(igual(instanciasDe('segunda'), MATRIZ_H.H1.instancias), 'segunda = H1, vagas na ordem da matriz', instanciasDe('segunda').join(','));
  ok(igual(instanciasDe('quarta'), MATRIZ_H.H2.instancias), 'quarta = H2, com estabilizar_tronco');
  ok(igual(instanciasDe('sexta'), MATRIZ_H.H3.instancias), 'sexta = H3');
  ok(igual(w41.dias.terca.blocoPrincipal, w41.dias.segunda.blocoPrincipal), 'terça repete o H1 da segunda (catch-up)');
  ok(igual(w41.dias.sabado.blocoPrincipal, w41.dias.sexta.blocoPrincipal), 'sábado repete o H3 da sexta');
  ok(w41.dias.quinta.blocoPrincipal.length === 0 && w41.dias.quinta.treinos[0] === 'Hyrox', 'quinta: Hyrox, sem bloco');
  ok(w41.dias.sabado.treinos[0] === 'HIIT' && w41.dias.sabado.sessaoForca?.papel === 'alternativa', 'sábado: HIIT principal, H3 alternativa');
  const seg = w41.dias.segunda;
  ok(seg.cadencia === '3010' && seg.blocoPrincipal.every((e) => e.series === 4 && e.repeticoes === '8-12')
    && seg.descansos.entreSeriesSeg === 90, 'prescrição: 4 × 8-12, cadência 3010, descanso padrão 90 s');

  // Descanso por vaga (decisão de 05/10/2026).
  const descansos = (dia: DiaSemana) => w41.dias[dia].blocoPrincipal.map((e) => e.descansoSeg);
  ok(igual(descansos('segunda'), [120, 120, 90, 90, 90, 90]), 'H1: agachar e empurrar_horizontal 120 s, resto 90 s', descansos('segunda').join(','));
  ok(igual(descansos('quarta'), [120, 120, 90, 90, 90, 45]), 'H2: terra/romeno e remada 120 s, core 45 s', descansos('quarta').join(','));
  ok(igual(descansos('sexta'), [90, 90, 90, 90, 90, 90]), 'H3: tudo 90 s (agachar do H3 não é a abertura pesada)', descansos('sexta').join(','));
  ok(igual(descansos('terca'), descansos('segunda')) && igual(descansos('sabado'), descansos('sexta')),
    'o catch-up herda o descanso da sessão original');
  ok(descansoDaVaga('H1', 1, 'estabilizar_tronco') === 45, 'core vence a regra de posição');
  ok(!w41.alertas.length && problemasParaPublicar(w41.dias, w41.alertas).length === 0, 'semana gerada pode publicar direto');
  ok(igual(gerarSemana({ semanaId: '2026-W41', catalogo, limites: { ...INVENTARIO_PADRAO }, diasDaSemanaAnterior: null }), w41),
    'mesma entrada, mesma semana (determinístico)');
  const variacoes = [1, 2, 3, 4].map((variacao) => gerarSemana({
    semanaId: '2026-W41', catalogo, limites: { ...INVENTARIO_PADRAO }, diasDaSemanaAnterior: null, variacao,
  }));
  ok(variacoes.some((v) => !igual(v.dias, w41.dias)), '`variacao` muda o sorteio');

  // O rodízio: W42 gerada lendo W41. Nenhum exercício da W41 volta.
  const w42 = gerarSemana({ semanaId: '2026-W42', catalogo, limites: { ...INVENTARIO_PADRAO }, diasDaSemanaAnterior: w41.dias });
  const usados41 = idsDaSemana(w41.dias);
  const repetidos = [...idsDaSemana(w42.dias)].filter((id) => usados41.has(id));
  ok(repetidos.length === 0, 'W42 não repete nenhuma variação exata da W41', repetidos.join(', '));
  ok(!w42.avisos.length, 'e sem precisar avisar repetição', w42.avisos.join(' | '));

  // Quando a instância só tem uma opção, ela volta — com aviso, e não com vaga vazia.
  const pobre = new Map([...catalogo].filter(([id, e]) => e.instancia !== 'estabilizar_tronco' || id === 'pallof_press'));
  const comPallof = { quarta: { blocoPrincipal: [{ exercicioId: 'pallof_press' }] } };
  const r = gerarSemana({ semanaId: '2026-W42', catalogo: pobre, limites: { ...INVENTARIO_PADRAO }, diasDaSemanaAnterior: comPallof });
  ok(r.dias.quarta.blocoPrincipal.some((e) => e.exercicioId === 'pallof_press')
    && r.avisos.some((a) => a.includes('Pallof press') && a.includes('única opção')),
    'única opção da instância repete a semana anterior e avisa', r.avisos.join(' | '));
}

console.log('\nGerador: trava de equipamento (catálogo forjado)');
{
  // Catálogo mínimo em que o sorteio é forçado: cada instância tem UM exercício
  // fora da semana anterior, e é ele que usa o recurso disputado.
  const ex = (instancia: Instancia, equipamentos: ExercicioCatalogo['equipamentos']): ExercicioCatalogo => ({
    nome: `${instancia} ${equipamentos.join('+')}`, instancia, musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos, adaptacoes: {},
  });
  const forjado = new Map<string, ExercicioCatalogo>([
    ['ag_smith', ex('agachar', ['smith'])],
    ['eh_smith', ex('empurrar_horizontal', ['smith', 'banco'])],
    ['eh_halter', ex('empurrar_horizontal', ['halteres'])],
    ['ev_smith', ex('empurrar_vertical', ['smith'])],
    ['ev_halter', ex('empurrar_vertical', ['halteres'])],
    ['ph_trx', ex('puxar_horizontal', ['trx'])],
    ['eq_flexora', ex('estender_quadril', ['flexora'])],
    ['pv_mono', ex('puxar_vertical', ['monocross'])],
  ]);
  const passada = new Set(['eh_halter', 'ev_halter']); // força o sorteio a cair nos de smith
  const ctx = (smith: number) => ({
    catalogo: forjado, limites: { ...INVENTARIO_PADRAO, smith }, semanaPassada: passada,
    usadosNaSemana: new Set<string>(), rng: () => 0.5,
  });

  // H1 sorteia ag_smith, eh_smith, ev_smith: 3 smiths num dia.
  const tres = montarBloco(MATRIZ_H.H1.instancias, { ...ctx(3) });
  ok(igual(tres.ids.slice(0, 3), ['ag_smith', 'eh_smith', 'ev_smith']) && !tres.trocas.length,
    'com 3 smiths no box, os 3 de smith ficam', tres.ids.join(','));

  const dois = montarBloco(MATRIZ_H.H1.instancias, ctx(2));
  ok(igual(dois.trocas, [{ posicao: 3, de: 'ev_smith', para: 'ev_halter', recurso: 'smith' }]),
    'limite 2: re-sorteia o ÚLTIMO conflitante (vaga 3) por um da mesma instância sem smith', JSON.stringify(dois.trocas));
  ok(dois.ids[0] === 'ag_smith' && dois.ids[1] === 'eh_smith', 'os conflitantes anteriores ficam');

  const um = montarBloco(MATRIZ_H.H1.instancias, ctx(1));
  ok(igual(um.trocas.map((t) => t.de), ['ev_smith', 'eh_smith']) && um.ids[0] === 'ag_smith',
    'limite 1: troca do fim para o começo até caber', JSON.stringify(um.trocas));
  ok(!excedeAlgum(um.ids, forjado, { ...INVENTARIO_PADRAO, smith: 1 }), 'e o dia fica válido');

  // Agachar só existe no smith: com smith 0 não há troca — fica o alerta.
  const zero = montarBloco(MATRIZ_H.H1.instancias, ctx(0));
  ok(zero.ids.includes('ag_smith') && zero.avisos.some((a) => a.includes('smith')),
    'sem alternativa, não inventa: mantém o exercício e avisa', zero.avisos.join(' | '));
  ok(excedeAlgum(zero.ids, forjado, { ...INVENTARIO_PADRAO, smith: 0 }), 'e o dia continua acima do limite (vira alerta)');

  // A troca não pode empurrar o estouro para outro recurso.
  const comBanco = new Map(forjado);
  comBanco.set('ev_halter', ex('empurrar_vertical', ['halteres', 'banco']));
  const semBanco = montarBloco(MATRIZ_H.H1.instancias, {
    ...ctx(2), catalogo: comBanco, limites: { ...INVENTARIO_PADRAO, smith: 2, banco: 1 },
  });
  ok(!semBanco.trocas.some((t) => t.para === 'ev_halter') && excedeAlgum(semBanco.ids, comBanco, { ...INVENTARIO_PADRAO, smith: 2, banco: 1 }) === false,
    'troca que estouraria o banco é recusada; o gerador acha outra saída', JSON.stringify(semBanco.trocas));

  // Ponta a ponta: semana inteira com 1 smith ativo no catálogo base.
  const apertada = gerarSemana({
    semanaId: '2026-W42', catalogo, limites: { ...INVENTARIO_PADRAO, smith: 1, monocross: 1 }, diasDaSemanaAnterior: null,
  });
  ok(!apertada.alertas.length, 'catálogo base com 1 smith e 1 monocross: a semana fecha sem alerta', JSON.stringify(apertada.alertas));
  ok(DIAS_SEMANA.every((d) => (apertada.dias[d].consumoEquipamentos.smith ?? 0) <= 1), 'nenhum dia passa de 1 smith');
}

console.log('\nSanidade do vocabulário');
ok(RECURSOS_INVENTARIO.every((r) => r in INVENTARIO_PADRAO), 'todo recurso tem padrão');
ok((['segunda', 'sabado'] as DiaSemana[]).every((d) => DIAS_SEMANA.includes(d)) && DIAS_SEMANA.length === 6, 'segunda a sábado');

console.log(falhas === 0 ? '\n✓ A semana do box fecha a conta.\n' : `\n✗ ${falhas} verificação(ões) falharam.\n`);
process.exitCode = falhas === 0 ? 0 : 1;
