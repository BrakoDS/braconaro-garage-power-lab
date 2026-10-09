// @ts-check
/**
 * O motor de automação de mensagens — as regras, puras.
 *
 * O motor SUGERE mensagens de WhatsApp; quem envia é o coach, num clique
 * (api.whatsapp.com). Nada aqui grava, envia ou desenha: cada função recebe o estado e
 * devolve o resultado, sem alterar o que recebeu.
 *
 * As sugestões nascem de duas fontes:
 *
 *   AÇÃO — algo que o coach acabou de fazer e ficou no log (registro.js emite
 *   'acao-registrada'). Um pagamento vira um RECIBO. A sugestão entra na fila
 *   (`pendentes`) e espera o coach, porque o momento da ação não se repete.
 *
 *   CONDIÇÃO — um fato que passa a valer com a data. A conta do mês em aberto
 *   não tem clique nenhum que a dispare: ela é VARRIDA do estado do box a cada
 *   desenho (`sugestoesDaVarredura`) e nunca fica guardada. Antes do
 *   vencimento (ou no dia) vira LEMBRETE; depois, COBRANÇA VENCIDA — duas
 *   chaves, então o aluno recebe no máximo um de cada. A baixa tira os dois da
 *   fila sozinha: a varredura seguinte já não encontra a conta.
 *
 * O ANTI-SPAM é a chave de cada sugestão, `gatilho:aluno:período` (um
 * lembrete e uma cobrança por aluno por mês, um recibo por aluno por mês pago). Enviada ou
 * descartada, a chave vai para `feitas` e a sugestão não aparece de novo —
 * nem vinda de outra varredura, nem de uma segunda baixa do mesmo mês, nem de
 * outro aparelho (as `feitas` sobem para a nuvem e se mesclam: `planoDeSync`).
 *
 * O que fica guardado é o mínimo: o id do aluno, o gatilho e os números. O
 * nome, o telefone e o texto saem da ficha NA HORA de mostrar (`visiveis`) —
 * telefone trocado vale na hora, e a fila não vira uma cópia do cadastro.
 */
import { cobrancasDoMes, msgCobranca, itensDaConta, itensFecham, linhasDosItens } from './financeiro-regras.js?v=13';
import { MESES_FIN, brl } from './financeiro-aluno.js?v=13';

/**
 * @typedef {'cobranca-vencida'|'cobranca-a-vencer'|'recibo'} Gatilho
 * @typedef {{ chave: string, gatilho: Gatilho, alunoId: string, criadaEm: number, dados: Record<string, any> }} Sugestao
 *   criadaEm: quando a ação aconteceu (0 nas de condição — elas valem enquanto a condição vale)
 * @typedef {{ status: 'enviada'|'descartada', em: number }} Feita
 * @typedef {{ pendentes: Sugestao[], feitas: Record<string, Feita> }} Fila
 * @typedef {Sugestao & { nome: string, telefone: string, temTelefone: boolean, texto: string, rotulo: string }} Mensagem
 * @typedef {{ tipo: string, aluno: any, dados?: Record<string, any> }} Acao o que 'acao-registrada' entrega
 */

const DIA = 86400000;

/** Os gatilhos que existem, na ordem em que a fila os mostra. */
export const GATILHOS = Object.freeze({
  'cobranca-vencida': Object.freeze({ rotulo: 'Cobrança vencida', fonte: 'condicao', grupo: 'Cobranças vencidas' }),
  'cobranca-a-vencer': Object.freeze({ rotulo: 'Lembrete de vencimento', fonte: 'condicao', grupo: 'Lembretes do mês (a vencer)' }),
  'recibo': Object.freeze({ rotulo: 'Recibo de pagamento', fonte: 'acao', grupo: 'Recibos de pagamento' }),
});
const ORDEM = /** @type {Gatilho[]} */ (Object.keys(GATILHOS));

/** Uma sugestão de AÇÃO esperando mais que isso já perdeu a hora (o recibo de 10 dias atrás). */
export const PRAZO_PENDENTE = 7 * DIA;
/**
 * Quanto tempo uma chave enviada/descartada é lembrada. Tem de ser MAIOR que o
 * período da chave mais longa (um mês): esquecer a cobrança de outubro ainda
 * em outubro faria a varredura sugeri-la de novo.
 */
export const GUARDA_FEITAS = 120 * DIA;

/** @param {Gatilho} gatilho @param {string} alunoId @param {string} periodo */
export const chaveDe = (gatilho, alunoId, periodo) => `${gatilho}:${alunoId}:${periodo}`;

/** @returns {Fila} */
export const filaVazia = () => ({ pendentes: [], feitas: {} });

/** A chave já foi enviada ou descartada? @param {Fila} fila @param {string} chave */
export const foiFeita = (fila, chave) => Object.prototype.hasOwnProperty.call(fila.feitas, chave);

/* ============================================================
   As fontes
   ============================================================ */

/**
 * CONDIÇÃO — as contas em aberto do mês de hoje, uma sugestão por conta (a
 * mesma lista e o mesmo valor da tela Cobranças: `cobrancasDoMes`):
 *   - vencida (venceu ontem ou antes) → 'cobranca-vencida';
 *   - vence hoje ou mais adiante no mês → 'cobranca-a-vencer' (o lembrete).
 * Paga, cortesia (R$ 0), dependente com a conta no responsável e inativo
 * ficam de fora — é a regra das Cobranças.
 * @param {any[]} todos @param {string} hojeIso
 * @returns {Sugestao[]}
 */
export function sugestoesDaVarredura(todos, hojeIso) {
  const mesId = hojeIso.slice(0, 7);
  const { vencidas, emBreve, aVencer } = cobrancasDoMes(todos, mesId, hojeIso);
  /** @param {Gatilho} gatilho @returns {(c: import('./financeiro-regras.js').Cobranca) => Sugestao} */
  const sugestao = (gatilho) => ({ a, dias, valor, soMensalidade }) => ({
    chave: chaveDe(gatilho, String(a.id), mesId),
    gatilho,
    alunoId: String(a.id),
    criadaEm: 0,
    dados: { mesId, valor, dias, soMensalidade },
  });
  return [...vencidas.map(sugestao('cobranca-vencida')), ...[...emBreve, ...aVencer].map(sugestao('cobranca-a-vencer'))];
}

/**
 * AÇÃO — a sugestão que uma ação do log merece, ou null. Hoje: o pagamento com
 * valor vira recibo (a baixa de uma cortesia, R$ 0, não).
 * @param {Acao} acao @param {number} agora
 * @returns {Sugestao | null}
 */
export function sugestaoDaAcao(acao, agora) {
  if (!acao || acao.tipo !== 'pagamento' || !acao.aluno || acao.aluno.id == null) return null;
  const d = acao.dados || {};
  if (typeof d.mesId !== 'string' || !(Number(d.valor) > 0)) return null;
  return {
    chave: chaveDe('recibo', String(acao.aluno.id), d.mesId),
    gatilho: 'recibo',
    alunoId: String(acao.aluno.id),
    criadaEm: agora,
    dados: { mesId: d.mesId, valor: Number(d.valor), soMensalidade: d.soMensalidade !== false },
  };
}

/* ============================================================
   A fila
   ============================================================ */

/**
 * A fila depois de uma ação. Devolve a MESMA fila quando nada muda.
 *  - pagamento: o recibo entra — a não ser que já tenha sido enviado ou
 *    descartado (desfazer e refazer a baixa não manda um segundo recibo); se
 *    já estava esperando, é trocado pelo novo (o valor pode ter mudado);
 *  - pagamento desfeito: o recibo daquele mês, se ainda esperava, sai.
 * @param {Fila} fila @param {Acao} acao @param {number} agora
 * @returns {Fila}
 */
export function aoAgir(fila, acao, agora) {
  if (acao && acao.tipo === 'pagamento-desfeito' && acao.aluno && acao.dados && typeof acao.dados.mesId === 'string') {
    const chave = chaveDe('recibo', String(acao.aluno.id), acao.dados.mesId);
    if (!fila.pendentes.some((s) => s.chave === chave)) return fila;
    return { ...fila, pendentes: fila.pendentes.filter((s) => s.chave !== chave) };
  }
  const s = sugestaoDaAcao(acao, agora);
  if (!s || foiFeita(fila, s.chave)) return fila;
  return { ...fila, pendentes: [...fila.pendentes.filter((x) => x.chave !== s.chave), s] };
}

/**
 * Marca uma chave como enviada ou descartada. Devolve a MESMA fila se a chave
 * já estava marcada — o primeiro clique vale, o segundo não faz nada (é o que
 * impede o duplo toque de abrir o WhatsApp duas vezes).
 * @param {Fila} fila @param {string} chave @param {'enviada'|'descartada'} status @param {number} agora
 * @returns {Fila}
 */
export function marcar(fila, chave, status, agora) {
  if (!chave || foiFeita(fila, chave) || (status !== 'enviada' && status !== 'descartada')) return fila;
  return {
    pendentes: fila.pendentes.filter((s) => s.chave !== chave),
    feitas: { ...fila.feitas, [chave]: { status, em: agora } },
  };
}

/**
 * Esquece o que passou do prazo: a sugestão de ação velha e a chave feita há
 * mais de `GUARDA_FEITAS`.
 * @param {Fila} fila @param {number} agora
 * @returns {Fila}
 */
export function podar(fila, agora) {
  const feitas = /** @type {Record<string, Feita>} */ ({});
  for (const [k, f] of Object.entries(fila.feitas)) if (agora - f.em <= GUARDA_FEITAS) feitas[k] = f;
  return { pendentes: fila.pendentes.filter((s) => agora - s.criadaEm <= PRAZO_PENDENTE), feitas };
}

const ehFeita = (f) => !!f && typeof f === 'object' && (f.status === 'enviada' || f.status === 'descartada') && Number.isFinite(f.em);
const ehSugestao = (s) => !!s && typeof s === 'object' && typeof s.chave === 'string' && s.chave !== ''
  && Object.prototype.hasOwnProperty.call(GATILHOS, s.gatilho) && typeof s.alunoId === 'string'
  && Number.isFinite(s.criadaEm) && !!s.dados && typeof s.dados === 'object';

/**
 * A fila como veio do armazenamento, só com o que é válido (o localStorage
 * pode ter lixo, ou uma versão antiga). Nunca lança.
 * @param {any} bruta @returns {Fila}
 */
export function normalizarFila(bruta) {
  const f = filaVazia();
  if (!bruta || typeof bruta !== 'object') return f;
  if (bruta.feitas && typeof bruta.feitas === 'object') {
    for (const [k, v] of Object.entries(bruta.feitas)) if (k && ehFeita(v)) f.feitas[k] = { status: v.status, em: v.em };
  }
  const vistas = new Set();
  for (const s of Array.isArray(bruta.pendentes) ? bruta.pendentes : []) {
    if (!ehSugestao(s) || vistas.has(s.chave) || foiFeita(f, s.chave)) continue;
    vistas.add(s.chave);
    f.pendentes.push(s);
  }
  return f;
}

/* ============================================================
   O que o coach vê
   ============================================================ */

/**
 * O recibo de WhatsApp de uma baixa — a mesma voz do lembrete de cobrança.
 * @param {any} a @param {string} mesId @param {number} valor @param {boolean} [soMensalidade]
 */
export function msgRecibo(a, mesId, valor, soMensalidade = true) {
  const nome = (a.nome || '').trim().split(/\s+/)[0] || '';
  const mesNome = MESES_FIN[Number(mesId.split('-')[1]) - 1];
  return `Olá, ${nome}! ✅ Recebi o pagamento da ${soMensalidade ? 'mensalidade' : 'conta'} de ${mesNome} (${brl(valor)}). Obrigado pela confiança — bons treinos! 💪`;
}

/**
 * O recibo com o extrato da conta (quando há consumo) — as mesmas linhas do
 * lembrete de cobrança (`linhasDosItens`, financeiro-regras.js).
 * @param {any} a @param {string} mesId @param {number} valor @param {import('./financeiro-regras.js').ItemDaConta[]} itens
 */
export function msgReciboDetalhado(a, mesId, valor, itens) {
  const nome = (a.nome || '').trim().split(/\s+/)[0] || '';
  const mesNome = MESES_FIN[Number(mesId.split('-')[1]) - 1];
  return `Olá, ${nome}! ✅ Recebi o pagamento da sua conta de ${mesNome} (${brl(valor)}):\n${linhasDosItens(itens)}\nObrigado pela confiança — bons treinos! 💪`;
}

/**
 * O texto de uma sugestão para a ficha. A cobrança é o MESMO `msgCobranca`
 * do botão da tela Cobranças, com o mesmo extrato. Com consumo na conta, o
 * texto detalha os itens — desde que eles somem o valor da sugestão: o recibo
 * guarda o valor da HORA da baixa, e se a conta mudou depois, um extrato que
 * não fecha com o total confundiria o aluno (vale o texto curto).
 * @param {Sugestao} s @param {any} a @param {any[]} [todos] todos os alunos (os dependentes entram na conta)
 */
export function textoDa(s, a, todos = [a]) {
  const d = s.dados;
  const itens = itensDaConta(a, d.mesId, todos);
  if (s.gatilho === 'cobranca-vencida' || s.gatilho === 'cobranca-a-vencer') return msgCobranca(a, d.mesId, d.valor, d.dias, d.soMensalidade, itens);
  return itens && itensFecham(itens, d.valor) ? msgReciboDetalhado(a, d.mesId, d.valor, itens) : msgRecibo(a, d.mesId, d.valor, d.soMensalidade);
}

/**
 * O que a fila mostra: as condições varridas agora e as ações esperando, sem
 * nada enviado ou descartado, sem chave repetida e sem aluno que não existe
 * mais — já com nome, telefone e texto tirados da ficha atual. Em ordem: os
 * gatilhos na ordem de `GATILHOS`; a cobrança mais atrasada e o lembrete que
 * vence antes primeiro; o
 * recibo mais novo primeiro.
 * @param {Fila} fila @param {Sugestao[]} varredura @param {any[]} todos
 * @returns {Mensagem[]}
 */
export function visiveis(fila, varredura, todos) {
  const porId = new Map(todos.map((a) => [String(a.id), a]));
  const vistas = new Set();
  /** @type {Mensagem[]} */
  const saida = [];
  for (const s of [...varredura, ...fila.pendentes]) {
    if (vistas.has(s.chave) || foiFeita(fila, s.chave)) continue;
    const a = porId.get(s.alunoId);
    if (!a) continue;
    vistas.add(s.chave);
    const telefone = String(a.telefone || '').replace(/\D/g, '');
    saida.push({ ...s, nome: a.nome || 'Sem nome', telefone, temTelefone: telefone.length >= 10, texto: textoDa(s, a, todos), rotulo: GATILHOS[s.gatilho].rotulo });
  }
  return saida.sort((x, y) => ORDEM.indexOf(x.gatilho) - ORDEM.indexOf(y.gatilho)
    || (GATILHOS[x.gatilho].fonte === 'condicao' ? x.dados.dias - y.dados.dias : y.criadaEm - x.criadaEm)
    || (x.chave < y.chave ? -1 : x.chave > y.chave ? 1 : 0));
}

/* ============================================================
   Mais de um aparelho
   ============================================================ */

/**
 * Junta as chaves feitas de dois lugares (este aparelho e a nuvem). Ninguém
 * perde nada: a união das chaves. Na mesma chave, "enviada" vence
 * "descartada" (mandar é o fato mais forte) e, no empate, vale a mais antiga.
 * Comutativa e idempotente — a ordem de quem sincroniza não muda o resultado.
 * @param {Record<string, Feita>} a @param {Record<string, Feita>} b
 * @returns {Record<string, Feita>}
 */
export function mesclarFeitas(a, b) {
  const r = /** @type {Record<string, Feita>} */ ({});
  for (const fonte of [a || {}, b || {}]) {
    for (const [k, f] of Object.entries(fonte)) {
      if (!ehFeita(f)) continue;
      const atual = r[k];
      if (!atual) { r[k] = { status: f.status, em: f.em }; continue; }
      const vence = atual.status !== f.status ? f.status === 'enviada' : f.em < atual.em;
      if (vence) r[k] = { status: f.status, em: f.em };
    }
  }
  return r;
}

/**
 * O que fazer ao sincronizar com a nuvem: a fila local já mesclada e podada,
 * o que SUBIR (chave que a nuvem não tem, ou tem diferente) e o que APAGAR lá
 * (chave que passou do prazo).
 * @param {Fila} fila @param {Record<string, Feita> | null} daNuvem @param {number} agora
 * @returns {{ fila: Fila, subir: string[], apagar: string[] }}
 */
export function planoDeSync(fila, daNuvem, agora) {
  const nuvem = daNuvem && typeof daNuvem === 'object' ? daNuvem : {};
  const feitas = mesclarFeitas(fila.feitas, nuvem);
  const nova = podar({ pendentes: fila.pendentes.filter((s) => !Object.prototype.hasOwnProperty.call(feitas, s.chave)), feitas }, agora);
  const igual = (x, y) => ehFeita(x) && ehFeita(y) && x.status === y.status && x.em === y.em;
  return {
    fila: nova,
    subir: Object.keys(nova.feitas).filter((k) => !igual(nova.feitas[k], nuvem[k])).sort(),
    apagar: Object.keys(nuvem).filter((k) => !Object.prototype.hasOwnProperty.call(nova.feitas, k)).sort(),
  };
}
