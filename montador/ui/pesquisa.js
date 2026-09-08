// @ts-check
/**
 * PESQUISA DE ITEM — chamada à Cloud Function `pesquisarItem` e normalização
 * do que sai daqui para `pesquisa-modal.js` (a tela) consumir.
 *
 * Contrato fixo com a Task 2 (`functions/src/pesquisa.ts`):
 *   entrada: { termo, contexto: 'exercicio'|'mobilidade'|'tecnica', equipamentos: {id,nome}[], buscarNaWeb? }
 *   saída:   { proposta, restantes, buscou }
 *
 * Segue **exatamente** o padrão de `loja/precos.js` (`pedirAtualizacao`,
 * linhas ~262-269) para chamar uma callable: import dinâmico do SDK pela CDN,
 * `getFunctions(app, 'southamerica-east1')` e — o ponto que importa — um
 * TIMEOUT EXPLÍCITO no terceiro argumento de `httpsCallable`.
 *
 * Por quê: o padrão de 70s do SDK web é pensado para chamadas comuns, mas a
 * via com `buscarNaWeb: true` faz a OpenAI navegar a internet antes de
 * responder — o brief estima 10-20s para ela, mas isso é o caminho feliz, sem
 * fila do servidor nem cold start da function. Sem um teto explícito bem acima
 * disso, o coach veria "erro" no navegador enquanto a function ainda está
 * rodando com sucesso do lado do servidor — e clicaria de novo, gerando
 * concorrência (mesmo raciocínio do comentário em `loja/precos.js`).
 */
import { firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2'; // mesma versão do SDK já usada em cloud.js e loja/precos.js
/** Maior que o `timeoutSeconds: 120` da própria function (ver `pesquisarItem` em
 * functions/src/index.ts), de propósito. Se o cliente desistir ANTES do servidor,
 * o coach vê erro enquanto a busca ainda está rodando com sucesso — e clica de
 * novo, gastando cota e disparando duas chamadas para a mesma coisa. É o mesmo
 * problema que o comentário de `pedirAtualizacao` em loja/precos.js descreve.
 * Quem desiste primeiro tem que ser o servidor, que sabe o que estava fazendo. */
const TIMEOUT_MS = 130000;

/** Mensagem amigável para erro de TRANSPORTE (a function não chegou a responder).
 * Erro que a própria function lança (nome ausente, sem padrão etc.) já vem com
 * `.message` amigável — pesquisa-modal.js mostra esse direto. Este mapa cobre só
 * os casos em que quem falhou foi o SDK/rede antes de a function terminar. */
const ERRO_TRANSPORTE = {
  'functions/deadline-exceeded': 'A pesquisa demorou demais e foi cancelada. Tente de novo — a via com busca na internet pode levar até 20s.',
  'functions/unauthenticated': 'Sua sessão de coach expirou. Faça login de novo.',
  'functions/unavailable': 'Sem conexão com o servidor agora. Confira sua internet e tente de novo.',
};
const ERRO_GENERICO = 'Não deu para completar a pesquisa. Tente de novo.';

/**
 * @param {{termo: string, contexto: 'exercicio'|'mobilidade'|'tecnica', equipamentos: {id:string,nome:string}[], buscarNaWeb?: boolean}} args
 * @returns {Promise<{proposta: any, restantes: number, buscou: boolean}>}
 */
export async function pesquisarItem({ termo, contexto, equipamentos, buscarNaWeb = false }) {
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fnMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  const fns = fnMod.getFunctions(app, 'southamerica-east1');
  const chamar = fnMod.httpsCallable(fns, 'pesquisarItem', { timeout: TIMEOUT_MS });

  // Normalização de entrada: o inventário da Academia trafega com bem mais campos
  // (categoria, quantidade, área, obs...) do que a function precisa — manda só o
  // par que o schema da IA usa, sem depender de quem chamou já ter filtrado.
  const payload = {
    termo: String(termo || '').trim(),
    contexto,
    equipamentos: (equipamentos || []).map((e) => ({ id: e.id, nome: e.nome })),
    buscarNaWeb: !!buscarNaWeb,
  };

  try {
    const r = await chamar(payload);
    return /** @type {any} */ (r).data;
  } catch (e) {
    const codigo = /** @type {any} */ (e)?.code;
    // Erro da própria function (ex.: "A pesquisa voltou sem nome.") chega aqui com
    // `.message` já pronto para o coach ler — repassa como está. Só reescreve o
    // texto quando o código é de transporte (SDK/rede), que costuma vir cru.
    const amigavel = ERRO_TRANSPORTE[codigo];
    throw new Error(amigavel || /** @type {any} */ (e)?.message || ERRO_GENERICO);
  }
}
