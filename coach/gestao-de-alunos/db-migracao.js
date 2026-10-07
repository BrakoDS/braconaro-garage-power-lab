// @ts-check
/**
 * Migração da Gestão de Alunos: do blob v1 para as subcoleções v2.
 *
 *   v1: gestao/{uid} = { seq, alunos[], produtos, feriados }
 *   v2: gestao/{uid} = { schema: 2, seq, produtos, feriados, migradoEm, migracao }
 *       gestao/{uid}/alunos/{id}                  a ficha (com `emailNorm`)
 *       gestao/{uid}/alunos/{id}/avaliacoes/{num} uma avaliação
 *       gestao/{uid}/alunos/{id}/feedbacks/{id}   um feedback pós-treino
 *       gestao/{uid}/backup/v1-AAAAMMDD           o documento raiz, intacto
 *
 * Plano: docs/superpowers/specs/2026-10-06-refatoracao-gestao-design.md, §3.
 *
 * Este módulo é PURO: não importa Firebase. Quem fala com o banco é uma "porta"
 * injetada — `db-firestore.js` em produção, `db-memoria.js`
 * nos testes e no simulador (`ferramentas/simular-migracao-gestao.mjs`). Assim
 * a ordem dos passos, que é onde mora o risco, é provada sem rede.
 *
 * Garantias:
 *  - o documento raiz NUNCA é apagado: a virada é um update que só tira `alunos`;
 *  - até a virada, o blob v1 continua sendo a verdade (as Cloud Functions só
 *    olham a subcoleção com `schema: 2`); falhar em qualquer passo antes dela
 *    deixa tudo como estava;
 *  - rodar de novo não duplica nada: os ids são determinísticos e a sobra de
 *    uma tentativa anterior é apagada;
 *  - a virada é condicional: se um aparelho ainda no v1 regravou o blob durante
 *    a cópia, ela não acontece (a cópia estaria velha) e a próxima rodada refaz.
 */

export const SCHEMA_V2 = 2;
/** Mesmo nome que o servidor consulta (`functions/src/gestao-leitura.ts`). */
export const CAMPO_EMAIL_NORM = 'emailNorm';
/** Teto de operações por `writeBatch` do Firestore. */
export const MAX_OPS_LOTE = 500;
/** Trava mais velha que isso é de uma aba que morreu no meio: pode ser tomada. */
export const TRAVA_EXPIRA_MS = 10 * 60 * 1000;
/** O teto do Firestore é 1 MiB por documento; a folga cobre a contagem dele, que não é JSON. */
export const TETO_DOC_BYTES = 900 * 1024;

/* ============================================================
   Utilidades puras
   ============================================================ */

/**
 * E-mail normalizado, ou '' quando não parece e-mail. CÓPIA de `normalizarEmail`
 * em `functions/src/acesso.ts`: o servidor procura `emailNorm == normalizarEmail(email)`,
 * então as duas precisam dar o mesmo resultado (o teste confere os mesmos casos).
 * @param {unknown} v
 */
export function normalizarEmail(v) {
  if (typeof v !== 'string') return '';
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

/**
 * Serve de id de documento? CÓPIA de `ehIdDeDoc` em `functions/src/gestao-leitura.ts`.
 * @param {string} id
 */
export function ehIdDeDoc(id) {
  return !!id && id.length <= 1500 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
}

/** Tira `undefined`, funções e afins — o Firestore recusa `undefined`. @param {any} v */
const limpo = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * JSON com as chaves em ordem: duas leituras do mesmo dado dão o mesmo texto,
 * não importa a ordem em que o Firestore devolveu os campos.
 * @param {any} v
 * @returns {string}
 */
export function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Tamanho aproximado do documento, em bytes UTF-8. @param {any} v */
export const bytesJSON = (v) => new TextEncoder().encode(JSON.stringify(v)).length;

/** `v1-AAAAMMDD`, na data local de quem roda. @param {number} agora */
export function idDoBackup(agora) {
  const d = new Date(agora);
  return `v1-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================================================
   Um aluno fatiado — a regra única de ids e de emailNorm
   ============================================================
   A migração e o cache do dia a dia (`db-cache.js`) fatiam o aluno pela MESMA
   função: se um gerasse o id do feedback de um jeito e o outro de outro, a
   primeira gravação depois da migração apagaria e recriaria tudo. */

/**
 * Ids dos feedbacks, na ordem da lista. O do próprio feedback quando serve;
 * senão `fb-{criadoEm}` — sem a posição na lista, porque o `portal-merge.js`
 * reordena a lista a cada feedback novo, e o id não pode andar junto. Repetido
 * ganha sufixo (`-2`, `-3`) em vez de sobrescrever o outro.
 * @param {any[]} fbs
 * @returns {string[]}
 */
export function idsDosFeedbacks(fbs) {
  const vistos = new Set();
  return (Array.isArray(fbs) ? fbs : []).map((fb) => {
    const base = fb && typeof fb.id === 'string' && ehIdDeDoc(fb.id) ? fb.id : `fb-${Number(fb && fb.criadoEm) || 0}`;
    let id = base;
    for (let n = 2; vistos.has(id); n++) id = `${base}-${n}`;
    vistos.add(id);
    return id;
  });
}

/**
 * O aluno "gordo" (como a tela conhece) em documentos: a ficha, cada avaliação
 * e cada feedback. Problema = dado que não vira documento sem inventar algo.
 * @param {any} a o aluno, já sem `undefined` (passe por JSON antes)
 * @returns {{ id: string, ficha: Dados, avaliacoes: {id: string, dados: Dados}[],
 *   feedbacks: {id: string, dados: Dados}[], problemas: string[], avisos: string[] }}
 */
export function fatiarAluno(a) {
  const problemas = [], avisos = [];
  const id = a && (typeof a.id === 'string' || typeof a.id === 'number') ? String(a.id) : '';
  const quem = `Aluno ${JSON.stringify(id || null)} (${(a && a.nome) || 'sem nome'})`;
  if (!id) problemas.push(`${quem}: sem id.`);
  else if (!ehIdDeDoc(id)) problemas.push(`${quem}: o id não serve de id de documento.`);

  const { avaliacoes: avs, feedbacks: fbs, ...resto } = a || {};
  const ficha = { ...resto, id, [CAMPO_EMAIL_NORM]: normalizarEmail(a && a.email) };
  if (a && a.email && !ficha[CAMPO_EMAIL_NORM]) avisos.push(`${quem}: e-mail "${a.email}" não parece e-mail — emailNorm fica vazio.`);
  const tam = bytesJSON(ficha);
  if (tam > TETO_DOC_BYTES) problemas.push(`${quem}: a ficha sozinha tem ${(tam / 1024).toFixed(0)} KB.`);

  const avaliacoes = [];
  const nums = new Set();
  (Array.isArray(avs) ? avs : []).forEach((av, j) => {
    const num = av && typeof av === 'object' ? av.num : undefined;
    if (!Number.isInteger(num) || num < 1) { problemas.push(`${quem}: avaliação na posição ${j} sem número válido (${JSON.stringify(num)}).`); return; }
    if (nums.has(num)) { problemas.push(`${quem}: avaliação nº ${num} repetida.`); return; }
    nums.add(num);
    if (bytesJSON(av) > TETO_DOC_BYTES) problemas.push(`${quem}: a avaliação nº ${num} sozinha passa do teto.`);
    avaliacoes.push({ id: String(num), dados: av });
  });
  if (avs != null && !Array.isArray(avs)) avisos.push(`${quem}: \`avaliacoes\` não é lista — ignorado (fica no backup).`);

  const listaFb = Array.isArray(fbs) ? fbs : [];
  const fbIds = idsDosFeedbacks(listaFb);
  const feedbacks = [];
  listaFb.forEach((fb, j) => {
    if (!fb || typeof fb !== 'object') { avisos.push(`${quem}: feedback na posição ${j} não é objeto — fica só no backup.`); return; }
    feedbacks.push({ id: fbIds[j], dados: fb });
  });

  return { id, ficha, avaliacoes, feedbacks, problemas, avisos };
}

/* ============================================================
   Plano: o blob v1 fatiado em documentos
   ============================================================ */

/**
 * @typedef {Record<string, any>} Dados
 * @typedef {{ id: string, dados: Dados }} Ficha
 * @typedef {{ alunoId: string, id: string, dados: Dados }} Filho
 * @typedef {{ alunos: number, avaliacoes: number, feedbacks: number }} Contagem
 * @typedef {{
 *   ok: boolean, problemas: string[], avisos: string[],
 *   backupId: string, backup: Dados,
 *   fichas: Ficha[], avaliacoes: Filho[], feedbacks: Filho[],
 *   contagem: Contagem, virada: Dados,
 * }} Plano
 */

/**
 * Fatia o documento raiz v1. Não grava nada: devolve o que precisa ser gravado
 * e, em `problemas`, o que impede a migração. Problema bloqueia; aviso não.
 *
 * Bloqueia o que obrigaria a INVENTAR dado: id de aluno ausente, repetido ou que
 * não serve de id de documento (o id do aluno está no Storage, nos eventos, no
 * `pagoPor` e nas fichas da lousa — renomear aqui quebraria tudo isso), e
 * avaliação sem número ou com número repetido (é o `num` que a tela usa para
 * abrir e apagar). Feedback sem id ganha um determinístico: ninguém aponta para ele.
 *
 * @param {Dados} raizBruta o documento `gestao/{uid}` como veio do banco
 * @param {{ agora: number, aparelho?: string }} opts
 * @returns {Plano}
 */
export function planejarMigracao(raizBruta, { agora, aparelho = '' }) {
  const raiz = limpo(raizBruta) || {};
  const problemas = [], avisos = [];
  /** @type {Ficha[]} */ const fichas = [];
  /** @type {Filho[]} */ const avaliacoes = [];
  /** @type {Filho[]} */ const feedbacks = [];
  const ids = new Set();

  if (!Array.isArray(raiz.alunos)) problemas.push('O documento não tem a lista `alunos` do formato v1.');

  (Array.isArray(raiz.alunos) ? raiz.alunos : []).forEach((/** @type {any} */ a, i) => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) { avisos.push(`Posição ${i} da lista não é um aluno (${JSON.stringify(a)}) — fica só no backup.`); return; }
    const f = fatiarAluno(a);
    avisos.push(...f.avisos);
    if (f.problemas.length) { problemas.push(...f.problemas.map((p) => (f.id ? p : `${p} (posição ${i})`))); return; }
    if (ids.has(f.id)) { problemas.push(`Aluno ${JSON.stringify(f.id)} (${a.nome || 'sem nome'}): id repetido na lista.`); return; }
    ids.add(f.id);
    fichas.push({ id: f.id, dados: f.ficha });
    for (const av of f.avaliacoes) avaliacoes.push({ alunoId: f.id, ...av });
    for (const fb of f.feedbacks) feedbacks.push({ alunoId: f.id, ...fb });
  });

  const { migracao: _trava, ...backup } = raiz; // a trava é desta rodada, não do histórico
  return {
    ok: problemas.length === 0,
    problemas, avisos,
    backupId: idDoBackup(agora),
    backup,
    fichas, avaliacoes, feedbacks,
    contagem: { alunos: fichas.length, avaliacoes: avaliacoes.length, feedbacks: feedbacks.length },
    virada: {
      schema: SCHEMA_V2,
      migradoEm: agora,
      migracao: {
        status: 'concluida', em: agora, aparelho, backup: idDoBackup(agora),
        contagem: { alunos: fichas.length, avaliacoes: avaliacoes.length, feedbacks: feedbacks.length },
      },
    },
  };
}

/* ============================================================
   Operações e lotes
   ============================================================ */

/**
 * @typedef {{ tipo: 'set', caminho: string[], dados: Dados } | { tipo: 'delete', caminho: string[] }} Operacao
 * Caminho relativo a `gestao/{uid}`: ['alunos', '001'], ['alunos', '001', 'avaliacoes', '2']…
 *
 * @typedef {{
 *   fichas: Map<string, Dados>,
 *   avaliacoes: Map<string, Map<string, Dados>>,
 *   feedbacks: Map<string, Map<string, Dados>>,
 * }} Subcolecoes   o que já existe (ou foi lido de volta) embaixo de gestao/{uid}/alunos
 */

/**
 * Tudo que precisa ser gravado, e o que precisa sair: sobra de uma tentativa
 * anterior (aluno removido depois dela, avaliação apagada) ressuscitaria dado
 * que o coach já tirou. Antes da virada só a migração escreve nessas
 * subcoleções, então apagar a sobra é seguro.
 * @param {Plano} plano @param {Subcolecoes} existentes
 * @returns {Operacao[]}
 */
export function operacoes(plano, existentes) {
  /** @type {Operacao[]} */ const ops = [];
  const noPlano = new Set(plano.fichas.map((f) => f.id));
  const filhosNoPlano = (lista, alunoId) => new Set(lista.filter((x) => x.alunoId === alunoId).map((x) => x.id));

  for (const id of existentes.fichas.keys()) {
    const avs = [...(existentes.avaliacoes.get(id)?.keys() || [])];
    const fbs = [...(existentes.feedbacks.get(id)?.keys() || [])];
    const manterAv = noPlano.has(id) ? filhosNoPlano(plano.avaliacoes, id) : new Set();
    const manterFb = noPlano.has(id) ? filhosNoPlano(plano.feedbacks, id) : new Set();
    for (const n of avs) if (!manterAv.has(n)) ops.push({ tipo: 'delete', caminho: ['alunos', id, 'avaliacoes', n] });
    for (const f of fbs) if (!manterFb.has(f)) ops.push({ tipo: 'delete', caminho: ['alunos', id, 'feedbacks', f] });
    if (!noPlano.has(id)) ops.push({ tipo: 'delete', caminho: ['alunos', id] });
  }
  for (const f of plano.fichas) ops.push({ tipo: 'set', caminho: ['alunos', f.id], dados: f.dados });
  for (const a of plano.avaliacoes) ops.push({ tipo: 'set', caminho: ['alunos', a.alunoId, 'avaliacoes', a.id], dados: a.dados });
  for (const b of plano.feedbacks) ops.push({ tipo: 'set', caminho: ['alunos', b.alunoId, 'feedbacks', b.id], dados: b.dados });
  return ops;
}

/**
 * @template T
 * @param {T[]} lista @param {number} [max]
 * @returns {T[][]}
 */
export function emLotes(lista, max = MAX_OPS_LOTE) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += max) lotes.push(lista.slice(i, i + max));
  return lotes;
}

/* ============================================================
   Verificação e remontagem
   ============================================================ */

/**
 * O que foi lido de volta bate com o plano? Contagem de alunos, avaliações e
 * feedbacks, e cada documento campo a campo (JSON canônico). Sobra também é
 * diferença: um aluno a mais na subcoleção apareceria na lista do coach.
 * @param {Plano} plano @param {Subcolecoes} lido
 * @returns {{ ok: boolean, contagemLida: Contagem, diferencas: string[] }}
 */
export function verificar(plano, lido) {
  const diferencas = [];
  const soma = (/** @type {Map<string, Map<string, Dados>>} */ m) => [...m.values()].reduce((n, x) => n + x.size, 0);
  const contagemLida = { alunos: lido.fichas.size, avaliacoes: soma(lido.avaliacoes), feedbacks: soma(lido.feedbacks) };
  for (const k of /** @type {(keyof Contagem)[]} */ (['alunos', 'avaliacoes', 'feedbacks'])) {
    if (contagemLida[k] !== plano.contagem[k]) diferencas.push(`${k}: esperado ${plano.contagem[k]}, lido ${contagemLida[k]}.`);
  }
  for (const f of plano.fichas) {
    const l = lido.fichas.get(f.id);
    if (!l) diferencas.push(`Ficha ${f.id} não foi gravada.`);
    else if (canonico(l) !== canonico(f.dados)) diferencas.push(`Ficha ${f.id} gravada diferente.`);
  }
  const noPlano = new Set(plano.fichas.map((f) => f.id));
  for (const id of lido.fichas.keys()) if (!noPlano.has(id)) diferencas.push(`Ficha ${id} sobrando na subcoleção.`);
  for (const [nome, lista, mapa] of /** @type {const} */ ([['Avaliação', plano.avaliacoes, lido.avaliacoes], ['Feedback', plano.feedbacks, lido.feedbacks]])) {
    for (const x of lista) {
      const l = mapa.get(x.alunoId)?.get(x.id);
      if (!l) diferencas.push(`${nome} ${x.alunoId}/${x.id} não foi gravada.`);
      else if (canonico(l) !== canonico(x.dados)) diferencas.push(`${nome} ${x.alunoId}/${x.id} gravada diferente.`);
    }
  }
  return { ok: diferencas.length === 0, contagemLida, diferencas: diferencas.slice(0, 30) };
}

/**
 * O caminho de volta: subcoleções → o objeto aluno que a tela conhece (com
 * `avaliacoes[]` e `feedbacks[]` dentro). É a forma que o `db.js` v2 vai
 * entregar aos consumidores, e a prova de que a migração não perde nada:
 * remontar(planejar(blob)) == blob (+ emailNorm).
 *
 * Ordem: avaliações por número (a ordem em que nasceram); feedbacks do mais
 * recente para o mais antigo (a do `portal-merge.js`); alunos por criação.
 * @param {Dados} meta @param {Subcolecoes} sub
 */
export function remontar(meta, sub) {
  const { schema: _s, migradoEm: _m, migracao: _t, ...resto } = meta || {};
  const alunos = [...sub.fichas.entries()].map(([id, f]) => ({
    ...f,
    avaliacoes: [...(sub.avaliacoes.get(id)?.values() || [])].sort((x, y) => (x.num || 0) - (y.num || 0)),
    feedbacks: [...(sub.feedbacks.get(id)?.values() || [])].sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0)),
  })).sort((x, y) => (x.criadoEm || 0) - (y.criadoEm || 0) || String(x.id).localeCompare(String(y.id)));
  return { ...resto, alunos };
}

/* ============================================================
   Trava
   ============================================================ */

/**
 * Pode travar? Puro, para as duas portas decidirem igual — a do Firestore roda
 * isto dentro de uma transação.
 * @param {Dados|null} raiz @param {{ em: number, aparelho: string, expiraMs?: number }} pedido
 * @returns {{ ok: true } | { ok: false, motivo: 'sem-dados'|'ja-migrado'|'ocupado', trava?: Dados }}
 */
export function decidirTrava(raiz, { em, aparelho, expiraMs = TRAVA_EXPIRA_MS }) {
  if (!raiz) return { ok: false, motivo: 'sem-dados' };
  if (raiz.schema === SCHEMA_V2) return { ok: false, motivo: 'ja-migrado' };
  const t = raiz.migracao;
  if (t && t.status === 'andando' && t.aparelho !== aparelho && em - (Number(t.em) || 0) < expiraMs) {
    return { ok: false, motivo: 'ocupado', trava: t };
  }
  return { ok: true };
}

/* ============================================================
   A rodada inteira
   ============================================================ */

/**
 * @typedef {{
 *   lerRaiz(): Promise<Dados|null>,
 *   travar(pedido: { em: number, aparelho: string, expiraMs?: number }): Promise<ReturnType<typeof decidirTrava>>,
 *   gravarBackup(id: string, dados: Dados): Promise<void>,
 *   lerSubcolecoes(): Promise<Subcolecoes>,
 *   gravarLote(ops: Operacao[]): Promise<void>,
 *   virar(alunosEsperados: string, virada: Dados): Promise<boolean>,
 *   liberar(migracao: Dados): Promise<void>,
 * }} Porta
 *   `virar` é condicional e atômica: só tira `alunos` e grava `virada` se o
 *   `canonico(raiz.alunos)` atual ainda for `alunosEsperados`. Devolve se virou.
 *
 * @typedef {{ estado: 'migrado'|'ja-migrado'|'sem-dados'|'bloqueado'|'ocupado'|'blob-mudou'|'falhou',
 *   contagem?: Contagem, problemas?: string[], avisos?: string[], diferencas?: string[], erro?: string,
 *   lotes?: number, backupId?: string }} Resultado
 */

/**
 * Migra a nuvem, passo a passo. Qualquer falha antes da virada deixa o blob v1
 * como verdade e a trava marcada como 'falhou' (com o motivo); a próxima rodada
 * recomeça do zero.
 * @param {Porta} porta
 * @param {{ agora?: number, aparelho?: string, log?: (msg: string) => void }} [opts]
 * @returns {Promise<Resultado>}
 */
export async function migrarNuvem(porta, { agora = Date.now(), aparelho = 'desconhecido', log = () => {} } = {}) {
  const raiz = await porta.lerRaiz();
  if (!raiz) return { estado: 'sem-dados' };
  if (raiz.schema === SCHEMA_V2) return { estado: 'ja-migrado' };
  if (!Array.isArray(raiz.alunos)) return { estado: 'sem-dados' };

  const plano = planejarMigracao(raiz, { agora, aparelho });
  if (!plano.ok) return { estado: 'bloqueado', problemas: plano.problemas, avisos: plano.avisos };
  const alunosEsperados = canonico(raiz.alunos);

  // a) trava
  const trava = await porta.travar({ em: agora, aparelho });
  if (!trava.ok) return { estado: trava.motivo === 'ja-migrado' ? 'ja-migrado' : trava.motivo === 'ocupado' ? 'ocupado' : 'sem-dados' };
  log(`Trava tomada por ${aparelho}.`);

  try {
    // b) backup do documento raiz inteiro, antes de qualquer outra escrita
    await porta.gravarBackup(plano.backupId, plano.backup);
    log(`Backup gravado em backup/${plano.backupId}.`);

    // c) cópia em lotes (com a limpeza da sobra de tentativas anteriores)
    const ops = operacoes(plano, await porta.lerSubcolecoes());
    const lotes = emLotes(ops);
    for (let i = 0; i < lotes.length; i++) {
      await porta.gravarLote(lotes[i]);
      log(`Lote ${i + 1}/${lotes.length} gravado (${lotes[i].length} operações).`);
    }

    // e) verificação: lê tudo de volta e confere
    const v = verificar(plano, await porta.lerSubcolecoes());
    if (!v.ok) {
      await porta.liberar({ status: 'falhou', em: agora, aparelho, erro: 'verificacao', diferencas: v.diferencas });
      return { estado: 'falhou', erro: 'A cópia não bate com o original.', diferencas: v.diferencas, contagem: v.contagemLida };
    }
    log(`Verificado: ${plano.contagem.alunos} alunos, ${plano.contagem.avaliacoes} avaliações, ${plano.contagem.feedbacks} feedbacks.`);

    // f) virada — condicional: blob regravado no meio = cópia velha
    const virou = await porta.virar(alunosEsperados, plano.virada);
    if (!virou) {
      await porta.liberar({ status: 'adiada', em: agora, aparelho, erro: 'blob-mudou' });
      return { estado: 'blob-mudou', contagem: plano.contagem };
    }
    log('Virada feita: schema 2.');
    return { estado: 'migrado', contagem: plano.contagem, avisos: plano.avisos, lotes: lotes.length, backupId: plano.backupId };
  } catch (e) {
    const erro = String((e && /** @type {any} */ (e).code) || (e && /** @type {any} */ (e).message) || e);
    try { await porta.liberar({ status: 'falhou', em: agora, aparelho, erro }); } catch {}
    return { estado: 'falhou', erro };
  }
}
