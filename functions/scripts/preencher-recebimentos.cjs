/**
 * MIGRAÇÃO DA ETAPA 3 (PLANO-FASE1-ETAPA3.md, Parte D): o registro dos meses
 * pagos antes de 10/11/2026.
 *
 * Preenche `recebimentos[mês]` só dos meses pagos que AINDA NÃO têm registro,
 * a partir do Pix do Portal (`pixPagos` + `cobrancasPix`) ou da linha
 * "Pagamento registrado" dos Registros. A regra é pura e testada:
 * coach/gestao-de-alunos/recebimentos-historico.js.
 *
 *   SIMULAÇÃO (padrão, só leitura): só CONTAGENS — nenhum nome, e-mail ou valor
 *   de aluno.
 *       cd functions && npm run build && node scripts/preencher-recebimentos.cjs
 *
 *   GRAVAÇÃO (só com o ok do dono, depois da simulação):
 *       node scripts/preencher-recebimentos.cjs --aplicar <arquivo-de-backup-novo.json>
 *   Primeiro grava o backup (o `recebimentos` de cada ficha tocada, como estava);
 *   depois, ficha por ficha numa transação, recalcula com a ficha relida e grava
 *   só os campos `recebimentos.<mês>` que ainda faltam, com o carimbo
 *   `atualizadoEm`. Nada mais na ficha muda.
 *
 * Desfazer: todo registro gravado aqui tem `origem: 'historico'`; o backup tem
 * o `recebimentos` anterior de cada ficha.
 *
 * Precisa da credencial padrão do Google nesta máquina
 * (`gcloud auth application-default login`), com acesso ao projeto.
 * NÃO rode isto contra a produção sem o dono pedir.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const { writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { COACH_UIDS } = require('../lib/acesso.js');

const PROJETO = process.env.PROJETO || 'projeto-garage-f0a2f';
const APLICAR = process.argv[2] === '--aplicar';
const BACKUP = process.argv[3];

(async () => {
  if (APLICAR && (!BACKUP || existsSync(BACKUP))) throw new Error('informe um arquivo de backup NOVO: --aplicar <caminho.json>');
  const regra = pathToFileURL(join(__dirname, '..', '..', 'coach', 'gestao-de-alunos', 'recebimentos-historico.js')).href;
  const { recebimentosDoHistorico } = await import(regra);

  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  console.log(`${APLICAR ? 'GRAVAÇÃO' : 'SIMULAÇÃO (nada é gravado)'} · projeto ${PROJETO}`);

  /** @type {{ uid: string, id: string, antes: any, meses: string[], eventos: any[], cobrancas: Record<string, any> }[]} */
  const tocadas = [];
  for (const uid of COACH_UIDS) {
    const fichas = (await db.collection(`gestao/${uid}/alunos`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
    const eventos = (await db.collection(`gestao/${uid}/eventos`).where('tipo', 'in', ['pagamento', 'pagamento-desfeito']).get()).docs.map((d) => d.data());
    const cobrancas = Object.fromEntries((await db.collection(`gestao/${uid}/cobrancasPix`).get()).docs.map((d) => [d.id, d.data()]));

    let marcas = 0, jaTem = 0;
    for (const f of fichas) for (const [mes, pago] of Object.entries(f.pagamentos || {})) {
      if (!pago) continue;
      marcas++;
      if ((f.recebimentos || {})[mes]) jaTem++;
    }
    const porFonte = { pix: 0, registro: 0 };
    const porMes = {};
    for (const f of fichas) {
      const itens = recebimentosDoHistorico(f, { eventos, cobrancas });
      if (!itens.length) continue;
      tocadas.push({ uid, id: f.id, antes: f.recebimentos ?? null, meses: itens.map((p) => p.mes), eventos, cobrancas });
      for (const p of itens) { porFonte[p.fonte]++; porMes[p.mes] = (porMes[p.mes] || 0) + 1; }
    }
    const total = porFonte.pix + porFonte.registro;
    console.log(`\nCoach ${uid.slice(0, 4)}…  fichas: ${fichas.length}; meses pagos: ${marcas}; já com registro: ${jaTem}`);
    console.log(`  a preencher: ${total} (Pix do Portal: ${porFonte.pix}; Registro de pagamento: ${porFonte.registro}) em ${tocadas.filter((t) => t.uid === uid).length} ficha(s)`);
    console.log(`  por mês: ${JSON.stringify(Object.fromEntries(Object.entries(porMes).sort()))}`);
    console.log(`  ficam sem registro (sem de onde tirar o dado): ${marcas - jaTem - total}`);
  }

  if (!APLICAR) { console.log('\nNada foi gravado.'); process.exit(0); }

  writeFileSync(BACKUP, JSON.stringify(tocadas.map((t) => ({ caminho: `gestao/${t.uid}/alunos/${t.id}`, recebimentosAntes: t.antes, meses: t.meses })), null, 1));
  console.log(`\nBackup gravado em ${BACKUP} (${tocadas.length} ficha(s)).`);

  let gravados = 0, pulados = 0;
  for (const t of tocadas) {
    const ref = db.doc(`gestao/${t.uid}/alunos/${t.id}`);
    const n = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      // Recalcula com a ficha relida: o mês que ganhou registro (ou foi desfeito) no meio-tempo fica de fora.
      const itens = recebimentosDoHistorico({ ...snap.data(), id: t.id }, { eventos: t.eventos, cobrancas: t.cobrancas });
      if (!itens.length) return 0;
      const args = [];
      for (const p of itens) args.push(new FieldPath('recebimentos', p.mes), p.rec);
      tx.update(ref, ...args, 'atualizadoEm', FieldValue.serverTimestamp());
      return itens.length;
    });
    gravados += n;
    pulados += t.meses.length - n;
  }
  console.log(`Feito: ${gravados} registro(s) gravado(s)${pulados ? `; ${pulados} pulado(s) porque a ficha mudou no meio-tempo` : ''}.`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
