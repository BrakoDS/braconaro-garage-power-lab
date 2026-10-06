// @ts-check
/**
 * SEMANA DO BOX — trocar à mão um movimento do WOD do Cross ou uma estação do
 * Hyrox. Mesmo molde do `troca-hiit.js`, em modais (`compartilhado/ui/dialogo.js`):
 *  1. o servidor manda as opções com os conflitos (`opcoesTrocaCrossBox` /
 *     `opcoesTrocaHyroxBox`); conteúdo travado (semana publicada com o dia no
 *     passado) para aqui;
 *  2. semana publicada pede confirmação — os alunos veem a troca na hora;
 *  3. a lista: o que esbarra em padrão, cardio ou equipamento vem DESABILITADO;
 *  4. no WOD, só o rodízio quebrado pergunta: manter ou escolher outro;
 *  5. grava a semana pela `salvarSemanaBox`, que revalida tudo e recalcula a
 *     prescrição do novo movimento ou da estação.
 */
import { avisar, confirmar, painel } from '../../../compartilhado/ui/dialogo.js';
import { diasComCrossTrocado, diasComFocoTrocado, diasComHyroxTrocado, rotuloDias } from '../core/vista.js';
import { opcoesTrocaCross, opcoesTrocaHyrox, salvarSemana } from '../cloud/semana.js';
import { esc } from './render.js';
import { renderAvisoCross, renderOpcoesCross, renderOpcoesFoco, renderOpcoesHyrox } from './render-troca.js';

/**
 * @typedef {{
 *   semanaId: string,
 *   lerDoc: () => Promise<any>,
 *   status: (msg: string, tipo?: 'ok'|'erro'|'') => void,
 *   ocupar: (sim: boolean) => void,
 * }} Contexto
 */

/**
 * Pede as opções ao servidor e passa pelas duas paradas comuns: travado e
 * semana publicada. `null` = o coach não segue (ou deu erro, já mostrado).
 * @param {Contexto} o @param {() => Promise<any>} pedir @param {string} oQue 'o WOD' / 'o Hyrox'
 */
async function abrir(o, pedir, oQue) {
  o.status('Buscando as opções…');
  o.ocupar(true);
  let r;
  try {
    r = await pedir();
  } catch (e) {
    o.ocupar(false);
    o.status(/** @type {any} */ (e)?.message || 'Não deu para buscar as opções.', 'erro');
    return null;
  }
  o.ocupar(false);
  o.status('');

  if (r.travada) {
    await avisar({
      titulo: `${oQue === 'o WOD' ? 'WOD' : 'Hyrox'} travado`,
      texto: `A semana já foi publicada e ${oQue} é de um dia que já passou (${rotuloDias(r.vaga.dias)}). `
        + 'Ele não muda mais: algum aluno pode ter registrado a aula.',
    });
    return null;
  }
  if (r.publicada) {
    const ok = await confirmar({
      titulo: 'Semana publicada',
      texto: `Os alunos veem a troca na hora${r.temHoje ? ', inclusive na aula de <b>hoje</b>' : ''}. `
        + `Ela vale para ${oQue} de ${esc(rotuloDias(r.vaga.dias))}.`,
      ok: 'Continuar',
    });
    if (!ok) return null;
  }
  return r;
}

/**
 * Grava a semana com a troca e relê o documento. Lê de NOVO antes de montar o
 * pedido: a semana na tela pode ter mudado desde que a lista foi aberta.
 * @param {Contexto} o @param {(doc: any) => Record<string, any>} montar @param {string} sucesso
 */
async function gravar(o, montar, sucesso) {
  o.ocupar(true);
  o.status('Gravando a troca…');
  try {
    const doc = await o.lerDoc();
    await salvarSemana(o.semanaId, montar(doc));
    await o.lerDoc();
    o.status(`Trocado: ${sucesso}`, 'ok');
  } catch (e) {
    try { await o.lerDoc(); } catch { /* a mensagem do erro é a que importa */ }
    o.status(/** @type {any} */ (e)?.message || 'Não deu para gravar a troca.', 'erro');
  } finally {
    o.ocupar(false);
  }
}

/** Troca o movimento `posicao` (1…n) do WOD. @param {Contexto & {posicao: number}} o */
export async function trocarMovimentoCross(o) {
  const r = await abrir(o, () => opcoesTrocaCross(o.semanaId, o.posicao), 'o WOD');
  if (!r) return;

  for (;;) {
    const escolha = await painel({ titulo: `Trocar movimento · WOD (${r.vaga.formato})`, corpoHTML: renderOpcoesCross(r) });
    if (!escolha || !escolha.startsWith('escolher:')) return;
    const opcao = r.opcoes.find((x) => x.exercicioId === escolha.slice('escolher:'.length));
    // Bloqueada vem desabilitada; se chegar aqui mesmo assim, não grava.
    if (!opcao || opcao.bloqueada) return;
    const montar = (/** @type {any} */ doc) => diasComCrossTrocado(doc, r.vaga.posicao, opcao.exercicioId);
    const sucesso = `${opcao.nome} no movimento ${r.vaga.posicao} do WOD (${rotuloDias(r.vaga.dias)}).`;

    if (!opcao.conflitos.semanaAnterior) {
      await gravar(o, montar, sucesso);
      return;
    }
    const aviso = renderAvisoCross(r, opcao);
    const decisao = await painel({ titulo: aviso.titulo, corpoHTML: aviso.corpoHTML, acoes: aviso.acoes, fechar: aviso.fechar, largo: false });
    if (decisao === 'outro') continue;
    if (decisao === 'manter') await gravar(o, montar, `${sucesso} Quebra o rodízio, com aviso.`);
    return;
  }
}

/**
 * Troca o foco da Técnica / Força por outro movimento do WOD que serve de foco.
 * As opções já estão na semana (`tecnica.alternativas`, gravadas pelo servidor):
 * não precisa de chamada. A trava de dia passado fica no servidor (`salvarSemanaBox`).
 * @param {Contexto} o
 */
export async function trocarFocoTecnica(o) {
  const doc = await o.lerDoc();
  const dia = Object.values(doc?.dias ?? {}).find((d) => /** @type {any} */ (d)?.cross?.tecnica);
  const t = /** @type {any} */ (dia)?.cross?.tecnica;
  if (!t) return;
  if (doc.status === 'publicado') {
    const ok = await confirmar({
      titulo: 'Semana publicada',
      texto: 'Os alunos veem a troca do foco da Técnica / Força na hora.',
      ok: 'Continuar',
    });
    if (!ok) return;
  }
  const escolha = await painel({ titulo: 'Trocar foco · Técnica / Força', corpoHTML: renderOpcoesFoco(t) });
  if (!escolha || !escolha.startsWith('foco:')) return;
  const novo = (t.alternativas ?? []).find((a) => a.exercicioId === escolha.slice('foco:'.length));
  if (!novo) return;
  await gravar(o, (d) => diasComFocoTrocado(d, novo.exercicioId), `${novo.nome} é o foco da Técnica / Força.`);
}

/** Troca uma estação do Hyrox pela substituta (ou volta à da prova). @param {Contexto & {estacao: string}} o */
export async function trocarEstacaoHyrox(o) {
  const r = await abrir(o, () => opcoesTrocaHyrox(o.semanaId, o.estacao), 'o Hyrox');
  if (!r) return;
  const escolha = await painel({ titulo: `Trocar estação · Hyrox (${r.vaga.base})`, corpoHTML: renderOpcoesHyrox(r) });
  if (escolha !== 'substituta' && escolha !== 'original') return;
  const opcao = r.opcoes.find((x) => x.substituta === (escolha === 'substituta'));
  if (!opcao || opcao.bloqueada) return;
  await gravar(o, (doc) => diasComHyroxTrocado(doc, r.vaga.estacao, opcao.substituta),
    `${opcao.nome} na estação ${r.vaga.n} do Hyrox (${rotuloDias(r.vaga.dias)}).`);
}
