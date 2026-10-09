// @ts-check
/**
 * O motor de automação de mensagens — a fiação.
 *
 * As regras moram em automacao-regras.js (puro); aqui fica o que as liga ao
 * mundo: o barramento, o armazenamento deste aparelho e a nuvem.
 *
 *   - ouve 'acao-registrada' (registro.js): um pagamento põe o recibo na fila;
 *     desfazer a baixa tira;
 *   - a varredura das condições (a cobrança vencida) não fica guardada: roda a
 *     cada `mensagens()`, sobre os alunos de agora — por isso a lista nunca
 *     fica velha, e a baixa tira a cobrança sem ninguém avisar o motor;
 *   - `marcarMensagem` grava a chave como enviada ou descartada, aqui e na
 *     nuvem, e avisa 'automacao-mudou';
 *   - `sincronizarAutomacao(uid)` (boot.js, depois do sync) mescla as chaves
 *     feitas em outro aparelho.
 *
 * Nada aqui envia mensagem: o envio é o coach tocando "Enviar" na tela
 * (ui-tela-automacao.js), que abre o WhatsApp com o texto pronto.
 */
import * as db from './db.js?v=14';
import { hoje } from './util/formato.js?v=14';
import { estado, on, emit, EVENTOS } from './estado.js?v=14';
import {
  filaVazia, normalizarFila, aoAgir, marcar, podar, visiveis, sugestoesDaVarredura, planoDeSync,
} from './automacao-regras.js?v=14';
import { lerFeitas, gravarFeitas, apagarFeitas } from './automacao-nuvem.js?v=14';

const CHAVE = 'braconaro_automacao_v1';

/**
 * @typedef {{
 *   listar: () => any[], hoje: () => string, agora: () => number,
 *   nuvem: { ler: (uid: string) => Promise<Record<string, any> | null>,
 *            gravar: (uid: string, feitas: Record<string, any>) => Promise<void>,
 *            apagar: (uid: string, chaves: string[]) => Promise<void> },
 * }} Deps
 */
/** @type {Deps} */
let deps = { listar: db.listar, hoje, agora: () => Date.now(), nuvem: { ler: lerFeitas, gravar: gravarFeitas, apagar: apagarFeitas } };
let fila = filaVazia();
let ligado = false;

function carregar() {
  try { fila = podar(normalizarFila(JSON.parse(localStorage.getItem(CHAVE) || 'null')), deps.agora()); } catch { fila = filaVazia(); }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(fila)); } catch { /* cheio ou bloqueado: a fila vale até fechar a aba */ }
}
/** @param {import('./automacao-regras.js').Fila} nova */
function trocar(nova) {
  if (nova === fila) return false;
  fila = nova;
  salvar();
  emit(EVENTOS.AUTOMACAO_MUDOU);
  return true;
}
const avisarFalha = (e) => console.warn('Fila de mensagens: a marca ficou só neste aparelho por enquanto.', e?.code || e);

/** As mensagens à espera do coach, agora: as condições varridas e as ações na fila. */
export function mensagens() {
  const todos = deps.listar();
  return visiveis(fila, sugestoesDaVarredura(todos, deps.hoje()), todos);
}

/**
 * Marca uma mensagem como enviada ou descartada. false: já estava marcada (o
 * segundo toque não faz nada). A nuvem recebe depois, sem esperar.
 * @param {string} chave @param {'enviada'|'descartada'} status
 */
export function marcarMensagem(chave, status) {
  if (!trocar(marcar(fila, chave, status, deps.agora()))) return false;
  const uid = estado.uid;
  if (uid) deps.nuvem.gravar(uid, { [chave]: fila.feitas[chave] }).catch(avisarFalha);
  return true;
}

/**
 * Mescla com a nuvem: o que outro aparelho enviou ou descartou sai daqui; o
 * que foi marcado aqui sem rede sobe; o que passou do prazo é apagado lá.
 * @param {string} uid
 */
export async function sincronizarAutomacao(uid) {
  try {
    const daNuvem = await deps.nuvem.ler(uid);
    if (!daNuvem) return;
    const p = planoDeSync(fila, daNuvem, deps.agora());
    trocar(p.fila);
    if (p.subir.length) await deps.nuvem.gravar(uid, Object.fromEntries(p.subir.map((k) => [k, fila.feitas[k]])));
    if (p.apagar.length) await deps.nuvem.apagar(uid, p.apagar);
  } catch (e) {
    console.warn('Fila de mensagens: não deu para sincronizar com a nuvem.', /** @type {any} */ (e)?.code || e);
  }
}

/**
 * Liga o motor. Lê a fila guardada neste aparelho; os ouvintes entram uma vez
 * só (chamar de novo só relê a fila — é o que os testes usam como "recarregar").
 * @param {Partial<Deps>} [d] o que vem de fora (os testes trocam tudo)
 */
export function iniciarAutomacao(d = {}) {
  deps = { ...deps, ...d };
  carregar();
  if (ligado) return;
  ligado = true;
  on(EVENTOS.ACAO_REGISTRADA, (acao) => { trocar(aoAgir(fila, acao, deps.agora())); });
}
