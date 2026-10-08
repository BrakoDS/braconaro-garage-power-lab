// @ts-check
/**
 * As regras das telas de comunicação do box — Aviso em massa, Mural, Desafios
 * da semana e Leads. Puras: recebem a lista (e o relógio, quando importa) e
 * DEVOLVEM a lista nova ou a conta pronta. Não gravam, não desenham e não
 * alteram o que recebem; quem grava é a tela.
 *
 * Mural e Desafios são a mesma coisa vista de dois lados: uma lista de itens
 * publicados no Portal (`{ id, …campos, ativo, criadoEm }`), em que o coach
 * publica, edita, oculta/reativa e exclui. Antes, cada tela tinha a sua cópia
 * dessa lógica; agora as duas usam `publicarItem`, `alternarAtivo` e
 * `removerItem`.
 */

/* ============================================================
   Itens publicados (Mural e Desafios)
   ============================================================ */

/**
 * @typedef {{ id: string, ativo?: boolean, criadoEm?: number } & Record<string, any>} ItemPublicado
 */

/** Do mais novo para o mais antigo. @param {ItemPublicado[]} arr */
export function recentes(arr) {
  return arr.slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

/**
 * Publica um item novo — ou, com `editId`, salva a edição do item existente
 * (só os campos do formulário mudam; id, ativo e criadoEm ficam).
 * @param {ItemPublicado[]} arr @param {string|null} editId
 * @param {Record<string, any>} campos os campos do formulário, na ordem em que são gravados
 * @param {{ id: string, agora: number }} novo o id e o instante, para o item novo
 * @returns {ItemPublicado[]}
 */
export function publicarItem(arr, editId, campos, { id, agora }) {
  if (editId) return arr.map((x) => (x.id === editId ? { ...x, ...campos } : x));
  return [...arr, { id, ...campos, ativo: true, criadoEm: agora }];
}

/** Ocultar ↔ reativar: só `ativo: false` é oculto. @param {ItemPublicado[]} arr @param {string} id */
export function alternarAtivo(arr, id) {
  return arr.map((x) => (x.id === id ? { ...x, ativo: x.ativo === false } : x));
}

/** Tira o item da lista. @param {ItemPublicado[]} arr @param {string} id */
export function removerItem(arr, id) {
  return arr.filter((x) => x.id !== id);
}

/** A meta de dias de um desafio: inteira, de 1 a 7; 5 se não der. @param {unknown} v */
export function metaDiasValida(v) {
  return Math.min(7, Math.max(1, parseInt(String(v), 10) || 5));
}

/* ============================================================
   Aviso em massa
   ============================================================ */

/** Quem recebe o aviso: aluno ativo com WhatsApp (10+ dígitos). @param {any[]} alunos */
export function destinatariosDoAviso(alunos) {
  return alunos.filter((a) => (a.status || 'ativo') !== 'inativo' && String(a.telefone || '').replace(/\D/g, '').length >= 10);
}

/* ============================================================
   Leads
   ============================================================ */

export const LEAD_STATUS_LABEL = Object.freeze({ novo: 'Novo', contatado: 'Contatado', convertido: 'Convertido', descartado: 'Descartado' });

const DIA = 86400000;
/** Dias para o lead "novo" (nunca contatado) e o "contatado" (sem retorno) pedirem follow-up. */
export const LIMIAR_FOLLOWUP = Object.freeze({ novo: 2, contatado: 4 });

/** Dias inteiros desde `ts` (null sem data). @param {number|undefined} ts @param {number} agora */
const diasDesde = (ts, agora) => (ts ? Math.floor((agora - ts) / DIA) : null);

/**
 * O lead precisa de follow-up? "Novo" há 2+ dias sem contato, ou "contatado"
 * há 4+ dias sem retorno — para nenhum lead esfriar sem ação.
 * @param {any} l @param {number} agora
 * @returns {{ precisa: boolean, dias: number, motivo: string }}
 */
export function followUpLead(l, agora) {
  const st = l.status || 'novo';
  if (st === 'novo') {
    const d = diasDesde(l.criadoEm, agora);
    if (d != null && d >= LIMIAR_FOLLOWUP.novo) return { precisa: true, dias: d, motivo: 'sem contato' };
  } else if (st === 'contatado') {
    const d = diasDesde(l.statusEm || l.criadoEm, agora);
    if (d != null && d >= LIMIAR_FOLLOWUP.contatado) return { precisa: true, dias: d, motivo: 'sem retorno' };
  }
  return { precisa: false, dias: 0, motivo: '' };
}

/**
 * Os leads da tela: os ativos (descartado sai), as contagens e a ordem —
 * quem precisa de follow-up primeiro (o mais parado no topo), depois o resto
 * do mais recente para o mais antigo.
 * @param {any[]} leads @param {number} agora
 */
export function painelDeLeads(leads, agora) {
  const ativos = leads.filter((l) => l.status !== 'descartado');
  const ordenados = ativos.slice().sort((a, b) => {
    const fa = followUpLead(a, agora), fb = followUpLead(b, agora);
    if (fa.precisa !== fb.precisa) return fa.precisa ? -1 : 1;
    if (fa.precisa && fb.precisa) return fb.dias - fa.dias;
    return (b.criadoEm || 0) - (a.criadoEm || 0);
  });
  return {
    ordenados,
    novos: ativos.filter((l) => l.status === 'novo' || !l.status).length,
    contatados: ativos.filter((l) => l.status === 'contatado').length,
    convertidos: ativos.filter((l) => l.status === 'convertido').length,
    precisam: ativos.filter((l) => followUpLead(l, agora).precisa).length,
  };
}

/**
 * O cache de leads com o status de um deles trocado — o mesmo que a nuvem
 * grava (`atualizarStatusLead`: o status e o `statusEm`). Sem o `statusEm`
 * aqui, o lead recém-marcado como "contatado" contava o prazo de retorno desde
 * a CRIAÇÃO, e um lead de 5 dias aparecia na hora com "⏰ sem retorno há 5d" —
 * até alguém recarregar a tela.
 * @param {any[]} leads @param {string} id @param {string} status @param {number} agora
 */
export function comStatus(leads, id, status, agora) {
  return leads.map((l) => (l.id === id ? { ...l, status, statusEm: agora } : l));
}
