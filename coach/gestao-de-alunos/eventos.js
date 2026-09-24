// @ts-check
/**
 * Log de eventos da Gestão — o que alimenta a tela Registros.
 *
 * Mora em `gestao/{uid}/eventos/{id}`, uma SUBCOLEÇÃO, e não dentro de
 * `gestao/{uid}`: aquele documento guarda todos os alunos, tem teto de 1 MB e é
 * regravado inteiro a cada mudança (ver db.js). Um log ali cresceria até
 * estourar o documento e levaria as fichas junto.
 *
 * Existe porque a ficha não guarda história: `presencas` é só uma lista de
 * datas, a foto nova substitui a velha, a edição de ficha é um `Object.assign`,
 * e o `portal-merge` apaga a caixa depois de aplicar. Sem o log, "quem fez o
 * check-in, e quando?" não tem resposta.
 *
 * A Gestão é local-first, então o evento entra numa fila no localStorage e sobe
 * quando der — o check-in do coach sem rede não pode ficar esperando a nuvem.
 *
 * A primeira metade do arquivo é pura (testada em eventos.test.js); a segunda
 * fala com o localStorage e com o Firestore.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

/** De onde o evento veio. 'aluno' = caixa antiga, sem dizer se foi app ou Portal. */
export const ORIGENS = ['app', 'portal', 'gestao', 'aluno'];

/**
 * O que o aparelho do aluno declarou na caixa. Só 'app' e 'portal' passam: a
 * caixa é escrita pelo aluno, e ele não pode se apresentar como o coach.
 * @param {unknown} o @returns {'app'|'portal'|'aluno'}
 */
export function origemDaCaixa(o) {
  return o === 'app' || o === 'portal' ? o : 'aluno';
}

/**
 * Monta um evento. Campo vazio não entra no documento.
 * @param {{ tipo:string, origem:string, aluno:any, em:number, resumo:string,
 *   dia?:string, detalhe?:string, campos?:string[], chave?:string, id?:string }} p
 */
export function novoEvento({ tipo, origem, aluno, em, resumo, dia, detalhe, campos, chave, id }) {
  const ev = {
    id: id || `${em}-${Math.random().toString(36).slice(2, 10)}`,
    tipo,
    origem,
    alunoId: String(aluno?.id ?? ''),
    // O nome vai copiado: a linha do feed não pode depender de a ficha existir.
    alunoNome: String(aluno?.nome ?? ''),
    em,
    dia,
    resumo,
    detalhe,
    campos: campos && campos.length ? campos : undefined,
    chave,
  };
  for (const k of Object.keys(ev)) if (ev[k] === undefined || ev[k] === '') delete ev[k];
  return ev;
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const DOR = { nenhuma: 'sem dor', leve: 'dor leve', moderada: 'dor moderada', forte: 'dor forte' };
/** @param {string} s @param {number} n */
export const cortar = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

/** "Feedback pós-treino · esforço 7/10 · dor leve" — o mesmo texto no log e no histórico. @param {any} fb */
export function resumoFeedback(fb) {
  const rpe = Math.max(0, Math.min(10, Number(fb && fb.esforco) || 0));
  const partes = ['Feedback pós-treino'];
  if (rpe) partes.push(`esforço ${rpe}/10`);
  if (fb && DOR[fb.dor]) partes.push(DOR[fb.dor]);
  return partes.join(' · ');
}

/**
 * Os eventos do que o `portal-merge` acabou de aplicar numa ficha.
 *
 * Só vira evento o que o `patch` realmente mudou — feedback que a ficha já
 * tinha, ou dia que o coach já tinha marcado, não é novidade. Os ids são
 * determinísticos: se a mesma caixa for aplicada de novo (duas abas abertas, um
 * merge interrompido), o evento é regravado, não duplicado.
 *
 * @param {any} aluno a ficha ANTES do patch
 * @param {any} inbox a caixa como veio do Firestore
 * @param {any} patch o que o merge aplicou na ficha
 * @param {number} agora
 * @returns {any[]}
 */
export function eventosDaCaixa(aluno, inbox, patch, agora) {
  const evs = [];
  if (!aluno || !inbox || !patch) return evs;
  const id = String(aluno.id);

  if (patch.fotoUrl) {
    const em = num(inbox.fotoEm) || num(inbox.atualizadoEm) || agora;
    evs.push(novoEvento({
      id: `foto-${id}-${em}`, chave: `foto:${id}:${em}`,
      tipo: 'foto-perfil', origem: origemDaCaixa(inbox.fotoOrigem), aluno, em,
      resumo: 'Foto de perfil nova',
    }));
  }

  if (Array.isArray(patch.feedbacks)) {
    const tinha = new Set((Array.isArray(aluno.feedbacks) ? aluno.feedbacks : []).map((f) => f && f.id));
    const daCaixa = new Map((Array.isArray(inbox.feedbacks) ? inbox.feedbacks : []).filter((f) => f && f.id).map((f) => [f.id, f]));
    for (const f of patch.feedbacks) {
      if (!f || tinha.has(f.id)) continue;
      const fb = daCaixa.get(f.id) || f;
      evs.push(novoEvento({
        id: `feedback-${id}-${fb.id}`, chave: `feedback:${id}:${fb.id}`,
        tipo: 'feedback', origem: origemDaCaixa(fb.origem), aluno,
        em: num(fb.criadoEm) || agora,
        dia: typeof fb.data === 'string' ? fb.data : undefined,
        resumo: resumoFeedback(fb),
        detalhe: cortar(fb.obs, 120),
      }));
    }
  }

  if (Array.isArray(patch.presencas)) {
    const tinha = new Set(Array.isArray(aluno.presencas) ? aluno.presencas : []);
    // Só o app manda presença pela caixa. A hora é a da última escrita na caixa:
    // é o mais perto que se tem de "quando o aluno avisou".
    const em = num(inbox.atualizadoEm) || agora;
    for (const dia of patch.presencas) {
      if (tinha.has(dia)) continue;
      evs.push(novoEvento({
        id: `presenca-app-${id}-${dia}`, chave: `presenca:${id}:${dia}`,
        tipo: 'presenca', origem: 'app', aluno, em, dia,
        resumo: 'Check-in pelo app',
      }));
    }
  }
  return evs;
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Os eventos dos avisos do Diário de Evolução (`portalInbox/{email}.diario`).
 *
 * Diferente do resto da caixa, o diário não muda a ficha: a foto mora em
 * `diario/{email}/fotos/{dia}` e a caixa traz só a campainha `{ dia, em, origem }`.
 * Por isso não depende de `patch` — cada aviso válido vira um evento.
 *
 * O id leva o `em`: refazer a foto do dia é outro aviso (outro `em`) e merece
 * outra linha; o mesmo aviso aplicado duas vezes regrava a mesma linha. Aviso
 * sem dia válido ou sem `em` fica de fora — sem `em` o id não seria estável.
 *
 * @param {any} aluno @param {any} inbox @returns {any[]}
 */
export function eventosDoDiario(aluno, inbox) {
  if (!aluno || !inbox || !Array.isArray(inbox.diario)) return [];
  const id = String(aluno.id);
  const evs = [];
  for (const av of inbox.diario) {
    const em = num(av && av.em);
    if (!em || !DIA_ISO.test(av.dia)) continue;
    evs.push(novoEvento({
      id: `diario-${id}-${av.dia}-${em}`, chave: `diario:${id}:${av.dia}:${em}`,
      tipo: 'foto-diario', origem: origemDaCaixa(av.origem), aluno, em, dia: av.dia,
      resumo: 'Foto do Diário de Evolução',
    }));
  }
  return evs;
}

/** Campos que mudam sozinhos e não são "edição" do coach. */
const CAMPOS_DERIVADOS = ['idade'];

// `false` entra como vazio: a caixa desmarcada é gravada como `false` explícito
// (ver `lerForm`), e numa ficha antiga o campo nem existia.
const vazio = (v) => v == null || v === '' || v === false
  || (Array.isArray(v) && !v.length)
  || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

/**
 * Os nomes dos campos que `depois` mudou em relação a `antes`, em ordem.
 *
 * Só nomes, nunca valores: o log não pode virar uma segunda cópia de anamnese e
 * PAR-Q. Vazio e ausente contam como iguais, porque o formulário devolve "" para
 * todo campo que nunca foi preenchido — sem isso, o primeiro "Salvar" de uma
 * ficha antiga listaria meia ficha como alterada.
 *
 * @param {any} antes @param {any} depois @returns {string[]}
 */
export function camposAlterados(antes, depois) {
  if (!depois || typeof depois !== 'object') return [];
  const a = antes && typeof antes === 'object' ? antes : {};
  return Object.keys(depois)
    .filter((k) => !CAMPOS_DERIVADOS.includes(k))
    .filter((k) => {
      const x = a[k], y = depois[k];
      if (vazio(x) && vazio(y)) return false;
      return JSON.stringify(x) !== JSON.stringify(y);
    })
    .sort();
}

/* ============================================================
   Fila local + Firestore
   ============================================================ */

const V = '10.12.2';
const FILA = 'braconaro_eventos_pendentes_v1';
let _db = null, _fns = null, _uid = null, _enviando = false;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = {
    doc: fsMod.doc, setDoc: fsMod.setDoc, deleteDoc: fsMod.deleteDoc,
    collection: fsMod.collection, getDocs: fsMod.getDocs, query: fsMod.query,
    where: fsMod.where, orderBy: fsMod.orderBy, limit: fsMod.limit, startAfter: fsMod.startAfter,
  };
}

/** @returns {any[]} */
function lerFila() {
  try {
    const l = JSON.parse(localStorage.getItem(FILA) || '[]');
    return Array.isArray(l) ? l.filter((e) => e && typeof e.id === 'string') : [];
  } catch { return []; }
}
function gravarFila(l) {
  try { localStorage.setItem(FILA, JSON.stringify(l)); } catch { /* cheio ou bloqueado: o evento se perde, a ação não */ }
}

/** Os eventos que ainda não subiram — a tela mostra junto dos gravados. */
export function pendentes() { return lerFila(); }

/** Liga o envio — chamar depois do login, com o uid do coach. */
export function configurarEventos(uid) {
  _uid = uid || null;
  enviarPendentes();
}

/**
 * Registra um evento: entra na fila e tenta subir. Nunca lança — o log é
 * testemunha da ação, não condição para ela.
 * @param {any} ev evento pronto (ver `novoEvento`)
 */
export function registrar(ev) {
  if (!ev || !ev.id || !ev.alunoId) return;
  const fila = lerFila().filter((e) => e.id !== ev.id);
  fila.push(ev);
  gravarFila(fila);
  enviarPendentes();
}

/** Sobe a fila, na ordem. Para no primeiro erro: sem rede, os outros falhariam igual. */
export async function enviarPendentes() {
  if (_enviando || !_uid || !cloudAtivo()) return;
  _enviando = true;
  try {
    await init();
    for (const ev of lerFila()) {
      await _fns.setDoc(_fns.doc(_db, 'gestao', _uid, 'eventos', ev.id), ev);
      gravarFila(lerFila().filter((e) => e.id !== ev.id));
    }
  } catch (e) {
    console.warn('Registros: eventos ficaram na fila do navegador.', e?.code || e);
  } finally {
    _enviando = false;
  }
}

/**
 * Uma página de eventos, do mais novo ao mais antigo.
 *
 * Com `alunoId`, traz TODOS os eventos daquele aluno e ordena aqui: a consulta
 * `where` + `orderBy` em campos diferentes pediria índice composto, e o projeto
 * não publica índices. Um aluno tem poucas centenas de eventos por ano.
 *
 * @param {{ antesDe?: number, limite?: number, alunoId?: string }} [opts]
 * @returns {Promise<{ eventos: any[], fim: boolean }>}
 */
export async function listarEventos({ antesDe, limite = 50, alunoId } = {}) {
  if (!_uid || !cloudAtivo()) return { eventos: [], fim: true };
  await init();
  const col = _fns.collection(_db, 'gestao', _uid, 'eventos');
  if (alunoId) {
    const snap = await _fns.getDocs(_fns.query(col, _fns.where('alunoId', '==', alunoId)));
    const eventos = snap.docs.map((d) => d.data()).sort((a, b) => (b.em || 0) - (a.em || 0));
    return { eventos, fim: true };
  }
  const partes = [_fns.orderBy('em', 'desc')];
  if (antesDe) partes.push(_fns.startAfter(antesDe));
  partes.push(_fns.limit(limite));
  const snap = await _fns.getDocs(_fns.query(col, ...partes));
  return { eventos: snap.docs.map((d) => d.data()), fim: snap.size < limite };
}

/**
 * Apaga os eventos de um aluno excluído (LGPD: a ficha sai, o rastro também).
 * Também tira da fila local o que ainda não tinha subido.
 * @param {string} alunoId
 */
export async function apagarEventosDoAluno(alunoId) {
  gravarFila(lerFila().filter((e) => e.alunoId !== alunoId));
  if (!_uid || !cloudAtivo() || !alunoId) return;
  try {
    await init();
    const col = _fns.collection(_db, 'gestao', _uid, 'eventos');
    const snap = await _fns.getDocs(_fns.query(col, _fns.where('alunoId', '==', alunoId)));
    await Promise.all(snap.docs.map((d) => _fns.deleteDoc(d.ref)));
  } catch (e) {
    console.warn('Registros: não deu para apagar os eventos do aluno excluído.', e?.code || e);
  }
}
