/**
 * Confere a publicação do Quadro (`quadro-publicar.ts`) sem rede e sem emulador.
 *
 *     npm run checar:quadro
 *
 * O pedido de exemplo é a semana 45 do coach (07/11/2026): H1 com acessório,
 * Cross com Força escrita e WOD com quantidades, Hyrox com as 8 estações e
 * HIIT com 3 estações (o unilateral escrito duas vezes).
 */
import { CATALOGO_COMPLETO } from './catalogo-completo';
import { DIAS_SEMANA, ESTACOES_HYROX, type DiaProgramado, type DiaSemana, type ItemCatalogo } from './modelo-box';
import { contaDaSemana, lerSessaoAluno, reconferirSemana, semanaEmBrancoNosDias } from './semana-box';
import { idsDoPedidoQuadro, lerDiaQuadro, lerSemanaQuadro, manterDiasPassados } from './quadro-publicar';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}

// Um acessório criado pelo coach (sem vaga no H, sem HIIT, sem Cross).
const catalogo = new Map<string, ItemCatalogo>(Object.entries(CATALOGO_COMPLETO));
catalogo.set('coach_abs_canoinha', {
  id: 'coach_abs_canoinha', nome: 'Abs Canoinha', instancia: null, musculoPrincipal: ['core'], musculosSecundarios: [],
  equipamentos: ['peso_corporal'], unilateral: false, adaptacoes: {}, hiit: null, cross: null, acessorio: true,
} as unknown as ItemCatalogo);

const h = (ids: string[], series = 3, repeticoes = '8-12') => ({ exercicios: ids.map((exercicioId) => ({ exercicioId, series, repeticoes, rir: '0-3' })) });
const H1 = h(['agachamento_smith', 'supino_smith', 'mesa_flexora', 'remada_aberta_neutra', 'desenvolvimento_halter', 'puxada_aberta_pronada', 'abdominal_supra']);
const H2 = h(['agachamento_smith', 'supino_smith', 'mesa_flexora', 'remada_aberta_neutra', 'desenvolvimento_halter', 'puxada_aberta_pronada', 'abdominal_remador']);
const H3 = h(['agachamento_smith', 'supino_smith', 'mesa_flexora', 'remada_aberta_neutra', 'elevacao_lateral_halter', 'puxada_aberta_pronada', 'coach_abs_canoinha']);
const mob = (aula: string) => ({ aula, titulo: 'Mobilidade', linhas: ['5 Min'] });
const pedido = {
  segunda: { treinos: [], aviso: { tipo: 'feriado', texto: 'Finados' } },
  terca: {
    treinos: ['Cross', 'H1'], forca: H1,
    cross: {
      formato: 'AMRAP', minutos: 18, movimentos: [
        { exercicioId: 'abdominal_remador', quantidade: 12, unidade: 'reps' },
        { exercicioId: 'remada_halter_unilateral', quantidade: 8, unidade: 'reps' },
        { exercicioId: 'thruster_halteres', quantidade: 10, unidade: 'reps' },
        { exercicioId: 'corrida', quantidade: 200, unidade: 'metros', alternativas: ['Remo', '1 min Air bike'] },
      ],
    },
    blocosTexto: [mob('H1'), mob('Cross'), { aula: 'Cross', titulo: 'Força 5 x 8-12', linhas: ['Dumbbell Shoulder Press', 'Stiff / RDL'] }],
  },
  quarta: { treinos: ['H2'], forca: H2, blocosTexto: [mob('H2')] },
  quinta: { treinos: ['Hyrox', 'H2'], forca: H2, hyrox: { estacoes: ESTACOES_HYROX.map((estacao) => ({ estacao })) } },
  sexta: { treinos: ['H3'], forca: H3 },
  sabado: {
    treinos: ['HIIT', 'H3'], forca: H3,
    hiit: {
      estacoes: [
        { estacao: 'pernas', slots: [{ exercicioId: 'afundo_reverso' }, { exercicioId: 'afundo_reverso' }, { exercicioId: 'agachamento_livre' }] },
        { estacao: 'superiores', slots: [{ exercicioId: 'remada_trx' }, { exercicioId: 'flexao' }, { exercicioId: 'thruster_halteres' }] },
        { estacao: 'cardio', slots: [{ exercicioId: 'air_bike_sprint' }, { exercicioId: 'polichinelo' }, { exercicioId: 'mountain_climber' }, { exercicioId: 'burpee' }] },
      ],
    },
  },
};

console.log('\n== a semana 45 do coach');
const r = lerSemanaQuadro(pedido, catalogo);
ok(!('erro' in r), 'a semana escrita passa', 'erro' in r ? r.erro : '');
if (!('erro' in r)) {
  const d = r.dias;
  ok(d.segunda.treinos.length === 0 && d.segunda.aviso?.tipo === 'feriado', 'segunda: feriado, sem treino');
  ok(d.terca.treinos.join() === 'Cross,H1' && d.terca.blocosMetabolicos[0]?.papel === 'principal' && d.terca.sessaoForca?.papel === 'alternativa',
    'terça: Cross principal, H1 alternativa');
  ok(d.terca.blocoPrincipal.length === 7 && d.terca.blocoPrincipal.every((e) => e.series === 3 && e.repeticoes === '8-12' && e.rir === '0-3' && e.descansoSeg === 90),
    'terça: o H1 com 7 × 3, 8-12, RIR 0-3, 90 s');
  const wod = d.terca.cross;
  ok(wod?.formato === 'AMRAP' && wod.minutos === 18 && wod.rodadas === null, 'o WOD: AMRAP 18 min');
  ok(JSON.stringify(wod?.movimentos.map((m) => [m.rx, m.scaled, m.unidade])) === JSON.stringify([[12, 12, 'reps'], [8, 8, 'reps'], [10, 10, 'reps'], [200, 200, 'metros']]),
    'o WOD com as quantidades ESCRITAS (não as do catálogo)', JSON.stringify(wod?.movimentos.map((m) => [m.rx, m.unidade])));
  ok(wod?.movimentos[3].nome === 'Corrida (rua) / Remo / 1 min Air bike', 'as opções da linha entram no nome', wod?.movimentos[3].nome);
  ok(wod?.movimentos[1].porLado === true, 'remada serrote: por lado');
  ok(wod?.tecnica === null && wod.estrategia === null, 'sem o foco automático do gerador (a Força vai como texto)');
  ok(d.terca.blocosTexto.length === 3 && d.terca.blocosTexto[2].linhas.join('|') === 'Dumbbell Shoulder Press|Stiff / RDL', 'terça: os blocos de texto');
  ok(d.quarta.treinos.join() === 'H2' && d.quinta.treinos.join() === 'Hyrox,H2', 'H2 na quarta e na quinta');
  ok(d.quinta.hyrox?.estacoes.length === 8 && d.quinta.hyrox.formato === 'prova', 'quinta: Hyrox com as 8 estações, pela tabela');
  ok(d.sabado.blocoPrincipal[6].exercicioId === 'coach_abs_canoinha' && d.sabado.blocoPrincipal[6].instancia === null, 'sábado: acessório no H3');
  const est = d.sabado.hiit?.estacoes ?? [];
  ok(est.map((e) => e.estacao).join() === 'pernas,superiores,cardio', 'HIIT com as 3 estações escritas');
  ok(est[0].slots.map((s) => s.lado ?? '-').join('') === 'DE-' && est[0].slots.length === 3, 'afundo reverso escrito duas vezes = D e E', est[0].slots.map((s) => s.lado).join());
  ok(semanaEmBrancoNosDias(d as Record<DiaSemana, DiaProgramado>) === false, 'não é semana em branco');
  let conta: unknown = null;
  try { conta = contaDaSemana(d as Record<DiaSemana, DiaProgramado>, { smith: 2, banco: 2, halteres: 23 } as never, 6); } catch (e) { conta = e; }
  ok(!(conta instanceof Error), 'a conta do gerador roda na semana do Quadro (só nota)', String(conta));
  const rec = reconferirSemana({ dias: d }, { smith: 2 } as never, 6);
  ok(rec !== null, 'a reconferência do inventário lê a semana do Quadro');
  const sessao = lerSessaoAluno({ exercicios: [{ exercicioId: 'coach_abs_canoinha', seriesValidas: 3 }] }, d.sabado);
  ok(!('erro' in sessao) && sessao.series.coach_abs_canoinha === 3, 'o aluno registra o acessório do H3');
}

console.log('\n== o que impede');
const com = (dia: DiaSemana, x: object) => ({ ...pedido, [dia]: { ...(pedido as any)[dia], ...x } });
const erro = (p: unknown) => { const x = lerSemanaQuadro(p, catalogo); return 'erro' in x ? x.erro : ''; };
ok(erro(com('terca', { forca: h(['nao_existe']) })).includes('não está no catálogo'), 'nome fora do catálogo');
ok(erro(com('segunda', { aviso: null })).includes('precisa do motivo'), 'dia sem aula sem o motivo');
ok(erro(com('terca', { cross: { ...pedido.terca.cross, movimentos: [{ exercicioId: 'corrida', unidade: 'metros' }] } })).includes('escreva a quantidade'),
  'movimento do WOD sem quantidade');
ok(erro(com('terca', { cross: { formato: 'AMRAP', movimentos: pedido.terca.cross.movimentos } })).includes('minutos'), 'AMRAP sem os minutos');
ok(erro(com('quinta', { hyrox: { estacoes: [{ estacao: 'skierg' }] } })).includes('8 estações'), 'Hyrox sem as 8 estações');
ok(erro(com('sabado', { hiit: { estacoes: [{ estacao: 'pernas', slots: ['afundo_reverso', 'remada_trx', 'flexao', 'polichinelo'].map((exercicioId) => ({ exercicioId })) }] } })).includes('4 vagas'),
  'estação do HIIT com mais de 4 vagas (unilateral ocupa 2)');
ok(erro(com('quarta', { treinos: ['H2', 'H3'] })).includes('no máximo uma sessão H'), 'dois H no mesmo dia');
const { segunda: _s, ...semSegunda } = pedido;
ok(erro(semSegunda).includes('Falta a segunda'), 'pedido sem um dia');
ok(erro(Object.fromEntries(DIAS_SEMANA.map((d) => [d, { treinos: [], aviso: { tipo: 'recesso', texto: '' } }]))).includes('nenhum treino'), 'semana sem treino nenhum');
const dia = lerDiaQuadro({ treinos: ['H1'], forca: H1, blocosTexto: [{ aula: 'H1', titulo: '', linhas: ['   ', ''] }] }, 'segunda', catalogo);
ok(!('erro' in dia) && dia.dia.blocosTexto.length === 0, 'bloco de texto vazio é ignorado');

console.log('\n== ids e dias que já passaram');
ok(idsDoPedidoQuadro(pedido).includes('coach_abs_canoinha') && idsDoPedidoQuadro(pedido).includes('air_bike_sprint'), 'os ids do pedido (H, WOD, HIIT)');
const m = manterDiasPassados({ segunda: 'novo', terca: 'novo' } as never, { segunda: 'velho' }, ['segunda', 'terca'] as DiaSemana[]);
ok((m.dias as any).segunda === 'velho' && (m.dias as any).terca === 'novo' && m.mantidos.join() === 'segunda', 'semana publicada: o dia que passou fica como estava');

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
if (falhas) process.exit(1);
