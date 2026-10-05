// @ts-check
/**
 * SEMANA DO BOX — o que a tela precisa para MOSTRAR a semana, sem DOM e sem rede.
 *
 * Aqui não mora regra de negócio. Quem decide qual exercício entra, quanto
 * equipamento um dia ocupa, se a semana passou do limite e se ela pode ser
 * publicada é o servidor (`functions/src/semana-box.ts` e `gerador-box.ts`), e
 * o documento `coaches/{uid}/semanas/{AAAA-Www}` já chega com tudo calculado:
 * `alertas`, `problemasParaPublicar`, `limitesUsados`, e `instancia`/`recursos`
 * em cada exercício. Este módulo só transforma esses campos em texto e decide
 * o que destacar — se uma conta aparecer aqui, ela está no lugar errado.
 */

/** Segunda a sábado, na ordem da grade. `prep` é a preposição do "na segunda" / "no sábado". */
export const DIAS = [
  { id: 'segunda', nome: 'Segunda', prep: 'na' },
  { id: 'terca', nome: 'Terça', prep: 'na' },
  { id: 'quarta', nome: 'Quarta', prep: 'na' },
  { id: 'quinta', nome: 'Quinta', prep: 'na' },
  { id: 'sexta', nome: 'Sexta', prep: 'na' },
  { id: 'sabado', nome: 'Sábado', prep: 'no' },
];

/** Os recursos que o inventário limita, na ordem do servidor (`RECURSOS_INVENTARIO`). */
export const RECURSOS = ['smith', 'banco', 'monocross', 'maquinaLegs', 'cavalinho'];

/** @type {Record<string, {um: string, varios: string}>} */
export const NOME_RECURSO = {
  smith: { um: 'Smith', varios: 'Smiths' },
  banco: { um: 'Banco', varios: 'Bancos' },
  monocross: { um: 'Monocross', varios: 'Monocross' },
  maquinaLegs: { um: 'Máquina de pernas', varios: 'Máquinas de pernas (extensora/flexora)' },
  cavalinho: { um: 'Cavalinho', varios: 'Cavalinhos' },
};

/** @type {Record<string, string>} */
export const NOME_INSTANCIA = {
  agachar: 'Agachar',
  estender_quadril: 'Estender quadril',
  empurrar_horizontal: 'Empurrar horizontal',
  empurrar_vertical: 'Empurrar vertical',
  puxar_horizontal: 'Puxar horizontal',
  puxar_vertical: 'Puxar vertical',
  estabilizar_tronco: 'Core',
};

const DIA_MS = 864e5;

/** @param {string} id */
function dia(id) {
  return DIAS.find((d) => d.id === id) ?? { id, nome: id, prep: 'em' };
}

/** @param {string} r */
function nomeRecurso(r) {
  return NOME_RECURSO[r] ?? { um: r, varios: r };
}

/**
 * Em que pé está a semana. Documento ausente é a semana que ainda não foi gerada.
 * @param {any} doc
 * @returns {{id: 'vazia'|'rascunho'|'publicado', rotulo: string}}
 */
export function estadoDaSemana(doc) {
  if (!doc) return { id: 'vazia', rotulo: 'Não gerada' };
  return doc.status === 'publicado' ? { id: 'publicado', rotulo: 'Publicada' } : { id: 'rascunho', rotulo: 'Rascunho' };
}

/**
 * "Limite de Smiths atingido na segunda: 3 em uso, 2 ativos."
 * @param {{dia: string, recurso: string, usado: number, limite: number}} a
 */
export function textoAlerta(a) {
  const d = dia(a.dia);
  const ativos = a.limite === 1 ? '1 ativo' : `${a.limite} ativos`;
  return `Limite de ${nomeRecurso(a.recurso).varios} atingido ${d.prep} ${d.nome.toLowerCase()}: ${a.usado} em uso, ${ativos}.`;
}

/**
 * "H1, vaga 3: Desenvolvimento militar no Smith → com halteres (faltou Smith)."
 * @param {{sessao: string, posicao: number, deNome?: string, paraNome?: string, de: string, para: string, recurso: string}} t
 */
export function textoTroca(t) {
  return `${t.sessao}, vaga ${t.posicao}: ${t.deNome || t.de} → ${t.paraNome || t.para} (faltou ${nomeRecurso(t.recurso).um}).`;
}

/**
 * As posições do bloco de um dia que ocupam algum recurso estourado NAQUELE dia —
 * as que a tela pinta de vermelho. Usa os `recursos` que o servidor gravou em
 * cada exercício; semana gravada antes desse campo simplesmente não destaca.
 * @param {any} doc @param {string} diaId
 * @returns {Set<number>}
 */
export function posicoesEmAlerta(doc, diaId) {
  const estourados = new Set((doc?.alertas ?? []).filter((a) => a.dia === diaId).map((a) => a.recurso));
  const bloco = doc?.dias?.[diaId]?.blocoPrincipal ?? [];
  const posicoes = new Set();
  bloco.forEach((ex, i) => {
    if ((ex.recursos ?? []).some((r) => estourados.has(r))) posicoes.add(i);
  });
  return posicoes;
}

/**
 * O consumo de um dia contra o limite, só dos recursos que o dia usa ("Smith 2/2").
 * @param {any} diaProgramado @param {Record<string, number>|undefined} limites
 */
export function consumoVisivel(diaProgramado, limites) {
  const consumo = diaProgramado?.consumoEquipamentos ?? {};
  return RECURSOS
    .filter((r) => (consumo[r] ?? 0) > 0)
    .map((r) => {
      const limite = limites?.[r];
      return {
        recurso: r,
        nome: nomeRecurso(r).um,
        usado: consumo[r],
        limite: typeof limite === 'number' ? limite : null,
        estourou: typeof limite === 'number' && consumo[r] > limite,
      };
    });
}

/**
 * Publicar está liberado? Só ESPELHA o que o servidor gravou em
 * `problemasParaPublicar`; quem decide é `publicarSemanaBox`. Semana sem o
 * campo (gravada antes dele existir) libera o botão e deixa o servidor responder.
 * @param {any} doc
 * @returns {{pode: boolean, motivos: string[]}}
 */
export function publicacao(doc) {
  if (!doc || doc.status === 'publicado') return { pode: false, motivos: [] };
  const motivos = Array.isArray(doc.problemasParaPublicar) ? doc.problemasParaPublicar : [];
  return { pode: motivos.length === 0, motivos };
}

/** A próxima `variacao` para "Sortear de novo". @param {any} doc */
export function variacaoSeguinte(doc) {
  const atual = Number(doc?.geracao?.variacao);
  return ((Number.isInteger(atual) && atual >= 0 ? atual : 0) + 1) % 1000;
}

/**
 * Milissegundos de um Timestamp do Firestore (SDK web), de um número ou de nada.
 * @param {any} t
 */
export function msDe(t) {
  if (typeof t === 'number') return t;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return NaN;
}

/**
 * 'dd/mm' de cada dia, a partir do `dataInicio` gravado (segunda 00:00 em São
 * Paulo = 03:00 UTC, então a data UTC daquele instante JÁ é a segunda).
 * @param {any} dataInicio
 * @returns {Record<string, string>}
 */
export function datasDosDias(dataInicio) {
  const inicio = msDe(dataInicio);
  /** @type {Record<string, string>} */
  const datas = {};
  DIAS.forEach((d, i) => {
    if (!Number.isFinite(inicio)) { datas[d.id] = ''; return; }
    const x = new Date(inicio + i * DIA_MS);
    datas[d.id] = `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  return datas;
}

/**
 * O título da sessão de força do dia: "H1 · Força Base — Agachar/Empurrar",
 * com "(catch-up)" quando ela é a alternativa do dia.
 * @param {any} diaProgramado
 */
export function tituloForca(diaProgramado) {
  const s = diaProgramado?.sessaoForca;
  if (!s) return '';
  return `${s.sessao} · ${s.nome}${s.papel === 'alternativa' ? ' (catch-up)' : ''}`;
}
