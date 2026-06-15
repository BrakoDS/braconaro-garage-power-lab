// @ts-check
/**
 * Trava simples de acesso ao montador (dissuasor — NÃO é segurança real:
 * é client-side, num site estático e repositório público).
 *
 * Guardamos apenas o HASH SHA-256 da senha, nunca a senha em texto.
 *
 * COMO TROCAR A SENHA:
 *   1. Abra /montador/ no navegador e, no console (F12), rode:
 *        await montadorHashSenha('SUA_NOVA_SENHA')
 *      (a função fica disponível globalmente nesta página)
 *   2. Copie o hash impresso e cole em SENHA_HASH abaixo.
 *   3. Faça commit. Pronto.
 *
 * Senha inicial: "braconaro2026" — TROQUE assim que puder.
 */
export const SENHA_HASH = '8d80ad737cf68c168a78cfc383f5e3a61ba1332791bea770cb09cdbba4ffc52d';

const CHAVE_OK = 'braconaro_montador_auth';

/** SHA-256 hex de um texto. @param {string} txt */
export async function sha256(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Já liberado nesta sessão do navegador? */
export function estaLiberado() {
  return sessionStorage.getItem(CHAVE_OK) === '1';
}

/** Tenta liberar com a senha. @param {string} senha @returns {Promise<boolean>} */
export async function tentarLiberar(senha) {
  const ok = (await sha256(senha)) === SENHA_HASH;
  if (ok) sessionStorage.setItem(CHAVE_OK, '1');
  return ok;
}

// helper global para gerar o hash de uma nova senha no console
// @ts-ignore
window.montadorHashSenha = sha256;
