/**
 * SIMULAÇÃO, SÓ LEITURA: o que a Etapa 2 faria na PRIMEIRA varredura depois do
 * deploy (falta da chamada da Lousa e crédito de box fechado).
 *
 * Nada é gravado: só `.get()`. A saída é só CONTAGEM — nenhum nome, e-mail ou
 * telefone de aluno. Roda a MESMA regra do servidor (lib/caixas.js com a cópia
 * da Gestão em lib/gestao/), então o build vem antes.
 *
 *     cd functions && npm run build && node scripts/simular-etapa2.cjs
 *
 * Mostra:
 *   - por dia de box fechado ainda sem a marca de resolvido (e depois do corte
 *     `sistema/fechamento.desde`): quantos créditos seriam criados;
 *   - por chamada da Lousa de ontem e de hoje: quantas faltas seriam gravadas e
 *     quantas sairiam (aluno que a chamada refeita não lista mais);
 *   - o corte `desde` em vigor e os dias fechados que ele ignora.
 *
 * Antes de ligar a etapa, se os números do crédito forem retroativos demais
 * (dias velhos, alunos que entraram depois), grave o corte SEM deploy:
 *     gestao/{uid}/sistema/fechamento  →  desde: 'AAAA-MM-DD'
 *
 * Precisa da credencial padrão do Google nesta máquina
 * (`gcloud auth application-default login`), com acesso ao projeto.
 * NÃO rode isto contra a produção sem o dono pedir.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  diasFechadosAteHoje, idDoEventoDaFalta, idDoEventoDoFechamento, planoDaFaltaDaChamada, planoDeDesfazerFalta, planoDoCreditoDeFechamento, regrasDaGestao,
} = require('../lib/caixas.js');
const { normalizarEmail } = require('../lib/acesso.js');
const { COACH_UIDS } = require('../lib/acesso.js');
const { relogioDoBox, somarDias } = require('../lib/presenca.js');

const PROJETO = process.env.PROJETO || 'projeto-garage-f0a2f';
const AGORA = Date.now();

(async () => {
  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  const regras = await regrasDaGestao();
  const { hoje, agora: hhmm } = relogioDoBox(new Date(AGORA));
  console.log(`Hoje (relógio do box): ${hoje} ${hhmm}`);

  for (const uid of COACH_UIDS) {
    const interruptor = (await db.doc(`gestao/${uid}/sistema/caixas`).get()).data();
    console.log(`\nCoach ${uid.slice(0, 4)}…  interruptor: ${interruptor ? JSON.stringify(interruptor) : '(sem documento = a Gestão aplica)'}`);
    const meta = (await db.doc(`gestao/${uid}`).get()).data() || {};
    const marca = (await db.doc(`gestao/${uid}/sistema/fechamento`).get()).data() || {};
    const fichas = (await db.collection(`gestao/${uid}/alunos`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
    const ativas = fichas.filter((f) => (f.status || 'ativo') !== 'inativo').length;
    console.log(`Fichas: ${fichas.length} (${ativas} ativas)`);

    // ---- crédito de box fechado ----
    const desde = typeof marca.desde === 'string' ? marca.desde : null;
    const resolvidos = marca.aplicados || {};
    const todos = diasFechadosAteHoje(meta, hoje);
    const valem = diasFechadosAteHoje(meta, hoje, desde);
    console.log('\nCrédito de box fechado');
    console.log(`  corte (sistema/fechamento.desde): ${desde || '(nenhum: tudo que está em meta.feriados vale)'}`);
    console.log(`  dias fechados que já chegaram: ${todos.length}; ignorados pelo corte: ${todos.length - valem.length}; já resolvidos: ${valem.filter((d) => d in resolvidos).length}`);
    let total = 0;
    for (const dia of valem.filter((d) => !(d in resolvidos))) {
      let n = 0, jaTemRegistro = 0;
      for (const f of fichas) {
        const p = planoDoCreditoDeFechamento(regras, { ficha: f, dias: [dia], hoje, agora: AGORA });
        if (!p.creditos) continue;
        if ((await db.doc(`gestao/${uid}/eventos/${idDoEventoDoFechamento(String(f.id), dia)}`).get()).exists) { jaTemRegistro++; continue; }
        n += p.creditos;
      }
      total += n;
      console.log(`  ${dia}: ${n} crédito(s) seriam criados${jaTemRegistro ? ` (+${jaTemRegistro} já têm o Registro e ficariam de fora)` : ''}`);
    }
    console.log(`  TOTAL de créditos na 1ª varredura: ${total}`);

    // ---- a falta da chamada da Lousa (ontem e hoje) ----
    console.log('\nChamadas da Lousa de ontem e de hoje');
    const fechados = diasFechadosAteHoje(meta, '9999-12-31');
    let faltasTotal = 0, desfeitasTotal = 0;
    for (const dia of [somarDias(hoje, -1), hoje]) {
      const chamadas = (await db.collection(`lousa/${dia}/chamadas`).get()).docs;
      if (!chamadas.length) { console.log(`  ${dia}: nenhuma chamada`); continue; }
      for (const c of chamadas) {
        const dados = c.data() || {};
        const hora = c.id;
        const emails = regras.emailsQueFaltaram(dados).map(normalizarEmail).filter(Boolean);
        const listados = new Set([...(dados.presentes || []), ...(dados.faltaram || [])].map(normalizarEmail).filter(Boolean));
        const aplicada = (await db.doc(`gestao/${uid}/chamadasAplicadas/${dia}_${hora.replace(/\W/g, '')}`).get()).exists;
        let faltas = 0, desfeitas = 0;
        for (const { aluno } of regras.casarCaixasComFichas(emails, fichas).pares) {
          const p = planoDaFaltaDaChamada(regras, { ficha: aluno, dia, hora, hoje, fechados, agora: AGORA });
          if (p.acao === 'nada') continue;
          if ((await db.doc(`gestao/${uid}/eventos/${idDoEventoDaFalta(String(aluno.id), dia, hora)}`).get()).exists) continue;
          faltas++;
        }
        for (const f of fichas) {
          const email = normalizarEmail(f.email);
          if (email && listados.has(email)) continue;
          if (planoDeDesfazerFalta(regras, { ficha: f, dia, hora, versao: 0, agora: AGORA }).acao !== 'nada') desfeitas++;
        }
        faltasTotal += faltas; desfeitasTotal += desfeitas;
        console.log(`  ${dia} ${hora}: ${emails.length} em "faltaram" -> ${faltas} falta(s) seriam gravadas, ${desfeitas} sairiam${aplicada ? ' (a marca diz que já foi aplicada: a varredura pularia)' : ''}`);
      }
    }
    console.log(`  TOTAL de faltas na 1ª varredura: ${faltasTotal}; saindo: ${desfeitasTotal}`);
  }
  console.log('\nNada foi gravado.');
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
