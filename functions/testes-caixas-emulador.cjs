/**
 * A ESCRITA SEGURA NA FICHA CONTRA UM FIRESTORE DE VERDADE (emulador).
 * Fase 1 · etapa 1 (PLANO-FASE1-ETAPA1.md).
 *
 *     npm run checar:emulador:caixas   # sobe o emulador, roda e derruba (precisa de Java 21)
 *
 * Roda no CI (job `emulador` do deploy.yml). Duas partes:
 *
 *  1. AS REGRAS (firestore.rules), com o SDK web e um login de coach de
 *     mentira: a ficha só se grava com o carimbo do servidor; a gravação
 *     inteira da Gestão antiga (sem carimbo) é recusada; avaliação, log, Fila
 *     e interruptor continuam livres para o coach; aluno não lê ficha.
 *
 *  2. O SERVIDOR APLICANDO AS CAIXAS (lib/caixas-servico.js), com o Admin SDK:
 *     transação, só os campos que mudaram, itens consumidos, log com id fixo,
 *     Portal atualizado, e rodar duas vezes não duplica nada.
 *
 * O teste puro (checar-caixas) prova as regras de negócio sem rede; este prova
 * o que só o Firestore faz: a regra com `request.time`, o curinga das regras, a
 * transação, o FieldPath com hífen, o `deleteField` dentro de mapa.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('firebase/firestore');

const PROJETO = 'demo-garage';
const COACH = 'G6gfpahorCfptVxOM26sCjxMOqb2'; // o UID da lista de ehCoach() — os testes falham se ela mudar sem este
const [HOST, PORTA] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok  ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU  ${nome}\n        ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n        ') : e}`); }
}

async function regras() {
  console.log('\n1) As regras da ficha (firestore.rules)');
  const env = await initializeTestEnvironment({
    projectId: PROJETO,
    firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8'), host: HOST, port: Number(PORTA) },
  });
  const ficha = `gestao/${COACH}/alunos/001`;
  // O ponto de partida, sem regra no caminho: a ficha que está na nuvem.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await fs.setDoc(fs.doc(db, `gestao/${COACH}`), { schema: 2, seq: 1 });
    await fs.setDoc(fs.doc(db, ficha), { id: '001', nome: 'Ana', pagamentos: { '2026-10': true }, presencas: ['2026-11-03'] });
  });
  const coach = env.authenticatedContext(COACH).firestore();
  const aluno = env.authenticatedContext('aluno123', { email: 'ana@box.com' }).firestore();

  await caso('coach grava por campo, numa transação, com o carimbo: passa', async () => {
    await assertSucceeds(fs.runTransaction(coach, async (tx) => {
      const r = fs.doc(coach, ficha);
      const s = await tx.get(r);
      assert.ok(s.exists());
      tx.update(r, new fs.FieldPath('telefone'), '1199', new fs.FieldPath('pagamentos', '2026-11'), true,
        new fs.FieldPath('atualizadoEm'), fs.serverTimestamp());
    }));
    const d = (await env.withSecurityRulesDisabled(async (ctx) => (await fs.getDoc(fs.doc(ctx.firestore(), ficha))).data()));
    assert.deepEqual(d.pagamentos, { '2026-10': true, '2026-11': true }, 'o mês com hífen virou chave do mapa, não caminho');
  });

  await caso('Gestão antiga: a ficha inteira sem o carimbo é RECUSADA', async () => {
    await assertFails(fs.setDoc(fs.doc(coach, ficha), { id: '001', nome: 'Ana (aba velha)' }));
  });

  await caso('atualização sem carimbo, ou com um carimbo velho copiado do cache: recusada', async () => {
    await assertFails(fs.updateDoc(fs.doc(coach, ficha), { telefone: 'x' }));
    await assertFails(fs.updateDoc(fs.doc(coach, ficha), { telefone: 'x', atualizadoEm: fs.Timestamp.fromMillis(1) }));
  });

  await caso('ficha nova com o carimbo: passa; apagar a ficha: passa', async () => {
    await assertSucceeds(fs.setDoc(fs.doc(coach, `gestao/${COACH}/alunos/002`), { id: '002', nome: 'Bia', atualizadoEm: fs.serverTimestamp() }));
    await assertSucceeds(fs.deleteDoc(fs.doc(coach, `gestao/${COACH}/alunos/002`)));
  });

  await caso('avaliação, log, Fila, livro do Pix e interruptor: livres para o coach (sem carimbo)', async () => {
    await assertSucceeds(fs.setDoc(fs.doc(coach, `${ficha}/avaliacoes/1`), { num: 1, peso: 70 }));
    await assertSucceeds(fs.setDoc(fs.doc(coach, `gestao/${COACH}/eventos/e1`), { tipo: 'presenca' }));
    await assertSucceeds(fs.setDoc(fs.doc(coach, `gestao/${COACH}/automacao/feitas`), { 'recibo:001:2026-11': { status: 'enviada' } }, { merge: true }));
    await assertSucceeds(fs.setDoc(fs.doc(coach, `gestao/${COACH}/cobrancasPix/p1`), { aplicadaEm: 1 }, { merge: true }));
    await assertSucceeds(fs.setDoc(fs.doc(coach, `gestao/${COACH}/sistema/caixas`), { aplicador: 'servidor' }));
    await assertSucceeds(fs.getDocs(fs.collection(coach, `gestao/${COACH}/alunos`)));
  });

  await caso('depois da virada para a v2, o meta não volta a ter o blob alunos[] (nem pelo curinga)', async () => {
    await assertFails(fs.setDoc(fs.doc(coach, `gestao/${COACH}`), { schema: 2, seq: 1, alunos: [] }));
    await assertSucceeds(fs.setDoc(fs.doc(coach, `gestao/${COACH}`), { schema: 2, seq: 2 }, { mergeFields: ['seq', 'schema'] }));
  });

  await caso('aluno (ou outra conta) não lê nem grava ficha, avaliação ou interruptor', async () => {
    await assertFails(fs.getDoc(fs.doc(aluno, ficha)));
    await assertFails(fs.getDoc(fs.doc(aluno, `${ficha}/avaliacoes/1`)));
    await assertFails(fs.setDoc(fs.doc(aluno, ficha), { nome: 'x', atualizadoEm: fs.serverTimestamp() }));
    await assertFails(fs.setDoc(fs.doc(aluno, `gestao/${COACH}/sistema/caixas`), { aplicador: 'gestao' }));
  });

  await env.cleanup();
}

module.exports = { caso, PROJETO, COACH };

if (require.main === module) {
  (async () => {
    await regras();
    if (typeof module.exports.servidor === 'function') await module.exports.servidor();
    if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
    console.log('\nTudo certo.');
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
