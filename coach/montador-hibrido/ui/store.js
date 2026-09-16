// @ts-check
/**
 * O ESTADO DA SESSÃO do Montador Híbrido, em memória e espelhado no
 * localStorage.
 *
 * Por que existe rascunho local: montar uma aula é um fluxo de quatro telas
 * (lousa ➔ alertas ➔ turma ➔ volume) e o coach faz isso no celular, entre uma
 * série e outra. Um toque no botão "voltar", uma ligação, a aba descartada pelo
 * sistema para liberar memória — e a lousa inteira teria ido embora. O
 * localStorage traz de volta o texto, o título, a data e o treino já
 * reconhecido.
 *
 * O que NÃO é guardado aqui, de propósito:
 *  - o DESENHO do canvas. São centenas de KB por lousa, e o localStorage tem
 *    cota de poucos MB por origem — duas lousas encheriam e a terceira falharia
 *    a escrita, derrubando junto o rascunho de texto que cabia. O desenho vive
 *    na tela enquanto a aba vive; o que precisa sobreviver é o RESULTADO dele,
 *    que é o treino estruturado.
 *  - o treino salvo na nuvem. Esse tem dono (`coaches/{uid}/lousas`) e é lido de
 *    lá. Guardar uma segunda cópia local seria criar duas verdades sobre o mesmo
 *    treino, e a local venceria por acidente no próximo carregamento.
 *
 * @typedef {Object} Estado
 * @property {string} titulo
 * @property {string} dateId    'YYYY-MM-DD'
 * @property {string} classTime 'HH:MM' da turma
 * @property {string} texto     o que o coach digitou na lousa
 * @property {any|null} treino  o treino estruturado que a IA devolveu
 * @property {string} workoutId id no Firestore, depois de salvo
 * @property {any|null} alertas resultado da checagem de variabilidade
 * @property {string[]} turma   ids dos alunos selecionados
 * @property {any[]} fichas     prévia da distribuição
 */

const CHAVE = 'braconaro_montador_hibrido_v1';

/** 'YYYY-MM-DD' de hoje no fuso do aparelho — a mesma conta de `datas-treino.js`. */
function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @returns {Estado} */
function vazio() {
  return {
    titulo: '', dateId: hoje(), classTime: '', texto: '',
    treino: null, workoutId: '', alertas: null, turma: [], fichas: [],
  };
}

/** @type {Estado} */
const estado = (() => {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return vazio();
    const salvo = JSON.parse(cru);
    // Mescla com o vazio em vez de adotar o objeto salvo: um rascunho gravado por
    // uma versão anterior pode não ter campo que a tela de hoje lê, e `undefined`
    // no meio de um `.map()` quebra a renderização inteira.
    return { ...vazio(), ...(salvo && typeof salvo === 'object' ? salvo : {}) };
  } catch {
    return vazio();
  }
})();

/** @type {Set<() => void>} */
const ouvintes = new Set();

/** Registra quem quer ser avisado a cada mudança. Devolve como cancelar. */
export function aoMudar(cb) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

function persistir() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (e) {
    // Cota estourada ou modo privado: o rascunho não sobrevive ao recarregar,
    // mas a sessão continua funcionando. Derrubar a tela por causa do rascunho
    // seria trocar um inconveniente por uma perda.
    console.warn('Rascunho do Montador Híbrido não pôde ser salvo:', e);
  }
}

/** O estado atual (somente leitura por convenção — use `atualizar` para mexer). */
export function ler() { return estado; }

/**
 * Aplica um patch, persiste e avisa a tela.
 * @param {Partial<Estado>} patch
 */
export function atualizar(patch) {
  Object.assign(estado, patch);
  persistir();
  for (const cb of ouvintes) {
    try { cb(); } catch (e) { console.error('Ouvinte do store falhou:', e); }
  }
}

/**
 * Começa uma lousa nova.
 *
 * Preserva a DATA e o HORÁRIO da turma: quem acabou de montar a aula das 19h de
 * quarta normalmente monta a das 20h logo em seguida, e redigitar os dois todo
 * dia é o tipo de atrito que faz o coach voltar para o papel.
 */
export function limpar() {
  const { dateId, classTime } = estado;
  atualizar({ ...vazio(), dateId, classTime });
}

/**
 * Invalida o que deixou de valer quando o treino muda.
 *
 * Alertas e fichas são DERIVADOS do treino: reconhecer a lousa de novo, ou
 * aceitar uma troca de implemento, torna os dois obsoletos na hora. Deixá-los na
 * tela é pior que apagá-los — o coach distribuiria para a turma uma ficha
 * calculada em cima do treino anterior, sem nada indicando isso.
 */
export function definirTreino(treino) {
  atualizar({ treino, alertas: null, fichas: [] });
}
