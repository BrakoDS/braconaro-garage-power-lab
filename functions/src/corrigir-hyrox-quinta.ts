/**
 * Põe a prova COMPLETA (as 8 estações) no Hyrox da quinta de uma semana já
 * gravada — a correção da W42 (15/10/2026), que saiu com a Metade B antes da
 * regra `DIA_HYROX_COMPLETO`.
 *
 *     node lib/corrigir-hyrox-quinta.js 2026-W42             # simulação: mostra o que mudaria
 *     node lib/corrigir-hyrox-quinta.js 2026-W42 --gravar    # grava
 *
 * Faz o mesmo caminho de `salvarSemanaBox` com o pedido só da quinta: o Hyrox
 * novo sai do gerador (`gerarHyrox` com a quinta, inventário atual: sled
 * parado vira substituta), a semana passa por `diasComConteudoGravado` +
 * `lerDias` e pela conta (`contaDaSemana`). As travas também: quinta que já
 * passou não muda, e semana publicada só fica publicada se continuar podendo.
 * Só mexe na quinta; o resto da semana volta igual (o script confere).
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { COACH_UIDS } from './acesso';
import { avisosDeEdicao } from './edicao-box';
import { crossDaSemana, idsDaSemana, idsDoHiit } from './gerador-box';
import { gerarHyrox } from './gerador-hyrox';
import { DIAS_SEMANA, type ItemCatalogo } from './modelo-box';
import {
  contaDaSemana, diasComConteudoGravado, intervaloDaSemana, lerDias, lerInventario, lerItemCatalogo, semanaAnterior,
  semanaEmBrancoNosDias,
} from './semana-box';

const PROJETO = process.env.GCLOUD_PROJECT || 'projeto-garage-f0a2f';
const GRAVAR = process.argv.includes('--gravar');
const semanaId = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';

/** 'AAAA-MM-DD' de hoje no fuso do box. */
const hojeSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function main() {
  const intervalo = intervaloDaSemana(semanaId);
  if (!intervalo) throw new Error('Passe a semana: node lib/corrigir-hyrox-quinta.js 2026-W42 [--gravar]');
  if (intervalo.datas.quinta < hojeSaoPaulo()) throw new Error(`A quinta da ${semanaId} (${intervalo.datas.quinta}) já passou e não muda mais.`);

  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  const uid = COACH_UIDS[0];
  const ref = db.doc(`coaches/${uid}/semanas/${semanaId}`);
  const anteriorId = semanaAnterior(semanaId);
  const [gravada, inv, anterior] = await Promise.all([
    ref.get(), db.doc(`coaches/${uid}/inventario/atual`).get(), anteriorId ? db.doc(`coaches/${uid}/semanas/${anteriorId}`).get() : null,
  ]);
  const doc = gravada.data();
  if (!doc) throw new Error(`${semanaId} não existe.`);
  const quinta = (doc.dias?.quinta ?? {}) as { treinos?: string[]; hyrox?: { formato?: string; estacoes?: { estacao: string }[] } };
  if (!quinta.treinos?.includes('Hyrox')) throw new Error(`${semanaId}: a quinta não tem Hyrox.`);
  console.log(`\n${semanaId} (${doc.status}) → ${PROJETO} (${GRAVAR ? 'GRAVANDO' : 'simulação; use --gravar para gravar'})`);
  console.log(`  quinta hoje: ${quinta.hyrox?.formato} — ${(quinta.hyrox?.estacoes ?? []).map((e) => e.estacao).join(', ')}`);

  const { limitesAtivos: limitesUsados, alunosPorAula } = lerInventario(inv.data());
  const novo = gerarHyrox({ limites: limitesUsados, semente: `${semanaId}:Hyrox:quinta-completa`, dias: ['quinta'] });
  console.log(`  quinta nova: ${novo.cru.formato} — ${novo.cru.estacoes.map((e) => e.estacao + (e.substituta ? ' (substituta)' : '')).join(', ')}`);
  for (const a of novo.avisos) console.log(`  aviso: ${a}`);

  // O pedido do salvar só com a quinta: o resto da semana vem do gravado (`diasComConteudoGravado`).
  const pedido = Object.fromEntries(DIAS_SEMANA.map((d) => [d, d === 'quinta' ? { ...doc.dias[d], hyrox: novo.cru } : doc.dias[d]]));
  const diasPedido = diasComConteudoGravado(pedido, doc.dias);
  // Os ids que `salvarSemanaBox` carrega: o bloco H, o HIIT e o WOD do Cross.
  const ids = [...new Set([...idsDaSemana(diasPedido), ...idsDoHiit(diasPedido), ...crossDaSemana(diasPedido).ids])];
  const docsCatalogo = ids.length ? await db.getAll(...ids.map((id) => db.doc(`catalogoExercicios/${id}`))) : [];
  const catalogo = new Map<string, ItemCatalogo>();
  for (const d of docsCatalogo) {
    const item = lerItemCatalogo(d.data());
    if (item) catalogo.set(d.id, item);
  }
  const lido = lerDias(diasPedido, catalogo);
  if ('erro' in lido) throw new Error(`A validação do salvar recusou: ${lido.erro}`);

  const mudaram = DIAS_SEMANA.filter((d) => JSON.stringify(lido.dias[d]) !== JSON.stringify(doc.dias[d]));
  if (mudaram.join() !== 'quinta') throw new Error(`Esperava mudar só a quinta; mudariam: ${mudaram.join(', ') || 'nenhum'}.`);
  const conta = contaDaSemana(lido.dias, limitesUsados, alunosPorAula);
  const publicada = doc.status === 'publicado';
  if (publicada && conta.problemasParaPublicar.length) throw new Error(`A semana deixaria de poder ser publicada: ${conta.problemasParaPublicar[0]}`);
  const h = lido.dias.quinta.hyrox!;
  console.log(`  validado: ${h.nome}, ${h.estacoes.length} estações, ${h.rodadas} rodada(s); alertas do Hyrox: ${conta.alertasHyrox.length}; problemas: ${conta.problemasParaPublicar.length}`);

  // Quem já registrou o Hyrox de hoje (o registro fica; só informativo).
  const anoMes = intervalo.datas.quinta.slice(0, 7);
  const historicos = await db.collectionGroup('historico').get();
  const registraram = historicos.docs.filter((d) => d.id === anoMes && (d.data().presencas ?? [])
    .some((p: { sessaoId?: string }) => p.sessaoId === `${intervalo.datas.quinta}_Hyrox`)).length;
  console.log(`  alunos que já registraram o Hyrox de ${intervalo.datas.quinta}: ${registraram}`);

  if (!GRAVAR) { console.log('\nSimulação: nada foi gravado.\n'); return; }

  await db.runTransaction(async (tx) => {
    const atual = (await tx.get(ref)).data();
    if (JSON.stringify(atual?.dias ?? null) !== JSON.stringify(doc.dias ?? null)) throw new Error('A semana mudou enquanto o script rodava. Rode de novo.');
    // Os mesmos campos que `gravarDiasEditados` recalcula; status, datas e `publicadoEm` ficam.
    tx.update(ref, {
      dias: lido.dias,
      emBranco: semanaEmBrancoNosDias(lido.dias),
      alertas: conta.alertas, alertasHiit: conta.alertasHiit, alertasCross: conta.alertasCross, alertasHyrox: conta.alertasHyrox,
      problemasParaPublicar: conta.problemasParaPublicar,
      alunosPorAula,
      limitesUsados,
      avisosEdicao: avisosDeEdicao(lido.dias, idsDaSemana(anterior?.data()?.dias)),
      geracao: FieldValue.delete(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  });
  const depois = (await ref.get()).data()!;
  const q = depois.dias.quinta.hyrox;
  console.log(`\nGravado. ${semanaId} (${depois.status}): quinta = ${q.formato}, ${q.estacoes.length} estações.\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
