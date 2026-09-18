/**
 * EXCLUSÃO DE TREINO CONTRA UM FIRESTORE DE VERDADE (emulador).
 *
 *     npm run checar:emulador      # sobe o emulador, roda e derruba
 *
 * POR QUE ISTO EXISTE SEPARADO DO `checar.ts`: aquele é lógica pura, roda em
 * dois segundos e não toca em rede. Apagar um treino é o oposto — é quase todo
 * Firestore: subcoleção que não some com o pai, `FieldValue.delete()` dentro de
 * um mapa, lote com validação SÍNCRONA que estoura antes do commit. Nada disso
 * um teste puro alcança, e foi justamente aí que o coach viu "erro interno".
 *
 * O QUE ELE NÃO PROVA: que a função está PUBLICADA. Um callable que não existe
 * no projeto devolve o mesmo `internal` de uma função que lançou — a diferença
 * só aparece no console do Firebase.
 *
 * A lógica de `achar` abaixo é uma CÓPIA da que está em `deleteWorkoutLousa`
 * (`index.ts`). Duplicação consciente, como a de `volume-agregado.ts`: extrair a
 * função exigiria injetar o `db`, e o custo disso é maior que o de manter doze
 * linhas em dia — se divergirem, este teste para de valer e é para isso que
 * serve o comentário.
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { limparParaGravar } = require('./lib/catalogo.js');
initializeApp({ projectId: 'fake' });
const db = getFirestore();
const UID = 'coach1';
const EH_DATA = /^\d{4}-\d{2}-\d{2}$/;
const col = db.collection(`coaches/${UID}/lousas`);

// A MESMA logica de `achar` da function, extraida para poder rodar aqui.
async function achar(pedido, dataPedida) {
  if (pedido) { const d = await col.doc(pedido).get(); if (d.exists) return d; }
  const data = EH_DATA.test(dataPedida) ? dataPedida
    : (pedido.slice(0, 10).match(EH_DATA) ? pedido.slice(0, 10) : '');
  if (!data) return null;
  const doDia = await col.where('dateId', '==', data).limit(3).get();
  if (doDia.size === 1) return doDia.docs[0];
  if (doDia.size > 1) throw new Error(`AMBIGUO:${doDia.size}`);
  return null;
}
async function apagar(pedido, dataPedida) {
  const snap = await achar(pedido, dataPedida);
  if (!snap) return { apagado: true, achou: false };
  const doc = limparParaGravar(snap.data() ?? {});
  const dateId = typeof doc.dateId === 'string' ? doc.dateId : '';
  const fichas = await snap.ref.collection('fichas').limit(300).get();
  const emails = fichas.docs.map((d) => (d.data() ?? {}).email).filter((e) => typeof e === 'string' && e.trim());
  const portais = [];
  if (emails.length && dateId) {
    const docs = await db.getAll(...[...new Set(emails)].map((e) => db.doc(`treinoAluno/${e}`)));
    for (const d of docs) {
      const h = (d.data() ?? {}).hibrido;
      if (h?.[dateId]?.workoutId === snap.id) portais.push(d.id);
    }
  }
  const lote = db.batch();
  lote.set(db.doc(`coaches/${UID}/lousasApagadas/${snap.id}`),
    { ...doc, apagadoEm: FieldValue.serverTimestamp(), fichasApagadas: fichas.size });
  for (const d of fichas.docs) lote.delete(d.ref);
  for (const e of portais) {
    lote.set(db.doc(`treinoAluno/${e}`),
      { hibrido: { [dateId]: FieldValue.delete() }, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  }
  lote.delete(snap.ref);
  await lote.commit();
  return { apagado: true, achou: true, id: snap.id, fichas: fichas.size, portais: portais.length };
}

let falhas = 0;
const ok = (c, d) => { console.log(`  ${c ? '✓' : '✗'} ${d}`); if (!c) falhas++; };

(async () => {
  console.log('\nEXCLUSÃO CONTRA O FIRESTORE DE VERDADE (emulador)\n');

  // === 1. TREINO LEGADO: sem campo workoutId no documento ===
  await col.doc('legado-antigo').set({
    dateId: '2026-09-18',
    treino: { titulo: 'HIPERTROFIA 2 errado', sistema: 'Hipertrofia', blocos: [
      { id: 'C', nome: 'Força', exercicios: [{ nome: 'Agachamento', series: 4, reps: '8', implemento: 'Barra', grupamentos: ['Quadríceps'], observacao: '' }] },
    ] },
    // SEM `workoutId` no corpo, SEM `geradoEm`, SEM `textoOriginal` — formato antigo.
  });
  await col.doc('legado-antigo').collection('fichas').doc('a1').set({ email: 'aluno@x.com', linhas: [] });
  await db.doc('treinoAluno/aluno@x.com').set({ hibrido: { '2026-09-18': { workoutId: 'legado-antigo', titulo: 'x' } } });

  const r1 = await apagar('legado-antigo', '2026-09-18');
  ok(r1.achou && r1.fichas === 1 && r1.portais === 1, `treino SEM campo workoutId é apagado (fichas ${r1.fichas}, portais ${r1.portais})`);
  ok(!(await col.doc('legado-antigo').get()).exists, 'o documento sumiu da coleção');
  ok((await col.doc('legado-antigo').collection('fichas').doc('a1').get()).exists === false, 'a ficha da turma foi junto (sem órfã)');
  const portal = (await db.doc('treinoAluno/aluno@x.com').get()).data();
  ok(!portal.hibrido?.['2026-09-18'], 'a publicação no Portal do aluno saiu');
  const arq = await db.doc(`coaches/${UID}/lousasApagadas/legado-antigo`).get();
  ok(arq.exists && arq.data().treino.titulo === 'HIPERTROFIA 2 errado', 'a cópia de segurança foi gravada');

  // === 2. ID QUE NÃO EXISTE MAIS, achado pela DATA ===
  await col.doc('outro-id').set({ dateId: '2026-09-20', treino: { titulo: 'Só deste dia' } });
  const r2 = await apagar('id-que-nao-existe-mais', '2026-09-20');
  ok(r2.achou && r2.id === 'outro-id', `o fallback por data achou o treino certo (${r2.id})`);

  // === 3. DIA DUPLICADO: tem de RECUSAR, não escolher no escuro ===
  await col.doc('dup-1').set({ dateId: '2026-09-21', treino: { titulo: 'Bom' } });
  await col.doc('dup-2').set({ dateId: '2026-09-21', treino: { titulo: 'Duplicado' } });
  let recusou = '';
  try { await apagar('sumiu', '2026-09-21'); } catch (e) { recusou = e.message; }
  ok(recusou.startsWith('AMBIGUO'), `dia com 2 treinos RECUSA em vez de apagar o errado (${recusou})`);
  ok((await col.doc('dup-1').get()).exists && (await col.doc('dup-2').get()).exists, 'e nenhum dos dois foi tocado');

  // === 4. JÁ NÃO EXISTE: sucesso, não erro ===
  const r4 = await apagar('nunca-existiu', '2026-01-01');
  ok(r4.apagado && !r4.achou, 'apagar o que não existe devolve sucesso (clique duplo)');

  // === 5. DOIS TREINOS NO MESMO DIA: apagar um não leva o Portal do outro ===
  await col.doc('manha').set({ dateId: '2026-09-22', treino: { titulo: 'Manhã' } });
  await col.doc('noite').set({ dateId: '2026-09-22', treino: { titulo: 'Noite' } });
  await col.doc('manha').collection('fichas').doc('b1').set({ email: 'b@x.com' });
  await db.doc('treinoAluno/b@x.com').set({ hibrido: { '2026-09-22': { workoutId: 'noite', titulo: 'Noite' } } });
  const r5 = await apagar('manha', '2026-09-22');
  const p5 = (await db.doc('treinoAluno/b@x.com').get()).data();
  ok(r5.portais === 0, 'apagar o da manhã não mexeu no Portal');
  ok(p5.hibrido?.['2026-09-22']?.workoutId === 'noite', 'o treino da NOITE continua publicado para o aluno');

  console.log(falhas === 0 ? '\n✓ Todas passaram.\n' : `\n✗ ${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('EXPLODIU:', e.message); process.exit(1); });
