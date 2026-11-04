// @ts-check
/**
 * Os pedidos que o aluno fez pelo app e a Gestão ainda não aplicou na ficha:
 * "Não irei ao treino" (`avisosAusencia/{email}.itens`) e a reposição marcada
 * por ele (`reposicoesAluno/{email}.itens`). Só a Gestão CONSOME essas caixas
 * (ausencias-merge.js); o Calendário só as lê, ao vivo, e aplica a MESMA regra
 * (`aplicarAvisosNaFicha`) numa cópia em memória — assim a turma mostra o que o
 * aluno já ouviu no app, mesmo com a Gestão fechada, sem gravar nada.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { aplicarAvisosNaFicha } from '../gestao-de-alunos/ausencias-merge.js?v=30';
import { casarCaixasComFichas } from '../gestao-de-alunos/portal-merge.js?v=30';

/** @typedef {import('./core/camadas.js').Pendente} Pendente */
/** @typedef {{ avisos: Record<string, any>, reservas: Record<string, any> }} Caixas  id do doc (o e-mail) → data() */

/**
 * @param {any[]} fichas @param {Caixas} caixas @param {string} coachUid
 * @returns {{ fichas: any[], porAluno: Record<string, Pendente[]> }}
 */
export function aplicarPendentes(fichas, caixas, coachUid) {
  const meus = (/** @type {any} */ doc) => Object.fromEntries(
    Object.entries((doc && doc.itens) || {}).filter(([, v]) => v && v.coachUid === coachUid));
  const ids = [...new Set([...Object.keys(caixas.avisos || {}), ...Object.keys(caixas.reservas || {})])];
  const { pares } = casarCaixasComFichas(ids, fichas);
  /** @type {Map<any, any>} */
  const trocadas = new Map();
  /** @type {Record<string, Pendente[]>} */
  const porAluno = {};
  for (const { key, aluno } of pares) {
    const avisos = meus((caixas.avisos || {})[key]);
    const reservas = meus((caixas.reservas || {})[key]);
    /** @type {Pendente[]} */
    const lista = [
      ...Object.values(avisos).map((v) => ({ tipo: /** @type {const} */ ('aviso'), chave: String(v.chave), em: Number(v.em) || 0 })),
      ...Object.values(reservas).map((r) => ({ tipo: /** @type {const} */ ('reserva'), chave: String(r.origem), em: Number(r.em) || 0, data: r.data, hora: r.hora })),
    ];
    if (!lista.length) continue;
    // structuredClone: a regra copia a ficha por cima (spread), e um objeto
    // aninhado alterado lá dentro mudaria a ficha do cache da Gestão.
    const copia = structuredClone(aluno);
    const { patch } = aplicarAvisosNaFicha(copia, avisos, reservas);
    trocadas.set(aluno, { ...copia, ...patch });
    porAluno[String(aluno.id)] = lista.sort((x, y) => x.em - y.em);
  }
  return { fichas: fichas.map((a) => trocadas.get(a) || a), porAluno };
}

const V = '10.12.2';

/**
 * Ouve as duas caixas ao vivo. Devolve a função que para de ouvir.
 * @param {(c: Caixas) => void} aoMudar @param {(e: any) => void} aoFalhar
 * @returns {Promise<() => void>}
 */
export async function ouvirPendentes(aoMudar, aoFalhar) {
  if (!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey)) return () => {};
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  const db = F.getFirestore(app);
  /** @type {Caixas} */
  const caixas = { avisos: {}, reservas: {} };
  const ouvir = (/** @type {string} */ colecao, /** @type {'avisos'|'reservas'} */ campo) =>
    F.onSnapshot(F.collection(db, colecao), (/** @type {any} */ snap) => {
      caixas[campo] = Object.fromEntries(snap.docs.map((/** @type {any} */ d) => [d.id, d.data()]));
      aoMudar({ avisos: caixas.avisos, reservas: caixas.reservas });
    }, aoFalhar);
  const pararAvisos = ouvir('avisosAusencia', 'avisos');
  const pararReservas = ouvir('reposicoesAluno', 'reservas');
  return () => { pararAvisos(); pararReservas(); };
}
