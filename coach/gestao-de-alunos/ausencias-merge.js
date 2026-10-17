// @ts-check
/**
 * "Não irei ao treino" (lado coach): aplica na ficha os avisos que os alunos
 * deram pelo Portal ou pelo app.
 *
 * O aviso não chega pela caixa do aluno (`portalInbox`), que ele escreve livre:
 * a HORA do aviso decide o crédito de reposição, então quem grava é a Cloud
 * Function `avisarAusencia`, com o relógio do servidor, em
 * `avisosAusencia/{email}.itens[`${tipo}|${chave}`]`. Aqui a Gestão aplica a
 * mesma regra do painel (presenca-regras.js) com aquele relógio — o resultado é
 * o que o aluno ouviu na hora — e tira o item consumido.
 *
 * Roda no boot e de 2 em 2 minutos, junto com o Pix (boot.js).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { desmarcar, desmarcarReposicaoComAviso } from './presenca-regras.js?v=23';
import { casarCaixasComFichas } from './portal-merge.js?v=23';

/**
 * @typedef {{ tipo: 'titular'|'reposicao', chave: string, coachUid: string, alunoId?: string,
 *   aviso: { hoje: string, agora: string }, em: number, noPrazo?: boolean }} Aviso
 */

/**
 * Aplica, em ordem de chegada, os avisos de um aluno na ficha. Todo item é
 * consumido: o que a regra recusa (a aula já tinha crédito, o coach já lançou a
 * falta) vira só uma linha de "ignorado", para não ficar voltando.
 * @param {any} a a ficha @param {Record<string, Aviso>} itens
 * @returns {{ patch: Record<string, any>, logs: Array<{ tipo: string, resumo: string, extra?: any }>, consumidos: string[], ignorados: Array<{ chave: string, motivo: string }> }}
 */
export function aplicarAvisosNaFicha(a, itens) {
  let ficha = { ...a };
  const patch = {};
  const logs = [];
  const consumidos = [];
  const ignorados = [];
  const ordem = Object.entries(itens || {}).sort(([, x], [, y]) => (Number(x && x.em) || 0) - (Number(y && y.em) || 0));
  for (const [chave, item] of ordem) {
    consumidos.push(chave);
    if (!item || !item.aviso || typeof item.chave !== 'string') { ignorados.push({ chave, motivo: 'aviso sem dados' }); continue; }
    const o = { aviso: item.aviso, em: Number(item.em) || Date.now() };
    const r = item.tipo === 'reposicao' ? desmarcarReposicaoComAviso(ficha, item.chave, o) : desmarcar(ficha, item.chave, o);
    if (!r) { ignorados.push({ chave, motivo: 'reposição não está mais marcada' }); continue; }
    if ('recusa' in r) { ignorados.push({ chave, motivo: r.recusa.texto }); continue; }
    ficha = { ...ficha, ...r.patch };
    Object.assign(patch, r.patch);
    logs.push({ ...r.log, resumo: `Pelo app: ${r.log.resumo}` });
  }
  return { patch, logs, consumidos, ignorados };
}

const V = '10.12.2';
/** @type {any} */ let F = null;
/** @type {any} */ let _db = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = F.getFirestore(app);
}

/**
 * Varre `avisosAusencia`, aplica os avisos deste coach nas fichas e consome os
 * itens. Caixa sem ficha fica intacta (como no portal-merge). Devolve quantas
 * fichas mudaram. Falha de rede ou de regra não quebra a Gestão.
 * @param {{ coachUid: string, alunos: any[], aplicar: (id: string, patch: any) => void,
 *   registrar: (tipo: string, a: any, resumo: string, extra?: any) => void }} o
 */
export async function mesclarAvisosDeAusencia({ coachUid, alunos, aplicar, registrar }) {
  if (!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey) || !coachUid) return 0;
  let n = 0;
  try {
    await init();
    const snap = await F.getDocs(F.collection(_db, 'avisosAusencia'));
    if (snap.empty) return 0;
    const porId = new Map(snap.docs.map((/** @type {any} */ d) => [d.id, d]));
    const { pares } = casarCaixasComFichas([...porId.keys()], alunos);
    for (const { key, aluno } of pares) {
      const todos = (porId.get(key).data() || {}).itens || {};
      const meus = Object.fromEntries(Object.entries(todos).filter(([, v]) => v && v.coachUid === coachUid));
      if (!Object.keys(meus).length) continue;
      const r = aplicarAvisosNaFicha(aluno, meus);
      if (Object.keys(r.patch).length) { aplicar(aluno.id, r.patch); n++; }
      for (const l of r.logs) { try { registrar(l.tipo, aluno, l.resumo, l.extra); } catch { /* o log não trava o merge */ } }
      for (const i of r.ignorados) console.warn(`[ausências] ${key} ${i.chave}: ignorado — ${i.motivo}`);
      // Tira só os itens consumidos: um aviso que chegou durante a leitura fica.
      const ref = F.doc(_db, 'avisosAusencia', key);
      const campos = r.consumidos.flatMap((k) => [new F.FieldPath('itens', k), F.deleteField()]);
      if (campos.length) await F.updateDoc(ref, campos[0], campos[1], ...campos.slice(2));
    }
  } catch (e) {
    console.warn('[ausências] não deu para aplicar os avisos agora:', e);
  }
  return n;
}
