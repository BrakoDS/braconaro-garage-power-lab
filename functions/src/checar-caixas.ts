/**
 * Confere `caixas.ts` (as caixas aplicadas pelo servidor), sem rede:
 *
 *   1) a cópia das regras em lib/gestao/ é byte a byte a da Gestão (com o site
 *      ao lado; num clone só das functions, pula com aviso);
 *   2) casos à mão: o check-in da uGym e da Lousa, o "Não irei" e a reposição,
 *      o Pix (baixa, mês já pago, divergência, segunda rodada) — o que vai para
 *      a ficha, o que sai da caixa, as linhas dos Registros e o Portal;
 *   3) o resultado é o MESMO que a Gestão gravaria: a ficha depois das escritas
 *      por campo é a ficha com o patch da regra, campo a campo.
 *
 *     npm run checar:caixas
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  diasFechadosAteHoje, idDoEventoDaFalta, planoDaFaltaDaChamada, planoDasCaixas, planoDeDesfazerFalta, planoDoCreditoDeFechamento, planoDoPixNoServidor, regrasDaGestao, type RegrasDaGestao,
} from './caixas';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else { falhas++; console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`); }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// A ficha e as caixas são JSON livre, como na Gestão.
type Dados = Record<string, any>;

const COACH = 'coach1';
const AGORA = Date.UTC(2026, 10, 4, 21, 15); // qua 04/11/2026, 18:15 em São Paulo
// A Ana treina seg, qua e qui; a ficha como está na nuvem (com o que é da nuvem).
const ana = (extra: Dados = {}): Dados => ({
  id: '001', nome: 'Ana', email: 'Ana@Box.com', emailNorm: 'ana@box.com', atualizadoEm: { _seconds: 1 },
  status: 'ativo', telefone: '14999', mensalidade: 130, vencimento: 10,
  diasTreino: ['seg', 'qua', 'qui'], horarios: { seg: '18:10', qua: '18:10', qui: '19:10' },
  presencas: ['2026-11-02'], pagamentos: { '2026-10': true },
  ...extra,
});
const checkin = (dia: string, agora: string, extra: Dados = {}): Dados => ({
  coachUid: COACH, origem: 'ugym', dia, hora: '18:10', checkin: { hoje: dia, agora }, em: AGORA, ...extra,
});

// O "Não irei" da quinta 05/11 (aula das 19:10) avisado às 15:00, e a reposição no sábado 07/11.
const AVISO = { tipo: 'titular', chave: '2026-11-05', coachUid: COACH, aviso: { hoje: '2026-11-05', agora: '15:00' }, em: AGORA, noPrazo: true };
const RESERVA = { data: '2026-11-07', hora: '10:00', coachUid: COACH, em: AGORA + 1000 };

/** A ficha depois das escritas por campo (o que o Firestore guardaria). */
function depoisDasEscritas(ficha: Dados, escritas: { caminho: string[]; valor?: unknown; apagar?: true }[]): Dados {
  const r = JSON.parse(JSON.stringify(ficha));
  for (const e of escritas) {
    let alvo = r;
    for (const k of e.caminho.slice(0, -1)) { if (!alvo[k] || typeof alvo[k] !== 'object') alvo[k] = {}; alvo = alvo[k]; }
    const u = e.caminho[e.caminho.length - 1];
    if (e.apagar) delete alvo[u]; else alvo[u] = JSON.parse(JSON.stringify(e.valor));
  }
  return r;
}

function aCopiaEAdaGestao(): void {
  console.log('\n1) A cópia em lib/gestao/ é a da Gestão');
  const raiz = resolve(__dirname, '..', '..');
  if (!existsSync(join(raiz, 'coach', 'gestao-de-alunos'))) { console.log('  (site ausente ao lado — conferência pulada)'); return; }
  const base = join(__dirname, 'gestao');
  const arquivos: string[] = [];
  const andar = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) andar(p); else if (n !== 'package.json' || d !== base) arquivos.push(relative(base, p).split(sep).join('/')); } };
  andar(base);
  const diferentes = arquivos.filter((rel) => !readFileSync(join(raiz, rel)).equals(readFileSync(join(__dirname, 'gestao', rel))));
  ok(arquivos.length >= 6 && !diferentes.length, `${arquivos.length} arquivos idênticos`, diferentes.join(', '));
  const novos = ['coach/gestao-de-alunos/chamada-faltas.js', 'coach/gestao-de-alunos/creditos-fechamento.js', 'compartilhado/regras/semana.js'];
  ok(novos.every((n) => arquivos.includes(n)), 'a falta da chamada, o crédito de fechamento e o semana.js estão na cópia', novos.filter((n) => !arquivos.includes(n)).join(', '));
}

function checkins(regras: RegrasDaGestao): void {
  console.log('\n2) Check-in da uGym e da Lousa');
  const ficha = ana();
  const p = planoDasCaixas(regras, {
    ficha, coachUid: COACH, agora: AGORA,
    caixas: {
      checkinsUgym: { itens: { 'ugym|r1': checkin('2026-11-04', '18:12'), 'ugym|r9': checkin('2026-11-04', '18:20', { coachUid: 'outro' }) } },
    },
  });
  const depois = depoisDasEscritas(ficha, p.escritas);
  ok(igual(depois.presencas, ['2026-11-02', '2026-11-04']), 'a presença de quarta entra', JSON.stringify(depois.presencas));
  ok(depois.presencaHoras?.['2026-11-04'] === '18:12', 'com a hora do check-in no app');
  ok(p.escritas.every((e) => ['presencas', 'presencaHoras', 'atestados', 'faltas', 'remarcacoes'].includes(e.caminho[0])), 'só os campos da presença são gravados', JSON.stringify(p.escritas.map((e) => e.caminho)));
  ok(depois.telefone === '14999' && igual(depois.pagamentos, { '2026-10': true }), 'o resto da ficha fica como estava');
  ok(igual(p.consumir, { checkinsUgym: ['ugym|r1'] }), 'só o item deste coach sai da caixa (o do outro fica)', JSON.stringify(p.consumir));
  ok(p.eventos.length === 1 && p.eventos[0].origem === 'servidor' && p.eventos[0].alunoId === '001' && /uGym/.test(p.eventos[0].resumo), 'uma linha nos Registros, com origem servidor', JSON.stringify(p.eventos));
  ok(igual(p.portal.presencas, ['2026-11-02', '2026-11-04']) && !('pagamentos' in p.portal), 'o Portal recebe as presenças (e só o que mudou)', JSON.stringify(p.portal));

  // O mesmo resultado da Gestão: a regra aplicada direto, como o ugym-merge faz no navegador.
  const naGestao = regras.aplicarCheckinsNaFicha({ ...regras.soDoBox(ficha), id: '001' }, { 'ugym|r1': checkin('2026-11-04', '18:12') }, regras.ORIGENS.ugym);
  ok(Object.entries(naGestao.patch).every(([k, v]) => igual(depois[k], v)), 'a ficha fica igual à que a Gestão gravaria', JSON.stringify(naGestao.patch));

  const fora = planoDasCaixas(regras, {
    ficha, coachUid: COACH, agora: AGORA,
    caixas: { checkinsLousa: { itens: { 'lousa|2026-11-05|10:00': { ...checkin('2026-11-06', '10:00'), origem: 'lousa' } } } },
  });
  ok(!fora.escritas.length && igual(fora.consumir, { checkinsLousa: ['lousa|2026-11-05|10:00'] }), 'Lousa num dia sem aula dele: nada muda, o item sai');
  ok(fora.eventos.length === 1 && fora.eventos[0].tipo === 'presenca-lousa-fora-da-grade', 'e o coach recebe a linha "confira"', JSON.stringify(fora.eventos));

  const repetido = planoDasCaixas(regras, { ficha: depois, coachUid: COACH, agora: AGORA, caixas: { checkinsUgym: { itens: { 'ugym|r2': checkin('2026-11-04', '18:30') } } } });
  ok(!repetido.escritas.length && igual(repetido.consumir, { checkinsUgym: ['ugym|r2'] }), 'segundo check-in no mesmo dia: nada muda');
}

function avisosEReservas(regras: RegrasDaGestao): void {
  console.log('\n3) "Não irei" e a reposição marcada pelo aluno');
  const ficha = ana();
  const p = planoDasCaixas(regras, {
    ficha, coachUid: COACH, agora: AGORA,
    caixas: {
      avisosAusencia: { itens: { 'titular|2026-11-05': AVISO } },
      reposicoesAluno: { itens: { '2026-11-05': RESERVA } },
    },
  });
  const depois = depoisDasEscritas(ficha, p.escritas);
  const credito = depois.atestados?.['2026-11-05'];
  ok(credito && credito.tipo === 'desmarcacao', 'avisou com 4h10: nasce o crédito', JSON.stringify(depois.atestados));
  ok(credito && credito.reposicao && credito.reposicao.data === '2026-11-07', 'e a reserva (que chegou depois) usa o crédito', JSON.stringify(credito));
  ok(igual(Object.keys(p.consumir).sort(), ['avisosAusencia', 'reposicoesAluno']), 'os dois itens saem das caixas');
  ok(p.eventos.length === 2 && p.eventos.every((e) => e.origem === 'servidor' && /^Pelo app/.test(e.resumo)), 'duas linhas nos Registros ("Pelo app: …")', JSON.stringify(p.eventos.map((e) => e.resumo)));
  ok('atestados' in p.portal, 'o Portal recebe o crédito');
  const naGestao = regras.aplicarAvisosNaFicha({ ...regras.soDoBox(ficha), id: '001' }, { 'titular|2026-11-05': AVISO }, { '2026-11-05': RESERVA });
  ok(Object.entries(naGestao.patch).every(([k, v]) => igual(depois[k], v)), 'a ficha fica igual à que a Gestão gravaria');

  const vazio = planoDasCaixas(regras, { ficha, coachUid: COACH, agora: AGORA, caixas: { avisosAusencia: { itens: {} } } });
  ok(!vazio.escritas.length && !vazio.eventos.length && !Object.keys(vazio.consumir).length, 'caixa vazia: nada a fazer');
}

function pix(regras: RegrasDaGestao): void {
  console.log('\n4) O Pix do livro-caixa');
  const cob = { paymentId: 'p1', alunoId: '001', mesId: '2026-11', valor: 130, valorPago: 130, status: 'aprovado', soMensalidade: true, avisarGestao: true };
  const ficha = ana();
  const p = planoDoPixNoServidor(regras, { cobranca: cob, ficha, todos: [ficha], agora: AGORA });
  const depois = depoisDasEscritas(ficha, p.escritas);
  ok(p.acao === 'baixa' && depois.pagamentos['2026-11'] === true && depois.pagamentos['2026-10'] === true, 'aprovado: a baixa do mês (o outro mês fica)', JSON.stringify(depois.pagamentos));
  ok(depois.pixPagos?.['2026-11'] === 'p1', 'e o rastro de qual Pix pagou');
  ok(igual(p.escritas.map((e) => e.caminho), [['pagamentos', '2026-11'], ['pixPagos']]), 'só o mês e o rastro são gravados', JSON.stringify(p.escritas.map((e) => e.caminho)));
  const ev = p.eventos[0];
  ok(ev && ev.id === 'pix-p1' && ev.tipo === 'pagamento' && ev.origem === 'servidor', 'a linha "Pagamento via Pix" com o id fixo da Gestão', JSON.stringify(ev));
  ok(ev && ev.dados && ev.dados.mesId === '2026-11' && ev.dados.valor === 130, 'com os dados que a Fila usa para sugerir o recibo');
  ok(igual(p.portal, { pagamentos: { '2026-10': true, '2026-11': true } }), 'o Portal recebe os pagamentos');

  const segunda = planoDoPixNoServidor(regras, { cobranca: cob, ficha: depois, todos: [depois], agora: AGORA });
  ok(segunda.acao === 'nada' && !segunda.escritas.length, 'o mesmo Pix de novo: nada (não paga duas vezes)', JSON.stringify(segunda));

  const jaPago = planoDoPixNoServidor(regras, { cobranca: { ...cob, paymentId: 'p2' }, ficha: depois, todos: [depois], agora: AGORA });
  ok(jaPago.acao === 'aviso' && !jaPago.escritas.length && /já estava pago/.test(jaPago.eventos[0]?.resumo || ''), 'outro Pix para um mês já pago: só o aviso para conferir', JSON.stringify(jaPago.eventos));

  const divergente = planoDoPixNoServidor(regras, { cobranca: { ...cob, paymentId: 'p3', status: 'divergente', valorPago: 100 }, ficha, todos: [ficha], agora: AGORA });
  ok(divergente.acao === 'aviso' && !divergente.escritas.length && /divergência/.test(divergente.eventos[0]?.resumo || ''), 'divergência de valor: aviso, e a baixa NÃO é feita');

  const semFicha = planoDoPixNoServidor(regras, { cobranca: cob, ficha: null, todos: [], agora: AGORA });
  ok(semFicha.acao === 'nada' && !semFicha.eventos.length, 'aluno que saiu da Gestão: nada');
}

// A chamada da Lousa de quinta 05/11 às 19:10 (a turma da Ana), fechada e depois fechada de novo (versão 777).
const QUINTA = '2026-11-05';
const AGORA_QUINTA = Date.UTC(2026, 10, 5, 22, 30); // qui 05/11/2026, 19:30 em São Paulo
const chamada = (extra: Dados = {}) => ({ dia: QUINTA, hora: '19:10', hoje: QUINTA, fechados: [] as string[], agora: AGORA_QUINTA, ...extra });

function chamadaDaLousa(regras: RegrasDaGestao): void {
  console.log('\n5) A falta da chamada da Lousa');
  const plano = (ficha: Dados, extra: Dados = {}) => {
    return planoDaFaltaDaChamada(regras, { ...chamada(extra), ficha });
  };
  const ficha = ana();
  const p = plano(ficha);
  const depois = depoisDasEscritas(ficha, p.escritas);
  const falta = depois.faltas?.[QUINTA];
  ok(p.acao === 'falta' && falta && falta.tipo === 'no-show' && falta.origem === 'lousa' && falta.aula.hora === '19:10', 'quem faltou ganha faltas[dia] tipo no-show, com origem lousa', JSON.stringify(depois.faltas));
  ok(p.escritas.length === 1 && p.escritas[0].caminho[0] === 'faltas', 'só o campo das faltas é gravado (nenhum outro)', JSON.stringify(p.escritas.map((e) => e.caminho)));
  ok(depois.telefone === '14999' && igual(depois.presencas, ['2026-11-02']), 'o resto da ficha fica como estava');
  const ev = p.eventos[0];
  ok(p.eventos.length === 1 && ev.id === idDoEventoDaFalta('001', QUINTA, '19:10') && ev.id === 'lousa-falta-001-2026-11-05-1910', 'uma linha nos Registros, com id fixo (aluno e aula, SEM a versão da chamada)', JSON.stringify(ev));
  ok(ev.tipo === 'falta' && ev.origem === 'servidor' && /Pela chamada da Lousa: não veio/.test(ev.resumo) && ev.chave === `falta:001:${QUINTA}`, 'tipo falta, origem servidor, texto "Pela chamada da Lousa: não veio"', JSON.stringify(ev));
  ok(igual(Object.keys(p.portal), ['faltas']) && p.portal.faltas[QUINTA]?.origem === 'lousa', 'o Portal recebe só as faltas', JSON.stringify(p.portal));
  const naGestao = regras.faltaDaChamada({ ...regras.soDoBox(ficha), id: '001' }, { dia: QUINTA, hora: '19:10', em: AGORA_QUINTA, hoje: QUINTA, agora: '19:30', fechados: [] });
  ok(naGestao.acao === 'falta' && igual(naGestao.patch.faltas[QUINTA], depois.faltas[QUINTA]), 'a ficha fica igual à que a regra da Gestão devolve');

  const segunda = plano(depois);
  ok(segunda.acao === 'nada' && !segunda.escritas.length && !segunda.eventos.length, 'a mesma chamada de novo: nada (não repete a falta)', JSON.stringify(segunda));

  const aula = { data: QUINTA, hora: '19:10' };
  const avisou = plano(ana({ atestados: { [QUINTA]: { tipo: 'desmarcacao', aula, expira: '2026-11-30', reposicao: null } } }));
  ok(avisou.acao === 'nada' && !avisou.escritas.length, 'avisou ("Não irei" no prazo): nenhuma falta', JSON.stringify(avisou));
  ok(plano(ana({ presencas: ['2026-11-02', QUINTA] })).acao === 'nada', 'já tem presença no dia (uGym): nenhuma falta');
  ok(plano(ana(), { hora: '18:10' }).acao === 'nada', 'outra turma (sem aula dele nesse horário): nenhuma falta');
  ok(plano(ana(), { fechados: [QUINTA] }).acao === 'nada', 'box fechado nesse dia: nenhuma falta');
  ok(plano(ana({ status: 'inativo' })).acao === 'nada', 'ficha inativa: nenhuma falta');

  // Quem estava de reposição e não veio: o no-show da reposição (crédito perdido).
  const rep = ana({ diasTreino: ['seg'], horarios: { seg: '18:10' }, atestados: { '2026-11-02': { em: 1, tipo: 'desmarcacao', aula: { data: '2026-11-02', hora: '18:10' }, expira: '2026-11-30', reposicao: { data: QUINTA, hora: '19:10' } } } });
  const pr = plano(rep);
  const dr = depoisDasEscritas(rep, pr.escritas);
  ok(pr.acao === 'falta' && dr.atestados['2026-11-02'].reposicao.noShow === true && dr.atestados['2026-11-02'].reposicao.noShowOrigem === 'lousa', 'reposição não usada: no-show na reposição (o crédito fica gasto)', JSON.stringify(dr.atestados));
  ok(/crédito perdido/.test(pr.eventos[0]?.resumo || '') && !dr.faltas?.[QUINTA], 'e o Registro diz "crédito perdido", sem falta de titular');

  // Fechar de novo com ela em "Veio": o check-in da Lousa chega pela caixa e a falta sai.
  const item = { 'lousa|2026-11-05|19:10': { coachUid: COACH, origem: 'lousa', dia: QUINTA, hora: '19:10', checkin: { hoje: QUINTA, agora: '19:10' }, em: AGORA_QUINTA + 5 } };
  const corrigido = planoDasCaixas(regras, { ficha: depois, coachUid: COACH, agora: AGORA_QUINTA + 10, caixas: { checkinsLousa: { itens: item } } });
  const dc = depoisDasEscritas(depois, corrigido.escritas);
  ok(igual(dc.presencas, ['2026-11-02', QUINTA]) && !dc.faltas?.[QUINTA], 'fechar de novo com "Veio": a presença entra e a falta com origem lousa sai', JSON.stringify({ p: dc.presencas, f: dc.faltas }));
  ok(corrigido.escritas.some((e) => e.apagar && e.caminho[0] === 'faltas' && e.caminho[1] === QUINTA), 'a falta sai como campo apagado (não regrava a ficha)', JSON.stringify(corrigido.escritas.map((e) => e.caminho)));
  ok(plano(dc).acao === 'nada', 'e uma chamada que ainda liste o aluno em "faltaram" não a repõe (já tem presença)');
  // Fechar de novo (outra versão da chamada) gera o MESMO id: a falta é gravada no máximo uma vez por aula.
  ok(plano(ficha).eventos[0].id === p.eventos[0].id, 'fechar de novo gera o mesmo id de Registro (nunca repõe a falta que o coach tirou)');
  // Hoje, antes da hora da aula: nenhuma falta.
  ok(plano(ficha, { agora: Date.UTC(2026, 10, 5, 21, 50) }).acao === 'nada', 'chamada de hoje fechada antes da aula (18:50 para 19:10): nenhuma falta');
  ok(plano(ficha, { hoje: '2026-11-06', agora: Date.UTC(2026, 10, 6, 11, 0) }).acao === 'falta', 'dia passado: a hora do relógio não importa');

  // Saiu da lista na chamada refeita: sai a falta que a Lousa gravou; a do coach fica.
  const d = planoDeDesfazerFalta(regras, { ficha: depois, dia: QUINTA, hora: '19:10', versao: 888, agora: AGORA_QUINTA + 20 });
  const dd = depoisDasEscritas(depois, d.escritas);
  ok(d.acao === 'desfazer' && !dd.faltas?.[QUINTA] && d.escritas.some((e) => e.apagar && e.caminho[0] === 'faltas' && e.caminho[1] === QUINTA), 'saiu da lista: a falta com origem lousa sai (campo apagado)', JSON.stringify(d.escritas.map((e) => e.caminho)));
  ok(d.eventos.length === 1 && d.eventos[0].id === 'lousa-falta-desfeita-001-2026-11-05-1910-888' && d.eventos[0].origem === 'servidor' && /saiu da lista/.test(d.eventos[0].resumo), 'e uma linha nos Registros diz que saiu da lista', JSON.stringify(d.eventos));
  ok(igual(Object.keys(d.portal), ['faltas']) && !d.portal.faltas[QUINTA], 'o Portal perde a falta');
  const doCoach = ana({ faltas: { [QUINTA]: { em: 5, tipo: 'no-show', aula: { data: QUINTA, hora: '19:10' } } } });
  ok(planoDeDesfazerFalta(regras, { ficha: doCoach, dia: QUINTA, hora: '19:10', versao: 888, agora: AGORA_QUINTA }).acao === 'nada', 'a falta lançada pelo coach (sem origem lousa) nunca é desfeita');
  ok(planoDeDesfazerFalta(regras, { ficha: ana(), dia: QUINTA, hora: '19:10', versao: 888, agora: AGORA_QUINTA }).acao === 'nada', 'sem falta da Lousa: nada');
  const dRep = planoDeDesfazerFalta(regras, { ficha: depoisDasEscritas(rep, pr.escritas), dia: QUINTA, hora: '19:10', versao: 888, agora: AGORA_QUINTA });
  ok(dRep.acao === 'desfazer' && !('noShow' in (depoisDasEscritas(depoisDasEscritas(rep, pr.escritas), dRep.escritas).atestados['2026-11-02'].reposicao)), 'o no-show da reposição que a Lousa gravou também sai');

  const reposto = regras.emailsQueFaltaram({ presentes: ['ana@box.com'], faltaram: ['Ana@Box.com'] });
  ok(!reposto.length, 'quem está em "presentes" não é mandado para falta, mesmo se a lista antiga ainda o trouxer', JSON.stringify(reposto));
}

function fechamentoDoBox(regras: RegrasDaGestao): void {
  console.log('\n6) O crédito do dia de box fechado');
  const hoje = QUINTA;
  const ficha = ana({ presencas: [] });
  const p = planoDoCreditoDeFechamento(regras, { ficha, dias: ['2026-11-02'], hoje, agora: AGORA_QUINTA });
  const depois = depoisDasEscritas(ficha, p.escritas);
  const cr = depois.atestados?.['2026-11-02'];
  ok(p.creditos === 1 && cr && cr.tipo === 'fechado' && cr.expira === '2026-11-30' && cr.reposicao === null && cr.aula.hora === '18:10', '+1 crédito para quem tinha aula (válido até o fim do mês)', JSON.stringify(depois.atestados));
  ok(p.escritas.length === 1 && p.escritas[0].caminho[0] === 'atestados', 'só o campo dos atestados é gravado (nenhum outro)', JSON.stringify(p.escritas.map((e) => e.caminho)));
  ok(p.eventos.length === 1 && p.eventos[0].id === 'fechado-001-2026-11-02' && p.eventos[0].tipo === 'credito' && p.eventos[0].origem === 'servidor', 'uma linha nos Registros com id fixo', JSON.stringify(p.eventos));
  ok(igual(Object.keys(p.portal), ['atestados']), 'o Portal recebe os atestados', JSON.stringify(p.portal));

  const de_novo = planoDoCreditoDeFechamento(regras, { ficha: depois, dias: ['2026-11-02'], hoje, agora: AGORA_QUINTA });
  ok(de_novo.creditos === 0 && !de_novo.escritas.length && !de_novo.eventos.length, 'rodar de novo: nada (a trava é atestados[dia])');

  const dois = planoDoCreditoDeFechamento(regras, { ficha, dias: ['2026-11-04', '2026-11-02'], hoje, agora: AGORA_QUINTA });
  const d2 = depoisDasEscritas(ficha, dois.escritas);
  ok(dois.creditos === 2 && d2.atestados['2026-11-02'] && d2.atestados['2026-11-04'], 'dois dias fechados: os dois créditos ficam (um não apaga o outro)', JSON.stringify(Object.keys(d2.atestados || {})));

  ok(planoDoCreditoDeFechamento(regras, { ficha: ana({ presencas: ['2026-11-02'] }), dias: ['2026-11-02'], hoje, agora: AGORA_QUINTA }).creditos === 0, 'quem veio de algum jeito no dia fechado: sem crédito');
  ok(planoDoCreditoDeFechamento(regras, { ficha: ana({ presencas: [], status: 'inativo' }), dias: ['2026-11-02'], hoje, agora: AGORA_QUINTA }).creditos === 0, 'ficha inativa: sem crédito');
  ok(planoDoCreditoDeFechamento(regras, { ficha: ana({ presencas: [], atestados: { '2026-11-02': { tipo: 'desmarcacao', expira: '2026-11-30', reposicao: null } } }), dias: ['2026-11-02'], hoje, agora: AGORA_QUINTA }).creditos === 0, 'quem já avisou nesse dia: sem crédito em dobro');

  const meta = { feriados: { '2026-11-02': false, '2026-11-15': false, '2026-11-20': true, 'lixo': false } };
  ok(igual(diasFechadosAteHoje(meta, hoje), ['2026-11-02']), 'só os dias fechados que já chegaram (o aberto e o futuro ficam de fora)', JSON.stringify(diasFechadosAteHoje(meta, hoje)));
  ok(igual(diasFechadosAteHoje(meta, '2026-11-30', '2026-11-10'), ['2026-11-15']) && igual(diasFechadosAteHoje(meta, '2026-11-30', '2026-11-02'), ['2026-11-02', '2026-11-15']) && igual(diasFechadosAteHoje(meta, '2026-11-30', 'lixo'), ['2026-11-02', '2026-11-15']), 'o corte "desde" ignora os dias fechados antes dele (e um valor inválido não corta)');
  ok(!diasFechadosAteHoje(null, hoje).length && !diasFechadosAteHoje({}, hoje).length, 'sem feriados no meta: nenhum dia');
}


regrasDaGestao().then((regras) => {
  aCopiaEAdaGestao();
  checkins(regras);
  avisosEReservas(regras);
  pix(regras);
  chamadaDaLousa(regras);
  fechamentoDoBox(regras);
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
