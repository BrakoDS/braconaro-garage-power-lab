/**
 * SIMULAÇÃO, SÓ LEITURA: o que o servidor faria com o que está nas caixas
 * AGORA, se o interruptor fosse para 'servidor' (Fase 1 · etapa 1).
 *
 * Nada é gravado: só `.get()`. A saída é só contagem e nome de campo — nenhum
 * nome, e-mail ou telefone de aluno. Roda a MESMA regra do servidor
 * (lib/caixas.js com a cópia da Gestão em lib/gestao/), então o build vem antes.
 *
 *     cd functions && npm run build && node scripts/simular-caixas.cjs
 *
 * Precisa da credencial padrão do Google nesta máquina
 * (`gcloud auth application-default login`), com acesso ao projeto.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { COLECOES_DO_ALUNO, planoDasCaixas, planoDoPixNoServidor, regrasDaGestao, itensDoCoach } = require('../lib/caixas.js');
const { COACH_UIDS } = require('../lib/acesso.js');

const PROJETO = process.env.PROJETO || 'projeto-garage-f0a2f';
const conta = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

(async () => {
  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  const regras = await regrasDaGestao();
  const agora = Date.now();
  for (const uid of COACH_UIDS) {
    const interruptor = (await db.doc(`gestao/${uid}/sistema/caixas`).get()).data();
    console.log(`\nCoach ${uid.slice(0, 4)}…  interruptor: ${interruptor ? JSON.stringify(interruptor) : '(sem documento = a Gestão aplica)'}`);
    const fichas = (await db.collection(`gestao/${uid}/alunos`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
    console.log(`Fichas: ${fichas.length}`);

    // As caixas por aluno (o id do documento é o e-mail).
    const porCaixa = new Map();
    for (const c of COLECOES_DO_ALUNO) {
      for (const d of (await db.collection(c).get()).docs) {
        const itens = itensDoCoach(d.data(), uid);
        if (!Object.keys(itens).length) continue;
        if (!porCaixa.has(d.id)) porCaixa.set(d.id, {});
        porCaixa.get(d.id)[c] = { itens };
      }
    }
    const itensPorColecao = {}, camposTocados = {}, tiposDeLinha = {}, ignorados = {};
    let alunosComMudanca = 0, semFicha = 0, consumidos = 0;
    for (const [id, caixas] of porCaixa) {
      for (const [c, d] of Object.entries(caixas)) conta(itensPorColecao, c, Object.keys(d.itens).length);
      const par = regras.casarCaixasComFichas([id], fichas).pares[0];
      if (!par) { semFicha++; continue; }
      const p = planoDasCaixas(regras, { ficha: par.aluno, caixas, coachUid: uid, agora });
      if (p.escritas.length) alunosComMudanca++;
      for (const e of p.escritas) conta(camposTocados, e.caminho[0]);
      for (const ev of p.eventos) conta(tiposDeLinha, ev.tipo);
      for (const i of p.ignorados) conta(ignorados, i.motivo.replace(/\d{2}\/\d{2}/g, 'DD/MM'));
      for (const ch of Object.values(p.consumir)) consumidos += ch.length;
    }
    console.log('\nCaixas dos alunos');
    console.log(`  itens pendentes por caixa: ${JSON.stringify(itensPorColecao)}`);
    console.log(`  caixas de e-mail sem ficha (ficariam intactas): ${semFicha}`);
    console.log(`  alunos cuja ficha mudaria: ${alunosComMudanca}`);
    console.log(`  itens que sairiam das caixas: ${consumidos}`);
    console.log(`  campos gravados (por aluno): ${JSON.stringify(camposTocados)}`);
    console.log(`  linhas nos Registros, por tipo: ${JSON.stringify(tiposDeLinha)}`);
    console.log(`  itens recusados pela regra, por motivo: ${JSON.stringify(ignorados)}`);

    const pix = (await db.collection(`gestao/${uid}/cobrancasPix`).where('avisarGestao', '==', true).get()).docs;
    const acoes = {};
    for (const d of pix) {
      const c = { ...d.data(), paymentId: d.id };
      const ficha = fichas.find((f) => f.id === String(c.alunoId)) || null;
      conta(acoes, planoDoPixNoServidor(regras, { cobranca: c, ficha, todos: fichas, agora }).acao);
    }
    console.log('\nPix com algo a tratar (avisarGestao)');
    console.log(`  ${pix.length} cobrança(s): ${JSON.stringify(acoes)}`);
  }
  console.log('\nNada foi gravado.');
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
