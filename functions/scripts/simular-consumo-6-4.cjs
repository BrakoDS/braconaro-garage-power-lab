#!/usr/bin/env node
/**
 * Fase 1 · etapa 6.4 — SIMULAÇÃO, só leitura (não grava nada).
 *
 * Mostra, só com CONTAGENS (sem nomes e sem valores):
 *  1) quantos lançamentos de consumo existem e quantas linhas a notinha passa a
 *     mostrar, com os itens iguais do mesmo dia juntos (`linhasDaNotinha`);
 *  2) o corte novo (decisão 12): quantos consumos já estão carimbados na conta
 *     de dezembro (vendas de 11 a 30/11) e, nos meses passados, quantos foram
 *     vendidos entre os dias 1 e 10 — os que, no corte novo, iriam para a conta
 *     seguinte;
 *  3) que ainda não há compras pagas na hora nem vendas a visitantes.
 *
 * Nenhum dado muda: o corte novo vale para as vendas de 01/12/2026 em diante, e
 * a quantidade só agrupa na tela.
 *
 *     node scripts/simular-consumo-6-4.cjs
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { COACH_UIDS } = require('../lib/acesso.js');

const PROJETO = 'projeto-garage-f0a2f';

(async () => {
  const raiz = join(__dirname, '..', '..');
  const { linhasDaNotinha, consumosDoMes } = await import(pathToFileURL(join(raiz, 'compartilhado', 'regras', 'consumo.js')).href);
  initializeApp({ projectId: PROJETO });
  const db = getFirestore();

  let fichas = 0, comConsumo = 0, lancamentos = 0, linhas = 0, gruposJuntados = 0, maiorGrupo = 0;
  let naContaDeDezembro = 0, comprasNaHora = 0;
  /** mês da venda → { total, dia1a10 } */
  const porMesDaVenda = {};
  let vendasAvulsas = 0;

  for (const uid of COACH_UIDS) {
    const docs = (await db.collection(`gestao/${uid}/alunos`).get()).docs;
    for (const d of docs) {
      const a = d.data();
      fichas++;
      const consumos = Array.isArray(a.consumos) ? a.consumos.filter((c) => c && typeof c.mesId === 'string') : [];
      comprasNaHora += Array.isArray(a.comprasNaHora) ? a.comprasNaHora.length : 0;
      if (!consumos.length) continue;
      comConsumo++;
      lancamentos += consumos.length;
      for (const mes of new Set(consumos.map((c) => c.mesId))) {
        const ls = linhasDaNotinha(consumosDoMes(consumos, mes));
        linhas += ls.length;
        for (const l of ls) {
          if (l.ids.length > 1) gruposJuntados++;
          maiorGrupo = Math.max(maiorGrupo, l.ids.length);
        }
      }
      for (const c of consumos) {
        if (c.mesId === '2026-12') naContaDeDezembro++;
        const data = String(c.data || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
        const m = data.slice(0, 7);
        const x = (porMesDaVenda[m] ||= { total: 0, dia1a10: 0 });
        x.total++;
        if (Number(data.slice(8, 10)) <= 10) x.dia1a10++;
      }
    }
    const meta = (await db.doc(`gestao/${uid}`).get()).data() || {};
    for (const lista of Object.values(meta.vendasAvulsas || {})) vendasAvulsas += Array.isArray(lista) ? lista.length : 0;
  }

  console.log('\nETAPA 6.4 · SIMULAÇÃO (só leitura, só contagens)\n');
  console.log(`Fichas: ${fichas} · com consumo lançado: ${comConsumo}`);
  console.log(`Lançamentos de consumo: ${lancamentos} → linhas na notinha (iguais do dia juntos): ${linhas}`);
  console.log(`Linhas que juntam mais de um lançamento: ${gruposJuntados} · o maior grupo junta ${maiorGrupo}`);
  console.log(`\nConsumos já carimbados na conta de dezembro (vendas de 11 a 30/11): ${naContaDeDezembro}`);
  console.log('Por mês da venda — total · vendidos do dia 1 ao 10 (no corte novo, iriam para a conta seguinte):');
  for (const m of Object.keys(porMesDaVenda).sort()) {
    const x = porMesDaVenda[m];
    console.log(`  ${m}: ${x.total} · ${x.dia1a10}`);
  }
  console.log(`\nCompras pagas na hora: ${comprasNaHora} · vendas a visitantes: ${vendasAvulsas}`);
  console.log('\nNada foi gravado.');
})().catch((e) => { console.error(e); process.exit(1); });
