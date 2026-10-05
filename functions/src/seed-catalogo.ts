/**
 * SEED DO CATÁLOGO BASE — grava `CATALOGO_BASE` em `catalogoExercicios/{id}`.
 *
 *     npm run seed:catalogo                     # simulação: lista o que mudaria, não grava
 *     npm run seed:catalogo -- --gravar         # grava no projeto do .firebaserc
 *
 * Contra o emulador, basta exportar FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 antes.
 * Em produção usa as credenciais padrão do Google (`gcloud auth
 * application-default login`, com uma conta que tenha acesso ao projeto) —
 * as regras não deixam nenhum cliente gravar nessa coleção, só o Admin SDK.
 *
 * Idempotente: cada item é reescrito inteiro com o que está no código, e item
 * igual ao gravado nem é tocado. Documento que existe no Firestore e NÃO está
 * no código é só listado, nunca apagado — apagar exercício que uma semana já
 * usa quebraria a republicação dela.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CATALOGO_BASE } from './catalogo-base';
import { lerExercicioCatalogo } from './semana-box';

const PROJETO = process.env.GCLOUD_PROJECT || 'projeto-garage-f0a2f';
const GRAVAR = process.argv.includes('--gravar');

/** Comparação estável: mesma chave em ordem diferente não conta como mudança. */
function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${k}:${estavel((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function main(): Promise<void> {
  // Defesa contra um item torto no código: o servidor o trataria como
  // inexistente, então gravá-lo só criaria um exercício que nenhuma semana aceita.
  const tortos = Object.entries(CATALOGO_BASE).filter(([, item]) => !lerExercicioCatalogo(item)).map(([id]) => id);
  if (tortos.length) throw new Error(`Itens inválidos no CATALOGO_BASE: ${tortos.join(', ')}. Rode npm run checar:box.`);

  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  const alvo = process.env.FIRESTORE_EMULATOR_HOST ? `emulador ${process.env.FIRESTORE_EMULATOR_HOST}` : PROJETO;
  console.log(`\nCatálogo base → ${alvo} (${GRAVAR ? 'GRAVANDO' : 'simulação; use --gravar para gravar'})\n`);

  const existentes = await db.collection('catalogoExercicios').get();
  const atuais = new Map(existentes.docs.map((d) => [d.id, d.data()]));

  const lote = db.batch();
  let novos = 0;
  let alterados = 0;
  for (const [id, item] of Object.entries(CATALOGO_BASE)) {
    const atual = atuais.get(id);
    if (atual && estavel(atual) === estavel(item)) continue;
    console.log(`  ${atual ? '~ altera' : '+ cria  '} ${id}`);
    if (atual) alterados++; else novos++;
    lote.set(db.doc(`catalogoExercicios/${id}`), item);
  }
  const sobrando = [...atuais.keys()].filter((id) => !(id in CATALOGO_BASE));
  for (const id of sobrando) console.log(`  ? só no Firestore (mantido): ${id}`);

  if (GRAVAR && novos + alterados) await lote.commit();
  console.log(`\n${novos} novo(s), ${alterados} alterado(s), ${Object.keys(CATALOGO_BASE).length - novos - alterados} igual(is)`
    + `${sobrando.length ? `, ${sobrando.length} só no Firestore` : ''}.`
    + `${!GRAVAR && novos + alterados ? ' Nada foi gravado.' : ''}\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
