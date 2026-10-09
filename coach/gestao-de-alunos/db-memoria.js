// @ts-check
/**
 * Porta da Gestão em memória (migração e sync) — o Firestore de mentira dos
 * testes e do simulador (`ferramentas/simular-migracao-gestao.mjs`).
 *
 * Imita o que importa do banco de verdade: cada leitura devolve uma CÓPIA (quem
 * lê não altera o que está guardado), o lote é atômico (falhou no meio, nada
 * entra) e a virada compara o blob atual antes de mexer.
 */
import { canonico, decidirTrava } from './db-migracao.js?v=13';

const copia = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * @param {Record<string, any>|null} raizInicial o documento gestao/{uid}
 * @param {{
 *   antesDoLote?: (porta: any, indice: number) => void | Promise<void>,
 *   subcolecoes?: Record<string, Record<string, any>>,
 * }} [ganchos]
 *   `antesDoLote` simula o mundo mexendo durante a migração (um aparelho v1
 *   regravando o blob, a rede caindo — basta lançar). `subcolecoes` pré-carrega
 *   documentos como { 'alunos/999': {...} }, a sobra de uma tentativa anterior.
 */
export function portaEmMemoria(raizInicial, ganchos = {}) {
  /** @type {Map<string, any>} caminho relativo a gestao/{uid} ('' é a raiz) → dados */
  const docs = new Map();
  if (raizInicial) docs.set('', copia(raizInicial));
  for (const [k, v] of Object.entries(ganchos.subcolecoes || {})) docs.set(k, copia(v));
  let lotes = 0;

  const porta = {
    docs,
    /** Simula um aparelho ainda no v1 regravando o documento raiz inteiro. @param {any} blob */
    regravarRaiz(blob) { docs.set('', copia(blob)); },

    async lerRaiz() { return copia(docs.get('') ?? null); },

    async travar(/** @type {any} */ pedido) {
      const d = decidirTrava(docs.get('') ?? null, pedido);
      if (d.ok) docs.set('', { ...docs.get(''), migracao: { status: 'andando', em: pedido.em, aparelho: pedido.aparelho } });
      return copia(d);
    },

    async gravarBackup(/** @type {string} */ id, /** @type {any} */ dados) { docs.set(`backup/${id}`, copia(dados)); },

    async lerSubcolecoes() {
      const fichas = new Map(), avaliacoes = new Map(), feedbacks = new Map();
      for (const [k, v] of docs) {
        const p = k.split('/');
        if (p[0] !== 'alunos') continue;
        if (p.length === 2) fichas.set(p[1], copia(v));
      }
      // Como no Firestore: só se enxerga o filho de uma ficha que existe.
      for (const [k, v] of docs) {
        const p = k.split('/');
        if (p[0] !== 'alunos' || p.length !== 4 || !fichas.has(p[1])) continue;
        const alvo = p[2] === 'avaliacoes' ? avaliacoes : p[2] === 'feedbacks' ? feedbacks : null;
        if (!alvo) continue;
        if (!alvo.has(p[1])) alvo.set(p[1], new Map());
        alvo.get(p[1]).set(p[3], copia(v));
      }
      return { fichas, avaliacoes, feedbacks };
    },

    async gravarLote(/** @type {any[]} */ ops) {
      if (ganchos.antesDoLote) await ganchos.antesDoLote(porta, lotes);
      lotes++;
      if (ops.length > 500) throw new Error('lote com mais de 500 operações');
      for (const op of ops) {
        // 'meta': os campos listados substituem os do documento raiz, o resto
        // fica (o `mergeFields` do Firestore). Cria a raiz se não existir.
        if (op.tipo === 'meta') { docs.set('', { ...(docs.get('') || {}), ...copia(op.dados) }); continue; }
        const k = op.caminho.join('/');
        if (op.tipo === 'set') docs.set(k, copia(op.dados));
        else docs.delete(k);
      }
    },

    async virar(/** @type {string} */ alunosEsperados, /** @type {any} */ virada) {
      const r = docs.get('');
      if (!r || canonico(r.alunos) !== alunosEsperados) return false;
      const { alunos: _fora, ...resto } = r;
      docs.set('', { ...resto, ...copia(virada) });
      return true;
    },

    async liberar(/** @type {any} */ migracao) {
      const r = docs.get('');
      if (r) docs.set('', { ...r, migracao: copia(migracao) });
    },
  };
  return porta;
}
