// @ts-check
/**
 * Mescla da caixa de entrada do aluno (lado coach).
 *
 * Lê `portalInbox/{email}` de cada aluno com e-mail, aplica no registro do
 * coach (foto nova → fotoUrl; feedbacks → a.feedbacks, sem duplicar; presenças
 * avisadas pelo app → a.presencas) e apaga a caixa. Silencioso: se a nuvem ou a
 * regra falhar, não quebra o app do coach.
 *
 * Quem chama (app.js) republica o Portal logo depois, então o que entra aqui
 * volta para o aluno na mesma rodada.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2';
let _db = null, _fns = null;

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
    doc: fsMod.doc,
    getDoc: fsMod.getDoc,
    deleteDoc: fsMod.deleteDoc,
    updateDoc: fsMod.updateDoc,
    deleteField: fsMod.deleteField,
    // Só para o diagnóstico das caixas órfãs; sai junto com ele.
    collection: fsMod.collection,
    getDocs: fsMod.getDocs,
  };
}

/**
 * Os campos que ESTA versão sabe processar.
 *
 * Existe por causa de um prejuízo real: a versão anterior apagava a caixa
 * inteira com `deleteDoc`, sempre. Quando o Garage App passou a mandar
 * `presencas`, a Gestão publicada — que não conhecia o campo — leu a caixa,
 * ignorou a presença e apagou tudo. O aluno lançava o treino e o dado morria
 * sem deixar rastro, a cada tentativa.
 *
 * Daqui em diante o que não é conhecido SOBREVIVE: a caixa só é apagada por
 * completo quando não sobra nada dentro dela. Assim, um campo que uma versão
 * futura do app mande fica esperando uma Gestão que o entenda, em vez de ser
 * destruído por uma antiga.
 */
const CAMPOS_CONHECIDOS = ['fotoNova', 'feedbacks', 'presencas', 'atualizadoEm'];

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** Só 'YYYY-MM-DD' entra: a caixa é escrita pelo aparelho do aluno. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Junta as presenças que o Garage App avisou às que a ficha já tem.
 *
 * Mesma estrutura do check-in manual (`toggleCheckin`/`fazerCheckin` do app.js):
 * lista de 'YYYY-MM-DD' única e ordenada. A HORA não entra — o `presencaHoras` só
 * é preenchido quando o coach confirma a aula no próprio dia, e a hora em que o
 * aluno lançou as calorias não diz quando ele chegou ao box. Sem hora, o Portal
 * cai no horário fixo da grade dele, que é o comportamento certo.
 *
 * Devolve `null` quando nada mudou — um dia que o coach já tinha marcado não é
 * novidade e não deve disparar gravação nem redesenho.
 *
 * @param {any} atuais as presenças que já estão na ficha
 * @param {any} vindas o que veio na caixa de entrada
 * @returns {string[]|null}
 */
/**
 * O que sobra na caixa depois que esta versão processou o que conhece.
 *
 * Lista vazia quer dizer "pode apagar a caixa"; qualquer coisa aqui quer dizer
 * "apague só os campos conhecidos e deixe o resto para quem entender".
 *
 * @param {any} inbox @returns {string[]}
 */
/**
 * DIAGNÓSTICO TEMPORÁRIO — lista as caixas que existem e aponta as órfãs.
 *
 * O `mergarInboxes` procura a caixa A PARTIR da ficha (`portalInbox/{email da
 * ficha}`). Se o aluno entra no app com um e-mail e a ficha dele no painel tem
 * outro — ou não tem e-mail nenhum —, ele escreve numa caixa que o coach nunca
 * vai abrir, e nada no sistema reclama. Esta função mostra isso.
 *
 * Remover quando o diagnóstico da presença terminar.
 */
async function diagnosticarCaixasOrfas(alunosComEmail) {
  try {
    const snaps = await _fns.getDocs(_fns.collection(_db, 'portalInbox'));
    const daFicha = new Set(alunosComEmail.map((a) => emailKey(a.email)));
    const existentes = snaps.docs.map((d) => d.id);
    console.log(`[INBOX] caixas existentes na nuvem (${existentes.length}): ${existentes.join(', ') || '(nenhuma)'}`);
    const orfas = existentes.filter((id) => !daFicha.has(id));
    if (orfas.length) {
      console.error('[INBOX] CAIXA ORFA — o aluno escreveu, mas NENHUMA ficha tem este e-mail:', orfas);
      console.error('[INBOX] e-mails das fichas:', [...daFicha]);
    }
  } catch (e) {
    // Listar a coleção pode ser negado pela regra; não é motivo para parar o merge.
    console.warn('[INBOX] nao deu para listar as caixas (diagnostico):', e?.code || e);
  }
}

export function camposDesconhecidos(inbox) {
  if (!inbox || typeof inbox !== 'object') return [];
  return Object.keys(inbox).filter((k) => !CAMPOS_CONHECIDOS.includes(k));
}

export function mesclarPresencas(atuais, vindas) {
  const novas = (Array.isArray(vindas) ? vindas : [])
    .filter((d) => typeof d === 'string' && DATA_ISO.test(d));
  if (!novas.length) return null;
  const set = new Set(Array.isArray(atuais) ? atuais : []);
  const antes = set.size;
  novas.forEach((d) => set.add(d));
  return set.size > antes ? [...set].sort() : null;
}

/**
 * Processa as caixas de entrada e aplica as mudanças via `aplicar(id, patch)`.
 * @param {any[]} alunos @param {(id:string, patch:any)=>void} aplicar
 * @returns {Promise<number>} quantos alunos tiveram novidade
 */
export async function mergarInboxes(alunos, aplicar) {
  if (!cloudAtivo()) { console.warn('[INBOX] nuvem desativada — merge nao roda'); return 0; }
  let n = 0;
  try {
    await init();
    const comEmail = (alunos || []).filter((a) => emailKey(a.email));
    console.log(`[INBOX] procurando caixa de ${comEmail.length} aluno(s) com e-mail na ficha`);

    // DIAGNÓSTICO: lista as caixas que EXISTEM e cruza com as fichas.
    //
    // Responde a pergunta que nenhuma checagem de código responde: a caixa está
    // lá, mas com um e-mail que nenhuma ficha tem? É o caso em que o aluno
    // escreve e o coach nunca lê, porque o `getDoc` abaixo procura pela ficha e
    // não pela caixa. Some quando o diagnóstico terminar.
    await diagnosticarCaixasOrfas(comEmail);

    await Promise.all(comEmail.map(async (a) => {
      const key = emailKey(a.email);
      const snap = await _fns.getDoc(_fns.doc(_db, 'portalInbox', key));
      if (!snap.exists()) return;
      const inbox = snap.data() || {};
      console.log(`[INBOX] ${key}: campos = [${Object.keys(inbox).join(', ')}]`
        + ` · presencas = ${JSON.stringify(inbox.presencas ?? null)}`);
      const patch = {};
      if (inbox.fotoNova) patch.fotoUrl = inbox.fotoNova;
      const novos = Array.isArray(inbox.feedbacks) ? inbox.feedbacks : [];
      if (novos.length) {
        const atuais = Array.isArray(a.feedbacks) ? a.feedbacks : [];
        const ids = new Set(atuais.map((f) => f && f.id));
        const add = novos.filter((f) => f && !ids.has(f.id));
        if (add.length) patch.feedbacks = [...atuais, ...add].sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0));
      }

      // Presença que o Garage App avisou: o aluno lançou o treino daquele dia.
      //
      // O app NÃO pode escrever `portal/{email}` — a regra do Firestore libera a
      // escrita só para quem tem `gestao/{uid}`, e é assim de propósito: presença
      // é registro do coach. Então ele manda a data pela caixa e quem aplica na
      // ficha é aqui.
      //
      // Mesma estrutura do check-in manual (`toggleCheckin`/`fazerCheckin` do
      // app.js): lista de 'YYYY-MM-DD' única e ordenada. A HORA não entra — o
      // `presencaHoras` só é preenchido quando o coach confirma a aula no dia, e
      // a hora em que o aluno lançou as calorias não diz quando ele chegou. Sem
      // hora, o Portal cai no horário fixo da grade dele, que é o certo.
      const presencas = mesclarPresencas(a.presencas, inbox.presencas);
      if (presencas) {
        patch.presencas = presencas;
        console.log(`[INBOX] ${key}: presenca APLICADA na ficha ${a.id} → ${presencas.join(', ')}`);
      } else if (inbox.presencas) {
        console.log(`[INBOX] ${key}: presenca veio mas NAO mudou nada`
          + ` (ja estava na ficha, ou formato invalido). Ficha tem: ${JSON.stringify(a.presencas ?? [])}`);
      }

      if (Object.keys(patch).length) { aplicar(a.id, patch); n++; }

      // Esvazia a caixa já processada — mas só o que esta versão entende. Ver
      // `CAMPOS_CONHECIDOS`: apagar o documento inteiro foi o que destruiu, em
      // silêncio, as primeiras presenças mandadas pelo app.
      const ref = _fns.doc(_db, 'portalInbox', key);
      if (camposDesconhecidos(inbox).length) {
        const limpar = {};
        for (const campo of CAMPOS_CONHECIDOS) {
          if (campo in inbox) limpar[campo] = _fns.deleteField();
        }
        if (Object.keys(limpar).length) await _fns.updateDoc(ref, limpar);
      } else {
        await _fns.deleteDoc(ref);
      }
    }));
  } catch (e) {
    console.warn('Falha ao mesclar a caixa do Portal do Aluno:', e?.code || e);
  }
  return n;
}
