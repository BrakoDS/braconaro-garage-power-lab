/**
 * As caixas aplicadas pelo SERVIDOR — a parte pura (Fase 1 · etapa 1).
 *
 * As caixas são o que chega para a ficha de fora da Gestão: o Pix aprovado
 * (`gestao/{uid}/cobrancasPix`), o check-in da uGym (`checkinsUgym`), a chamada
 * da Lousa (`checkinsLousa`), o "Não irei" (`avisosAusencia`) e a reposição
 * marcada pelo aluno (`reposicoesAluno`). Até aqui só a Gestão aberta as
 * aplicava; agora o servidor aplica, a qualquer hora, quando o interruptor
 * (`gestao/{uid}/sistema/caixas`) está em 'servidor'.
 *
 * A REGRA É A DA GESTÃO, E NÃO UM PORTE: o build copia para lib/gestao/ os
 * arquivos de regra dela (scripts/copiar-regras-gestao.mjs) e este módulo os
 * executa — `aplicarAvisosNaFicha`, `aplicarCheckinsNaFicha`, `planoDoPix`,
 * `casarCaixasComFichas`, `novoEvento`. O que a Gestão faria com a caixa é o
 * que o servidor faz. A gravação também é a da Gestão: só os campos que mudaram
 * (`diferencasDaFicha` + `escritasDaAtualizacao`, de ficha-campos.js).
 *
 * Nada aqui fala com o banco: `caixas-servico.ts` lê e grava numa transação;
 * `checar-caixas.ts` prova os casos sem rede.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { relogioDoBox } from './presenca';

// A ficha e as caixas são JSON livre, como na Gestão: o formato é o dos arquivos de regra dela.
type Dados = Record<string, any>;

/** `import()` de verdade (o tsc em commonjs trocaria por `require`). */
const importar = new Function('u', 'return import(u)') as (u: string) => Promise<Dados>;

export interface Escrita { caminho: string[]; valor?: unknown; apagar?: true }

export interface RegrasDaGestao {
  aplicarAvisosNaFicha(a: Dados, itens: Dados, reservas: Dados): { patch: Dados; logs: Dados[]; consumidos: string[]; reservasConsumidas: string[]; ignorados: { chave: string; motivo: string }[] };
  aplicarCheckinsNaFicha(a: Dados, itens: Dados, origem: Dados): { patch: Dados; logs: Dados[]; consumidos: string[]; ignorados: { chave: string; motivo: string }[] };
  ORIGENS: { ugym: Dados; lousa: Dados };
  planoDoPix(c: Dados, a: Dados | null, todos: Dados[]): { acao: 'baixa'; patch: Dados; log: Dados } | { acao: 'aviso'; log: Dados } | { acao: 'nada'; motivo: string };
  casarCaixasComFichas(ids: string[], alunos: Dados[]): { pares: { key: string; aluno: Dados }[]; orfas: string[] };
  novoEvento(p: Dados): Dados;
  diferencasDaFicha(antes: Dados, depois: Dados): { campos: string[][]; conjuntos: Record<string, { mais: string[]; menos: string[] }> };
  escritasDaAtualizacao(atual: Dados, dados: Dados, entrada: Dados): Escrita[];
  soDoBox(f: Dados): Dados;
  emailsQueFaltaram(chamada: Dados | null | undefined): string[];
  faltaDaChamada(a: Dados | null, o: { dia: string; hora: string; em: number; hoje: string; agora?: string; fechados?: string[] }): { acao: 'falta'; tipo: 'titular' | 'reposicao'; chave: string; patch: Dados; log: Dados } | { acao: 'nada'; motivo: string };
  desfazerFaltaDaChamada(a: Dados | null, o: { dia: string; hora: string }): { acao: 'desfazer'; tipo: 'titular' | 'reposicao'; chave: string; patch: Dados; log: Dados } | { acao: 'nada'; motivo: string };
  creditosDeFechamento(alunos: Dados[], diasSemAula: string[], hoje: string): { alunoId: string; dia: string; patch: Dados; log: Dados }[];
}

const _regras = new Map<string, Promise<RegrasDaGestao>>();

/**
 * Os arquivos de regra da Gestão, copiados no build para lib/gestao/. Carrega
 * uma vez por instância.
 * @param base a pasta da cópia (os testes podem apontar para outra)
 */
export function regrasDaGestao(base = join(__dirname, 'gestao')): Promise<RegrasDaGestao> {
  const ja = _regras.get(base);
  if (ja) return ja;
  const de = (arquivo: string) => importar(pathToFileURL(join(base, 'coach', 'gestao-de-alunos', arquivo)).href);
  const carga = Promise.all([
    de('ausencias-merge.js'), de('ugym-merge.js'), de('pix-baixa.js'), de('portal-merge.js'), de('eventos.js'), de('ficha-campos.js'),
    de('chamada-faltas.js'), de('creditos-fechamento.js'),
  ]).then(([aus, ugym, pix, portal, ev, campos, chamada, fechamento]) => ({
    aplicarAvisosNaFicha: aus.aplicarAvisosNaFicha,
    aplicarCheckinsNaFicha: ugym.aplicarCheckinsNaFicha,
    ORIGENS: ugym.ORIGENS,
    planoDoPix: pix.planoDoPix,
    casarCaixasComFichas: portal.casarCaixasComFichas,
    novoEvento: ev.novoEvento,
    diferencasDaFicha: campos.diferencasDaFicha,
    escritasDaAtualizacao: campos.escritasDaAtualizacao,
    soDoBox: campos.soDoBox,
    emailsQueFaltaram: chamada.emailsQueFaltaram,
    faltaDaChamada: chamada.faltaDaChamada,
    desfazerFaltaDaChamada: chamada.desfazerFaltaDaChamada,
    creditosDeFechamento: fechamento.creditosDeFechamento,
  }) as RegrasDaGestao);
  _regras.set(base, carga);
  return carga;
}

/** As caixas por aluno, na ordem em que a Gestão as aplica (boot.js: avisos e reservas, uGym, Lousa). */
export const COLECOES_DO_ALUNO = ['avisosAusencia', 'reposicoesAluno', 'checkinsUgym', 'checkinsLousa'] as const;
export type ColecaoDoAluno = typeof COLECOES_DO_ALUNO[number];

/**
 * Os campos da ficha que a fatia do Portal copia direto (`fatia` em
 * coach/gestao-de-alunos/portal-sync.js) — os que uma caixa muda. O servidor os
 * atualiza em `portal/{email}` junto com a ficha: o aluno vê no Portal e no app
 * sem esperar o coach abrir a Gestão.
 */
export const CAMPOS_ESPELHO_PORTAL: Record<string, () => unknown> = {
  pagamentos: () => ({}), presencas: () => [], presencaHoras: () => ({}),
  atestados: () => ({}), faltas: () => ({}), remarcacoes: () => ({}),
};

export interface PlanoDoServidor {
  /** O que gravar na ficha (só os campos que mudaram). */
  escritas: Escrita[];
  /** As linhas dos Registros (`gestao/{uid}/eventos/{id}`), com `origem: 'servidor'`. */
  eventos: Dados[];
  /** Os itens a tirar de cada caixa (o que foi aplicado ou recusado — todo item é consumido, como na Gestão). */
  consumir: Partial<Record<ColecaoDoAluno, string[]>>;
  /** Os campos inteiros a atualizar em `portal/{email}`. */
  portal: Dados;
  /** O que a regra recusou (vai para o log das functions, como o console.warn da Gestão). */
  ignorados: { colecao: string; chave: string; motivo: string }[];
}

const vazio = (): PlanoDoServidor => ({ escritas: [], eventos: [], consumir: {}, portal: {}, ignorados: [] });

/** Os itens de uma caixa que são deste coach (os de outro coach ficam, como na Gestão). */
export function itensDoCoach(caixa: Dados | undefined, coachUid: string): Dados {
  const itens = caixa && caixa.itens && typeof caixa.itens === 'object' ? caixa.itens : {};
  return Object.fromEntries(Object.entries(itens).filter(([, v]) => v && (v as Dados).coachUid === coachUid));
}

/**
 * Como o JSON guarda: sem `undefined` (o Admin SDK recusa; na Gestão, o cache já
 * passava tudo por JSON ao guardar).
 */
const comoJson = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Escritas, Portal e o resto do plano a partir da ficha antes e depois. */
function fechar(regras: RegrasDaGestao, plano: PlanoDoServidor, ficha: Dados, antes: Dados, depoisCru: Dados): PlanoDoServidor {
  const depois = comoJson(depoisCru);
  const dif = regras.diferencasDaFicha(antes, depois);
  plano.escritas = regras.escritasDaAtualizacao(ficha, depois, dif);
  for (const k of new Set(plano.escritas.map((e) => e.caminho[0]))) {
    if (k in CAMPOS_ESPELHO_PORTAL) plano.portal[k] = depois[k] ?? CAMPOS_ESPELHO_PORTAL[k]();
  }
  return plano;
}

/** Uma linha dos Registros como a Gestão grava (`reg` de registro.js), com a origem 'servidor'. */
/** Quem executa o que o servidor aplica (Fase 1 · etapa 5): a rotina. */
const AUTOR_ROTINA = Object.freeze({ tipo: 'rotina' });

/**
 * Quem PEDIU o que o servidor aplicou (etapa 5): vai em `proposta` na linha do log.
 * O aviso e a reserva vêm do aluno; o check-in da uGym, do aluno pela uGym; a
 * chamada da Lousa, do coach pela Lousa; o Pix, do aluno pelo Pix. O crédito de
 * box fechado nasce do feriado: só a rotina.
 */
export const PEDIDO_POR = Object.freeze({
  aluno: Object.freeze({ por: { tipo: 'aluno' } }),
  ugym: Object.freeze({ por: { tipo: 'aluno' }, via: 'ugym' }),
  lousa: Object.freeze({ por: { tipo: 'coach' }, via: 'lousa' }),
  pix: Object.freeze({ por: { tipo: 'aluno' }, via: 'pix' }),
});

/** As linhas com quem pediu (em `extra.proposta`, que o `evento` lê). */
const comPedido = (logs: Dados[], proposta: Dados): Dados[] => logs.map((l) => ({ ...l, extra: { ...((l.extra || {}) as Dados), proposta } }));

function evento(regras: RegrasDaGestao, aluno: Dados, log: Dados, agora: number, reserva: string): Dados {
  const extra = (log.extra || {}) as Dados;
  const ev = regras.novoEvento({
    ...extra, tipo: log.tipo, origem: 'servidor', aluno, em: agora, resumo: log.resumo, id: extra.id || reserva,
    autor: extra.autor || AUTOR_ROTINA,
  });
  return comoJson(log.dados ? { ...ev, dados: log.dados } : ev);
}

/**
 * O que o servidor faz com as caixas de UM aluno: aplica, na ordem da Gestão,
 * os avisos e reservas, os check-ins da uGym e os da Lousa.
 * @param ficha a ficha como está na nuvem (com `emailNorm`, `atualizadoEm`)
 * @param caixas os documentos das caixas deste aluno (`{ itens }`), por coleção
 */
export function planoDasCaixas(
  regras: RegrasDaGestao,
  { ficha, caixas, coachUid, agora }: { ficha: Dados; caixas: Partial<Record<ColecaoDoAluno, Dados | undefined>>; coachUid: string; agora: number },
): PlanoDoServidor {
  const plano = vazio();
  const antes = { ...regras.soDoBox(ficha), id: String(ficha.id) };
  let atual = antes;
  const logs: Dados[] = [];
  const meus = (c: ColecaoDoAluno) => itensDoCoach(caixas[c], coachUid);

  const avisos = meus('avisosAusencia'), reservas = meus('reposicoesAluno');
  if (Object.keys(avisos).length || Object.keys(reservas).length) {
    const r = regras.aplicarAvisosNaFicha(atual, avisos, reservas);
    atual = { ...atual, ...r.patch };
    logs.push(...comPedido(r.logs, PEDIDO_POR.aluno));
    if (r.consumidos.length) plano.consumir.avisosAusencia = r.consumidos;
    if (r.reservasConsumidas.length) plano.consumir.reposicoesAluno = r.reservasConsumidas;
    for (const i of r.ignorados) plano.ignorados.push({ colecao: 'avisosAusencia/reposicoesAluno', ...i });
  }
  for (const [colecao, origem] of [['checkinsUgym', regras.ORIGENS.ugym], ['checkinsLousa', regras.ORIGENS.lousa]] as const) {
    const itens = meus(colecao);
    if (!Object.keys(itens).length) continue;
    const r = regras.aplicarCheckinsNaFicha(atual, itens, origem);
    atual = { ...atual, ...r.patch };
    logs.push(...comPedido(r.logs, colecao === 'checkinsUgym' ? PEDIDO_POR.ugym : PEDIDO_POR.lousa));
    if (r.consumidos.length) plano.consumir[colecao] = r.consumidos;
    for (const i of r.ignorados) plano.ignorados.push({ colecao, ...i });
  }
  plano.eventos = logs.map((l, i) => evento(regras, antes, l, agora, `srv-${agora}-${antes.id}-${i}`));
  return fechar(regras, plano, ficha, antes, atual);
}

/**
 * O que o servidor faz com um Pix do livro-caixa (`cobrancasPix`): a baixa do
 * mês, ou o aviso de divergência/estorno — o `planoDoPix` da Gestão.
 * @param ficha a ficha do aluno na nuvem (null: o aluno saiu da Gestão)
 * @param todos todas as fichas (a conta do responsável soma os dependentes)
 */
export function planoDoPixNoServidor(
  regras: RegrasDaGestao,
  { cobranca, ficha, todos, agora }: { cobranca: Dados; ficha: Dados | null; todos: Dados[]; agora: number },
): PlanoDoServidor & { acao: 'baixa' | 'aviso' | 'nada'; motivo?: string } {
  const doBox = (f: Dados) => ({ ...regras.soDoBox(f), id: String(f.id) });
  const antes = ficha ? doBox(ficha) : null;
  const p = regras.planoDoPix(cobranca, antes, todos.map(doBox));
  if (p.acao === 'nada' || !ficha || !antes) return { ...vazio(), acao: 'nada', motivo: p.acao === 'nada' ? p.motivo : 'sem ficha' };
  const plano = vazio();
  plano.eventos = [evento(regras, antes, comPedido([p.log], PEDIDO_POR.pix)[0], agora, `pix-${cobranca.paymentId}-${cobranca.status}`)];
  if (p.acao === 'aviso') return { ...plano, acao: 'aviso' };
  return { ...fechar(regras, plano, ficha, antes, { ...antes, ...p.patch }), acao: 'baixa' };
}

/**
 * O id da linha dos Registros da falta da chamada: um por aluno e aula, SEM a versão da chamada. A
 * chamada grava a falta no máximo uma vez por aluno e aula: fechar de novo não a repõe se o coach a
 * tirou à mão ("Veio" corrige pelo check-in, e sair da lista desfaz pelo `planoDeDesfazerFalta`).
 */
export const idDoEventoDaFalta = (alunoId: string, dia: string, hora: string) =>
  `lousa-falta-${alunoId}-${dia}-${hora.replace(/\W/g, '')}`;

/** O id da linha dos Registros de "saiu da lista": um por aluno, aula e versão da chamada que o tirou. */
export const idDoEventoDaFaltaDesfeita = (alunoId: string, dia: string, hora: string, versao: number) =>
  `lousa-falta-desfeita-${alunoId}-${dia}-${hora.replace(/\W/g, '')}-${versao}`;

/** O id da linha do crédito de box fechado: um por aluno e dia. */
export const idDoEventoDoFechamento = (alunoId: string, dia: string) => `fechado-${alunoId}-${dia}`;

/**
 * O que o servidor faz com UM aluno que a chamada da Lousa deixou em "faltaram":
 * a falta "não veio" (`faltaDaChamada` da Gestão), ou nada, com o motivo.
 * A falta entra no máximo uma vez por aluno e aula (o id do Registro não leva a versão da chamada).
 * @param hoje o dia no relógio do box
 */
export function planoDaFaltaDaChamada(
  regras: RegrasDaGestao,
  { ficha, dia, hora, hoje, fechados, agora }: { ficha: Dados; dia: string; hora: string; hoje: string; fechados: string[]; agora: number },
): PlanoDoServidor & { acao: 'falta' | 'nada'; motivo?: string } {
  const antes = { ...regras.soDoBox(ficha), id: String(ficha.id) };
  const r = regras.faltaDaChamada(antes, { dia, hora, em: agora, hoje, agora: relogioDoBox(new Date(agora)).agora, fechados });
  if (r.acao === 'nada') return { ...vazio(), acao: 'nada', motivo: r.motivo };
  const id = idDoEventoDaFalta(antes.id, dia, hora);
  const plano = vazio();
  plano.eventos = [evento(regras, antes, { ...r.log, extra: { ...(r.log.extra || {}), id, proposta: PEDIDO_POR.lousa } }, agora, id)];
  return { ...fechar(regras, plano, ficha, antes, { ...antes, ...r.patch }), acao: 'falta' };
}

/**
 * A chamada foi refeita e o aluno saiu das duas listas: tira a falta que a própria
 * Lousa gravou para aquela aula (`desfazerFaltaDaChamada`). A do coach não é tocada.
 * @param versao a versão da chamada que o tirou (só entra no id do Registro)
 */
export function planoDeDesfazerFalta(
  regras: RegrasDaGestao,
  { ficha, dia, hora, versao, agora }: { ficha: Dados; dia: string; hora: string; versao: number; agora: number },
): PlanoDoServidor & { acao: 'desfazer' | 'nada'; motivo?: string } {
  const antes = { ...regras.soDoBox(ficha), id: String(ficha.id) };
  const r = regras.desfazerFaltaDaChamada(antes, { dia, hora });
  if (r.acao === 'nada') return { ...vazio(), acao: 'nada', motivo: r.motivo };
  const id = idDoEventoDaFaltaDesfeita(antes.id, dia, hora, versao);
  const plano = vazio();
  plano.eventos = [evento(regras, antes, { ...r.log, extra: { ...(r.log.extra || {}), id, proposta: PEDIDO_POR.lousa } }, agora, id)];
  return { ...fechar(regras, plano, ficha, antes, { ...antes, ...r.patch }), acao: 'desfazer' };
}

/**
 * O que o servidor faz com UM aluno nos dias em que o box fechou: +1 crédito de
 * reposição por dia em que ele tinha aula titular (`creditosDeFechamento`). Os
 * dias entram um de cada vez sobre a ficha já atualizada: dois dias fechados não
 * se sobrescrevem em `atestados`.
 * @param dias os dias fechados (só os que já chegaram: ver `diasFechadosAteHoje`)
 */
export function planoDoCreditoDeFechamento(
  regras: RegrasDaGestao,
  { ficha, dias, hoje, agora }: { ficha: Dados; dias: string[]; hoje: string; agora: number },
): PlanoDoServidor & { creditos: number } {
  const antes = { ...regras.soDoBox(ficha), id: String(ficha.id) };
  let atual = antes;
  const logs: Dados[] = [];
  for (const dia of [...dias].sort()) {
    for (const c of regras.creditosDeFechamento([atual], [dia], hoje)) {
      atual = { ...atual, ...c.patch };
      logs.push({ ...c.log, extra: { ...(c.log.extra || {}), id: idDoEventoDoFechamento(antes.id, dia) } });
    }
  }
  const plano = vazio();
  plano.eventos = logs.map((l) => evento(regras, antes, l, agora, String(l.extra.id)));
  return { ...fechar(regras, plano, ficha, antes, atual), creditos: logs.length };
}

/**
 * Os dias em que o box NÃO abriu (`meta.feriados` com `false`) que já chegaram, do mais antigo ao mais novo.
 * @param desde 'AAAA-MM-DD' (`sistema/fechamento.desde`): os dias antes dele são ignorados
 */
export function diasFechadosAteHoje(meta: Dados | null | undefined, hoje: string, desde?: string | null): string[] {
  const f = meta && meta.feriados && typeof meta.feriados === 'object' ? meta.feriados as Record<string, unknown> : {};
  const corte = typeof desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : '';
  return Object.entries(f).filter(([d, abriu]) => abriu === false && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= hoje && d >= corte).map(([d]) => d).sort();
}
