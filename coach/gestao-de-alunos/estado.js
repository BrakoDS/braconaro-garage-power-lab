// @ts-check
/**
 * Estado compartilhado da Gestão de Alunos + um barramento de eventos mínimo.
 *
 * Antes do fatiamento, `UID`, `alunoAtual` e `avalAberta` eram variáveis soltas
 * no `app.js`, e qualquer tela mexia nelas e chamava a render da outra direto —
 * era isso que prendia tudo no mesmo arquivo. Agora:
 *
 *  - o estado mora num objeto só (`estado`), que todo módulo importa e lê/grava;
 *  - uma tela não chama a outra: ela EMITE o que aconteceu ('alunos-mudaram',
 *    'abrir-perfil') e quem se importa ESCUTA.
 *
 * Puro: sem DOM. Um ouvinte que lança não derruba os outros.
 */

/** @type {{ uid: string|null, alunoAtual: any, avalAberta: number|null }} */
export const estado = {
  /** O coach logado (Firebase Auth). */
  uid: null,
  /** A ficha aberta no perfil. */
  alunoAtual: null,
  /** O número da avaliação aberta no formulário. */
  avalAberta: null,
};

/** Os eventos que existem — um nome errado num `on` vira ouvinte que nunca dispara. */
export const EVENTOS = Object.freeze({
  /** Algum aluno foi criado, editado ou removido (aqui ou vindo da nuvem). */
  ALUNOS_MUDARAM: 'alunos-mudaram',
  /** Pedido para abrir o perfil de um aluno. Dado: o id. */
  ABRIR_PERFIL: 'abrir-perfil',
  /** O perfil de um aluno acabou de abrir (estado.alunoAtual já é ele). Dado: o id. */
  PERFIL_ABERTO: 'perfil-aberto',
  /** Pedido para abrir uma aba do perfil. Dado: o id da aba ('dados', 'matriz'…). */
  ABRIR_ABA: 'abrir-aba',
  /** Pedido para sair do perfil e voltar à lista (o roteador traduz para abrir-tela 'lista'). */
  VOLTAR_LISTA: 'voltar-lista',
  /**
   * Pedido para mostrar uma tela ('lista', 'perfil', 'checkin', 'agenda',
   * 'financeiro', 'cobrancas', 'aviso', 'mural', 'desafios', 'leads').
   * O roteador (navegacao.js) mostra a tela; cada tela ouve o próprio nome
   * para se desenhar. Dado: o nome.
   */
  ABRIR_TELA: 'abrir-tela',
  /** Pedido para exportar a ficha do aluno aberto em PDF. */
  EXPORTAR_FICHA: 'exportar-ficha',
  /** Pedido para trocar a foto do aluno aberto. */
  TROCAR_FOTO: 'trocar-foto',
  /** Entrou evento novo no log da aba Registros (uma ação do coach, a caixa do aluno). Dado: o id do aluno, se houver. */
  REGISTROS_MUDARAM: 'registros-mudaram',
});

/** @type {Map<string, Set<(dados?: any) => void>>} */
const ouvintes = new Map();

/**
 * Escuta um evento. Devolve a função que cancela a escuta.
 * @param {string} evento @param {(dados?: any) => void} fn
 */
export function on(evento, fn) {
  if (!Object.values(EVENTOS).includes(evento)) throw new Error(`Evento desconhecido: ${evento}`);
  if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
  /** @type {Set<any>} */ (ouvintes.get(evento)).add(fn);
  return () => { ouvintes.get(evento)?.delete(fn); };
}

/**
 * Avisa todos os ouvintes do evento, na ordem em que se inscreveram.
 * @param {string} evento @param {any} [dados]
 */
export function emit(evento, dados) {
  if (!Object.values(EVENTOS).includes(evento)) throw new Error(`Evento desconhecido: ${evento}`);
  for (const fn of [...(ouvintes.get(evento) || [])]) {
    try { fn(dados); } catch (e) { console.error(`[Gestão] ouvinte de "${evento}" falhou:`, e); }
  }
}
