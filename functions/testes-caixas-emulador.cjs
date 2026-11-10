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
    // withSecurityRulesDisabled não devolve o que a função devolve: a leitura sai por fora.
    let d;
    await env.withSecurityRulesDisabled(async (ctx) => { d = (await fs.getDoc(fs.doc(ctx.firestore(), ficha))).data(); });
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

  await env.clearFirestore();
  await env.cleanup();
}

async function servidor() {
  console.log('\n2) O servidor aplicando as caixas (lib/caixas-servico.js, Admin SDK)');
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const { aplicarCaixasDoAluno, aplicarPixDaCobranca, aplicarTudoQueEstiverPendente } = require('./lib/caixas-servico.js');
  const { regrasDaGestao } = require('./lib/caixas.js');
  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  // O relógio anda a cada chamada: duas aplicações nunca gerariam o mesmo id de linha por acaso.
  let relogio = Date.UTC(2026, 10, 4, 21, 15);
  const deps = { regras: await regrasDaGestao(), agora: () => relogio++, log: { info() {}, warn() {} } };
  const EMAIL = 'ana@box.com';
  const ficha = () => db.doc(`gestao/${COACH}/alunos/001`).get().then((s) => s.data());
  const itemUgym = (id, agora) => ({ [`ugym|${id}`]: { coachUid: COACH, origem: 'ugym', dia: '2026-11-04', hora: '18:10', checkin: { hoje: '2026-11-04', agora }, em: Date.now() } });

  await db.doc(`gestao/${COACH}`).set({ schema: 2, seq: 1 });
  await db.doc(`gestao/${COACH}/alunos/001`).set({
    id: '001', nome: 'Ana', email: 'Ana@Box.com', emailNorm: EMAIL, status: 'ativo', telefone: '14999', mensalidade: 130, vencimento: 10,
    diasTreino: ['seg', 'qua', 'qui'], horarios: { seg: '18:10', qua: '18:10', qui: '19:10' }, presencas: ['2026-11-02'], pagamentos: { '2026-10': true },
  });
  await db.doc(`portal/${EMAIL}`).set({ email: EMAIL, presencas: ['2026-11-02'], pagamentos: { '2026-10': true } });
  await db.doc(`checkinsUgym/${EMAIL}`).set({ itens: itemUgym('r1', '18:12') });

  await caso('interruptor com a Gestão (ou sem documento): o servidor não mexe em nada', async () => {
    const r = await aplicarCaixasDoAluno(db, COACH, EMAIL, deps);
    assert.equal(r.aplicou, false);
    assert.deepEqual((await ficha()).presencas, ['2026-11-02']);
    assert.ok(Object.keys((await db.doc(`checkinsUgym/${EMAIL}`).get()).data().itens).length === 1, 'o item continua na caixa');
  });

  await db.doc(`gestao/${COACH}/sistema/caixas`).set({ aplicador: 'servidor' });

  await caso('interruptor no servidor: a presença entra, o item sai, o log e o Portal acompanham', async () => {
    const r = await aplicarCaixasDoAluno(db, COACH, EMAIL, deps);
    assert.equal(r.aplicou, true);
    const f = await ficha();
    assert.deepEqual(f.presencas, ['2026-11-02', '2026-11-04']);
    assert.equal(f.presencaHoras['2026-11-04'], '18:12');
    assert.equal(f.telefone, '14999', 'o resto da ficha fica');
    assert.ok(f.atualizadoEm && typeof f.atualizadoEm.toMillis === 'function', 'com o carimbo do servidor');
    assert.deepEqual((await db.doc(`checkinsUgym/${EMAIL}`).get()).data().itens, {});
    const evs = (await db.collection(`gestao/${COACH}/eventos`).get()).docs.map((d) => d.data());
    assert.equal(evs.length, 1);
    assert.equal(evs[0].origem, 'servidor');
    assert.deepEqual((await db.doc(`portal/${EMAIL}`).get()).data().presencas, ['2026-11-02', '2026-11-04']);
  });

  await caso('rodar de novo, com a caixa já vazia: nada', async () => {
    assert.equal((await aplicarCaixasDoAluno(db, COACH, EMAIL, deps)).aplicou, false);
  });

  await caso('o gatilho e a varredura ao mesmo tempo: aplica uma vez só', async () => {
    await db.doc(`checkinsLousa/${EMAIL}`).set({ itens: { 'lousa|2026-11-05|19:10': { coachUid: COACH, origem: 'lousa', dia: '2026-11-05', hora: '19:10', checkin: { hoje: '2026-11-05', agora: '19:10' }, em: Date.now() } } });
    const antes = (await db.collection(`gestao/${COACH}/eventos`).get()).size;
    await Promise.all([aplicarCaixasDoAluno(db, COACH, EMAIL, deps), aplicarTudoQueEstiverPendente(db, COACH, deps)]);
    const f = await ficha();
    assert.deepEqual(f.presencas, ['2026-11-02', '2026-11-04', '2026-11-05']);
    assert.equal((await db.collection(`gestao/${COACH}/eventos`).get()).size, antes + 1, 'uma linha só nos Registros');
  });

  await caso('Pix aprovado: a baixa do mês, o rastro, a bandeira desligada e a linha do recibo', async () => {
    const aprovadoEm = Date.UTC(2026, 10, 4, 21, 0); // 18:00 de 04/11 no box
    await db.doc(`gestao/${COACH}/cobrancasPix/p1`).set({ paymentId: 'p1', alunoId: '001', mesId: '2026-11', valor: 130, valorPago: 130, status: 'aprovado', soMensalidade: true, avisarGestao: true, aprovadoEm });
    const r = await aplicarPixDaCobranca(db, COACH, 'p1', deps);
    assert.equal(r.aplicou, true);
    const f = await ficha();
    assert.deepEqual(f.pagamentos, { '2026-10': true, '2026-11': true });
    assert.deepEqual(f.pixPagos, { '2026-11': 'p1' });
    // O registro do pagamento (etapa 3), na mesma gravação; ele não vai para o Portal.
    assert.deepEqual(f.recebimentos, { '2026-11': { valor: 130, data: '2026-11-04', meio: 'pix-portal', comprovante: null, conferidoPor: 'mercado-pago', paymentId: 'p1', registradoEm: aprovadoEm, origem: 'pix' } });
    assert.deepEqual(f.presencas, ['2026-11-02', '2026-11-04', '2026-11-05'], 'as presenças não foram tocadas');
    const c = (await db.doc(`gestao/${COACH}/cobrancasPix/p1`).get()).data();
    assert.equal(c.avisarGestao, false);
    assert.ok(c.aplicadaEm > 0);
    const ev = (await db.doc(`gestao/${COACH}/eventos/pix-p1`).get()).data();
    assert.equal(ev.tipo, 'pagamento');
    assert.equal(ev.dados.mesId, '2026-11');
    const portal = (await db.doc(`portal/${EMAIL}`).get()).data();
    assert.deepEqual(portal.pagamentos, { '2026-10': true, '2026-11': true });
    assert.equal(portal.recebimentos, undefined, 'o registro fica só na Gestão');
  });

  await caso('caixa de um e-mail sem ficha fica intacta', async () => {
    await db.doc('checkinsUgym/ninguem@box.com').set({ itens: itemUgym('r7', '18:40') });
    const r = await aplicarCaixasDoAluno(db, COACH, 'ninguem@box.com', deps);
    assert.equal(r.aplicou, false);
    assert.equal(Object.keys((await db.doc('checkinsUgym/ninguem@box.com').get()).data().itens).length, 1);
  });

  await caso('depois do servidor, a gravação por campo do coach não apaga o que ele pôs', async () => {
    // A transação da Gestão (db-firestore.js), aqui com o Admin SDK: lê e grava só o telefone.
    const ref = db.doc(`gestao/${COACH}/alunos/001`);
    await db.runTransaction(async (tx) => { await tx.get(ref); tx.update(ref, 'telefone', '1199', 'atualizadoEm', FieldValue.serverTimestamp()); });
    const f = await ficha();
    assert.equal(f.telefone, '1199');
    assert.deepEqual(f.pixPagos, { '2026-11': 'p1' });
    assert.deepEqual(f.presencas, ['2026-11-02', '2026-11-04', '2026-11-05']);
  });

  // ---- Etapa 2: a falta da chamada da Lousa e o crédito de box fechado (quinta 05/11/2026, 20:30 em São Paulo) ----
  // Depois das três aulas do teste (18:10, 19:10 e 20:10): a falta de HOJE só vale quando a hora da aula chegou.
  let relogioQui = Date.UTC(2026, 10, 5, 23, 30);
  const depsQui = { ...deps, agora: () => relogioQui++ };
  const DIA = '2026-11-05';
  const fichaDe = (id) => db.doc(`gestao/${COACH}/alunos/${id}`).get().then((s) => s.data());
  const eventosCom = async (prefixo) => (await db.collection(`gestao/${COACH}/eventos`).get()).docs.filter((d) => d.id.startsWith(prefixo));
  const novaFicha = (id, nome, email, extra) => ({
    id, nome, email, emailNorm: email.toLowerCase(), status: 'ativo', diasTreino: ['qui'], horarios: { qui: '19:10' }, presencas: [], pagamentos: {}, ...extra,
  });
  await db.doc(`gestao/${COACH}/alunos/003`).set(novaFicha('003', 'Caio', 'Caio@Box.com'));
  await db.doc('portal/caio@box.com').set({ email: 'caio@box.com', presencas: [], faltas: {} });
  await db.doc(`gestao/${COACH}/alunos/004`).set(novaFicha('004', 'Bia', 'bia@box.com', { diasTreino: ['seg', 'qui'], horarios: { seg: '18:10', qui: '20:10' } }));
  const { Timestamp } = require('firebase-admin/firestore');
  const chamadaV = (ms, extra) => ({ fechadaEm: Timestamp.fromMillis(ms), atualizadoEm: Timestamp.fromMillis(ms), presentes: [], faltaram: [], ...extra });

  await caso('chamada da Lousa: quem faltou ganha a falta com origem lousa; quem já tem presença (a Ana) fica como está', async () => {
    const versao = 1700000000000;
    await db.doc(`lousa/${DIA}/chamadas/19:10`).set(chamadaV(versao, { faltaram: ['Caio@Box.com', 'ana@box.com'] }));
    const r = await require('./lib/caixas-servico.js').aplicarFaltasDaChamada(db, COACH, DIA, '19:10', depsQui);
    assert.equal(r.faltas, 1);
    const f = await fichaDe('003');
    assert.equal(f.faltas[DIA].tipo, 'no-show');
    assert.equal(f.faltas[DIA].origem, 'lousa');
    assert.ok(f.atualizadoEm && typeof f.atualizadoEm.toMillis === 'function', 'com o carimbo do servidor');
    assert.equal((await fichaDe('001')).faltas, undefined, 'a Ana já tinha presença: nenhuma falta');
    const evs = await eventosCom('lousa-falta-003-');
    assert.deepEqual(evs.map((d) => d.id), [`lousa-falta-003-${DIA}-1910`]);
    assert.equal(evs[0].data().origem, 'servidor');
    assert.equal((await db.doc('portal/caio@box.com').get()).data().faltas[DIA].origem, 'lousa');
  });

  await caso('a mesma chamada de novo (gatilho + varredura): nada, nem linha repetida', async () => {
    const r = await require('./lib/caixas-servico.js').aplicarFaltasDaChamada(db, COACH, DIA, '19:10', depsQui);
    assert.equal(r.aplicou, false);
    await Promise.all([
      require('./lib/caixas-servico.js').aplicarFaltasDaChamada(db, COACH, DIA, '19:10', depsQui),
      aplicarTudoQueEstiverPendente(db, COACH, depsQui),
    ]);
    assert.equal((await eventosCom('lousa-falta-003-')).length, 1);
  });

  await caso('fechar de novo com o Caio em "Veio": o check-in tira a falta e a chamada nova não a repõe', async () => {
    await db.doc(`lousa/${DIA}/chamadas/19:10`).set(chamadaV(1700000001000, { presentes: ['Caio@Box.com'], faltaram: [] }));
    await db.doc('checkinsLousa/caio@box.com').set({ itens: { [`lousa|${DIA}|19:10`]: { coachUid: COACH, origem: 'lousa', dia: DIA, hora: '19:10', checkin: { hoje: DIA, agora: '19:10' }, em: Date.now() } } });
    assert.equal((await aplicarCaixasDoAluno(db, COACH, 'caio@box.com', depsQui)).aplicou, true);
    const f = await fichaDe('003');
    assert.deepEqual(f.presencas, [DIA]);
    assert.deepEqual(f.faltas, {}, 'a falta com origem lousa saiu');
    assert.equal((await require('./lib/caixas-servico.js').aplicarFaltasDaChamada(db, COACH, DIA, '19:10', depsQui)).aplicou, false);
    assert.deepEqual((await fichaDe('003')).faltas, {});
    assert.deepEqual((await db.doc('portal/caio@box.com').get()).data().faltas, {});
  });

  await caso('a varredura pega a chamada que o gatilho perdeu (hoje) e é limitada a ontem e hoje', async () => {
    await db.doc(`lousa/${DIA}/chamadas/20:10`).set(chamadaV(1700000002000, { faltaram: ['bia@box.com'] }));
    await db.doc('lousa/2026-11-01/chamadas/20:10').set(chamadaV(1700000003000, { faltaram: ['bia@box.com'] })); // antiga: fora da varredura
    const r = await aplicarTudoQueEstiverPendente(db, COACH, depsQui);
    assert.equal(r.faltas, 1);
    assert.equal((await fichaDe('004')).faltas[DIA].origem, 'lousa');
    assert.equal((await fichaDe('004')).faltas['2026-11-01'], undefined);
  });

  await caso('dia de box fechado: a varredura dá +1 crédito a quem tinha aula e não veio, uma vez só', async () => {
    await db.doc(`gestao/${COACH}`).set({ schema: 2, seq: 1, feriados: { '2026-11-02': false, '2026-11-20': false } }, { merge: true });
    const r = await aplicarTudoQueEstiverPendente(db, COACH, depsQui);
    assert.equal(r.creditos, 1, 'só a Bia (a Ana veio nesse dia; o dia 20 ainda não chegou)');
    const c = (await fichaDe('004')).atestados['2026-11-02'];
    assert.equal(c.tipo, 'fechado');
    assert.equal(c.expira, '2026-11-30');
    assert.equal((await eventosCom('fechado-004-2026-11-02')).length, 1);
    assert.equal((await db.doc(`gestao/${COACH}/sistema/fechamento`).get()).data().aplicados['2026-11-02'] > 0, true);
    const de_novo = await aplicarTudoQueEstiverPendente(db, COACH, depsQui);
    assert.equal(de_novo.creditos, 0);
    assert.equal((await eventosCom('fechado-004-')).length, 1);
  });

  await caso('o coach tira a falta à mão e fecha a chamada de novo (outra versão): a falta NÃO volta', async () => {
    await db.doc(`gestao/${COACH}/alunos/004`).update({ faltas: {} });
    await db.doc(`lousa/${DIA}/chamadas/20:10`).set(chamadaV(1700000005000, { faltaram: ['bia@box.com'] }));
    await require('./lib/caixas-servico.js').aplicarFaltasDaChamada(db, COACH, DIA, '20:10', depsQui);
    assert.deepEqual((await fichaDe('004')).faltas, {});
    assert.equal((await eventosCom('lousa-falta-004-')).length, 1);
  });

  await caso('a chamada refeita sem o aluno em nenhuma lista tira a falta que a Lousa gravou (a do coach fica)', async () => {
    await db.doc(`gestao/${COACH}/alunos/005`).set(novaFicha('005', 'Duda', 'duda@box.com', { diasTreino: ['qui', 'ter'], horarios: { qui: '18:10', ter: '18:10' } }));
    await db.doc(`gestao/${COACH}/alunos/006`).set(novaFicha('006', 'Eva', 'eva@box.com', { horarios: { qui: '18:10' }, faltas: { [DIA]: { em: 1, tipo: 'no-show', aula: { data: DIA, hora: '18:10' } } } }));
    await db.doc(`lousa/${DIA}/chamadas/18:10`).set(chamadaV(1700000006000, { faltaram: ['duda@box.com'] }));
    const sv = require('./lib/caixas-servico.js');
    assert.equal((await sv.aplicarFaltasDaChamada(db, COACH, DIA, '18:10', depsQui)).faltas, 1);
    assert.equal((await fichaDe('005')).faltas[DIA].origem, 'lousa');
    // "Cancelar aula" depois de fechar: a chamada nova não lista mais a Duda
    await db.doc(`lousa/${DIA}/chamadas/18:10`).set(chamadaV(1700000007000, { presentes: [], faltaram: [] }));
    const r = await sv.aplicarFaltasDaChamada(db, COACH, DIA, '18:10', depsQui);
    assert.equal(r.desfeitas, 1);
    assert.deepEqual((await fichaDe('005')).faltas, {});
    assert.equal((await eventosCom('lousa-falta-desfeita-005-')).length, 1);
    assert.equal((await fichaDe('006')).faltas[DIA].tipo, 'no-show', 'a falta do coach não é tocada');
  });

  await caso('fechamento.desde: dia fechado antes do corte é ignorado (sem deploy)', async () => {
    await db.doc(`gestao/${COACH}`).set({ feriados: { '2026-11-03': false } }, { merge: true });
    await db.doc(`gestao/${COACH}/sistema/fechamento`).set({ desde: '2026-11-04' }, { merge: true });
    assert.equal((await aplicarTudoQueEstiverPendente(db, COACH, depsQui)).creditos, 0);
    assert.equal((await fichaDe('005')).atestados, undefined);
    await db.doc(`gestao/${COACH}/sistema/fechamento`).set({ desde: '2026-11-01' }, { merge: true });
    assert.equal((await aplicarTudoQueEstiverPendente(db, COACH, depsQui)).creditos >= 1, true);
    assert.equal((await fichaDe('005')).atestados['2026-11-03'].tipo, 'fechado');
  });

  await caso('interruptor com a Gestão: a chamada não grava falta', async () => {
    await db.doc(`gestao/${COACH}/sistema/caixas`).set({ aplicador: 'gestao' });
    await db.doc(`lousa/${DIA}/chamadas/21:10`).set(chamadaV(1700000004000, { faltaram: ['bia@box.com'] }));
    const r = await require('./lib/caixas-servico.js').aplicarFaltasDaChamada(db, COACH, DIA, '21:10', depsQui);
    assert.equal(r.aplicou, false);
    await db.doc(`gestao/${COACH}/sistema/caixas`).set({ aplicador: 'servidor' });
  });
}

if (require.main === module) {
  (async () => {
    await regras();
    await servidor();
    if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
    console.log('\nTudo certo.');
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
