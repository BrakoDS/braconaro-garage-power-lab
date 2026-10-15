/**
 * Ajusta o inventário do box pelo mesmo caminho de `salvarInventarioBox`
 * (`aplicarInventario` + a reconferência das semanas que ainda não terminaram),
 * para mudança de equipamento combinada com o coach fora da tela. Usado em
 * 15/10/2026: 2 monocross (o 3º foi vendido) e o remo indoor oficial.
 *
 *     node lib/ajustar-inventario-box.js            # simulação: mostra o antes, o depois e as semanas afetadas
 *     node lib/ajustar-inventario-box.js --gravar   # grava
 *     node lib/ajustar-inventario-box.js --a-partir-de 2026-W43 --gravar
 *
 * A semana publicada NÃO é despublicada (como na tela); se a reconferência
 * achar alerta numa semana aberta, o script avisa e não grava sem
 * `--mesmo-com-alerta`. `--a-partir-de` reconfere só dessa semana em diante:
 * a semana em curso fica com a conta do inventário com que foi feita (em
 * 15/10/2026 a W42, cuja terça já tinha usado os 3 monocross — decisão do coach).
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { COACH_UIDS } from './acesso';
import { aplicarInventario, lerInventario, reconferirSemana } from './semana-box';

const PROJETO = process.env.GCLOUD_PROJECT || 'projeto-garage-f0a2f';
const GRAVAR = process.argv.includes('--gravar');
const MESMO_COM_ALERTA = process.argv.includes('--mesmo-com-alerta');
const A_PARTIR_DE = process.argv[process.argv.indexOf('--a-partir-de') + 1] ?? '';
if (process.argv.includes('--a-partir-de') && !/^\d{4}-W\d{2}$/.test(A_PARTIR_DE)) throw new Error('--a-partir-de AAAA-Www (ex.: 2026-W43)');

/** O pedido, no formato que `salvarInventarioBox` recebe. */
const PEDIDO = {
  monocross: { total: 2, observacao: '2 lado a lado (o SkiErg do Hyrox); o 3º foi vendido pelo remo oficial' },
  remo: { total: 1, observacao: 'remo indoor oficial' },
};

async function main() {
  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  const uid = COACH_UIDS[0];
  const ref = db.doc(`coaches/${uid}/inventario/atual`);
  const atual = lerInventario((await ref.get()).data());
  const r = aplicarInventario(atual, PEDIDO);
  if ('erro' in r) throw new Error(r.erro);
  const novo = r.inventario;
  console.log(`\nInventário → ${PROJETO} (${GRAVAR ? 'GRAVANDO' : 'simulação; use --gravar para gravar'})`);
  for (const k of Object.keys(PEDIDO) as (keyof typeof PEDIDO)[]) {
    console.log(`  ${k}: total ${atual.equipamentos[k].total} → ${novo.equipamentos[k].total}; ativos ${atual.limitesAtivos[k]} → ${novo.limitesAtivos[k]}`);
  }

  const abertas = await db.collection(`coaches/${uid}/semanas`).where('dataFim', '>=', Timestamp.now()).get();
  const daVez = abertas.docs.filter((s) => !A_PARTIR_DE || s.id >= A_PARTIR_DE);
  for (const s of abertas.docs) if (!daVez.includes(s)) console.log(`  ${s.id} (${s.data().status}): fica como está (antes de ${A_PARTIR_DE})`);
  const contas = daVez.map((s) => ({ s, conta: reconferirSemana(s.data(), novo.limitesAtivos, novo.alunosPorAula) }));
  let comAlerta = 0;
  for (const { s, conta } of contas) {
    if (!conta) continue;
    const n = conta.alertas.length + conta.alertasHiit.length + conta.alertasCross.length + conta.alertasHyrox.length;
    if (n) comAlerta++;
    console.log(`  ${s.id} (${s.data().status}): ${n} alerta(s), ${conta.problemasParaPublicar.length} problema(s)${n ? ` — ${conta.problemasParaPublicar[0] ?? ''}` : ''}`);
  }
  if (!GRAVAR) { console.log('\nSimulação: nada foi gravado.\n'); return; }
  if (comAlerta && !MESMO_COM_ALERTA) throw new Error('Alguma semana aberta ficaria com alerta. Confira e rode com --mesmo-com-alerta.');

  await ref.set({ ...novo, atualizadoEm: FieldValue.serverTimestamp() });
  const lote = db.batch();
  for (const { s, conta } of contas) {
    if (!conta) continue;
    lote.update(s.ref, {
      alertas: conta.alertas, alertasHiit: conta.alertasHiit, alertasCross: conta.alertasCross, alertasHyrox: conta.alertasHyrox,
      problemasParaPublicar: conta.problemasParaPublicar, alunosPorAula: novo.alunosPorAula,
      limitesUsados: novo.limitesAtivos, atualizadoEm: FieldValue.serverTimestamp(),
    });
  }
  await lote.commit();
  const gravado = lerInventario((await ref.get()).data());
  console.log(`\nGravado: monocross ${gravado.equipamentos.monocross.total}, remo ${gravado.equipamentos.remo.total}; ${contas.length} semana(s) reconferida(s).\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
