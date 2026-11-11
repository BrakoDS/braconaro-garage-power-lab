/**
 * MIGRAÇÃO DA ETAPA 6.1 (PLANO-FASE1-ETAPA6.md, Parte H): o plano e o cadastro
 * das fichas de hoje.
 *
 * Grava, só no que a ficha AINDA NÃO tem: a data de início (`inicio`), o plano
 * (`plano`), a marca de fundador (`fundador`, só ativas e pendentes) e a
 * cortesia (`cortesia`, das fichas com parceria de 100%). A regra é pura e
 * testada: `migracaoDaFicha` em coach/gestao-de-alunos/cadastro-regras.js.
 * `pagamentos`, `mensalidade`, `parceria` e os meses fechados não mudam.
 *
 *   SIMULAÇÃO (padrão, só leitura): só CONTAGENS — nenhum nome, e-mail ou valor
 *   de aluno.
 *       cd functions && node scripts/migrar-cadastro-planos.cjs
 *
 *   GRAVAÇÃO (só com o ok do dono, depois da simulação):
 *       node scripts/migrar-cadastro-planos.cjs --aplicar <arquivo-de-backup-novo.json>
 *   Primeiro grava o backup (os 4 campos de cada ficha tocada, como estavam);
 *   depois, ficha por ficha numa transação, recalcula com a ficha relida e grava
 *   só os campos que ainda faltam, com o carimbo `atualizadoEm`.
 *
 * Desfazer: o backup tem os 4 campos de antes de cada ficha (todos ausentes
 * hoje); apagar os campos gravados devolve as fichas ao que eram.
 *
 * Precisa da credencial padrão do Google nesta máquina
 * (`gcloud auth application-default login`), com acesso ao projeto.
 * NÃO rode isto contra a produção sem o dono pedir.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { COACH_UIDS } = require('../lib/acesso.js');

const PROJETO = process.env.PROJETO || 'projeto-garage-f0a2f';
const APLICAR = process.argv[2] === '--aplicar';
const BACKUP = process.argv[3];
const CAMPOS = ['inicio', 'plano', 'fundador', 'cortesia'];

const conta = (lista, chave) => {
  const m = {};
  for (const x of lista) { const k = String(chave(x)); m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort());
};

(async () => {
  if (APLICAR && (!BACKUP || existsSync(BACKUP))) throw new Error('informe um arquivo de backup NOVO: --aplicar <caminho.json>');
  const raiz = join(__dirname, '..', '..');
  const { migracaoDaFicha } = await import(pathToFileURL(join(raiz, 'coach', 'gestao-de-alunos', 'cadastro-regras.js')).href);
  const { mensalidadeDoMes, rotuloDoPlano, VIGENCIA_2027 } = await import(pathToFileURL(join(raiz, 'compartilhado', 'regras', 'planos.js')).href);

  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  console.log(`${APLICAR ? 'GRAVAÇÃO' : 'SIMULAÇÃO (nada é gravado)'} · projeto ${PROJETO}`);

  /** @type {{ uid: string, id: string, antes: Record<string, any>, campos: string[] }[]} */
  const tocadas = [];
  for (const uid of COACH_UIDS) {
    const fichas = (await db.collection(`gestao/${uid}/alunos`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
    const ativa = (f) => (f.status || 'ativo') !== 'inativo';
    const comPatch = fichas.map((f) => ({ f, patch: migracaoDaFicha(f) }));
    const porCampo = Object.fromEntries(CAMPOS.map((c) => [c, comPatch.filter((x) => c in x.patch).length]));
    for (const { f, patch } of comPatch) {
      const campos = Object.keys(patch);
      if (!campos.length) continue;
      tocadas.push({ uid, id: f.id, antes: Object.fromEntries(CAMPOS.map((c) => [c, f[c] ?? null])), campos });
    }
    const depois = comPatch.map(({ f, patch }) => ({ ...f, ...patch }));
    const ativas = depois.filter(ativa);

    console.log(`\nCoach ${uid.slice(0, 4)}…  fichas: ${fichas.length} (ativas e pendentes: ${ativas.length}, inativas: ${fichas.length - ativas.length})`);
    console.log(`  fichas a tocar: ${tocadas.filter((t) => t.uid === uid).length}; campos a gravar: ${JSON.stringify(porCampo)}`);
    console.log(`  plano (ativas): ${JSON.stringify(conta(ativas, (f) => rotuloDoPlano(f.plano) || 'sem plano'))}`);
    console.log(`  plano (inativas): ${JSON.stringify(conta(depois.filter((f) => !ativa(f)), (f) => rotuloDoPlano(f.plano) || 'sem plano'))}`);
    console.log(`  fundadores: ${depois.filter((f) => f.fundador === true).length} (ativas sem a marca: ${ativas.filter((f) => f.fundador !== true).length})`);
    console.log(`  cortesias: ${depois.filter((f) => f.cortesia).length}`);
    console.log(`  início por mês (todas): ${JSON.stringify(conta(depois, (f) => (f.inicio ? f.inicio.slice(0, 7) : 'sem dado')))}`);
    // Quantas fichas vão para cada preço em janeiro (os valores são os da tabela, não de ninguém).
    console.log(`  preço em ${VIGENCIA_2027} (ativas): ${JSON.stringify(conta(ativas, (f) => { const m = mensalidadeDoMes(f, VIGENCIA_2027); return m.zero ? m.zero : `${m.origem} ${m.valor}`; }))}`);
    // A prova de que nada muda até dezembro: o valor de nov e dez antes e depois.
    let mudam = 0;
    for (const { f, patch } of comPatch) {
      for (const mes of ['2026-10', '2026-11', '2026-12']) if (mensalidadeDoMes(f, mes).valor !== mensalidadeDoMes({ ...f, ...patch }, mes).valor) mudam++;
    }
    console.log(`  meses de out a dez cujo valor mudaria: ${mudam}`);
  }

  if (!APLICAR) { console.log('\nNada foi gravado.'); process.exit(0); }

  writeFileSync(BACKUP, JSON.stringify(tocadas.map((t) => ({ caminho: `gestao/${t.uid}/alunos/${t.id}`, antes: t.antes, campos: t.campos })), null, 1));
  console.log(`\nBackup gravado em ${BACKUP} (${tocadas.length} ficha(s)).`);

  let gravadas = 0, campos = 0;
  for (const t of tocadas) {
    const ref = db.doc(`gestao/${t.uid}/alunos/${t.id}`);
    const n = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      // Recalcula com a ficha relida: o que o coach preencheu no meio-tempo fica como está.
      const patch = migracaoDaFicha({ ...snap.data(), id: t.id });
      const chaves = Object.keys(patch);
      if (!chaves.length) return 0;
      tx.update(ref, { ...patch, atualizadoEm: FieldValue.serverTimestamp() });
      return chaves.length;
    });
    if (n) { gravadas++; campos += n; }
  }
  console.log(`Feito: ${gravadas} ficha(s), ${campos} campo(s) gravado(s).`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
