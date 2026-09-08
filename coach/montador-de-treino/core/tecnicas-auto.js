// @ts-check
/**
 * ATRIBUIÇÃO AUTOMÁTICA DE TÉCNICA AVANÇADA — só Hipertrofia.
 *
 * Força fica de fora de propósito: com 1–6 reps e carga alta, drop-set e
 * rest-pause atrapalham mais do que ajudam. Ali a técnica é a própria carga.
 *
 * Módulo puro: NÃO conhece a Academia. Recebe a lista de técnicas de quem chama
 * (`ui/app.js` passa `academia.listarTecnicas()`), porque `core/` não pode
 * depender de localStorage.
 *
 * @typedef {{id:string, nome:string, resumo?:string, objetivo?:string, ativo?:boolean}} Tecnica
 */

/**
 * Técnicas que se aplicam a UM exercício sozinho.
 *
 * As demais do banco — Bi-set, Tri-set, Série Gigante, Pré e Pós-Exaustão —
 * pareiam DOIS ou mais exercícios, e colar o selo delas num único item da lista
 * produziria uma instrução impossível de executar ("faça bi-set" em quê?).
 * Emparelhar exercícios automaticamente é outro problema, bem maior, e o coach
 * já resolve isso à mão no Treino Manual, onde ele escolhe os dois lados.
 *
 * Técnica que o coach criar na Academia NÃO entra aqui: não há como saber quantos
 * exercícios ela pede. Ela continua disponível no Treino Manual.
 */
export const TECNICAS_DE_UM_EXERCICIO = [
  'drop_set', 'pico_contracao', 'rest_pause', 'fst_7',
  'cluster_set', 'excentrica_lenta', 'repeticoes_parciais',
];

/** Quantos exercícios do dia recebem técnica. Mais que isso vira treino de exaustão. */
const MAX_COM_TECNICA = 2;

/**
 * Congela a técnica no formato do snapshot. O rótulo vai junto porque a técnica é
 * editável na Academia e pode até ser apagada depois — o treino salvo guarda o
 * nome e o texto que valiam no dia.
 * @param {Tecnica} t
 */
export function congelarTecnica(t) {
  return { tipo: t.id, label: t.nome, detalhe: t.resumo || t.objetivo || t.nome };
}

/**
 * Atribui técnica a até 2 exercícios do bloco principal.
 *
 * O PRIMEIRO exercício nunca recebe: ele é o mais pesado do dia (o gerador
 * seleciona por padrão obrigatório, e o composto principal abre a sessão), e
 * técnica de falha no abre-alas compromete todo o resto do treino.
 *
 * @param {{exercicio: any}[]} principal  Bloco principal já montado
 * @param {Tecnica[]} tecnicas            Banco da Academia (só as ativas)
 * @param {() => number} rng
 * @param {string} modalidade
 * @returns {(ReturnType<typeof congelarTecnica>|null)[]}  Uma entrada por exercício, na ordem
 */
export function atribuirTecnicasAuto(principal, tecnicas, rng, modalidade) {
  const vazio = principal.map(() => null);
  if (modalidade !== 'hipertrofia') return vazio;

  const pool = (tecnicas || []).filter(
    (t) => t && t.ativo !== false && TECNICAS_DE_UM_EXERCICIO.includes(t.id));
  if (!pool.length || principal.length < 2) return vazio;

  // Candidatos: tudo menos o primeiro. Embaralha e pega os dois primeiros.
  const indices = principal.map((_, i) => i).slice(1);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const escolhidos = indices.slice(0, Math.min(MAX_COM_TECNICA, indices.length));

  const disponiveis = [...pool];
  for (const idx of escolhidos) {
    if (!disponiveis.length) break;
    const k = Math.floor(rng() * disponiveis.length);
    vazio[idx] = congelarTecnica(disponiveis.splice(k, 1)[0]); // sem repetir técnica no mesmo dia
  }
  return vazio;
}
