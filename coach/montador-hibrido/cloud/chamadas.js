// @ts-check
/**
 * A CONVERSA COM O SERVIDOR — as quatro Callables do Montador Híbrido e as
 * leituras/escritas diretas no Firestore que a tela precisa.
 *
 * Segue o padrão já estabelecido em `coach/montador-de-treino/ui/pesquisa.js` e
 * em `garage-store/precos.js`: import dinâmico do SDK pela CDN (o site não tem
 * bundler), `getFunctions(app, 'southamerica-east1')` e — o ponto que mais
 * importa — TIMEOUT EXPLÍCITO maior que o da própria função.
 *
 * Por que o timeout do cliente tem de ser MAIOR que o do servidor: se o
 * navegador desiste primeiro, o coach vê "erro" enquanto a função ainda está
 * rodando com sucesso do outro lado. Ele clica de novo, gasta cota duas vezes e
 * dispara duas leituras da mesma lousa. Quem desiste primeiro tem que ser quem
 * sabe o que estava fazendo — o servidor.
 */
import { firebaseConfig } from '../../../compartilhado/firebase/config.js';

/** Mesma versão do SDK usada em `cloud.js`, `precos.js` e `pesquisa.js`. */
const V = '10.12.2';
const REGIAO = 'southamerica-east1';

/** Tetos do cliente, sempre acima do `timeoutSeconds` da função correspondente. */
const TIMEOUT = {
  lousa: 130000,        // função: 120s (visão em 'detail: high' é a chamada mais lenta)
  variabilidade: 70000, // função: 60s
  distribuicao: 130000, // função: 120s (até 8 leituras de matriz + gravação em lote)
};

/**
 * Mensagem amigável para erro de TRANSPORTE — quando a função nem chegou a
 * responder. Erro que a própria função lançou já vem com `.message` escrito
 * para o coach ler (ver `functions/src/index.ts`), e esse passa direto.
 */
const ERRO_TRANSPORTE = {
  'functions/deadline-exceeded': 'O servidor demorou demais e a chamada foi cancelada. Tente de novo em instantes.',
  'functions/unauthenticated': 'Sua sessão de coach expirou. Faça login de novo.',
  'functions/permission-denied': 'Esta conta não tem acesso ao Montador Híbrido.',
  'functions/unavailable': 'Sem conexão com o servidor agora. Confira sua internet e tente de novo.',
  'functions/internal': 'O servidor encontrou um erro inesperado. Tente de novo em instantes.',
  'functions/resource-exhausted': 'Limite diário atingido. Monte o treino no Montador de Treinos por hoje.',
};
const ERRO_GENERICO = 'Não deu para completar a operação. Tente de novo.';

let _app = null, _fns = null, _fsMod = null, _db = null;

async function app() {
  if (_app) return _app;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  _app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  return _app;
}

async function funcoes() {
  if (_fns) return _fns;
  const fnMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
  _fns = { mod: fnMod, ref: fnMod.getFunctions(await app(), REGIAO) };
  return _fns;
}

async function firestore() {
  if (_db) return { db: _db, fs: _fsMod };
  _fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  _db = _fsMod.getFirestore(await app());
  return { db: _db, fs: _fsMod };
}

/** Traduz um erro de chamada no texto que a tela mostra. */
function erroLegivel(e) {
  const codigo = /** @type {any} */ (e)?.code;
  // A ordem importa: a mensagem da função é mais específica que o mapa genérico,
  // mas um código de transporte significa que função nenhuma chegou a falar.
  const amigavel = ERRO_TRANSPORTE[codigo];
  if (amigavel) return new Error(amigavel);
  const msg = /** @type {any} */ (e)?.message;
  return new Error(msg && !String(msg).startsWith('INTERNAL') ? msg : ERRO_GENERICO);
}

/** Chama uma callable com timeout explícito e erro já traduzido. */
async function chamar(nome, payload, timeout) {
  const { mod, ref } = await funcoes();
  try {
    const r = await mod.httpsCallable(ref, nome, { timeout })(payload);
    return /** @type {any} */ (r).data;
  } catch (e) {
    console.error(`Falha em ${nome}:`, /** @type {any} */ (e)?.code, /** @type {any} */ (e)?.message);
    throw erroLegivel(e);
  }
}

/* ------------------------------------------------------------------ *
 * As quatro etapas
 * ------------------------------------------------------------------ */

/**
 * Lousa ➔ treino estruturado.
 * @param {{textInput: string, canvasImageBase64?: string|null, mimeType?: string}} args
 * @returns {Promise<{treino: any, restantes: number}>}
 */
export function parseWorkoutLousa({ textInput, canvasImageBase64 = null, mimeType = 'image/jpeg' }) {
  return chamar('parseWorkoutLousa', {
    textInput: String(textInput || ''),
    canvasImageBase64: canvasImageBase64 || '',
    mimeType,
  }, TIMEOUT.lousa);
}

/**
 * Treino ➔ alertas da semana.
 * @param {{structuredWorkout: any, weekStartDate: string}} args
 * @returns {Promise<{alertas: any[], resumo: any}>}
 */
export function checkWorkoutVariability({ structuredWorkout, weekStartDate }) {
  return chamar('checkWorkoutVariability', { structuredWorkout, weekStartDate }, TIMEOUT.variabilidade);
}

/**
 * Treino salvo ➔ ficha de cada aluno.
 *
 * `dryRun: true` devolve as mesmas fichas SEM gravar nada — é o que alimenta a
 * prévia ("como este treino fica para a Ana?"). A prévia e o envio percorrem o
 * mesmo caminho no servidor de propósito: recalcular lesão, restrição e
 * balizamento de 1RM aqui no navegador criaria uma segunda regra, e o coach
 * aprovaria uma ficha para mandar outra.
 *
 * `turmas` é o formato novo: TODOS os horários do dia num pedido só, gravados
 * num lote do Firestore. Antes era uma chamada por horário, e o coach salvava o
 * mesmo treino três vezes escolhendo os alunos na mão em cada rodada.
 *
 * @param {{workoutId: string, turmas: {classTime: string, studentIds: string[]}[], dryRun?: boolean}} args
 * @returns {Promise<{fichas: any[], gravadas: number, semMatriz: string[], dryRun: boolean}>}
 */
export function distributeWorkoutToStudents({ workoutId, turmas, dryRun = false }) {
  return chamar('distributeWorkoutToStudents', { workoutId, turmas, dryRun }, TIMEOUT.distribuicao);
}

/**
 * Apaga um treino: o documento, as fichas da turma e a fatia do Portal.
 *
 * Vai por Callable, e não direto ao Firestore como `salvarLousa`, porque apagar
 * mexe em TRÊS lugares — e a subcoleção `fichas` o Firestore não apaga junto
 * com o pai. Uma sequência de deletes no navegador pode morrer no meio (aba
 * fechada, rede caindo) e deixar o aluno vendo no celular um treino que o coach
 * apagou. No servidor é um lote só.
 *
 * @param {string} workoutId
 * @returns {Promise<{apagado: true, fichas: number, portais: number, dateId: string}>}
 */
export function excluirLousa(workoutId) {
  return chamar('deleteWorkoutLousa', { workoutId }, TIMEOUT.distribuicao);
}

/* ------------------------------------------------------------------ *
 * Firestore direto (o que não precisa de servidor)
 * ------------------------------------------------------------------ */

/** @see marcaDasLousas */
let gravacoes = 0;

/**
 * Grava a lousa e devolve o id do treino.
 *
 * Vai direto ao Firestore, sem passar por Callable, porque não há nada a
 * decidir no servidor: são dados do coach, no documento do coach, cobertos pela
 * regra que já existe. Uma função no meio só acrescentaria latência e um cold
 * start — e é justamente esta escrita que dispara `aggregateVolumeMetrics`.
 *
 * @param {string} uid @param {any} dados  o que `paraGravar()` montou
 * @param {string} [workoutId] regravar o mesmo treino em vez de criar outro
 * @returns {Promise<string>} o workoutId
 */
export async function salvarLousa(uid, dados, workoutId) {
  const { db, fs } = await firestore();
  const id = workoutId || `${dados.dateId}-${Date.now().toString(36)}`;
  await fs.setDoc(fs.doc(db, `coaches/${uid}/lousas/${id}`), { ...dados, workoutId: id }, { merge: true });
  gravacoes += 1;
  return id;
}

/**
 * Quantas lousas já foram gravadas NESTA sessão de navegador.
 *
 * Existe porque as telas que leem do Firestore (Calendário, Volume) não podem
 * reler a cada troca de aba — seriam leituras pagas toda vez que o coach vai da
 * Lousa para a Turma e volta — mas também não podem ler uma vez só: o treino
 * que ele acabou de salvar não apareceria, e a tela mentiria dizendo que o dia
 * está vazio.
 *
 * Comparar esta marca resolve os dois: releitura só depois de uma gravação.
 * O contador mora AQUI, e não em cada tela, porque `salvarLousa` é o único
 * ponto de escrita — assim nenhuma tela futura pode esquecer de avisar.
 */
export function marcaDasLousas() { return gravacoes; }

/** Os treinos salvos numa faixa de datas ('YYYY-MM-DD'). @param {string} uid */
export async function listarLousas(uid, inicio, fim) {
  const { db, fs } = await firestore();
  const q = fs.query(
    fs.collection(db, `coaches/${uid}/lousas`),
    fs.where('dateId', '>=', inicio),
    fs.where('dateId', '<=', fim),
  );
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => ({ workoutId: d.id, ...d.data() }));
}

/**
 * O consolidado de volume de um período ('2026-W38' ou '2026-09').
 *
 * Devolve `null` quando ainda não existe, e isso é situação NORMAL, não erro: o
 * gatilho leva alguns segundos depois do primeiro treino da semana. A tela
 * mostra "ainda consolidando" em vez de um erro que assustaria o coach.
 * @param {string} uid @param {string} chave
 */
export async function lerConsolidado(uid, chave) {
  const { db, fs } = await firestore();
  const snap = await fs.getDoc(fs.doc(db, `coaches/${uid}/volumeAgregado/${chave}`));
  return snap.exists() ? snap.data() : null;
}

/*
 * `lerMatriz` e `salvarMatriz` MORAVAM AQUI e foram removidas de propósito.
 *
 * Elas liam e escreviam `coaches/{uid}/matriz_individualizacao/{alunoId}` — uma
 * coleção que eu inventei antes de a matriz de verdade existir no projeto. A
 * matriz real é o campo `matrizIndividualizacao` DENTRO da ficha do aluno, em
 * `gestao/{uid}`, e quem a edita é a aba "Matriz" da Gestão de Alunos
 * (`coach/gestao-de-alunos/matriz-ui.js`), gravando pelo `db.js` de lá.
 *
 * Mantê-las aqui seria deixar no código um caminho pronto para gravar num lugar
 * que ninguém lê: a próxima tela que as importasse salvaria a matriz com
 * sucesso, sem erro nenhum, e o treino continuaria saindo sem individualização.
 */
