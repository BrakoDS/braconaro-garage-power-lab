/**
 * Confere a camada de ajustes do catálogo (`catalogo-ajustes.ts`) sem rede e
 * sem emulador.
 *
 *     npm run checar:catalogo
 *
 * Cobre: sem ajuste, o catálogo efetivo é o do seed (paridade); edição, criação
 * e desativação chegam ao gerador, às trocas e ao volume; ajuste torto nunca
 * derruba o item do seed; a validação do pedido da tela.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO_COMPLETO } from './catalogo-completo';
import {
  ativosDe, catalogoEfetivo, efeitoDeDesativar, idNovo, lerAjuste, lerPedidoExercicio, linhasDoCatalogo, semInativos,
  type CatalogoEfetivo,
} from './catalogo-ajustes';
import { opcoesDaVaga } from './edicao-box';
import { opcoesDoHiit } from './edicao-hiit';
import { gerarSemana, idsDaSemana, idsDoHiit } from './gerador-box';
import {
  DIAS_SEMANA, ESTACOES_HYROX, INSTANCIAS, INVENTARIO_PADRAO, type ExercicioCatalogo, type ItemCatalogo, type RecursoHiit,
} from './modelo-box';
import { lerDias, lerItemCatalogo, volumeDaSessao } from './semana-box';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** O que o seed grava, como o servidor lê do Firestore. */
const SEED = Object.entries(CATALOGO_COMPLETO) as [string, unknown][];
const efetivo = (ajustes: Record<string, unknown> = {}): CatalogoEfetivo => catalogoEfetivo(SEED, Object.entries(ajustes));
const semana = (catalogo: ReadonlyMap<string, ItemCatalogo>, variacao = 0) => gerarSemana({
  semanaId: '2026-W43', catalogo, limites: { ...INVENTARIO_PADRAO }, diasDaSemanaAnterior: null, variacao,
});

console.log('\nSem ajuste, o catálogo é o do seed');
{
  const c = efetivo();
  const lidoDoSeed = new Map(SEED.map(([id, d]) => [id, lerItemCatalogo(d)]));
  ok(c.itens.size === SEED.length && [...c.itens].every(([id, e]) => igual(e, lidoDoSeed.get(id))),
    `os ${SEED.length} itens do seed, idênticos ao que lerItemCatalogo lê`);
  ok(!c.inativos.size && !c.editados.size && !c.criados.size && !c.ignorados.length, 'nada inativo, editado, criado ou ignorado');
  ok(igual(semana(c.itens), semana(new Map(SEED.map(([id, d]) => [id, lerItemCatalogo(d)!])))), 'gerador: mesma semana com e sem a camada');
}

console.log('\nLer o ajuste');
{
  ok(igual(lerAjuste({ ativo: false }), { campos: null, ativo: false, criado: false }), 'só a desativação');
  ok(lerAjuste({ campos: { instancia: 'agachar' } }) === null, 'item do seed: campo fora dos editáveis (instância) recusa o ajuste');
  ok(lerAjuste({ ativo: 'nao' }) === null && lerAjuste(null) === null && lerAjuste({ campos: [1] }) === null, 'forma torta: null');
  ok(lerAjuste({ campos: { instancia: 'agachar', nome: 'X' }, criado: true }) !== null, 'criado pelo coach: o item inteiro passa');
}

console.log('\nEditar um item do seed');
{
  const c = efetivo({ agachamento_smith: { campos: { nome: 'Agachamento no Smith (barra guiada)', musculosSecundarios: ['core'] } } });
  const e = c.itens.get('agachamento_smith')!;
  const s = CATALOGO_COMPLETO.agachamento_smith;
  ok(!!s && s.instancia === 'agachar', 'agachamento_smith existe no seed, na vaga agachar (base do teste)');
  ok(e.nome === 'Agachamento no Smith (barra guiada)' && igual(e.musculosSecundarios, ['core']), 'nome e secundários editados valem');
  ok(igual(e.musculoPrincipal, s.musculoPrincipal) && e.instancia === s.instancia && igual(e.equipamentos, s.equipamentos),
    'o resto continua vindo do seed (uma revisão no código ainda chega)');
  ok(c.editados.has('agachamento_smith') && igual(c.doSeed.get('agachamento_smith')?.nome, s.nome), 'marcado como editado, com o original guardado');

  const torto = efetivo({ agachamento_smith: { campos: { musculoPrincipal: ['asa'] } } });
  ok(igual(torto.itens.get('agachamento_smith'), lerItemCatalogo(s)) && torto.ignorados.includes('agachamento_smith'),
    'edição que não fecha: vale o seed, e o id sai em `ignorados`');
  const semBase = efetivo({ nao_existe: { campos: { nome: 'Fantasma' } } });
  ok(!semBase.itens.has('nao_existe') && semBase.ignorados.includes('nao_existe'), 'edição de um id que não está no seed: ignorada');

  // Volume: o servidor conta pelo músculo efetivo.
  const vol = volumeDaSessao({ agachamento_smith: 4 }, c.itens);
  ok(vol.core === 2 && vol.gluteo === undefined, 'volume do aluno: os secundários editados (core 0,5 × 4), não os do seed', JSON.stringify(vol));

  // A semana gravada copia o nome efetivo.
  const gravado = Array.from({ length: 20 }, (_, v) => semana(c.itens, v))
    .flatMap((w) => DIAS_SEMANA.flatMap((d) => w.dias[d].blocoPrincipal))
    .find((x) => x.exercicioId === 'agachamento_smith');
  ok(gravado?.nome === 'Agachamento no Smith (barra guiada)', 'a semana gerada grava o nome editado', JSON.stringify(gravado));
}

console.log('\nCriar um exercício');
{
  const c = efetivo({
    coach_agachamento_landmine: {
      criado: true,
      campos: {
        nome: 'Agachamento landmine', instancia: 'agachar', musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['core'],
        equipamentos: ['cavalinho', 'barra'], adaptacoes: {},
      },
    },
  });
  ok(c.itens.get('coach_agachamento_landmine')?.instancia === 'agachar' && c.criados.has('coach_agachamento_landmine'), 'entra no catálogo efetivo, marcado como criado');
  const agachar = [...c.itens.values()].filter((e) => e.instancia === 'agachar').length;
  ok(agachar === [...efetivo().itens.values()].filter((e) => e.instancia === 'agachar').length + 1, 'mais uma opção na vaga agachar');
  const variacoes = Array.from({ length: 30 }, (_, v) => semana(c.itens, v));
  ok(variacoes.some((w) => idsDaSemana(w.dias).has('coach_agachamento_landmine')), 'o gerador sorteia o exercício novo (em alguma das 30 variações)');
  const colidiu = catalogoEfetivo(SEED, [['goblet_squat', { criado: true, campos: { nome: 'Outro', instancia: 'agachar', musculoPrincipal: ['core'], musculosSecundarios: [], equipamentos: ['peso_corporal'], adaptacoes: {} } }]]);
  ok(igual(colidiu.itens.get('goblet_squat'), lerItemCatalogo(CATALOGO_COMPLETO.goblet_squat)), 'criado com id que o seed tem: vale o seed');
}

console.log('\nDesativar');
{
  const base = efetivo();
  const w = semana(base.itens);
  const usado = w.dias.segunda.blocoPrincipal[0].exercicioId;
  const doHiit = w.dias.sexta.hiit!.estacoes[0].slots[0].exercicioId;
  const c = efetivo({ [usado]: { ativo: false }, [doHiit]: { ativo: false } });
  ok(c.inativos.has(usado) && c.itens.has(usado), 'desativado continua no catálogo (semana gravada e volume leem), mas fica em `inativos`');
  const w2 = semana(ativosDe(c));
  ok(!idsDaSemana(w2.dias).has(usado), `o gerador não escolhe o desativado (${usado})`);
  ok(!idsDoHiit(w2.dias).has(doHiit), `nem no HIIT (${doHiit})`);
  ok(!('erro' in lerDias(w.dias, c.itens)), 'a semana que já usa o desativado continua válida');
  ok(volumeDaSessao({ [usado]: 4 }, c.itens)[(c.itens.get(usado) as ExercicioCatalogo).musculoPrincipal[0]] === 4, 'e o volume dele continua contando');

  // Trocas: o desativado sai das opções, o resto do cálculo fica.
  const forca = new Map([...c.itens].filter((p): p is [string, ExercicioCatalogo] => p[1].instancia !== null));
  const outro = w.dias.segunda.blocoPrincipal[1].exercicioId;
  const desligado = efetivo({ [outro]: { ativo: false } });
  const op = opcoesDaVaga({ dias: w.dias, sessao: 'H1', posicao: 1, catalogo: forca, limites: { ...INVENTARIO_PADRAO }, semanaPassada: new Set(), semente: 't' })!;
  const filtrado = semInativos(op, desligado.inativos);
  ok(op.opcoes.some((o) => o.exercicioId === outro) && !filtrado.opcoes.some((o) => o.exercicioId === outro),
    'troca do H: o desativado sai das opções');
  ok(filtrado.opcoes.every((o) => (o.substitutos ?? []).every((s) => s.opcoes.every((x) => !desligado.inativos.has(x.exercicioId)))),
    'e das sugestões de substituto');
  const estacao = w.dias.sexta.hiit!.estacoes[0];
  const vizinho = [...base.itens].find(([id, e]) => e.hiit?.estacoes.includes(estacao.estacao) && !idsDoHiit(w.dias).has(id) && !e.unilateral)?.[0];
  const opH = opcoesDoHiit({
    dias: w.dias, estacao: estacao.estacao, slot: 1, catalogo: base.itens,
    limites: { ...INVENTARIO_PADRAO, kettlebell: 10, wallBall: 4, caixote: 4, cordaNaval: 2, cordaPular: 2, sandbag: 1, airbike: 2, trx: 2, halteres: 4 } as Record<RecursoHiit, number>,
    alunosPorAula: 6, semanaPassada: new Set(),
  });
  ok(!!vizinho && !!opH && !semInativos(opH, new Set([vizinho])).opcoes.some((o) => o.exercicioId === vizinho), 'troca do HIIT: idem');
  ok(semInativos(op, new Set()) === op, 'sem inativo, a resposta passa intacta');
}

console.log('\nO que desativar causa');
{
  const base = efetivo();
  const verticais = [...base.itens].filter(([, e]) => e.instancia === 'puxar_vertical').map(([id]) => id);
  ok(verticais.length >= 2, `puxar_vertical tem ${verticais.length} opções no seed`);
  const quaseTodos = efetivo(Object.fromEntries(verticais.slice(1).map((id) => [id, { ativo: false }])));
  const ultimo = efeitoDeDesativar(quaseTodos, verticais[0]);
  ok(!!ultimo.erro && ultimo.erro.includes('H1'), 'o último ativo de uma vaga do H: recusado, citando as sessões', String(ultimo.erro));
  ok(efeitoDeDesativar(base, verticais[0]).erro === null, 'com outras opções, pode');
  const doisRestam = efetivo(Object.fromEntries(verticais.slice(2).map((id) => [id, { ativo: false }])));
  ok(efeitoDeDesativar(doisRestam, verticais[0]).avisos.some((a) => a.includes('repetir')), 'sobrar menos opções que sessões: aviso de repetição');
  ok(efeitoDeDesativar(base, 'nao_existe').erro !== null, 'id que não existe: erro');
  // Com a vaga no mínimo, o gerador ainda monta a semana inteira.
  ok(DIAS_SEMANA.every((d) => [0, 6].includes(semana(ativosDe(quaseTodos)).dias[d].blocoPrincipal.length)), 'uma opção por vaga ainda gera blocos de 6');
  const hiitPernas = [...base.itens].filter(([, e]) => e.hiit?.estacoes.includes('pernas')).map(([id]) => id);
  const pernasNoFim = efetivo(Object.fromEntries(hiitPernas.slice(1).map((id) => [id, { ativo: false }])));
  let gerou = true;
  try { semana(ativosDe(pernasNoFim)); } catch { gerou = false; }
  ok(gerou, 'HIIT com uma opção em Pernas: o gerador não quebra (sai com estação incompleta)');
  ok(efeitoDeDesativar(pernasNoFim, hiitPernas[0]).avisos.some((a) => a.includes('HIIT pernas')), 'e o coach é avisado da estação');
}

console.log('\nO pedido da tela');
{
  const c = efetivo();
  const novo = {
    nome: 'Agachamento  sumô com KB', musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['posterior_coxa'],
    equipamentos: ['kettlebell'], instancia: 'agachar', adaptacoes: { joelho: 'goblet_squat' },
  };
  const r = lerPedidoExercicio(novo, c);
  ok(!('erro' in r) && r.id === 'coach_agachamento_sumo_com_kb' && r.criado && r.item.nome === 'Agachamento sumô com KB',
    'criar: id coach_ + snake_case sem acento, nome com espaço limpo', JSON.stringify(r));
  ok(!('erro' in r) && igual(r.item.adaptacoes, { joelho: 'goblet_squat' }), 'adaptação aponta para id do catálogo');
  const recusa = (p: object, trecho: string, desc: string) => {
    const x = lerPedidoExercicio(p, c);
    ok('erro' in x && x.erro.includes(trecho), desc, JSON.stringify(x));
  };
  recusa({ ...novo, instancia: null }, 'Escolha onde', 'sem modalidade: recusa');
  recusa({ ...novo, nome: CATALOGO_COMPLETO.goblet_squat.nome.toUpperCase() }, 'Já existe', 'nome repetido (sem caixa): recusa');
  recusa({ ...novo, musculosSecundarios: ['gluteo'] }, 'principal E secundário', 'músculo nos dois: recusa');
  recusa({ ...novo, musculoPrincipal: [] }, 'músculo principal', 'sem músculo principal: recusa');
  recusa({ ...novo, equipamentos: ['esteira'] }, 'equipamento', 'equipamento fora da lista: recusa');
  recusa({ ...novo, adaptacoes: { joelho: 'nao_existe' } }, 'não está no catálogo', 'adaptação para id inexistente: recusa');
  recusa({ ...novo, instancia: 'pular' }, 'Vaga de força', 'vaga desconhecida: recusa');
  recusa({ ...novo, instancia: null, cross: { padrao: 'cardio', unidade: 'reps', rx: 0 } }, 'RX', 'Cross com RX 0: recusa');
  recusa({ ...novo, instancia: null, cross: { padrao: 'cardio', unidade: 'reps', rx: 10, carga: { rx: '20 kg' } } }, 'Scaled', 'Cross com só a carga RX: recusa');
  const cross = lerPedidoExercicio({ ...novo, instancia: null, cross: { padrao: 'agachar', unidade: 'reps', rx: 15 }, hiit: { estacoes: ['pernas'] } }, c);
  ok(!('erro' in cross) && cross.item.instancia === null && cross.item.cross?.rx === 15 && igual(cross.item.hiit?.estacoes, ['pernas']),
    'só Cross + HIIT, sem vaga de força: vale');
  ok(idNovo('Supino', new Set(['coach_supino'])) === 'coach_supino_2', 'id já usado: sufixo _2');

  // Editar um item do seed: grava SÓ o que difere.
  const s = CATALOGO_COMPLETO.goblet_squat;
  const mesmo = { id: 'goblet_squat', nome: s.nome, musculoPrincipal: [...s.musculoPrincipal].reverse(), musculosSecundarios: s.musculosSecundarios,
    equipamentos: s.equipamentos, adaptacoes: s.adaptacoes, unilateral: s.unilateral === true };
  const semMudar = lerPedidoExercicio(mesmo, c);
  ok(!('erro' in semMudar) && semMudar.campos === null && !semMudar.criado, 'editar sem mudar nada (ordem diferente): nenhum campo gravado');
  const mudou = lerPedidoExercicio({ ...mesmo, nome: 'Goblet squat (KB)' }, c);
  ok(!('erro' in mudou) && igual(Object.keys(mudou.campos ?? {}), ['nome']), 'mudar o nome: só o nome gravado');
  const comInstancia = lerPedidoExercicio({ ...mesmo, instancia: 'puxar_vertical' }, c);
  ok(!('erro' in comInstancia) && comInstancia.item.instancia === s.instancia, 'editar não muda a vaga (instância ignorada)');
  const editado = efetivo({ goblet_squat: { campos: { nome: 'Goblet squat (KB)' } } });
  const voltar = lerPedidoExercicio({ id: 'goblet_squat', restaurar: true }, editado);
  ok(!('erro' in voltar) && voltar.campos === null && voltar.item.nome === s.nome, 'restaurar: volta ao seed');
  ok('erro' in lerPedidoExercicio({ id: 'nao_existe', nome: 'X' }, c), 'editar id que não existe: erro');
  const auto = lerPedidoExercicio({ ...mesmo, adaptacoes: { joelho: 'goblet_squat' } }, c);
  ok('erro' in auto && auto.erro.includes('próprio'), 'adaptação para si mesmo: recusa');

  // Editar um criado: grava o item inteiro de novo.
  const comNovo = efetivo({ coach_x: { criado: true, campos: { nome: 'Remada X', instancia: 'puxar_horizontal', musculoPrincipal: ['costas'], musculosSecundarios: [], equipamentos: ['halteres'], adaptacoes: {} } } });
  const ed = lerPedidoExercicio({ id: 'coach_x', nome: 'Remada X2', musculoPrincipal: ['costas'], musculosSecundarios: ['biceps'], equipamentos: ['halteres'] }, comNovo);
  ok(!('erro' in ed) && ed.criado && (ed.campos as { instancia?: string }).instancia === 'puxar_horizontal' && ed.item.nome === 'Remada X2',
    'editar um criado: o item inteiro, com a vaga de antes');
}

console.log('\nA lista da tela');
{
  const c = efetivo({ agachamento_smith: { ativo: false, campos: { nome: 'Goblet (editado)' } } });
  const { exercicios, hyrox, vocabulario } = linhasDoCatalogo(c);
  ok(exercicios.length === SEED.length, `uma linha por exercício (${exercicios.length})`);
  const g = exercicios.find((e) => e.id === 'agachamento_smith')!;
  ok(!g.ativo && g.editado && g.original?.nome === CATALOGO_COMPLETO.agachamento_smith.nome && g.origem === 'seed', 'desativado, editado, com o original');
  ok(igual(g.sessoes, ['H1', 'H2', 'H3']), 'agachar aparece nas 3 sessões H');
  ok(exercicios.every((e, i) => i === 0 || exercicios[i - 1].nome.localeCompare(e.nome, 'pt-BR') <= 0), 'em ordem de nome');
  ok(exercicios.every((e) => e.adaptacoes.every((a) => c.itens.has(a.exercicioId) && a.nome === c.itens.get(a.exercicioId)!.nome)), 'adaptações com o nome do alvo');
  ok(hyrox.length === ESTACOES_HYROX.length && hyrox.every((h) => h.musculoPrincipal.length > 0), 'as 8 estações do Hyrox, com músculos');
  ok(igual(vocabulario.instancias, INSTANCIAS), 'vocabulário vem das listas fechadas do modelo');
}

console.log('\nO fixture da tela (coach/semana-do-box/core/fixtures/catalogo.json)');
{
  // A resposta do listarCatalogoBox com um ajuste de cada tipo — é o que os testes da tela leem.
  // Mudou o catálogo ou a forma da linha? `node lib/checar-catalogo.js --gravar-fixture` e confira o diff.
  const ajustes = {
    agachamento_smith: { campos: { nome: 'Agachamento no Smith (barra guiada)', musculosSecundarios: ['gluteo', 'core'] } },
    remada_curvada_barra: { ativo: false },
    coach_remada_landmine: {
      criado: true,
      campos: {
        nome: 'Remada landmine', instancia: 'puxar_horizontal', musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'core'],
        equipamentos: ['cavalinho', 'barra'], adaptacoes: { lombar: 'agachamento_smith' },
      },
    },
  };
  const esperado = `${JSON.stringify(linhasDoCatalogo(efetivo(ajustes)), null, 2)}\n`;
  const arquivo = join(__dirname, '..', '..', 'coach', 'semana-do-box', 'core', 'fixtures', 'catalogo.json');
  if (process.argv.includes('--gravar-fixture')) writeFileSync(arquivo, esperado);
  if (!existsSync(arquivo)) console.log('  ! fixture ausente (clone parcial?) — comparação pulada');
  else ok(readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n') === esperado, 'o fixture é a saída atual do linhasDoCatalogo', 'rode node lib/checar-catalogo.js --gravar-fixture');
}

console.log(falhas ? `\n✗ ${falhas} falha(s)\n` : '\n✓ catálogo do coach ok\n');
if (falhas) process.exitCode = 1;
