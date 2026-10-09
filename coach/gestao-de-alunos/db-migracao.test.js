// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/db-migracao.test.js
 *
 * A migração do blob v1 para as subcoleções. O que precisa ficar provado: nada
 * do histórico se perde (ida e volta dá o mesmo blob), o `emailNorm` sai igual
 * ao do servidor, o documento raiz nunca some, e toda falha antes da virada
 * deixa o v1 como estava.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planejarMigracao, operacoes, emLotes, verificar, remontar, migrarNuvem, decidirTrava,
  normalizarEmail, ehIdDeDoc, canonico, idDoBackup, CAMPO_EMAIL_NORM, SCHEMA_V2, TRAVA_EXPIRA_MS,
} from './db-migracao.js?v=12';
import { portaEmMemoria } from './db-memoria.js';

const AGORA = new Date(2026, 9, 7, 14, 30).getTime(); // 07/10/2026, hora local

/** Um blob v1 com o que aparece de verdade: e-mail torto, ficha sem e-mail,
 *  feedback sem id e repetido, campo undefined, presenças, financeiro, matriz. */
function blobV1() {
  return {
    seq: 3,
    produtos: [{ id: 'energetico', nome: 'Energético', preco: 10 }],
    feriados: { '2026-10-12': false },
    alunos: [
      {
        id: '001', nome: 'Ana Lima', email: '  Ana.Lima@Box.COM ', status: 'ativo', criadoEm: 1000,
        presencas: ['2026-10-01', '2026-10-03'], pagamentos: { '2026-10': { pago: true } },
        matrizIndividualizacao: { nivel: 'intermediario', cargas: { referencia: { agachamento: { kg: 80, reps: 5 } } } },
        avaliacoes: [
          { num: 1, data: '2026-01-10', peso: 70.5, fotos: { frente: 'https://x/1.webp' } },
          { num: 2, data: '2026-04-10', peso: 68.2 },
        ],
        feedbacks: [
          { id: 'fb-a', data: '2026-10-03', esforco: 8, criadoEm: 3000 },
          { id: 'fb-b', data: '2026-10-01', esforco: 6, criadoEm: 2000 },
        ],
        obs: undefined,
      },
      { id: '002', nome: 'Bia', email: '', criadoEm: 2000, avaliacoes: [], pagoPor: { id: '001', escopo: 'plano' } },
      {
        id: '003', nome: 'Caio', email: 'caio@box.com', status: 'inativo', criadoEm: 3000,
        avaliacoes: [{ num: 1, data: '2026-02-01' }],
        feedbacks: [{ data: '2026-09-01', criadoEm: 500 }, { id: 'dup', criadoEm: 400 }, { id: 'dup', criadoEm: 300 }],
      },
    ],
  };
}

/* ---------- utilidades ---------- */

test('normalizarEmail igual ao do servidor (functions/src/acesso.ts)', () => {
  assert.equal(normalizarEmail('  Ana@Box.COM '), 'ana@box.com');
  for (const lixo of ['', 'ana', 'ana@box', 'a b@c.com', null, 42, {}]) assert.equal(normalizarEmail(lixo), '', JSON.stringify(lixo));
});

test('ehIdDeDoc igual ao do servidor (functions/src/gestao-leitura.ts)', () => {
  assert.ok(ehIdDeDoc('001'));
  for (const ruim of ['', '001/avaliacoes/3', '.', '..', '__id__']) assert.equal(ehIdDeDoc(ruim), false, ruim);
});

test('canonico não depende da ordem das chaves', () => {
  assert.equal(canonico({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), canonico({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  assert.notEqual(canonico({ a: 1 }), canonico({ a: '1' }));
});

test('backup nomeado com a data local', () => {
  assert.equal(idDoBackup(AGORA), 'v1-20261007');
});

/* ---------- plano ---------- */

test('fatia o blob: fichas sem avaliações/feedbacks, avaliações por num, feedbacks por id', () => {
  const p = planejarMigracao(blobV1(), { agora: AGORA });
  assert.equal(p.ok, true, p.problemas.join('\n'));
  assert.deepEqual(p.contagem, { alunos: 3, avaliacoes: 3, feedbacks: 5 });
  assert.deepEqual(p.fichas.map((f) => f.id), ['001', '002', '003']);
  for (const f of p.fichas) {
    assert.ok(!('avaliacoes' in f.dados) && !('feedbacks' in f.dados), `ficha ${f.id} sem as listas`);
    assert.equal(f.dados.id, f.id);
  }
  assert.deepEqual(p.avaliacoes.map((a) => `${a.alunoId}/${a.id}`), ['001/1', '001/2', '003/1']);
  assert.equal(p.avaliacoes[0].dados.fotos.frente, 'https://x/1.webp', 'avaliação inteira, com as fotos');
  const ana = p.fichas[0].dados;
  assert.deepEqual(ana.matrizIndividualizacao, blobV1().alunos[0].matrizIndividualizacao, 'matriz fica na ficha');
  assert.deepEqual(ana.presencas, ['2026-10-01', '2026-10-03']);
  assert.ok(!('obs' in ana), 'undefined não vai para o Firestore');
});

test('CRÍTICO: toda ficha sai com emailNorm, minúsculo e sem espaço', () => {
  const p = planejarMigracao(blobV1(), { agora: AGORA });
  assert.deepEqual(p.fichas.map((f) => f.dados[CAMPO_EMAIL_NORM]), ['ana.lima@box.com', '', 'caio@box.com']);
  assert.equal(p.fichas[0].dados.email, '  Ana.Lima@Box.COM ', 'o e-mail digitado não é reescrito');
  const torto = planejarMigracao({ alunos: [{ id: '9', email: 'sem-arroba' }] }, { agora: AGORA });
  assert.equal(torto.fichas[0].dados[CAMPO_EMAIL_NORM], '');
  assert.match(torto.avisos.join(), /não parece e-mail/);
});

test('feedback sem id ganha id determinístico, e id repetido não sobrescreve o outro', () => {
  const p = planejarMigracao(blobV1(), { agora: AGORA });
  const caio = p.feedbacks.filter((f) => f.alunoId === '003').map((f) => f.id);
  assert.deepEqual(caio, ['fb-500', 'dup', 'dup-2']);
  assert.deepEqual(planejarMigracao(blobV1(), { agora: AGORA + 999 }).feedbacks.map((f) => f.id), p.feedbacks.map((f) => f.id),
    'mesmo blob, mesmos ids — rodar de novo não duplica');
});

test('bloqueia o que obrigaria a inventar dado', () => {
  const casos = [
    [{ alunos: [{ nome: 'Sem id' }] }, /sem id/],
    [{ alunos: [{ id: '001' }, { id: '001' }] }, /id repetido/],
    [{ alunos: [{ id: 'a/b' }] }, /não serve de id/],
    [{ alunos: [{ id: '001', avaliacoes: [{ data: 'x' }] }] }, /sem número válido/],
    [{ alunos: [{ id: '001', avaliacoes: [{ num: 1 }, { num: 1 }] }] }, /nº 1 repetida/],
    [{ alunos: [{ id: '001', obs: 'x'.repeat(950 * 1024) }] }, /a ficha sozinha tem/],
    [{ seq: 1 }, /não tem a lista/],
  ];
  for (const [blob, msg] of casos) {
    const p = planejarMigracao(/** @type {any} */ (blob), { agora: AGORA });
    assert.equal(p.ok, false, JSON.stringify(blob).slice(0, 60));
    assert.match(p.problemas.join('\n'), /** @type {RegExp} */ (msg));
  }
});

test('posição que não é aluno vira aviso, não bloqueio', () => {
  const p = planejarMigracao({ alunos: [null, { id: '001' }] }, { agora: AGORA });
  assert.equal(p.ok, true);
  assert.equal(p.contagem.alunos, 1);
  assert.match(p.avisos.join(), /Posição 0/);
});

test('o backup é o documento raiz inteiro, sem a trava da rodada', () => {
  const raiz = { ...blobV1(), migracao: { status: 'andando', em: 1, aparelho: 'x' } };
  const p = planejarMigracao(raiz, { agora: AGORA });
  assert.equal(p.backupId, 'v1-20261007');
  assert.deepEqual(p.backup, JSON.parse(JSON.stringify(blobV1())));
});

/* ---------- ida e volta ---------- */

test('NADA SE PERDE: remontar(fatiar(blob)) devolve o blob (+ emailNorm)', () => {
  const blob = blobV1();
  const p = planejarMigracao(blob, { agora: AGORA });
  const porta = portaEmMemoria(null);
  return porta.gravarLote(operacoes(p, { fichas: new Map(), avaliacoes: new Map(), feedbacks: new Map() })).then(async () => {
    const volta = remontar({ seq: 3, produtos: blob.produtos, feriados: blob.feriados, schema: 2, migradoEm: AGORA }, await porta.lerSubcolecoes());
    const esperado = JSON.parse(JSON.stringify(blob));
    for (const a of esperado.alunos) {
      a[CAMPO_EMAIL_NORM] = normalizarEmail(a.email);
      a.avaliacoes = a.avaliacoes || [];
      a.feedbacks = (a.feedbacks || []).sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0));
    }
    assert.equal(canonico(volta), canonico(esperado));
  });
});

/* ---------- lotes e operações ---------- */

test('lotes de no máximo 500 operações', () => {
  const lotes = emLotes(Array.from({ length: 1201 }, (_, i) => i));
  assert.deepEqual(lotes.map((l) => l.length), [500, 500, 201]);
  assert.deepEqual(emLotes([]), []);
});

test('box grande: 400 alunos com 3 avaliações cada viram 4 lotes, nenhum acima de 500', () => {
  const alunos = Array.from({ length: 400 }, (_, i) => ({
    id: String(i + 1).padStart(3, '0'), email: `a${i}@box.com`, avaliacoes: [1, 2, 3].map((num) => ({ num })),
  }));
  const p = planejarMigracao({ alunos }, { agora: AGORA });
  const lotes = emLotes(operacoes(p, { fichas: new Map(), avaliacoes: new Map(), feedbacks: new Map() }));
  assert.equal(lotes.flat().length, 1600);
  assert.ok(lotes.every((l) => l.length <= 500));
  assert.equal(lotes.length, 4);
});

test('sobra de uma tentativa anterior é apagada', () => {
  const p = planejarMigracao(blobV1(), { agora: AGORA });
  const existentes = {
    fichas: new Map([['001', {}], ['999', {}]]),
    avaliacoes: new Map([['001', new Map([['1', {}], ['7', {}]])], ['999', new Map([['1', {}]])]]),
    feedbacks: new Map([['001', new Map([['velho', {}]])]]),
  };
  const apagar = operacoes(p, existentes).filter((o) => o.tipo === 'delete').map((o) => o.caminho.join('/'));
  assert.deepEqual(apagar.sort(), ['alunos/001/avaliacoes/7', 'alunos/001/feedbacks/velho', 'alunos/999', 'alunos/999/avaliacoes/1'].sort());
});

test('verificar acusa contagem, campo diferente e ficha sobrando', () => {
  const p = planejarMigracao(blobV1(), { agora: AGORA });
  const certo = {
    fichas: new Map(p.fichas.map((f) => [f.id, f.dados])),
    avaliacoes: new Map(['001', '003'].map((id) => [id, new Map(p.avaliacoes.filter((a) => a.alunoId === id).map((a) => [a.id, a.dados]))])),
    feedbacks: new Map(['001', '003'].map((id) => [id, new Map(p.feedbacks.filter((a) => a.alunoId === id).map((a) => [a.id, a.dados]))])),
  };
  assert.equal(verificar(p, certo).ok, true);

  const errado = { ...certo, fichas: new Map(certo.fichas) };
  errado.fichas.set('001', { ...certo.fichas.get('001'), nome: 'Outra' });
  errado.fichas.set('999', {});
  errado.fichas.delete('002');
  const v = verificar(p, errado);
  assert.equal(v.ok, false);
  assert.match(v.diferencas.join('\n'), /Ficha 001 gravada diferente/);
  assert.match(v.diferencas.join('\n'), /Ficha 002 não foi gravada/);
  assert.match(v.diferencas.join('\n'), /Ficha 999 sobrando/);
});

/* ---------- trava ---------- */

test('trava: outro aparelho há pouco segura; trava velha ou do mesmo aparelho, não', () => {
  const raiz = { alunos: [], migracao: { status: 'andando', em: AGORA - 60_000, aparelho: 'celular' } };
  assert.deepEqual(decidirTrava(raiz, { em: AGORA, aparelho: 'pc' }).ok, false);
  assert.equal(decidirTrava(raiz, { em: AGORA, aparelho: 'celular' }).ok, true);
  assert.equal(decidirTrava(raiz, { em: AGORA + TRAVA_EXPIRA_MS, aparelho: 'pc' }).ok, true);
  assert.equal(decidirTrava({ ...raiz, migracao: { ...raiz.migracao, status: 'falhou' } }, { em: AGORA, aparelho: 'pc' }).ok, true);
  assert.deepEqual(decidirTrava({ schema: 2 }, { em: AGORA, aparelho: 'pc' }), { ok: false, motivo: 'ja-migrado' });
  assert.deepEqual(decidirTrava(null, { em: AGORA, aparelho: 'pc' }), { ok: false, motivo: 'sem-dados' });
});

/* ---------- a rodada inteira ---------- */

test('migra: raiz vira meta (schema 2, sem alunos), backup intacto, subcoleções completas', async () => {
  const porta = portaEmMemoria(blobV1());
  const r = await migrarNuvem(porta, { agora: AGORA, aparelho: 'pc' });
  assert.equal(r.estado, 'migrado', JSON.stringify(r));
  assert.deepEqual(r.contagem, { alunos: 3, avaliacoes: 3, feedbacks: 5 });

  const raiz = porta.docs.get('');
  assert.ok(raiz, 'o documento raiz NUNCA é apagado');
  assert.equal(raiz.schema, SCHEMA_V2);
  assert.ok(!('alunos' in raiz), 'alunos saiu da raiz');
  assert.equal(raiz.seq, 3);
  assert.deepEqual(raiz.produtos, blobV1().produtos, 'produtos ficam no meta');
  assert.deepEqual(raiz.feriados, blobV1().feriados, 'feriados ficam no meta');
  assert.equal(raiz.migracao.status, 'concluida');
  assert.equal(raiz.migracao.backup, 'v1-20261007');

  assert.deepEqual(porta.docs.get('backup/v1-20261007'), JSON.parse(JSON.stringify(blobV1())), 'backup = blob original');
  assert.equal(porta.docs.get('alunos/001').emailNorm, 'ana.lima@box.com');
  assert.equal(porta.docs.get('alunos/001/avaliacoes/2').peso, 68.2);
  assert.equal(porta.docs.get('alunos/003/feedbacks/dup-2').criadoEm, 300);
});

test('já migrado: não mexe em nada', async () => {
  const porta = portaEmMemoria({ schema: 2, seq: 3 });
  const antes = canonico([...porta.docs]);
  assert.equal((await migrarNuvem(porta, { agora: AGORA })).estado, 'ja-migrado');
  assert.equal(canonico([...porta.docs]), antes);
});

test('rodar duas vezes é seguro: a segunda vê schema 2 e para', async () => {
  const porta = portaEmMemoria(blobV1());
  await migrarNuvem(porta, { agora: AGORA, aparelho: 'pc' });
  const depois = canonico([...porta.docs]);
  assert.equal((await migrarNuvem(porta, { agora: AGORA + 1, aparelho: 'pc' })).estado, 'ja-migrado');
  assert.equal(canonico([...porta.docs]), depois);
});

test('outro aparelho migrando agora: não grava nada', async () => {
  const porta = portaEmMemoria({ ...blobV1(), migracao: { status: 'andando', em: AGORA - 1000, aparelho: 'celular' } });
  const r = await migrarNuvem(porta, { agora: AGORA, aparelho: 'pc' });
  assert.equal(r.estado, 'ocupado');
  assert.deepEqual([...porta.docs.keys()], [''], 'nem backup, nem ficha');
});

test('blob bloqueado: não trava nem grava, e devolve os problemas', async () => {
  const porta = portaEmMemoria({ alunos: [{ id: '001' }, { id: '001' }] });
  const r = await migrarNuvem(porta, { agora: AGORA });
  assert.equal(r.estado, 'bloqueado');
  assert.match((r.problemas || []).join(), /repetido/);
  assert.ok(!porta.docs.get('').migracao, 'nem a trava foi tomada');
});

test('aparelho v1 regravou o blob durante a cópia: a virada NÃO acontece', async () => {
  const porta = portaEmMemoria(blobV1(), {
    antesDoLote: (p) => { const b = blobV1(); b.alunos[1].nome = 'Bia Editada no celular'; p.regravarRaiz(b); },
  });
  const r = await migrarNuvem(porta, { agora: AGORA, aparelho: 'pc' });
  assert.equal(r.estado, 'blob-mudou');
  const raiz = porta.docs.get('');
  assert.ok(Array.isArray(raiz.alunos), 'o blob continua lá — é a verdade');
  assert.equal(raiz.alunos[1].nome, 'Bia Editada no celular', 'e a edição do celular não se perdeu');
  assert.ok(!('schema' in raiz));

  // Próxima rodada (mundo quieto): copia a versão nova e vira.
  const porta2 = portaEmMemoria(raiz, { subcolecoes: Object.fromEntries([...porta.docs].filter(([k]) => k.startsWith('alunos/'))) });
  assert.equal((await migrarNuvem(porta2, { agora: AGORA + 1, aparelho: 'pc' })).estado, 'migrado');
  assert.equal(porta2.docs.get('alunos/002').nome, 'Bia Editada no celular');
});

test('rede cai no meio dos lotes: raiz intacta, trava marcada como falhou, e a nova rodada termina', async () => {
  const alunos = Array.from({ length: 600 }, (_, i) => ({ id: `a${i}`, email: `a${i}@box.com` }));
  const porta = portaEmMemoria({ seq: 600, alunos }, {
    antesDoLote: (_p, i) => { if (i === 1) throw Object.assign(new Error('offline'), { code: 'unavailable' }); },
  });
  const r = await migrarNuvem(porta, { agora: AGORA, aparelho: 'pc' });
  assert.equal(r.estado, 'falhou');
  assert.equal(r.erro, 'unavailable');
  const raiz = porta.docs.get('');
  assert.equal(raiz.alunos.length, 600, 'blob intacto');
  assert.ok(!('schema' in raiz));
  assert.equal(raiz.migracao.status, 'falhou');

  // Volta a rede: a mesma porta (com o primeiro lote já gravado) termina sem duplicar.
  const porta2 = portaEmMemoria(raiz, { subcolecoes: Object.fromEntries([...porta.docs].filter(([k]) => k.startsWith('alunos/'))) });
  const r2 = await migrarNuvem(porta2, { agora: AGORA + 1, aparelho: 'celular' });
  assert.equal(r2.estado, 'migrado', JSON.stringify(r2));
  assert.equal([...porta2.docs.keys()].filter((k) => /^alunos\/[^/]+$/.test(k)).length, 600);
});

test('aluno removido entre duas tentativas não ressuscita', async () => {
  const blob = blobV1();
  const porta = portaEmMemoria(blob, { subcolecoes: { 'alunos/999': { id: '999', nome: 'Removido' }, 'alunos/999/avaliacoes/1': { num: 1 } } });
  assert.equal((await migrarNuvem(porta, { agora: AGORA })).estado, 'migrado');
  assert.ok(!porta.docs.has('alunos/999') && !porta.docs.has('alunos/999/avaliacoes/1'));
});

test('cópia que não bate na verificação: não vira', async () => {
  const porta = portaEmMemoria(blobV1());
  const gravar = porta.gravarLote;
  porta.gravarLote = async (ops) => gravar(ops.filter((o) => o.caminho.join('/') !== 'alunos/003/avaliacoes/1'));
  const r = await migrarNuvem(porta, { agora: AGORA });
  assert.equal(r.estado, 'falhou');
  assert.match((r.diferencas || []).join(), /003\/1 não foi gravada/);
  assert.ok(Array.isArray(porta.docs.get('').alunos), 'blob continua sendo a verdade');
  assert.equal(porta.docs.get('').migracao.erro, 'verificacao');
});
