// @ts-check
/**
 * "Não irei ao treino" e a reposição marcada pelo aluno (lado coach): aplica na
 * ficha o que os alunos fizeram pelo Portal ou pelo app.
 *
 * O aviso não chega pela caixa do aluno (`portalInbox`), que ele escreve livre:
 * a HORA do aviso decide o crédito de reposição, então quem grava é a Cloud
 * Function `avisarAusencia`, com o relógio do servidor, em
 * `avisosAusencia/{email}.itens[`${tipo}|${chave}`]`. Aqui a Gestão aplica a
 * mesma regra do painel (presenca-regras.js) com aquele relógio — o resultado é
 * o que o aluno ouviu na hora — e tira o item consumido.
 *
 * A reposição que o aluno marca vem do mesmo jeito, de `reposicoesAluno/{email}
 * .itens[origem]` (Cloud Function `agendarReposicao`, que já conferiu vaga,
 * prazo e crédito). Avisos e reservas são aplicados JUNTOS, em ordem de
 * chegada: o "Não irei" que gerou o crédito vem antes da reserva que o usa, e a
 * reserva vem antes do "Não irei" que a desmarca fora do prazo.
 *
 * Roda no boot e de 2 em 2 minutos, junto com o Pix (boot.js).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { agendarReposicao } from './checkin-regras.js?v=30';
import { desmarcar, desmarcarReposicaoComAviso } from './presenca-regras.js?v=30';
import { casarCaixasComFichas } from './portal-merge.js?v=30';

/**
 * @typedef {{ tipo: 'titular'|'reposicao', chave: string, coachUid: string, alunoId?: string,
 *   aviso: { hoje: string, agora: string }, em: number, noPrazo?: boolean }} Aviso
 */

/**
 * @typedef {{ origem: string, data: string, hora: string, coachUid: string, alunoId?: string, em: number }} Reserva
 */

/**
 * A reserva de reposição na ficha: o crédito de `origem` ganha a reposição.
 * A vaga e o prazo o servidor já conferiu na hora da reserva; aqui fica a
 * trava da ficha (o crédito existe, está livre, e o dia não tem outra aula).
 * @param {any} a @param {Reserva} r
 */
function aplicarReserva(a, r) {
  const v = (a.atestados || {})[r.origem];
  if (!v) return { recusa: { texto: 'o crédito não está mais na ficha' } };
  if (v.reposicao && v.reposicao.data) return { recusa: { texto: 'o crédito já tem reposição marcada' } };
  return agendarReposicao(a, r.origem, r.data, r.hora);
}

/**
 * Aplica, em ordem de chegada, os avisos e as reservas de um aluno na ficha.
 * Todo item é consumido: o que a regra recusa (a aula já tinha crédito, o coach
 * já lançou a falta, o crédito já foi usado) vira só uma linha de "ignorado",
 * para não ficar voltando.
 * @param {any} a a ficha @param {Record<string, Aviso>} itens @param {Record<string, Reserva>} [reservas]
 * @returns {{ patch: Record<string, any>, logs: Array<{ tipo: string, resumo: string, extra?: any }>, consumidos: string[], reservasConsumidas: string[], ignorados: Array<{ chave: string, motivo: string }> }}
 */
export function aplicarAvisosNaFicha(a, itens, reservas = {}) {
  let ficha = { ...a };
  const patch = {};
  const logs = [];
  const consumidos = [];
  const reservasConsumidas = [];
  const ignorados = [];
  const em = (/** @type {any} */ x) => Number(x && x.em) || 0;
  const ordem = [
    ...Object.entries(itens || {}).map(([chave, item]) => ({ chave, item, reserva: false })),
    ...Object.entries(reservas || {}).map(([chave, item]) => ({ chave, item, reserva: true })),
  ].sort((x, y) => em(x.item) - em(y.item));
  for (const { chave, item, reserva } of ordem) {
    if (reserva) {
      reservasConsumidas.push(chave);
      if (!item || typeof item.data !== 'string' || !item.data) { ignorados.push({ chave, motivo: 'reserva sem dados' }); continue; }
      const r = aplicarReserva(ficha, { ...item, origem: chave });
      if (!r) { ignorados.push({ chave, motivo: 'reserva sem dia' }); continue; }
      if ('recusa' in r) { ignorados.push({ chave, motivo: r.recusa.texto }); continue; }
      ficha = { ...ficha, ...r.patch };
      Object.assign(patch, r.patch);
      logs.push({ ...r.log, resumo: `Pelo app: ${r.log.resumo}` });
      continue;
    }
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
  return { patch, logs, consumidos, reservasConsumidas, ignorados };
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
 * Varre `avisosAusencia` e `reposicoesAluno`, aplica o deste coach nas fichas e consome os
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
    const [snapAvisos, snapReservas] = await Promise.all([
      F.getDocs(F.collection(_db, 'avisosAusencia')),
      // As reservas não podem derrubar os avisos (ex.: regra do Firestore ainda não publicada).
      F.getDocs(F.collection(_db, 'reposicoesAluno')).catch((/** @type {unknown} */ e) => {
        console.warn('[ausências] não deu para ler as reservas de reposição agora:', e);
        return { empty: true, docs: [] };
      }),
    ]);
    if (snapAvisos.empty && snapReservas.empty) return 0;
    const avisosPorId = new Map(snapAvisos.docs.map((/** @type {any} */ d) => [d.id, d]));
    const reservasPorId = new Map(snapReservas.docs.map((/** @type {any} */ d) => [d.id, d]));
    const { pares } = casarCaixasComFichas([...new Set([...avisosPorId.keys(), ...reservasPorId.keys()])], alunos);
    /** Os itens deste coach numa caixa. @param {any} d */
    const meusItens = (d) => Object.fromEntries(Object.entries((d && d.data() || {}).itens || {}).filter(([, v]) => v && v.coachUid === coachUid));
    for (const { key, aluno } of pares) {
      const meus = meusItens(avisosPorId.get(key));
      const reservas = meusItens(reservasPorId.get(key));
      if (!Object.keys(meus).length && !Object.keys(reservas).length) continue;
      const r = aplicarAvisosNaFicha(aluno, meus, reservas);
      if (Object.keys(r.patch).length) { aplicar(aluno.id, r.patch); n++; }
      for (const l of r.logs) { try { registrar(l.tipo, aluno, l.resumo, l.extra); } catch { /* o log não trava o merge */ } }
      for (const i of r.ignorados) console.warn(`[ausências] ${key} ${i.chave}: ignorado — ${i.motivo}`);
      // Tira só os itens consumidos: um aviso (ou reserva) que chegou durante a leitura fica.
      for (const [colecao, chaves] of /** @type {const} */ ([['avisosAusencia', r.consumidos], ['reposicoesAluno', r.reservasConsumidas]])) {
        const campos = chaves.flatMap((k) => [new F.FieldPath('itens', k), F.deleteField()]);
        if (campos.length) await F.updateDoc(F.doc(_db, colecao, key), campos[0], campos[1], ...campos.slice(2));
      }
    }
  } catch (e) {
    console.warn('[ausências] não deu para aplicar os avisos agora:', e);
  }
  return n;
}
