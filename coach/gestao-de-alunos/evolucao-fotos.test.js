// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/evolucao-fotos.test.js
 *
 * O avaliador de evolução por IA sem DOM e sem Firebase: as fotos das duas
 * fontes (Diário e avaliações) com o peso do período, a escolha das 8 que vão
 * para a IA, o pedido (que só leva o primeiro nome) e o relatório em HTML (texto
 * do modelo — daí o teste de escape).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FOTOS_IA, escolherParaIA, fotosDoAluno, htmlFotosParaIA, htmlRelatorio, legendaDaFoto, pedidoParaIA,
} from './evolucao-fotos.js?v=27';

const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/projeto-garage-f0a2f.firebasestorage.app/o/';
const docDiario = (dia, extra = {}) => ({
  id: dia, dia, em: 1000,
  url: `${BUCKET}diario%2Fana%40x.com%2F${dia}.webp?alt=media&token=t`,
  miniUrl: `${BUCKET}diario%2Fana%40x.com%2F${dia}_mini.webp?alt=media&token=t`,
  ...extra,
});
const fotoAval = (n, slot) => `${BUCKET}gestao%2Fuid1%2F012%2Faval-${n}-${slot}.webp?alt=media&token=t`;
const aluno = (avaliacoes = []) => ({ id: '012', nome: 'Ana Paula Souza', sexo: 'Feminino', objetivo: 'Emagrecimento', avaliacoes });

test('junta Diário e avaliações em ordem cronológica, com o peso do período', () => {
  const a = aluno([
    { num: 1, dataRealizada: '2026-09-01', peso: '74,0', fotos: { frente: fotoAval(1, 'frente'), lado: fotoAval(1, 'lado') } },
    { num: 2, dataRealizada: '2026-10-20', peso: 71.5, fotos: { costas: fotoAval(2, 'costas') } },
  ]);
  const fotos = fotosDoAluno(a, [
    docDiario('2026-09-10', { angulo: 'frente' }),
    docDiario('2026-10-05'),
    docDiario('2026-08-01', { angulo: 'lado' }),
  ]);
  assert.deepEqual(fotos.map((f) => `${f.data} ${f.angulo || '-'} ${f.origem} ${f.peso ?? ''}`), [
    '2026-08-01 lado diario ',          // 31 dias da avaliação: fora da janela de peso
    '2026-09-01 frente avaliacao 74',
    '2026-09-01 lado avaliacao 74',
    '2026-09-10 frente diario 74',      // 9 dias da avaliação de 01/09
    '2026-10-05 - diario 71.5',         // mais perto da de 20/10 (15 dias) que da de 01/09 (34)
    '2026-10-20 costas avaliacao 71.5',
  ]);
});

test('foto do Diário no mesmo dia e ângulo de uma da avaliação fica de fora (a do coach tem o peso)', () => {
  const a = aluno([{ dataRealizada: '2026-09-01', peso: 74, fotos: { frente: fotoAval(1, 'frente') } }]);
  const fotos = fotosDoAluno(a, [docDiario('2026-09-01', { angulo: 'frente' }), docDiario('2026-09-02', { angulo: 'frente' })]);
  assert.deepEqual(fotos.map((f) => `${f.data} ${f.origem}`), ['2026-09-01 avaliacao', '2026-09-02 diario']);
});

test('sem ler o Diário (null), entram só as fotos das avaliações; URL de fora não entra', () => {
  const a = aluno([
    { dataRealizada: '2026-09-01', fotos: { frente: fotoAval(1, 'frente'), lado: 'https://evil.example/x.webp' } },
    { dataRealizada: '', fotos: { frente: fotoAval(9, 'frente') } }, // avaliação sem data
  ]);
  const fotos = fotosDoAluno(a, null);
  assert.equal(fotos.length, 1);
  assert.equal(fotos[0].angulo, 'frente');
  assert.equal(fotosDoAluno(aluno(), []).length, 0);
  assert.equal(fotosDoAluno(null, null).length, 0);
});

test('a IA recebe o antes e o depois de cada ângulo e, sobrando lugar, o meio do caminho', () => {
  const dias = (n, angulo) => Array.from({ length: n }, (_, i) => ({
    data: `2026-${String(i + 1).padStart(2, '0')}-10`, angulo, url: `u-${angulo}-${i}`, mini: '', origem: /** @type {const} */ ('diario'),
  }));
  const frente = dias(10, 'frente');
  const perfil = dias(3, 'lado');
  const escolhidas = escolherParaIA([...frente, ...perfil]);
  assert.equal(escolhidas.length, 5 + 3, 'até 8: as 3 de perfil e 5 de frente');
  const urls = new Set(escolhidas.map((f) => f.url));
  for (const u of ['u-frente-0', 'u-frente-9', 'u-lado-0', 'u-lado-2', 'u-lado-1']) assert.ok(urls.has(u), u);
  assert.deepEqual(escolhidas.map((f) => f.data), [...escolhidas.map((f) => f.data)].sort(), 'em ordem cronológica');

  const poucas = escolherParaIA(dias(3, 'frente'));
  assert.equal(poucas.length, 3, 'com menos de 8, vão todas');
});

test('cada ângulo com duas fotos leva as pontas antes de qualquer foto do meio', () => {
  const f = (data, angulo) => ({ data, angulo, url: `${angulo}-${data}`, mini: '', origem: /** @type {const} */ ('diario') });
  const muitas = ['frente', 'lado', 'costas'].flatMap((ang) => ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].map((d) => f(d, ang)));
  const semAngulo = [f('2026-01-05'), f('2026-04-05')];
  const escolhidas = escolherParaIA([...muitas, ...semAngulo]);
  assert.equal(escolhidas.length, MAX_FOTOS_IA);
  for (const ang of ['frente', 'lado', 'costas']) {
    assert.ok(escolhidas.some((x) => x.url === `${ang}-2026-01-01`) && escolhidas.some((x) => x.url === `${ang}-2026-04-01`), ang);
  }
  assert.ok(escolhidas.some((x) => !x.angulo && x.data === '2026-01-05') && escolhidas.some((x) => !x.angulo && x.data === '2026-04-05'),
    'as fotos sem ângulo (Diário antigo) contam como um ângulo à parte');
});

test('ângulo com uma foto só entra por último, se sobrar lugar', () => {
  const f = (data, angulo) => ({ data, angulo, url: `${angulo}-${data}`, mini: '', origem: /** @type {const} */ ('diario') });
  const escolhidas = escolherParaIA([f('2026-01-01', 'frente'), f('2026-03-01', 'frente'), f('2026-02-01', 'costas')], 2);
  assert.deepEqual(escolhidas.map((x) => x.url), ['frente-2026-01-01', 'frente-2026-03-01']);
  assert.equal(escolherParaIA([f('2026-01-01', 'frente'), f('2026-02-01', 'costas')]).length, 2, 'sem pontas, as únicas vão');
});

test('o pedido leva só o primeiro nome, o sexo e o objetivo da ficha, e as fotos sem a miniatura', () => {
  const a = aluno([{ dataRealizada: '2026-09-01', peso: 74, fotos: { frente: fotoAval(1, 'frente') } }]);
  const fotos = fotosDoAluno(a, [docDiario('2026-10-01')]);
  const p = pedidoParaIA(a, fotos);
  assert.equal(p.nome, 'Ana');
  assert.equal(p.sexo, 'feminino');
  assert.equal(p.objetivo, 'Emagrecimento');
  assert.deepEqual(p.fotos[0], { data: '2026-09-01', url: fotoAval(1, 'frente'), origem: 'avaliacao', angulo: 'frente', peso: 74 });
  assert.equal('mini' in p.fotos[1], false);
  assert.equal('angulo' in p.fotos[1], false, 'foto antiga sem ângulo vai sem ângulo');
  const outro = pedidoParaIA({ nome: '', sexo: 'Outro' }, []);
  assert.equal('sexo' in outro, false);
  assert.equal('objetivo' in outro, false);
});

test('legenda e fileira das fotos', () => {
  assert.equal(legendaDaFoto({ data: '2026-09-01', angulo: 'lado', url: '', mini: '', origem: 'diario', peso: 82.4 }), '01/09/26 · Perfil · 82,4 kg');
  assert.equal(legendaDaFoto({ data: '2026-09-01', url: '', mini: '', origem: 'diario' }), '01/09/26 · sem ângulo');
  const f = { data: '2026-09-01', angulo: 'frente', url: 'u', mini: 'm"><script>', origem: /** @type {const} */ ('avaliacao') };
  const html = htmlFotosParaIA([f, { ...f, data: '2026-10-01' }], 5);
  assert.ok(html.includes('2 de 5 fotos'));
  assert.ok(html.includes('Avaliação'));
  assert.ok(!html.includes('<script>'), 'a URL vai escapada');
  assert.equal(htmlFotosParaIA([], 0), '');
});

test('relatório: as quatro partes, o feedback editável e todo texto do modelo escapado', () => {
  const html = htmlRelatorio({
    qualidade: { nivel: 'parcial', avisos: ['Luz diferente em <b>15/10</b>.'] },
    evolucao: ['Cintura mais fina.'],
    atencao: [],
    feedback: 'Ana, parabéns! </textarea><img src=x onerror=alert(1)>',
  }, 4);
  for (const t of ['Qualidade da comparação', 'Evolução visível', 'Pontos a melhorar / atenção', 'Sugestão de feedback para o aluno']) {
    assert.ok(html.includes(t), t);
  }
  assert.ok(html.includes('Compara com ressalvas') && html.includes('fg-warn'));
  assert.ok(html.includes('&lt;b&gt;15/10&lt;/b&gt;'));
  assert.ok(!html.includes('</textarea><img'), 'o feedback não fecha o campo');
  assert.ok(html.includes('id="evo-feedback"') && html.includes('id="evo-copiar"'));
  assert.ok(html.includes('Nada apontado.'), 'parte vazia diz que está vazia');
  assert.ok(html.includes('4 fotos'));
  assert.ok(htmlRelatorio({ qualidade: { nivel: '???', avisos: [] }, evolucao: [], atencao: [], feedback: '' }, 2).includes('fg-warn'),
    'nível desconhecido vira "com ressalvas"');
});
