/**
 * MOTOR DE CONQUISTAS DE PONTA A PONTA (emuladores de Firestore + Functions).
 *
 *     npm run checar:emulador:conquistas    # compila, sobe os emuladores, roda e derruba
 *
 * O `checar-conquistas` prova a REGRA sem rede. Este prova a FIAÇÃO: que gravar
 * em `gastoTreinos/{email}` ou `portal/{email}` dispara a função de verdade e que
 * ela escreve `conquistas_aluno/{email}` no formato que o Portal lê.
 *
 * Roda num projeto `demo-*`: o emulador não toca em nada de produção, e o
 * projeto nem precisa existir. A função do OpenAI precisa de um valor para o
 * segredo carregar: crie `functions/.secret.local` com `OPENAI_API_KEY=teste`.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-garage' });
const db = getFirestore();

const EMAIL = 'aluno.teste@example.com';
const conquistas = db.doc(`conquistas_aluno/${EMAIL}`);

/** Hoje no fuso do box, como a função calcula. */
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

let falhas = 0;
function ok(condicao, descricao, detalhe = '') {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}

/** Espera o documento de conquistas satisfazer `condicao` (a função roda em segundo plano). */
async function esperar(condicao, limiteMs = 20000) {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const dados = (await conquistas.get()).data();
    if (dados && condicao(dados)) return dados;
    if (Date.now() > fim) return dados ?? null;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (const colecao of ['portal', 'gastoTreinos', 'desafios', 'rotinas', 'conquistas_aluno']) {
    await db.doc(`${colecao}/${EMAIL}`).delete();
  }

  console.log('\n1. Primeiro check-in (cria gastoTreinos)');
  await db.doc(`gastoTreinos/${EMAIL}`).set({ gastos: [{ id: 'c1', data: HOJE, calorias: null, checkin: true }] });
  let doc = await esperar((d) => d.conquistasDesbloqueadas?.includes('primeiro'));
  ok(doc?.conquistasDesbloqueadas?.includes('primeiro'), 'medalha "Começou!" concedida', JSON.stringify(doc));
  ok(doc?.xpAtual === 50, 'xpAtual = 50', String(doc?.xpAtual));
  ok(typeof doc?.ultimaAtualizacao === 'string' && !Number.isNaN(Date.parse(doc.ultimaAtualizacao)),
    'ultimaAtualizacao em ISO 8601');

  console.log('\n2. Marcação de água (dispara, mas não muda medalha)');
  const antes = doc?.ultimaAtualizacao;
  await db.doc(`gastoTreinos/${EMAIL}`).set({ agua: { [HOJE]: FieldValue.increment(250) } }, { merge: true });
  await pausa(4000);
  doc = (await conquistas.get()).data();
  ok(doc?.ultimaAtualizacao === antes, 'sem novidade, o documento não é regravado');

  console.log('\n3. Treino pesado lançado (gastoTreinos)');
  await db.doc(`gastoTreinos/${EMAIL}`).set(
    { gastos: [{ id: 'c1', data: HOJE, calorias: null, checkin: true }, { id: 't1', data: HOJE, calorias: 620 }] },
    { merge: true },
  );
  doc = await esperar((d) => d.conquistasDesbloqueadas?.includes('cal500'));
  ok(doc?.conquistasDesbloqueadas?.includes('cal500'), 'medalha "Forno ligado" concedida', JSON.stringify(doc?.conquistasDesbloqueadas));
  ok(doc?.xpAtual === 200, 'xpAtual = 50 + 150', String(doc?.xpAtual));

  console.log('\n4. Coach publica avaliação na ficha (portal)');
  await db.doc(`portal/${EMAIL}`).set({ nome: 'Aluno Teste', avaliacoes: [{ dataRealizada: HOJE, peso: 80 }] }, { merge: true });
  doc = await esperar((d) => d.conquistasDesbloqueadas?.includes('aval1'));
  ok(doc?.conquistasDesbloqueadas?.includes('aval1'), 'medalha "Ponto de partida" concedida pelo gatilho do portal');
  ok(doc?.xpAtual === 300, 'xpAtual = 50 + 150 + 100', String(doc?.xpAtual));

  console.log('\n5. XP editado à mão é corrigido no próximo disparo');
  await conquistas.set({ xpAtual: 999999 }, { merge: true });
  await db.doc(`gastoTreinos/${EMAIL}`).set({ agua: { [HOJE]: FieldValue.increment(250) } }, { merge: true });
  doc = await esperar((d) => d.xpAtual === 300);
  ok(doc?.xpAtual === 300, 'xpAtual volta a ser a soma das medalhas', String(doc?.xpAtual));

  console.log(falhas === 0 ? '\n✓ O motor reage a check-in, treino e ficha.\n' : `\n✗ ${falhas} verificação(ões) falharam.\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
