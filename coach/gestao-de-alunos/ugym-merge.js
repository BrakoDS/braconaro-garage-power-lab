// @ts-check
/**
 * Check-in pelo app da uGym (lado coach): aplica na ficha o check-in que o
 * aluno fez no app da uGym, e o Painel de Presença passa a mostrar "Presente".
 *
 * Quem lê o FitControl é a Cloud Function `sincronizarUgym`, de 2 em 2 minutos,
 * e ela grava em `checkinsUgym/{email}.itens[`ugym|${reserva}`]` — nunca na
 * ficha, que é da Gestão (ver functions/src/ugym-servico.ts). Aqui a Gestão
 * aplica com a MESMA regra do botão Check-in (`checkin` de checkin-regras.js),
 * com a hora do check-in no app (e não a hora em que o coach abriu a tela), e
 * tira o item consumido.
 *
 * Qual aula da ficha o check-in fecha: a que acontece naquele dia — a titular
 * (no dia dela ou no trocado) ou a reposição marcada para ele
 * (`diasReivindicados`). Aluno sem grade fixa ganha a presença do dia. Aluno com
 * grade e sem aula naquele dia: nada muda — a régua da semana ("2 de 4 treinos")
 * não pode contar uma visita fora da grade sozinha —, e o coach recebe a linha
 * no Registros para decidir.
 *
 * Roda no boot e de 2 em 2 minutos, junto com o Pix e os avisos (boot.js).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { datasDaSemana } from '../../compartilhado/regras/semana.js';
import { alternarPresenca, checkin, diasReivindicados } from './checkin-regras.js?v=23';
import { casarCaixasComFichas } from './portal-merge.js?v=23';

/**
 * @typedef {{ coachUid: string, origem: 'ugym', dia: string, hora: string,
 *   checkin: { hoje: string, agora: string }, aulaUgym?: string, reservaUgym?: string, em: number }} CheckinUgym
 */

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/;
const EH_HORA = /^\d{2}:\d{2}$/;
/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Aplica, em ordem de chegada, os check-ins da uGym de um aluno na ficha. Todo
 * item é consumido: o que não fecha aula nenhuma vira "ignorado" (e, se for
 * visita fora da grade, uma linha para o coach), para não ficar voltando.
 * @param {any} a a ficha @param {Record<string, CheckinUgym>} itens
 * @returns {{ patch: Record<string, any>, logs: Array<{ tipo: string, resumo: string, extra?: any }>, consumidos: string[], ignorados: Array<{ chave: string, motivo: string }> }}
 */
export function aplicarCheckinsNaFicha(a, itens) {
  let ficha = { ...a };
  /** @type {Record<string, any>} */
  const patch = {};
  /** @type {Array<{ tipo: string, resumo: string, extra?: any }>} */
  const logs = [];
  /** @type {string[]} */
  const consumidos = [];
  /** @type {Array<{ chave: string, motivo: string }>} */
  const ignorados = [];
  const ordem = Object.entries(itens || {}).sort(([, x], [, y]) => (Number(x && x.em) || 0) - (Number(y && y.em) || 0));
  for (const [chave, item] of ordem) {
    consumidos.push(chave);
    const rel = item && item.checkin;
    if (!item || typeof item.dia !== 'string' || !EH_DATA.test(item.dia) || !rel || !EH_DATA.test(rel.hoje) || !EH_HORA.test(rel.agora)) {
      ignorados.push({ chave, motivo: 'check-in sem dados' }); continue;
    }
    const dia = item.dia;
    if ((ficha.presencas || []).includes(dia)) { ignorados.push({ chave, motivo: `já tinha check-in em ${ddmm(dia)}` }); continue; }

    const dono = diasReivindicados(ficha, datasDaSemana(new Date(dia + 'T00:00:00'))).get(dia);
    let r;
    if (dono) {
      const rep = ficha.atestados && ficha.atestados[dono] && ficha.atestados[dono].reposicao;
      r = rep && rep.data === dia
        ? checkin(ficha, dia, { ehReposicao: true, hoje: rel.hoje, agora: rel.agora })
        : checkin(ficha, dono, { hoje: rel.hoje, agora: rel.agora });
    } else if (!(ficha.diasTreino || []).length) {
      r = alternarPresenca(ficha, dia, rel);
    } else {
      ignorados.push({ chave, motivo: `sem aula dele em ${ddmm(dia)}` });
      logs.push({
        tipo: 'presenca-ugym-fora-da-grade',
        resumo: `Check-in pelo app da uGym em ${ddmm(dia)} às ${rel.agora}, mas não há aula dele nesse dia — confira`,
        extra: { dia },
      });
      continue;
    }
    ficha = { ...ficha, ...r.patch };
    Object.assign(patch, r.patch);
    logs.push({ ...r.log, resumo: `Pelo app da uGym: ${r.log.resumo}` });
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
 * Varre `checkinsUgym`, aplica os check-ins deste coach nas fichas e consome os
 * itens. Caixa sem ficha fica intacta (como no portal-merge). Devolve quantas
 * fichas mudaram. Falha de rede ou de regra não quebra a Gestão.
 * @param {{ coachUid: string, alunos: any[], aplicar: (id: string, patch: any) => void,
 *   registrar: (tipo: string, a: any, resumo: string, extra?: any) => void }} o
 */
export async function mesclarCheckinsUgym({ coachUid, alunos, aplicar, registrar }) {
  if (!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey) || !coachUid) return 0;
  let n = 0;
  try {
    await init();
    const snap = await F.getDocs(F.collection(_db, 'checkinsUgym'));
    if (snap.empty) return 0;
    const porId = new Map(snap.docs.map((/** @type {any} */ d) => [d.id, d]));
    const { pares } = casarCaixasComFichas([...porId.keys()], alunos);
    for (const { key, aluno } of pares) {
      const todos = (porId.get(key).data() || {}).itens || {};
      const meus = Object.fromEntries(Object.entries(todos).filter(([, v]) => v && v.coachUid === coachUid));
      if (!Object.keys(meus).length) continue;
      const r = aplicarCheckinsNaFicha(aluno, meus);
      if (Object.keys(r.patch).length) { aplicar(aluno.id, r.patch); n++; }
      for (const l of r.logs) { try { registrar(l.tipo, aluno, l.resumo, l.extra); } catch { /* o log não trava o merge */ } }
      for (const i of r.ignorados) console.warn(`[uGym] ${key} ${i.chave}: ignorado — ${i.motivo}`);
      // Tira só os itens consumidos: um check-in que chegou durante a leitura fica.
      const ref = F.doc(_db, 'checkinsUgym', key);
      const campos = r.consumidos.flatMap((k) => [new F.FieldPath('itens', k), F.deleteField()]);
      if (campos.length) await F.updateDoc(ref, campos[0], campos[1], ...campos.slice(2));
    }
  } catch (e) {
    console.warn('[uGym] não deu para aplicar os check-ins agora:', e);
  }
  return n;
}
