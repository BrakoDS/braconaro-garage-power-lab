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

/** Os recursos que o inventário limita no bloco H, na ordem do servidor (`RECURSOS_INVENTARIO`). */
export const RECURSOS = ['smith', 'banco', 'monocross', 'maquinaLegs', 'cavalinho'];

/** Os recursos que limitam o HIIT, na ordem do servidor (`RECURSOS_HIIT`). */
export const RECURSOS_HIIT = ['kettlebell', 'wallBall', 'caixote', 'cordaNaval', 'cordaPular', 'sandbag', 'airbike', 'trx', 'halteres'];

/** @type {Record<string, {um: string, varios: string}>} */
export const NOME_RECURSO = {
  smith: { um: 'Smith', varios: 'Smiths' },
  banco: { um: 'Banco', varios: 'Bancos' },
  monocross: { um: 'Monocross', varios: 'Monocross' },
  maquinaLegs: { um: 'Máquina de pernas', varios: 'Máquinas de pernas (extensora/flexora)' },
  cavalinho: { um: 'Cavalinho', varios: 'Cavalinhos' },
  kettlebell: { um: 'Kettlebell', varios: 'Kettlebells' },
  wallBall: { um: 'Wall ball', varios: 'Wall balls' },
  caixote: { um: 'Caixote', varios: 'Caixotes' },
  cordaNaval: { um: 'Corda naval', varios: 'Cordas navais' },
  cordaPular: { um: 'Corda de pular', varios: 'Cordas de pular' },
  sandbag: { um: 'Sandbag', varios: 'Sandbags' },
  airbike: { um: 'Air bike', varios: 'Air bikes' },
  trx: { um: 'TRX', varios: 'TRX' },
  halteres: { um: 'Par de halteres', varios: 'Pares de halteres' },
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

/* ───────────────────────────── edição manual ───────────────────────────── */

/** 'segunda e terça', 'quarta'. @param {string[]} dias */
export function rotuloDias(dias) {
  const nomes = (dias ?? []).map((d) => dia(d).nome.toLowerCase());
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? '');
}

/**
 * 'AAAA-MM-DD' de cada dia, a partir do `dataInicio` gravado.
 * @param {any} dataInicio @returns {Record<string, string>}
 */
export function datasIsoDosDias(dataInicio) {
  const inicio = msDe(dataInicio);
  /** @type {Record<string, string>} */
  const datas = {};
  DIAS.forEach((d, i) => { datas[d.id] = Number.isFinite(inicio) ? new Date(inicio + i * DIA_MS).toISOString().slice(0, 10) : ''; });
  return datas;
}

/**
 * Dá para trocar exercício desta sessão? ESPELHA a trava do servidor
 * (`diasPassadosAlterados` em `edicao-box.ts`) só para decidir se a tela mostra
 * o botão: semana que já foi publicada não muda numa sessão com dia passado.
 * Quem recusa de verdade é `salvarSemanaBox`.
 * @param {any} doc @param {string} sessao @param {string} hojeIso
 */
export function sessaoEditavel(doc, sessao, hojeIso) {
  if (!doc) return false;
  if (doc.status !== 'publicado' && !doc.publicadoEm) return true;
  const datas = datasIsoDosDias(doc.dataInicio);
  return !DIAS.some((d) => doc.dias?.[d.id]?.sessaoForca?.sessao === sessao && datas[d.id] && datas[d.id] < hojeIso);
}

/**
 * Os `dias` no formato que `salvarSemanaBox` recebe, com as trocas aplicadas em
 * TODOS os dias da sessão (o H1 da segunda e o catch-up de terça mudam juntos).
 * Só monta o pedido: o servidor revalida e recalcula tudo.
 * @param {any} doc @param {{sessao: string, posicao: number, exercicioId: string}[]} [trocas]
 */
export function diasParaSalvar(doc, trocas = []) {
  /** @type {Record<string, any>} */
  const dias = {};
  for (const d of DIAS) {
    const x = doc?.dias?.[d.id] ?? {};
    const sessao = x.sessaoForca?.sessao;
    dias[d.id] = {
      treinos: Array.isArray(x.treinos) ? [...x.treinos] : [],
      blocoPrincipal: (Array.isArray(x.blocoPrincipal) ? x.blocoPrincipal : []).map((e, i) => {
        const t = trocas.find((tr) => tr.sessao === sessao && tr.posicao === i + 1);
        return { exercicioId: t ? t.exercicioId : e.exercicioId, series: e.series, repeticoes: e.repeticoes, descansoSeg: e.descansoSeg };
      }),
      cadencia: x.cadencia,
      descansos: x.descansos ? { ...x.descansos } : undefined,
    };
  }
  return dias;
}

/**
 * O que a tela diz sobre os conflitos de uma opção, um por linha.
 * @param {{mesmoBloco: boolean, repeticoes: any[], semanaAnterior: boolean, equipamento: any[], instanciaDiferente: boolean}} c
 * @param {string} sessao a sessão que está sendo editada
 */
export function textoConflitos(c, sessao) {
  const linhas = [];
  if (c.mesmoBloco) linhas.push(`Já está em outra vaga do ${sessao}. Um bloco não repete exercício.`);
  for (const r of c.repeticoes ?? []) linhas.push(`Já está no ${r.sessao} (vaga ${r.posicao} · ${rotuloDias(r.dias)}).`);
  if (c.semanaAnterior) linhas.push('Foi usado na semana passada: quebra o rodízio.');
  for (const e of c.equipamento ?? []) {
    linhas.push(`Passa do limite de ${nomeRecurso(e.recurso).varios}: ${e.usado} em uso, ${e.limite} ${e.limite === 1 ? 'ativo' : 'ativos'}. A semana não publica assim.`);
  }
  if (c.instanciaDiferente) linhas.push(`É de outra instância: a matriz do ${sessao} muda nesta vaga.`);
  return linhas;
}

/** Os selos curtos da lista de opções. @param {any} c */
export function selosDaOpcao(c) {
  const selos = [];
  if (c.mesmoBloco) selos.push({ id: 'bloco', rotulo: 'já no bloco' });
  if (c.equipamento?.length) selos.push({ id: 'equipamento', rotulo: '🔧 equipamento' });
  if (c.repeticoes?.length) selos.push({ id: 'repetido', rotulo: `⚠ no ${c.repeticoes.map((r) => r.sessao).join(', ')}` });
  if (c.semanaAnterior) selos.push({ id: 'rodizio', rotulo: '↺ semana passada' });
  return selos;
}

/**
 * Como seguir depois de escolher uma opção com conflito. Equipamento NÃO tem
 * "manter": a semana não publica acima do limite (decisão do coach). Mesmo
 * bloco também não: o servidor não salva.
 * @param {any} opcao
 * As saídas recomendadas (substituir no outro lugar, escolher outro exercício)
 * vêm cheias; "escolher outro substituto" e "manter" vêm `secundaria`.
 * @returns {{id: string, label: string, secundaria?: boolean}[]}
 */
export function acoesDoConflito(opcao) {
  const c = opcao.conflitos;
  if (c.mesmoBloco) return [{ id: 'outro', label: 'Escolher outro exercício' }];
  if (c.equipamento?.length) return [{ id: 'outro', label: 'Escolher outro exercício' }];
  const acoes = [];
  for (const s of opcao.substitutos ?? []) {
    for (const x of s.opcoes ?? []) {
      acoes.push({ id: `substituir:${s.sessao}:${s.posicao}:${x.exercicioId}`, label: `Trocar no ${s.sessao} por ${x.nome}` });
    }
    acoes.push({ id: `outro-substituto:${s.sessao}:${s.posicao}`, label: `Escolher outro para o ${s.sessao}…`, secundaria: true });
  }
  acoes.push({
    id: 'manter',
    label: c.repeticoes?.length ? 'Manter assim mesmo' : c.semanaAnterior ? 'Manter (quebra o rodízio)' : 'Trocar mesmo assim',
    // Sem substituto para oferecer, "manter" é a saída principal.
    secundaria: (opcao.substitutos ?? []).some((s) => s.opcoes?.length),
  });
  return acoes;
}

/** Tem algo a perguntar antes de trocar? @param {any} c */
export const temConflito = (c) =>
  !!(c.mesmoBloco || c.repeticoes?.length || c.semanaAnterior || c.equipamento?.length || c.instanciaDiferente);

/** As notas que a semana guarda (`avisosEdicao`). @param {any} a */
export function textoAvisoEdicao(a) {
  if (a?.tipo === 'repeticao') {
    return `${a.nome || a.exercicioId} está em ${(a.lugares ?? []).map((l) => `${l.sessao} (vaga ${l.posicao})`).join(' e ')}.`;
  }
  if (a?.tipo === 'semanaAnterior') return `${a.nome || a.exercicioId} (${a.sessao}, vaga ${a.posicao}) foi usado na semana passada.`;
  return '';
}

/* ───────────────────────────── inventário ───────────────────────────── */

/** Teto do seletor — o mesmo `inteiro(…, 0, 50)` que `aplicarInventario` aceita no servidor. */
export const MAX_UNIDADES = 50;

/**
 * As linhas da tela a partir de `coaches/{uid}/inventario/atual` (ou da resposta
 * de `salvarInventarioBox`, que tem a mesma forma). `ativos` é o `limitesAtivos`
 * que o SERVIDOR calculou — a tela não refaz a conta. Documento ausente = `[]`.
 * `grupo` separa o bloco H ('forca') do HIIT ('hiit'), na ordem do servidor.
 * @param {any} doc
 * @returns {{recurso: string, grupo: 'forca'|'hiit', nome: string, total: number, emManutencao: number, observacao: string, ativos: number|null}[]}
 */
export function linhasDoInventario(doc) {
  const eq = doc?.equipamentos;
  if (!eq || typeof eq !== 'object') return [];
  const grupos = /** @type {const} */ ([['forca', RECURSOS], ['hiit', RECURSOS_HIIT]]);
  return grupos.flatMap(([grupo, lista]) => lista.map((r) => {
    const x = eq[r] ?? {};
    const ativos = doc.limitesAtivos?.[r];
    return {
      recurso: r,
      grupo,
      nome: nomeRecurso(r).um,
      total: Number.isInteger(x.total) ? x.total : 0,
      emManutencao: Number.isInteger(x.emManutencao) ? x.emManutencao : 0,
      observacao: typeof x.observacao === 'string' ? x.observacao : '',
      ativos: Number.isInteger(ativos) ? ativos : null,
    };
  }));
}

/** Faixa do seletor da turma — a mesma que `aplicarInventario` aceita no servidor (1 a 40). */
export const TURMA_MIN = 1;
export const TURMA_MAX = 40;

/**
 * A turma gravada (`alunosPorAula`), ou `null` em inventário gravado antes do HIIT.
 * @param {any} doc
 */
export function turmaDoInventario(doc) {
  const n = doc?.alunosPorAula;
  return Number.isInteger(n) && n >= TURMA_MIN && n <= TURMA_MAX ? n : null;
}

/**
 * O documento já tem a forma de depois do HIIT (os recursos do HIIT e a turma)?
 * Inventário gravado antes disso é NORMALIZADO pelo servidor (`salvarInventario({})`):
 * é ele quem sabe os números de fábrica, e a tela não os repete.
 * @param {any} doc
 */
export function inventarioCompleto(doc) {
  const eq = doc?.equipamentos;
  return !!eq && typeof eq === 'object' && turmaDoInventario(doc) !== null
    && [...RECURSOS, ...RECURSOS_HIIT].every((r) => eq[r] && Number.isInteger(eq[r].total));
}

/**
 * Alunos que dividem uma estação do HIIT: a turma se espalha pelas 4. ESPELHA
 * `alunosPorEstacao` do servidor (`conta-hiit.ts`) só para a tela explicar o
 * número; quem conta de verdade é o servidor.
 * @param {number} turma
 */
export function alunosPorEstacao(turma) {
  return Math.max(1, Math.ceil(turma / 4));
}

/**
 * Só o que mudou, por recurso, no formato que `salvarInventarioBox` recebe.
 * Mandar só a diferença é o que impede a tela de sobrescrever com o valor
 * velho um campo que ela nem mexeu.
 * @param {ReturnType<typeof linhasDoInventario>} original
 * @param {ReturnType<typeof linhasDoInventario>} editado
 * @returns {Record<string, {total?: number, emManutencao?: number, observacao?: string}>}
 */
export function alteracoesDoInventario(original, editado) {
  /** @type {Record<string, any>} */
  const mudou = {};
  for (const e of editado) {
    const o = original.find((x) => x.recurso === e.recurso);
    if (!o) continue;
    const campos = {};
    if (e.total !== o.total) campos.total = e.total;
    if (e.emManutencao !== o.emManutencao) campos.emManutencao = e.emManutencao;
    if (e.observacao.trim() !== o.observacao) campos.observacao = e.observacao.trim();
    if (Object.keys(campos).length) mudou[e.recurso] = campos;
  }
  return mudou;
}

/**
 * Uma semana que o novo inventário deixou acima do limite — no bloco H, no HIIT
 * ou nos dois. Semana publicada NÃO é despublicada pelo servidor — a ação
 * sugerida diz isso ao coach. O alerta do HIIT aqui sai sem o nome dos
 * exercícios: a resposta do inventário não traz a semana, só os alertas.
 * @param {{semanaId: string, status: string, alertas?: any[], alertasHiit?: any[]}} s
 */
export function semanaAfetada(s) {
  const publicada = s.status === 'publicado';
  return {
    semanaId: s.semanaId,
    titulo: `Semana ${s.semanaId} · ${publicada ? 'publicada' : 'rascunho'}`,
    alertas: [...(s.alertas ?? []).map(textoAlerta), ...(s.alertasHiit ?? []).map((a) => textoAlertaHiit(a))],
    acao: publicada
      ? 'Os alunos já veem esta semana. Volte para rascunho e sorteie de novo, ou devolva o equipamento ao inventário.'
      : 'Sorteie de novo para o gerador trocar os exercícios, ou devolva o equipamento ao inventário.',
  };
}

/**
 * A segunda-feira ('AAAA-MM-DD') de uma chave ISO 'AAAA-Www' — para abrir a
 * semana afetada no mês certo. '' se a chave não é de semana.
 * @param {string} chave
 */
export function segundaDaChave(chave) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(chave || ''));
  if (!m) return '';
  const quatroJan = Date.UTC(Number(m[1]), 0, 4);
  const diaIso = (new Date(quatroJan).getUTCDay() + 6) % 7;
  return new Date(quatroJan - diaIso * DIA_MS + (Number(m[2]) - 1) * 7 * DIA_MS).toISOString().slice(0, 10);
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

/* ───────────────────────────── HIIT ───────────────────────────── */

/** Nome de cada estação do HIIT, como o servidor (`NOME_ESTACAO_HIIT`). @type {Record<string, string>} */
export const NOME_ESTACAO_HIIT = { pernas: 'Pernas', core: 'Core', superiores: 'Superiores', cardio: 'Cardio' };

/** Total de alertas da semana (bloco H + HIIT) — o "⚠ n alertas" da lista. @param {any} doc */
export function totalDeAlertas(doc) {
  return (doc?.alertas ?? []).length + (doc?.alertasHiit ?? []).length;
}

/**
 * O HIIT da semana, para a faixa abaixo da grade: as estações (gravadas iguais
 * na sexta e no sábado) e os dias em que ele aparece, com o papel de cada um.
 * `null` em semana gerada antes do gerador do HIIT — a tela fica como era.
 * @param {any} doc
 * @returns {{estacoes: any[], protocolo: string, dias: {id: string, nome: string, papel: string}[]}|null}
 */
export function hiitDaSemana(doc) {
  const dias = DIAS.filter((d) => Array.isArray(doc?.dias?.[d.id]?.hiit?.estacoes));
  if (!dias.length) return null;
  const estacoes = doc.dias[dias[0].id].hiit.estacoes;
  return {
    estacoes,
    protocolo: estacoes.find((e) => e?.protocolo)?.protocolo ?? '',
    dias: dias.map((d) => {
      const b = (doc.dias[d.id].blocosMetabolicos ?? []).find((x) => x?.modalidade === 'HIIT');
      return { id: d.id, nome: d.nome, papel: b?.papel === 'principal' ? 'principal' : 'alternativa' };
    }),
  };
}

/** 'sexta (alternativa) e sábado (principal)'. @param {{nome: string, papel: string}[]} dias */
export function rotuloDiasHiit(dias) {
  const partes = dias.map((d) => `${d.nome.toLowerCase()} (${d.papel})`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : (partes[0] ?? '');
}

/** id → nome dos exercícios do HIIT gravado (para o texto dos alertas). @param {any} doc */
export function nomesDoHiit(doc) {
  const nomes = new Map();
  for (const e of hiitDaSemana(doc)?.estacoes ?? []) for (const x of e.slots ?? []) nomes.set(x.exercicioId, x.nome);
  return nomes;
}

/**
 * Um alerta de equipamento do HIIT, em texto. Dois tipos, como o servidor grava:
 *  - `slot: null`: um exercício SOZINHO passa do limite (sandbag para 2 alunos);
 *  - `slot: n`: no slot n as estações juntas passam (rodam na mesma música).
 * `nomes` (de `nomesDoHiit`) põe o nome dos exercícios; sem ele, sai sem nome.
 * @param {{recurso: string, usado: number, limite: number, slot: number|null, exercicios?: string[], dias?: string[]}} a
 * @param {Map<string, string>} [nomes]
 */
export function textoAlertaHiit(a, nomes) {
  const r = nomeRecurso(a.recurso);
  const ativos = a.limite === 1 ? '1 ativo' : `${a.limite} ativos`;
  const onde = a.dias?.length ? ` (${rotuloDias(a.dias)})` : '';
  const quem = nomes ? (a.exercicios ?? []).map((id) => nomes.get(id) ?? id).join(' + ') : '';
  // Recurso fixo no espaço (o TRX) em mais de uma estação.
  if (a.estacoes?.length) {
    const estacoes = a.estacoes.map((e) => NOME_ESTACAO_HIIT[e] ?? e);
    const lista = estacoes.length > 1 ? `${estacoes.slice(0, -1).join(', ')} e ${estacoes[estacoes.length - 1]}` : estacoes[0];
    return `${r.um} fica fixo numa estação só, mas o HIIT${onde} o usa em ${a.usado} estações: ${lista}${quem ? ` — ${quem}` : ''}.`;
  }
  if (a.slot === null || a.slot === undefined) {
    return `${quem || 'Um exercício'} no HIIT${onde} precisa sozinho de ${a.usado} ${a.usado === 1 ? r.um : r.varios}: ${ativos}.`;
  }
  return `Limite de ${r.varios} atingido no slot ${a.slot} do HIIT${onde}: ${a.usado} em uso, ${ativos}${quem ? ` — ${quem}` : ''}.`;
}

/**
 * Os slots do HIIT que a tela pinta de vermelho, como 'estacao:indice' (índice
 * a partir de 0). Alerta de slot marca os exercícios daquele slot; alerta de
 * exercício sozinho marca todo slot dele (os dois lados, no unilateral).
 * @param {any} doc @returns {Set<string>}
 */
export function slotsEmAlertaHiit(doc) {
  const marcados = new Set();
  const h = hiitDaSemana(doc);
  if (!h) return marcados;
  for (const a of doc.alertasHiit ?? []) {
    const ids = new Set(a.exercicios ?? []);
    for (const e of h.estacoes) {
      (e.slots ?? []).forEach((x, i) => {
        const noSlot = a.slot === null || a.slot === undefined || a.slot === i + 1;
        if (noSlot && ids.has(x.exercicioId)) marcados.add(`${e.estacao}:${i}`);
      });
    }
  }
  return marcados;
}

/**
 * "Clean com sandbag: precisa de 2 Sandbags, o box tem 1 ativo." — exercício que
 * o gerador deixou fora do sorteio (`geracao.hiitFora`).
 * @param {{nome: string, recurso: string, precisa: number, limite: number}} f
 */
export function textoForaDoHiit(f) {
  return `${f.nome}: precisa de ${f.precisa} ${f.precisa === 1 ? nomeRecurso(f.recurso).um : nomeRecurso(f.recurso).varios}, o box tem ${f.limite} ${f.limite === 1 ? 'ativo' : 'ativos'}.`;
}
