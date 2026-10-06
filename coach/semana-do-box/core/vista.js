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

/**
 * Os recursos SÓ do Cross e do Hyrox, na ordem do servidor (`RECURSOS_CROSS_HYROX`).
 * O resto do que eles usam são as linhas do HIIT e o monocross.
 */
export const RECURSOS_CROSS_HYROX = ['barraOlimpica', 'sled'];

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
  barraOlimpica: { um: 'Barra olímpica', varios: 'Barras olímpicas' },
  sled: { um: 'Sled (trenó)', varios: 'Sleds' },
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
  if (c.noHiit?.length) linhas.push(`Já está no HIIT (${rotuloDias(c.noHiit)}): o dia não repete exercício. A semana não publica assim.`);
  return linhas;
}

/** Os selos curtos da lista de opções. @param {any} c */
export function selosDaOpcao(c) {
  const selos = [];
  if (c.mesmoBloco) selos.push({ id: 'bloco', rotulo: 'já no bloco' });
  if (c.noHiit?.length) selos.push({ id: 'bloco', rotulo: 'no HIIT do dia' });
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
  if (c.mesmoBloco || c.noHiit?.length) return [{ id: 'outro', label: 'Escolher outro exercício' }];
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
  !!(c.mesmoBloco || c.repeticoes?.length || c.semanaAnterior || c.equipamento?.length || c.instanciaDiferente || c.noHiit?.length);

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
 * `grupo` separa o bloco H ('forca'), o HIIT ('hiit') e o que é só do Cross e do
 * Hyrox ('crossHyrox'), na ordem do servidor.
 * @param {any} doc
 * @returns {{recurso: string, grupo: 'forca'|'hiit'|'crossHyrox', nome: string, total: number, emManutencao: number, observacao: string, ativos: number|null}[]}
 */
export function linhasDoInventario(doc) {
  const eq = doc?.equipamentos;
  if (!eq || typeof eq !== 'object') return [];
  const grupos = /** @type {const} */ ([['forca', RECURSOS], ['hiit', RECURSOS_HIIT], ['crossHyrox', RECURSOS_CROSS_HYROX]]);
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
 * O documento já tem a forma de agora (os recursos do H, do HIIT e do
 * Cross/Hyrox, e a turma)? Inventário gravado antes disso é NORMALIZADO pelo
 * servidor (`salvarInventario({})`): é ele quem sabe os números de fábrica, e a
 * tela não os repete.
 * @param {any} doc
 */
export function inventarioCompleto(doc) {
  const eq = doc?.equipamentos;
  return !!eq && typeof eq === 'object' && turmaDoInventario(doc) !== null
    && [...RECURSOS, ...RECURSOS_HIIT, ...RECURSOS_CROSS_HYROX].every((r) => eq[r] && Number.isInteger(eq[r].total));
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
 * O mesmo vale para o WOD e o Hyrox.
 * @param {{semanaId: string, status: string, alertas?: any[], alertasHiit?: any[], alertasCross?: any[], alertasHyrox?: any[]}} s
 */
export function semanaAfetada(s) {
  const publicada = s.status === 'publicado';
  return {
    semanaId: s.semanaId,
    titulo: `Semana ${s.semanaId} · ${publicada ? 'publicada' : 'rascunho'}`,
    alertas: [
      ...(s.alertas ?? []).map(textoAlerta),
      ...(s.alertasHiit ?? []).map((a) => textoAlertaHiit(a)),
      ...(s.alertasCross ?? []).map((a) => textoAlertaCross(a)),
      ...(s.alertasHyrox ?? []).map((a) => textoAlertaHyrox(a)),
    ],
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

/** Total de alertas da semana (bloco H, HIIT, WOD e Hyrox) — o "⚠ n alertas" da lista. @param {any} doc */
export function totalDeAlertas(doc) {
  return ['alertas', 'alertasHiit', 'alertasCross', 'alertasHyrox'].reduce((n, k) => n + (doc?.[k] ?? []).length, 0);
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

/* ───────────────────────────── troca no HIIT ───────────────────────────── */

/**
 * Dá para trocar exercício do HIIT? ESPELHA a trava do servidor (`hiitTravado`
 * em `edicao-hiit.ts`) só para decidir se a tela mostra o botão: semana que já
 * foi publicada não muda o HIIT se a sexta ou o sábado já passaram.
 * @param {any} doc @param {string} hojeIso
 */
export function hiitEditavel(doc, hojeIso) {
  if (!hiitDaSemana(doc)) return false;
  if (doc.status !== 'publicado' && !doc.publicadoEm) return true;
  const datas = datasIsoDosDias(doc.dataInicio);
  return !DIAS.some((d) => Array.isArray(doc.dias?.[d.id]?.hiit?.estacoes) && datas[d.id] && datas[d.id] < hojeIso);
}

/**
 * Os `dias` para `salvarSemanaBox` com UMA troca no HIIT, aplicada em todo dia
 * que tem o HIIT (sexta e sábado). O novo exercício ocupa exatamente os slots
 * do antigo (`slots`, vindos do servidor). Só monta o pedido: o servidor
 * revalida tudo (`lerHiit`) e recalcula os alertas.
 * @param {any} doc @param {{estacao: string, slots: number[], exercicioId: string}} troca
 */
export function diasComHiitTrocado(doc, troca) {
  const dias = diasParaSalvar(doc);
  for (const d of DIAS) {
    const estacoes = doc?.dias?.[d.id]?.hiit?.estacoes;
    if (!Array.isArray(estacoes)) continue;
    dias[d.id].hiit = {
      estacoes: estacoes.map((e) => ({
        estacao: e.estacao,
        slots: (e.slots ?? []).map((x, i) => ({
          exercicioId: e.estacao === troca.estacao && troca.slots.includes(i + 1) ? troca.exercicioId : x.exercicioId,
        })),
      })),
    };
  }
  return dias;
}

/**
 * Os selos de uma opção da troca do HIIT. Os de bloqueio dizem POR QUE a opção
 * está desabilitada; o do rodízio só avisa.
 * @param {{unilateral: boolean, conflitos: any}} opcao
 */
export function selosDaOpcaoHiit(opcao) {
  const c = opcao.conflitos;
  const selos = [];
  if (c.noHiit) selos.push({ id: 'bloco', rotulo: 'já no HIIT' });
  if (c.tamanhoDiferente) selos.push({ id: 'bloco', rotulo: opcao.unilateral ? 'ocupa 2 slots' : 'ocupa 1 slot' });
  for (const e of c.equipamento ?? []) {
    const r = nomeRecurso(e.recurso);
    selos.push({
      id: 'equipamento',
      rotulo: e.slot === null || e.slot === undefined
        ? `🔧 ${e.usado} ${e.usado === 1 ? r.um : r.varios}, ${e.limite} ${e.limite === 1 ? 'ativo' : 'ativos'}`
        : `🔧 slot ${e.slot}: ${e.usado} ${r.varios}`,
    });
  }
  for (const f of c.fixoEmOutraEstacao ?? []) {
    selos.push({ id: 'equipamento', rotulo: `📍 ${nomeRecurso(f.recurso).um} no ${(f.estacoes ?? []).map((e) => NOME_ESTACAO_HIIT[e] ?? e).join(', ')}` });
  }
  for (const b of c.noBlocoDoDia ?? []) selos.push({ id: 'bloco', rotulo: `no ${b.sessao}` });
  if (c.semanaAnterior) selos.push({ id: 'rodizio', rotulo: '↺ semana passada' });
  return selos;
}

/**
 * Como seguir depois de escolher uma opção do HIIT. Bloqueada não chega aqui
 * (está desabilitada na lista). Só o rodízio pergunta: manter ou escolher outro.
 * @param {{conflitos: any, bloqueada?: boolean}} opcao
 * @returns {{id: string, label: string, secundaria?: boolean}[]}
 */
export function acoesDoConflitoHiit(opcao) {
  if (opcao.bloqueada) return [{ id: 'outro', label: 'Escolher outro exercício' }];
  if (!opcao.conflitos?.semanaAnterior) return [];
  return [
    { id: 'manter', label: 'Manter (quebra o rodízio)' },
    { id: 'outro', label: 'Escolher outro exercício', secundaria: true },
  ];
}

/** 'slot 1' / 'slots 3 e 4' — onde a vaga fica na estação. @param {number[]} slots */
export function rotuloSlots(slots) {
  return slots.length > 1 ? `slots ${slots.slice(0, -1).join(', ')} e ${slots[slots.length - 1]}` : `slot ${slots[0]}`;
}


/* ───────────────────────────── Cross e Hyrox (comum) ───────────────────────────── */

/**
 * Os dias que têm o conteúdo (`cross`: o WOD da terça; `hyrox`: a quinta), com o
 * papel de cada um. `[]` em semana gerada antes dos geradores do Cross e do Hyrox.
 * @param {any} doc @param {'cross'|'hyrox'} chave
 * @returns {{id: string, nome: string, papel: string}[]}
 */
function diasDoConteudo(doc, chave) {
  const lista = chave === 'cross' ? 'movimentos' : 'estacoes';
  const modalidade = chave === 'cross' ? 'Cross' : 'Hyrox';
  return DIAS.filter((d) => Array.isArray(doc?.dias?.[d.id]?.[chave]?.[lista])).map((d) => {
    const b = (doc.dias[d.id].blocosMetabolicos ?? []).find((x) => x?.modalidade === modalidade);
    return { id: d.id, nome: d.nome, papel: b?.papel === 'principal' ? 'principal' : 'alternativa' };
  });
}

/**
 * Dá para trocar no WOD / no Hyrox? ESPELHA a trava do servidor
 * (`conteudoTravado` em `edicao-cross.ts`) só para decidir se a tela mostra o
 * botão: semana que já foi publicada não muda num dia que já passou.
 * @param {any} doc @param {'cross'|'hyrox'} chave @param {string} hojeIso
 */
export function conteudoEditavel(doc, chave, hojeIso) {
  const dias = diasDoConteudo(doc, chave);
  if (!dias.length) return false;
  if (doc.status !== 'publicado' && !doc.publicadoEm) return true;
  const datas = datasIsoDosDias(doc.dataInicio);
  return !dias.some((d) => datas[d.id] && datas[d.id] < hojeIso);
}

/** "50 s", "1 min", "2 min 30 s". @param {number} seg */
export function textoSegundos(seg) {
  if (seg < 60) return `${seg} s`;
  const min = Math.floor(seg / 60);
  const resto = seg % 60;
  return resto ? `${min} min ${resto} s` : `${min} min`;
}

/** A unidade curta depois do número, por unidade do servidor. @type {Record<string, string>} */
const UNIDADE_CURTA = { reps: '', metros: ' m', calorias: ' cal', segundos: ' s' };

/* ───────────────────────────── WOD do Cross ───────────────────────────── */

/** Nome de cada padrão do WOD (`PADROES_CROSS` do servidor). @type {Record<string, string>} */
export const NOME_PADRAO_CROSS = {
  cardio: 'Cardio', agachar: 'Agachar', quadril: 'Quadril', empurrar: 'Empurrar',
  puxar: 'Puxar', corpo_todo: 'Corpo todo', olimpico: 'Olímpico', core: 'Core',
};

/**
 * O WOD da semana (gravado em todo dia com Cross; hoje, só a terça) e os dias
 * dele. `null` em semana gerada antes do gerador do Cross — o dia fica como era.
 * @param {any} doc
 * @returns {{wod: any, dias: {id: string, nome: string, papel: string}[]}|null}
 */
export function wodDaSemana(doc) {
  const dias = diasDoConteudo(doc, 'cross');
  return dias.length ? { wod: doc.dias[dias[0].id].cross, dias } : null;
}

/**
 * O cabeçalho do WOD: 'AMRAP · 16 min', 'For Time · 4 rodadas · cap 16 min',
 * 'EMOM · 15 min (5 voltas)', 'Chipper · cap 20 min'.
 * @param {{formato: string, minutos: number, rodadas: number|null}} w
 */
export function tituloWod(w) {
  if (w.formato === 'AMRAP') return `AMRAP · ${w.minutos} min`;
  if (w.formato === 'EMOM') return `EMOM · ${w.minutos} min${w.rodadas ? ` (${w.rodadas} ${w.rodadas === 1 ? 'volta' : 'voltas'})` : ''}`;
  if (w.formato === 'For Time') return `For Time · ${w.rodadas} ${w.rodadas === 1 ? 'rodada' : 'rodadas'} · cap ${w.minutos} min`;
  return `${w.formato} · cap ${w.minutos} min`;
}

/**
 * A quantidade de um movimento: '15', '200 m', '12 cal', '30 s', '10 por lado'.
 * @param {{unidade: string, porLado?: boolean}} m @param {number} n
 */
export function quantidadeCross(m, n) {
  return `${n}${UNIDADE_CURTA[m.unidade] ?? ''}${m.porLado ? ' por lado' : ''}`;
}

/**
 * Alunos fazendo CADA movimento ao mesmo tempo. ESPELHA `alunosPorMovimento`
 * do servidor (`conta-cross.ts`) só para a tela explicar o número.
 * @param {string} formato @param {number} turma @param {number} movimentos
 */
export function alunosPorMovimento(formato, turma, movimentos) {
  if (formato === 'EMOM') return Math.max(1, turma);
  return Math.max(1, Math.ceil(turma / Math.max(1, movimentos)));
}

/**
 * Como o equipamento do WOD foi contado (a regra mista), para o rodapé do cartão.
 * @param {{formato: string, movimentos: any[]}} w @param {number} [turma]
 */
export function textoContaWod(w, turma) {
  if (!Number.isInteger(turma)) return '';
  if (w.formato === 'EMOM') {
    return `No EMOM a turma inteira (${turma}) faz o mesmo movimento no mesmo minuto: cada movimento precisa de equipamento para todos.`;
  }
  const n = alunosPorMovimento(w.formato, /** @type {number} */ (turma), w.movimentos.length);
  return `No ${w.formato} a turma de ${turma} se espalha pelo WOD: até ${n} aluno${n > 1 ? 's' : ''} por movimento, e os movimentos somam.`;
}

/** id → nome dos movimentos do WOD gravado. @param {any} doc */
export function nomesDoWod(doc) {
  return new Map((wodDaSemana(doc)?.wod.movimentos ?? []).map((m) => [m.exercicioId, m.nome]));
}

/**
 * Um alerta de equipamento do WOD em texto. `nomes` (de `nomesDoWod`) põe os
 * movimentos; sem ele (a resposta do inventário), sai sem nome.
 * @param {{recurso: string, usado: number, limite: number, exercicios?: string[], dias?: string[]}} a
 * @param {Map<string, string>} [nomes]
 */
export function textoAlertaCross(a, nomes) {
  const r = nomeRecurso(a.recurso);
  const ativos = a.limite === 1 ? '1 ativo' : `${a.limite} ativos`;
  const onde = a.dias?.length ? ` (${rotuloDias(a.dias)})` : '';
  const quem = nomes ? (a.exercicios ?? []).map((id) => nomes.get(id) ?? id).join(' + ') : '';
  if (a.bloco === 'tecnica') {
    return `Limite de ${r.varios} atingido na Técnica / Força${onde}: ${a.usado} em uso com a turma em duplas, ${ativos}${quem ? ` — ${quem}` : ''}.`;
  }
  return `Limite de ${r.varios} atingido no WOD${onde}: ${a.usado} em uso, ${ativos}${quem ? ` — ${quem}` : ''}.`;
}

/** Os movimentos do WOD que a tela pinta de vermelho (ids) — só os alertas do WOD. @param {any} doc */
export function movimentosEmAlerta(doc) {
  return new Set((doc?.alertasCross ?? []).filter((a) => !a.bloco).flatMap((a) => a.exercicios ?? []));
}

/* ── Técnica / Força ── */

/** Nome de cada tipo de bloco (`NOME_TIPO_TECNICA` do servidor). @type {Record<string, string>} */
export const NOME_TIPO_TECNICA = { tecnica: 'Técnica', forca: 'Força', skill: 'Skill' };

/** Nome de cada categoria de foco, na ordem de prioridade do servidor (`CATEGORIAS_FOCO`). @type {Record<string, string>} */
export const NOME_CATEGORIA_FOCO = { olimpico: 'Olímpico', barra: 'Barra', kettlebell: 'Kettlebell', ginastica: 'Ginástica' };

/** 'Power clean (barra) · Técnica · 10 min'. @param {{nome: string, tipo: string, minutos: number}} t */
export function tituloTecnica(t) {
  return `${t.nome} · ${NOME_TIPO_TECNICA[t.tipo] ?? t.tipo} · ${t.minutos} min`;
}

/**
 * Unidades de equipamento na Técnica / Força: duplas revezando, turma ÷ 2.
 * ESPELHA `unidadesNaTecnica` do servidor (`conta-cross.ts`) só para o rodapé.
 * @param {number} turma
 */
export function unidadesNaTecnica(turma) {
  return Math.max(1, Math.ceil(turma / 2));
}

/** Os alertas de equipamento da Técnica / Força. @param {any} doc */
export function alertasDaTecnica(doc) {
  return (doc?.alertasCross ?? []).filter((a) => a.bloco === 'tecnica');
}

/**
 * Os `dias` para `salvarSemanaBox` com OUTRO foco da Técnica / Força (um dos
 * movimentos do WOD que servem de foco — `tecnica.alternativas`). O WOD fica.
 * @param {any} doc @param {string} exercicioId
 */
export function diasComFocoTrocado(doc, exercicioId) {
  const dias = diasParaSalvar(doc);
  for (const d of DIAS) {
    const w = doc?.dias?.[d.id]?.cross;
    if (!Array.isArray(w?.movimentos)) continue;
    dias[d.id].cross = {
      formato: w.formato, minutos: w.minutos, rodadas: w.rodadas,
      movimentos: w.movimentos.map((m) => ({ exercicioId: m.exercicioId })),
      tecnica: { exercicioId },
    };
  }
  return dias;
}

/**
 * Os `dias` para `salvarSemanaBox` com UM movimento do WOD trocado, em todo dia
 * que tem o WOD. Formato, tempo e a posição ficam; o servidor recalcula a
 * prescrição (`lerCross`). O HIIT e o Hyrox não vão: o servidor mantém os gravados.
 * @param {any} doc @param {number} posicao 1…n @param {string} exercicioId
 */
export function diasComCrossTrocado(doc, posicao, exercicioId) {
  const dias = diasParaSalvar(doc);
  for (const d of DIAS) {
    const w = doc?.dias?.[d.id]?.cross;
    if (!Array.isArray(w?.movimentos)) continue;
    const movimentos = w.movimentos.map((m, i) => ({ exercicioId: i === posicao - 1 ? exercicioId : m.exercicioId }));
    // O foco da Técnica / Força FICA se continuar no WOD; se saiu, o servidor escolhe outro.
    const foco = w.tecnica?.exercicioId;
    dias[d.id].cross = {
      formato: w.formato, minutos: w.minutos, rodadas: w.rodadas, movimentos,
      ...(foco && movimentos.some((m) => m.exercicioId === foco) ? { tecnica: { exercicioId: foco } } : {}),
    };
  }
  return dias;
}

/**
 * Os selos de uma opção da troca no WOD. Os de bloqueio dizem POR QUE a opção
 * está desabilitada; o do rodízio só avisa.
 * @param {{conflitos: any}} opcao
 */
export function selosDaOpcaoCross(opcao) {
  const c = opcao.conflitos;
  const selos = [];
  if (c.noWod) selos.push({ id: 'bloco', rotulo: 'já no WOD' });
  if (c.padraoRepetido) selos.push({ id: 'bloco', rotulo: `mesmo padrão de ${c.padraoRepetido}` });
  if (c.tiraOCardio) selos.push({ id: 'bloco', rotulo: 'tira o cardio' });
  if (c.tiraATecnica) selos.push({ id: 'bloco', rotulo: 'tira a Técnica / Força' });
  for (const r of c.equipamento ?? []) selos.push({ id: 'equipamento', rotulo: `🔧 ${nomeRecurso(r).varios}` });
  if (c.semanaAnterior) selos.push({ id: 'rodizio', rotulo: '↺ semana passada' });
  if (c.viraFoco) selos.push({ id: 'foco', rotulo: '★ vira o foco da técnica' });
  return selos;
}

/** Como seguir depois de escolher uma opção do WOD: a MESMA regra do HIIT (só o rodízio pergunta). */
export const acoesDoConflitoCross = acoesDoConflitoHiit;

/* ───────────────────────────── Hyrox ───────────────────────────── */

/** Os 4 níveis, na ordem do servidor (`NIVEIS_HYROX`), com o nome e a coluna curta da tabela. */
export const NIVEIS_HYROX = [
  { id: 'iniciante', nome: 'Iniciante', curto: 'Ini' },
  { id: 'intermediario', nome: 'Intermediário', curto: 'Int' },
  { id: 'avancado', nome: 'Avançado', curto: 'Av' },
  { id: 'competicao', nome: 'Competição', curto: 'Comp' },
];

/**
 * As estações sem substituta (`substituta: null` em `functions/src/catalogo-hyrox.ts`):
 * nelas a tela não mostra "trocar". O teste de paridade confere a lista.
 */
export const ESTACOES_HYROX_SEM_SUBSTITUTA = ['burpee_broad_jump'];

/** A unidade de uma estação, para a tabela. @type {Record<string, string>} */
export const UNIDADE_HYROX = { reps: 'reps', metros: 'm', calorias: 'cal', segundos: 's' };

/**
 * O Hyrox da semana (gravado em todo dia com Hyrox; hoje, só a quinta) e os dias
 * dele. `null` em semana gerada antes do gerador do Hyrox.
 * @param {any} doc
 * @returns {{hyrox: any, dias: {id: string, nome: string, papel: string}[]}|null}
 */
export function hyroxDaSemana(doc) {
  const dias = diasDoConteudo(doc, 'hyrox');
  return dias.length ? { hyrox: doc.dias[dias[0].id].hyrox, dias } : null;
}

/** 'Compromised running · 2 rodadas'. @param {{nome: string, rodadas: number}} h */
export function tituloHyrox(h) {
  return `${h.nome}${h.rodadas > 1 ? ` · ${h.rodadas} rodadas` : ''}`;
}

/**
 * As duas linhas da corrida na tabela (por nível): os metros e, como
 * alternativa, a air bike.
 * @param {{corrida: Record<string, {metros: number, bikeSeg: number}>}} h
 */
export function linhasDaCorrida(h) {
  return [
    { rotulo: 'Corrida', unidade: 'm', valores: NIVEIS_HYROX.map((n) => String(h.corrida?.[n.id]?.metros ?? '—')) },
    {
      rotulo: 'ou air bike', unidade: '',
      valores: NIVEIS_HYROX.map((n) => (Number.isFinite(h.corrida?.[n.id]?.bikeSeg) ? textoSegundos(h.corrida[n.id].bikeSeg) : '—')),
    },
  ];
}

/** A estação tem substituta (e a tela mostra "trocar")? @param {string} estacao */
export function temSubstitutaHyrox(estacao) {
  return !ESTACOES_HYROX_SEM_SUBSTITUTA.includes(estacao);
}

/**
 * Um alerta do Hyrox em texto: a estação sem o equipamento que pede. `nome` é
 * o nome gravado da estação; sem ele (a resposta do inventário), sai o id.
 * @param {{estacao: string, recurso: string, precisa: number, limite: number, temSubstituta?: boolean, dias?: string[]}} a
 * @param {string} [nome]
 */
export function textoAlertaHyrox(a, nome) {
  const r = nomeRecurso(a.recurso);
  const onde = a.dias?.length ? ` (${rotuloDias(a.dias)})` : '';
  const ativos = a.limite === 1 ? '1 ativo' : `${a.limite} ativos`;
  return `No Hyrox${onde}, ${nome || a.estacao} precisa de ${a.precisa} ${a.precisa === 1 ? r.um : r.varios}, e o box tem ${ativos}`
    + `${a.temSubstituta ? ' — troque pela substituta.' : '.'}`;
}

/** As estações do Hyrox que a tela pinta de vermelho (ids). @param {any} doc */
export function estacoesEmAlerta(doc) {
  return new Set((doc?.alertasHyrox ?? []).map((a) => a.estacao));
}

/**
 * Os `dias` para `salvarSemanaBox` com UMA estação do Hyrox trocada (para a
 * substituta, ou de volta à da prova), em todo dia que tem o Hyrox. O servidor
 * recalcula a prescrição com o formato (`lerHyrox`).
 * @param {any} doc @param {string} estacao @param {boolean} substituta
 */
export function diasComHyroxTrocado(doc, estacao, substituta) {
  const dias = diasParaSalvar(doc);
  for (const d of DIAS) {
    const h = doc?.dias?.[d.id]?.hyrox;
    if (!Array.isArray(h?.estacoes)) continue;
    dias[d.id].hyrox = {
      formato: h.formato,
      estacoes: h.estacoes.map((e) => ({ estacao: e.estacao, substituta: e.estacao === estacao ? substituta : !!e.substituta })),
    };
  }
  return dias;
}
