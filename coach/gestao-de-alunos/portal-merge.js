// @ts-check
/**
 * Mescla da caixa de entrada do aluno (lado coach).
 *
 * VARRE a coleção `portalInbox` e aplica cada caixa no registro do coach (foto
 * nova → fotoUrl; feedbacks → a.feedbacks, sem duplicar; presenças avisadas pelo
 * app → a.presencas; avisos do Diário de Evolução → só eventos, a ficha não muda),
 * limpando só o que foi consumido. Se a nuvem ou a regra
 * falhar, não quebra o app do coach.
 *
 * Varre em vez de procurar caixa por caixa a partir da ficha: era isso que fazia
 * uma caixa sem ficha correspondente ficar invisível para sempre.
 *
 * Quem chama (app.js) republica o Portal logo depois, então o que entra aqui
 * volta para o aluno na mesma rodada.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { eventosDaCaixa, eventosDoDiario } from './eventos.js';

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
    // A varredura da coleção é o coração do merge: é ela que enxerga a caixa
    // que nenhuma ficha aponta.
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
const CAMPOS_CONHECIDOS = ['fotoNova', 'fotoOrigem', 'fotoEm', 'feedbacks', 'presencas', 'diario', 'atualizadoEm'];

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** Só 'YYYY-MM-DD' entra: a caixa é escrita pelo aparelho do aluno. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O que sobra na caixa depois que esta versão processou o que conhece.
 *
 * Lista vazia quer dizer "pode apagar a caixa"; qualquer coisa aqui quer dizer
 * "apague só os campos conhecidos e deixe o resto para quem entender".
 *
 * @param {any} inbox @returns {string[]}
 */
export function camposDesconhecidos(inbox) {
  if (!inbox || typeof inbox !== 'object') return [];
  return Object.keys(inbox).filter((k) => !CAMPOS_CONHECIDOS.includes(k));
}

/**
 * Casa as caixas encontradas na nuvem com as fichas do coach.
 *
 * Separado e exportado porque é onde estava o defeito: a versão anterior partia
 * da ficha para adivinhar o id da caixa, então caixa sem ficha correspondente era
 * invisível. Aqui a direção se inverte — parte-se da caixa — e o que não casa sai
 * nomeado em `orfas`, para virar aviso em vez de sumiço.
 *
 * O casamento é pelo e-mail normalizado dos DOIS lados: o id da caixa vem do
 * aparelho do aluno e o e-mail da ficha é digitado pelo coach, então qualquer um
 * dos dois pode chegar com maiúscula ou espaço.
 *
 * @param {string[]} idsDasCaixas @param {any[]} alunos
 * @returns {{ pares: Array<{ key: string, aluno: any }>, orfas: string[] }}
 */
export function casarCaixasComFichas(idsDasCaixas, alunos) {
  const porEmail = new Map();
  for (const a of alunos || []) {
    const k = emailKey(a && a.email);
    // Ficha sem e-mail não entra: ela não tem como ter caixa.
    if (k) porEmail.set(k, a);
  }
  const pares = [];
  const orfas = [];
  for (const id of idsDasCaixas || []) {
    const aluno = porEmail.get(emailKey(id));
    if (aluno) pares.push({ key: id, aluno });
    else orfas.push(id);
  }
  return { pares, orfas };
}

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
 *
 * `registrar` recebe um evento para a tela Registros por novidade aplicada
 * (ver `eventosDaCaixa`): depois deste ponto a caixa é apagada, e a origem e a
 * hora do que o aluno mandou só sobrevivem no evento.
 *
 * @param {any[]} alunos @param {(id:string, patch:any)=>void} aplicar
 * @param {(ev:any)=>void} [registrar]
 * @returns {Promise<number>} quantos alunos tiveram novidade
 */
export async function mergarInboxes(alunos, aplicar, registrar) {
  if (!cloudAtivo()) return 0;
  let n = 0;
  try {
    await init();

    /* Varre a COLEÇÃO, em vez de adivinhar o id da caixa a partir de cada ficha.

       A versão anterior fazia `getDoc('portalInbox/' + email da ficha)`. Uma caixa
       cujo e-mail nenhuma ficha tivesse era invisível: o aluno escrevia, o coach
       nunca abria, e nada reclamava. Pior, quando a ficha existia a caixa era
       apagada mesmo que nada fosse aplicado — então cada tentativa destruía a
       própria evidência, e foi isso que custou várias rodadas de teste.

       Varrendo, toda caixa aparece; a que não casa com ficha fica INTACTA e vira
       aviso. */
    const caixas = await _fns.getDocs(_fns.collection(_db, 'portalInbox'));
    if (caixas.empty) return 0;

    const porId = new Map(caixas.docs.map((d) => [d.id, d]));
    const { pares, orfas } = casarCaixasComFichas([...porId.keys()], alunos);

    // A órfã NÃO é apagada: a caixa espera a ficha certa. Apagá-la era descartar
    // o que o aluno mandou só porque o e-mail do painel não bate.
    await Promise.all(pares.map(async ({ key, aluno: a }) => {
      const inbox = porId.get(key).data() || {};
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
      if (presencas) patch.presencas = presencas;

      const evs = [];
      if (Object.keys(patch).length) {
        aplicar(a.id, patch);
        evs.push(...eventosDaCaixa(a, inbox, patch, Date.now()));
      }
      // Diário de Evolução: a caixa traz só o aviso (a foto já está em
      // diario/{email}/fotos). Não mexe na ficha — vira só evento na linha do tempo.
      evs.push(...eventosDoDiario(a, inbox));
      if (Object.keys(patch).length || evs.length) n++;
      if (registrar) {
        for (const ev of evs) {
          try { registrar(ev); } catch { /* o log não pode travar o merge */ }
        }
      }

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

    if (orfas.length) {
      // Fica em `error` de propósito: é dado de aluno parado, esperando alguém
      // arrumar o e-mail da ficha. Silenciar aqui foi o que criou o problema.
      console.error('[INBOX] CAIXA SEM FICHA — o aluno enviou, e nenhuma ficha tem este e-mail:', orfas);
      console.error('[INBOX] e-mails das fichas:', (alunos || []).map((a) => a && a.email).filter(Boolean));
    }
  } catch (e) {
    console.error('[INBOX] falha ao mesclar a caixa do Portal do Aluno:', e?.code || e, e);
  }
  return n;
}
