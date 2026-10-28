// @ts-check
/**
 * Check-in pelo app da uGym (lado coach): aplica na ficha o check-in que o
 * aluno fez no app da uGym, e o Painel de Presença passa a mostrar "Presente".
 *
 * Quem lê o FitControl é a Cloud Function `sincronizarUgym`, a cada minuto, e
 * ela grava em `checkinsUgym/{email}.itens[`ugym|${reserva}`]` — nunca na
 * ficha, que é da Gestão (ver functions/src/ugym-servico.ts). Aqui a Gestão
 * aplica com a MESMA regra do botão Check-in (`checkin` de checkin-regras.js),
 * com a hora do check-in no app (e não a hora em que o coach abriu a tela), e
 * tira o item consumido.
 *
 * A HORA já chega como hora local do box (`checkin.agora`, 'HH:MM'): o servidor
 * converte o carimbo UTC do FitControl (`relogioDoTexto(…, 'utc')` em
 * functions/src/ugym.ts). Aqui não se converte de novo — converter dos dois
 * lados é o jeito certo de errar 3h para o outro lado.
 *
 * Qual aula da ficha o check-in fecha: a que acontece naquele dia — a titular
 * (no dia dela ou no trocado) ou a reposição marcada para ele
 * (`diasReivindicados`). Aluno sem grade fixa ganha a presença do dia. Aluno com
 * grade e sem aula naquele dia: nada muda — a régua da semana ("2 de 4 treinos")
 * não pode contar uma visita fora da grade sozinha —, e o coach recebe a linha
 * no Registros para decidir.
 *
 * Roda no boot, AO VIVO enquanto a Gestão está aberta (`ouvirCheckinsUgym`: o
 * item é aplicado segundos depois de o servidor gravar) e, de rede de
 * segurança, de 2 em 2 minutos junto com o Pix e os avisos (boot.js).
 *
 * A CHAMADA DA LOUSA usa a mesma caixa, com outra coleção: ao "Fechar chamada"
 * no tablet, a lousa grava o check-in de quem veio em
 * `checkinsLousa/{email}.itens["lousa|dia|hora"]` (o mesmo formato, com
 * `origem: 'lousa'` e a hora do início do treino) — e esta mesma regra o aplica
 * (`ORIGENS.lousa`). Quem faltou não gera item: a falta é a automática do
 * Painel de Presença quando o dia passa.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { datasDaSemana } from '../../compartilhado/regras/semana.js';
import { alternarPresenca, checkin, diasReivindicados } from './checkin-regras.js?v=26';
import { casarCaixasComFichas } from './portal-merge.js?v=26';

/**
 * @typedef {{ coachUid: string, origem: 'ugym' | 'lousa', dia: string, hora: string,
 *   checkin: { hoje: string, agora: string }, aulaUgym?: string, reservaUgym?: string, em: number }} CheckinUgym
 * @typedef {{ colecao: string, tag: string, rotulo: string, foraDaGrade: string, texto: string }} OrigemCheckin
 */

/**
 * De onde vem o check-in: a coleção da caixa, o rótulo do log ("Pelo app da
 * uGym: Check-in") e a linha de quando não há aula dele no dia.
 * @type {Readonly<{ ugym: OrigemCheckin, lousa: OrigemCheckin }>}
 */
export const ORIGENS = Object.freeze({
  ugym: { colecao: 'checkinsUgym', tag: 'uGym', rotulo: 'Pelo app da uGym', foraDaGrade: 'presenca-ugym-fora-da-grade', texto: 'Check-in pelo app da uGym' },
  lousa: { colecao: 'checkinsLousa', tag: 'Lousa', rotulo: 'Pela chamada da Lousa', foraDaGrade: 'presenca-lousa-fora-da-grade', texto: 'Presença na chamada da Lousa' },
});

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/;
const EH_HORA = /^\d{2}:\d{2}$/;
/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Aplica, em ordem de chegada, os check-ins da uGym de um aluno na ficha. Todo
 * item é consumido: o que não fecha aula nenhuma vira "ignorado" (e, se for
 * visita fora da grade, uma linha para o coach), para não ficar voltando.
 * @param {any} a a ficha @param {Record<string, CheckinUgym>} itens
 * @param {OrigemCheckin} [origem] de onde vieram (o rótulo do log); a uGym por padrão
 * @returns {{ patch: Record<string, any>, logs: Array<{ tipo: string, resumo: string, extra?: any }>, consumidos: string[], ignorados: Array<{ chave: string, motivo: string }> }}
 */
export function aplicarCheckinsNaFicha(a, itens, origem = ORIGENS.ugym) {
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
        tipo: origem.foraDaGrade,
        resumo: `${origem.texto} em ${ddmm(dia)} às ${rel.agora}, mas não há aula dele nesse dia — confira`,
        extra: { dia },
      });
      continue;
    }
    ficha = { ...ficha, ...r.patch };
    Object.assign(patch, r.patch);
    logs.push({ ...r.log, resumo: `${origem.rotulo}: ${r.log.resumo}` });
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
 * Escuta a caixa da origem (`checkinsUgym` ou `checkinsLousa`) e chama
 * `aoChegar` quando há item para aplicar — é o que tira o "até 2 minutos" do
 * lado da Gestão. O próprio consumo (apagar os itens aplicados) dispara o
 * ouvinte de novo, mas aí não há item, e ele não chama ninguém. Devolve o
 * cancelamento; sem nuvem ou com erro, não ouve nada (a rodada de 2 em 2
 * minutos continua valendo).
 * @param {OrigemCheckin} origem @param {() => void} aoChegar
 * @returns {Promise<() => void>}
 */
export async function ouvirCaixaDeCheckins(origem, aoChegar) {
  if (!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey)) return () => {};
  try {
    await init();
    return F.onSnapshot(F.collection(_db, origem.colecao), (/** @type {any} */ snap) => {
      if (temItens(snap.docs.map((/** @type {any} */ d) => d.data()))) aoChegar();
    }, (/** @type {any} */ e) => console.warn(`[${origem.tag}] o ouvinte dos check-ins parou:`, e?.code || e));
  } catch (e) {
    console.warn(`[${origem.tag}] não deu para ouvir os check-ins:`, e);
    return () => {};
  }
}

/** @param {() => void} aoChegar */
export const ouvirCheckinsUgym = (aoChegar) => ouvirCaixaDeCheckins(ORIGENS.ugym, aoChegar);
/** @param {() => void} aoChegar */
export const ouvirCheckinsLousa = (aoChegar) => ouvirCaixaDeCheckins(ORIGENS.lousa, aoChegar);

/**
 * Algum documento de `checkinsUgym` tem item? (O ouvinte só acorda a Gestão
 * quando há o que aplicar.)
 * @param {any[]} docs
 */
export function temItens(docs) {
  return (docs || []).some((d) => d && d.itens && typeof d.itens === 'object' && Object.keys(d.itens).length > 0);
}

/**
 * @typedef {{ coachUid: string, alunos: any[], aplicar: (id: string, patch: any) => void,
 *   registrar: (tipo: string, a: any, resumo: string, extra?: any) => void }} OpcoesDoMerge
 */

/**
 * Varre a caixa da origem, aplica os check-ins deste coach nas fichas e consome
 * os itens. Caixa sem ficha fica intacta (como no portal-merge). Devolve quantas
 * fichas mudaram. Falha de rede ou de regra não quebra a Gestão.
 * @param {OrigemCheckin} origem @param {OpcoesDoMerge} o
 */
export async function mesclarCaixaDeCheckins(origem, { coachUid, alunos, aplicar, registrar }) {
  if (!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey) || !coachUid) return 0;
  let n = 0;
  try {
    await init();
    const snap = await F.getDocs(F.collection(_db, origem.colecao));
    if (snap.empty) return 0;
    const porId = new Map(snap.docs.map((/** @type {any} */ d) => [d.id, d]));
    const { pares } = casarCaixasComFichas([...porId.keys()], alunos);
    for (const { key, aluno } of pares) {
      const todos = (porId.get(key).data() || {}).itens || {};
      const meus = Object.fromEntries(Object.entries(todos).filter(([, v]) => v && v.coachUid === coachUid));
      if (!Object.keys(meus).length) continue;
      const r = aplicarCheckinsNaFicha(aluno, meus, origem);
      if (Object.keys(r.patch).length) { aplicar(aluno.id, r.patch); n++; }
      for (const l of r.logs) { try { registrar(l.tipo, aluno, l.resumo, l.extra); } catch { /* o log não trava o merge */ } }
      for (const i of r.ignorados) console.warn(`[${origem.tag}] ${key} ${i.chave}: ignorado — ${i.motivo}`);
      // Tira só os itens consumidos: um check-in que chegou durante a leitura fica.
      const ref = F.doc(_db, origem.colecao, key);
      const campos = r.consumidos.flatMap((k) => [new F.FieldPath('itens', k), F.deleteField()]);
      if (campos.length) await F.updateDoc(ref, campos[0], campos[1], ...campos.slice(2));
    }
  } catch (e) {
    console.warn(`[${origem.tag}] não deu para aplicar os check-ins agora:`, e);
  }
  return n;
}

/** Os check-ins do app da uGym (`sincronizarUgym`). @param {OpcoesDoMerge} o */
export const mesclarCheckinsUgym = (o) => mesclarCaixaDeCheckins(ORIGENS.ugym, o);
/** A chamada fechada na Lousa (`checkinsLousa`). @param {OpcoesDoMerge} o */
export const mesclarCheckinsLousa = (o) => mesclarCaixaDeCheckins(ORIGENS.lousa, o);
