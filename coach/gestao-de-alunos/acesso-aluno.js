// @ts-check
/**
 * "Criar acesso" do aluno, na ficha da Gestão.
 *
 * O cadastro público do Firebase Auth está desligado: o navegador não cria mais
 * conta nenhuma. Quem cria é a callable `criarAcessoAluno`
 * (teste-hibrido/functions), com o Admin SDK, e só para e-mail que está numa
 * ficha desta Gestão. Ela devolve um link para o aluno definir a própria senha
 * — o coach nunca vê nem escolhe senha — e este módulo transforma o link na
 * mensagem de WhatsApp.
 *
 * O mesmo botão serve de "reenviar acesso": conta que já existe não é tocada,
 * só ganha um link novo. É o caminho para aluno que esqueceu a senha e não
 * acha o e-mail de redefinição.
 */
import { firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2';
const REGIAO = 'southamerica-east1';
const URL_PORTAL = 'https://garagepowerlab.com.br/painel-do-aluno/index.html';

const ERROS = {
  'functions/permission-denied': 'Só a conta do coach cria acesso de aluno.',
  'functions/unauthenticated': 'Sua sessão expirou. Faça login de novo.',
  'functions/unavailable': 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  'functions/deadline-exceeded': 'O servidor demorou demais. Tente de novo.',
  'functions/internal': 'O servidor não conseguiu criar o acesso. Se o botão é novo, pode faltar publicar a função criarAcessoAluno.',
};

/**
 * A mensagem que vai para o aluno. Pura, para o teste.
 * @param {string} nome @param {string} email @param {string} link @param {boolean} novo conta criada agora?
 */
export function mensagemConvite(nome, email, link, novo) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const oi = primeiro ? `Oi, ${primeiro}!` : 'Oi!';
  const abertura = novo
    ? `${oi} Seu acesso ao Garage Power Lab está pronto.`
    : `${oi} Segue um link novo para você definir sua senha do Garage Power Lab.`;
  return [
    abertura,
    '',
    `1. Abra este link e crie sua senha (ele vale por 1 hora):`,
    link,
    '',
    `2. Depois é só entrar com o e-mail ${email} e a senha nova no Portal do Aluno: ${URL_PORTAL}`,
    '',
    'Se o link vencer, me avisa que eu mando outro.',
  ].join('\n');
}

/**
 * Link de WhatsApp para o telefone da ficha, ou '' sem telefone utilizável.
 * @param {string} telefone @param {string} texto
 */
export function linkWhatsApp(telefone, texto) {
  const d = String(telefone || '').replace(/\D/g, '');
  if (d.length < 10) return '';
  const cheio = d.startsWith('55') && d.length >= 12 ? d : '55' + d;
  return `https://wa.me/${cheio}?text=${encodeURIComponent(texto)}`;
}

let _chamar = null;
async function chamavel() {
  if (_chamar) return _chamar;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fnMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _chamar = fnMod.httpsCallable(fnMod.getFunctions(app, REGIAO), 'criarAcessoAluno', { timeout: 40000 });
  return _chamar;
}

/**
 * Cria (ou reaproveita) a conta e devolve o link de senha.
 * @param {string} email
 * @returns {Promise<{criado: boolean, link: string, nome: string}>}
 */
export async function criarAcesso(email) {
  const chamar = await chamavel();
  try {
    const r = await chamar({ email });
    return /** @type {any} */ (r).data;
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    console.error('criarAcessoAluno:', code, /** @type {any} */ (e)?.message);
    // not-found e invalid-argument trazem o texto da própria função, que é o útil.
    throw new Error(ERROS[code] || /** @type {any} */ (e)?.message || 'Não deu para criar o acesso.');
  }
}
