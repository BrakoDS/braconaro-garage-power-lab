/**
 * Confere `presenca.ts` (o servidor do "Não irei ao treino" e da ocupação):
 *
 *   1) casos escritos à mão — o relógio de São Paulo, o prazo de 2h, as
 *      recusas e a contagem das vagas;
 *   2) PARIDADE com o coach: roda `coach/gestao-de-alunos/presenca-regras.js`
 *      e este port sobre as mesmas fichas sorteadas — o status de cada aula na
 *      turma e o veredito do prazo têm de ser iguais. Se o site não estiver ao
 *      lado (clone só das functions), a paridade é pulada com aviso.
 *
 *     npm run checar:presenca
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  antecedenciaMin, aulasDoDia, avaliarAusencia, avaliarReposicao, avisosPorAluno, chaveDoDia, comReservas, creditosLivres,
  datasDaSemana, diaJaTemAula, GRADE_PADRAO, horasDaGrade, ocupacaoDoDia, relogioDoBox, reservasPorAluno, somarDias, validadeDoCredito, type Relogio,
  avaliarMarcacao, aulasNaSemana, comMarcacoes, marcacoesPorAluno,
} from './presenca';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else { falhas++; console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`); }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const mapa = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const importarEsm = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

type Dados = Record<string, unknown>;
const SEG = '2026-10-05', TER = '2026-10-06', QUA = '2026-10-07';
const ana = (extra: Dados = {}): Dados => ({
  id: 'A1', nome: 'Ana', diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' },
  presencas: [], remarcacoes: {}, atestados: {}, ...extra,
});

console.log('\nRELÓGIO E SEMANA\n');
ok(igual(relogioDoBox(new Date('2026-10-17T13:30:00Z')), { hoje: '2026-10-17', agora: '10:30' }), 'o relógio do box é o de São Paulo (UTC−3)');
ok(igual(relogioDoBox(new Date('2026-10-18T02:15:00Z')), { hoje: '2026-10-17', agora: '23:15' }), 'depois das 21h UTC ainda é o dia anterior no box');
ok(relogioDoBox(new Date('2026-10-17T03:05:00Z')).agora === '00:05', 'meia-noite sai como 00, não 24');
ok(chaveDoDia(QUA) === 'qua' && datasDaSemana(QUA).seg === SEG && datasDaSemana('2026-10-11').seg === SEG, 'a semana começa na segunda, domingo incluso');
ok(antecedenciaMin({ hoje: TER, agora: '22:30' }, QUA, '07:00') === 510 && somarDias(QUA, 30) === '2026-11-06', 'antecedência atravessa a meia-noite; 30 dias somados');

console.log('\n"NÃO IREI AO TREINO"\n');
const no = (r: ReturnType<typeof avaliarAusencia>) => ('erro' in r ? r.erro : r);
const r1 = avaliarAusencia(ana(), 'titular', QUA, { hoje: QUA, agora: '05:00' });
ok(igual(no(r1), { aula: { data: QUA, hora: '07:00' }, noPrazo: true, antecedenciaMin: 120, expira: '2026-10-31' }), 'exatamente 2h antes: no prazo, crédito até o fim do mês');
const rFim = avaliarAusencia(ana(), 'titular', '2026-10-28', { hoje: '2026-10-28', agora: '05:00' });
ok(!('erro' in rFim) && rFim.expira === '2026-11-04', 'aviso no fim do mês (28/10): o crédito vale no mínimo 7 dias');
ok(validadeDoCredito('2026-11-30') === '2026-12-07' && validadeDoCredito('2026-11-03') === '2026-11-30' && validadeDoCredito('2026-12-28') === '2027-01-04', 'validade: fim do mês, nunca menos de 7 dias');
const r2 = avaliarAusencia(ana(), 'titular', QUA, { hoje: QUA, agora: '05:01' });
ok(igual(no(r2), { aula: { data: QUA, hora: '07:00' }, noPrazo: false, antecedenciaMin: 119, expira: null }), '1h59 antes: fora do prazo, sem crédito');
ok(no(avaliarAusencia(ana(), 'titular', QUA, { hoje: QUA, agora: '07:00' })) === 'Essa aula já começou.', 'na hora da aula já não dá para avisar');
ok(no(avaliarAusencia(ana(), 'titular', TER, { hoje: SEG, agora: '07:00' })) === 'Essa aula não é da sua grade.', 'dia fora da grade é recusado');
ok(no(avaliarAusencia(ana({ atestados: { [QUA]: { tipo: 'desmarcacao' } } }), 'titular', QUA, { hoje: TER, agora: '07:00' })).toString().startsWith('Essa aula já foi desmarcada'), 'aula já desmarcada é recusada');
ok(no(avaliarAusencia(ana({ presencas: [QUA] }), 'titular', QUA, { hoje: QUA, agora: '06:00' })) === 'Você já fez check-in nessa aula.', 'quem já fez check-in não desmarca');
ok(no(avaliarAusencia(ana({ horarios: {} }), 'titular', QUA, { hoje: TER, agora: '07:00' })) === 'Essa aula não tem horário definido — fale com o coach.', 'aula sem horário é recusada');
ok(no(avaliarAusencia(ana(), 'titular', '2026-10-30', { hoje: QUA, agora: '07:00' })).toString().includes('próximos 14 dias'), 'aula a mais de 14 dias é recusada');
const remarcada = ana({ remarcacoes: { [SEG]: { data: TER, hora: '18:00' } } });
ok(igual(no(avaliarAusencia(remarcada, 'titular', SEG, { hoje: TER, agora: '15:00' })), { aula: { data: TER, hora: '18:00' }, noPrazo: true, antecedenciaMin: 180, expira: '2026-10-31' }), 'aula remarcada: o prazo mede a aula nova');
const comRep = ana({ atestados: { [SEG]: { tipo: 'desmarcacao', expira: '2026-11-01', reposicao: { data: '2026-10-08', hora: '18:00' } } } });
ok(igual(no(avaliarAusencia(comRep, 'reposicao', SEG, { hoje: '2026-10-08', agora: '15:00' })), { aula: { data: '2026-10-08', hora: '18:00' }, noPrazo: true, antecedenciaMin: 180, expira: '2026-11-01' }), 'reposição no prazo: o crédito volta com a validade que tinha');
ok(no(avaliarAusencia(ana(), 'reposicao', SEG, { hoje: SEG, agora: '06:00' })) === 'Você não tem reposição marcada para essa aula.', 'reposição inexistente é recusada');

console.log('\nOCUPAÇÃO\n');
/** Sem turma fixa: aqui só contam as turmas com gente (a grade tem teste próprio). */
const SEM_GRADE = { qua: [], qui: [] };
const bia: Dados = { id: 'B2', nome: 'Bia', diasTreino: ['qua'], horarios: { qua: '07:00' } };
const caio: Dados = { id: 'C3', nome: 'Caio', diasTreino: ['qua'], horarios: { qua: '18:00' } };
const exps = { [QUA]: [{ hora: '07:00', status: 'confirmado' }, { hora: '07:00', status: 'cancelada' }, { hora: '12:00', status: 'confirmado' }] };
const occ = ocupacaoDoDia([ana(), bia, caio], QUA, { hoje: QUA, experimentais: exps, config: { porHorario: { '07:00': 3 }, grade: SEM_GRADE } });
ok(igual(occ.map((t) => [t.hora, t.ocupadas, t.capacidade, t.vagas]), [['07:00', 3, 3, 0], ['12:00', 1, 6, 5], ['18:00', 1, 6, 5]]), 'conta titulares e experimentais (a cancelada não), por horário');
const avisos = avisosPorAluno([{ itens: { [`titular|${QUA}`]: { coachUid: 'X', alunoId: 'B2', noPrazo: false } } }, { itens: { 'titular|2026-10-07': { coachUid: 'outro', alunoId: 'A1', noPrazo: true } } }], 'X');
ok(igual(avisos, { B2: { [`titular|${QUA}`]: { noPrazo: false } } }), 'avisos pendentes por aluno, só os deste coach');
const comAviso = ocupacaoDoDia([ana(), bia], QUA, { hoje: QUA, avisos, config: { grade: SEM_GRADE } });
ok(comAviso[0].ocupadas === 1, 'o aviso que a Gestão ainda não aplicou já libera a vaga');
ok(!JSON.stringify(occ).includes('Ana'), 'nenhum nome sai na ocupação');

console.log('\nGRADE DE HORÁRIOS DO BOX\n');
ok(igual(horasDaGrade({}, 'qua'), ['06:00', '07:00', '08:00', '09:00', '10:00', '15:00', '16:00', '17:00', '18:10', '19:10', '20:10']), 'seg a qui: 6h–10h, 15h–17h e a noite com 10 min a mais');
ok(horasDaGrade({}, 'sex').at(-1) === '18:10' && horasDaGrade({}, 'sex').length === 9, 'sexta: a última começa 18:10');
ok(igual(horasDaGrade({}, 'sab'), ['08:00', '10:00', '12:30']) && igual(horasDaGrade({}, 'dom'), []), 'sábado 8h, 10h e 12:30; domingo sem aula');
ok(igual(horasDaGrade({ grade: { qua: ['19:10', '07:00', 'lixo'] } }, 'qua'), ['07:00', '19:10']) && horasDaGrade({ grade: { qua: [] } }, 'seg').length === 11, 'a grade salva pelo coach vale por dia; dia não salvo fica com a padrão');
const vazia = ocupacaoDoDia([ana()], QUA, { hoje: QUA });
ok(vazia.length === 11 && igual(vazia.find((t) => t.hora === '07:00'), { dia: QUA, hora: '07:00', capacidade: 6, ocupadas: 1, vagas: 5 })
  && igual(vazia.find((t) => t.hora === '15:00'), { dia: QUA, hora: '15:00', capacidade: 6, ocupadas: 0, vagas: 6 }), 'a turma da grade aparece mesmo vazia (0/6)');
ok(ocupacaoDoDia([], '2026-10-11', { hoje: QUA }).length === 0, 'domingo sem ninguém: nenhuma turma');

console.log('\nREPOSIÇÃO MARCADA PELO ALUNO\n');
const QUI = '2026-10-08';
const TER10 = { hoje: TER, agora: '10:00' };
const credSeg = (extra: Dados = {}) => ({ [SEG]: { tipo: 'desmarcacao', expira: '2026-11-04', reposicao: null, ...extra } });
const comCredito = (atestados: Dados = credSeg()) => ana({ atestados });
const rep = (a: Dados, data: string, hora: string, vagas: number | null, relogio: Relogio = TER10) => no2(avaliarReposicao(a, { data, hora }, { relogio, vagas }));
const no2 = (r: ReturnType<typeof avaliarReposicao>) => ('erro' in r ? r.erro : r);

ok(igual(rep(comCredito(), QUI, '18:00', 3), { origem: SEG, expira: '2026-11-04', aula: { data: QUI, hora: '18:00' }, antecedenciaMin: 3360 }), 'turma com vaga e crédito livre: marca, com o crédito de origem');
ok(rep(comCredito(), QUI, '18:00', null) === 'Não há turma nesse dia e horário.', 'horário sem turma é recusado');
ok(rep(comCredito(), QUI, '18:00', 0) === 'Turma lotada.', 'turma lotada é recusada');
ok(rep(comCredito(), QUA, '18:00', 3) === 'Você já tem aula nesse dia.', 'dia em que ele já treina é recusado (um dia, uma aula)');
ok(typeof rep(comCredito({ ...credSeg(), [QUA]: { tipo: 'desmarcacao', expira: '2026-11-06' } }), QUA, '18:00', 3) === 'object', 'dia da aula que ele desmarcou fica livre para a reposição');
ok(rep(comCredito(), TER, '10:59', 3) === 'A reposição só pode ser marcada até 1h antes da aula.', '59 min antes: recusado');
ok(typeof rep(comCredito(), TER, '11:00', 3) === 'object', 'exatamente 1h antes: vale');
ok(rep(comCredito(), TER, '09:00', 3) === 'Essa aula já começou.', 'aula que já começou é recusada');
ok(rep(comCredito(), '2026-10-13', '18:00', 3).toString().includes('próximos 7 dias'), 'além dos 7 dias da ocupação: recusado');
ok(rep(ana(), QUI, '18:00', 3) === 'Você não tem crédito de reposição.', 'sem crédito: recusado');
ok(rep(comCredito(credSeg({ expira: '2026-10-05' })), QUI, '18:00', 3) === 'Você não tem crédito de reposição.', 'crédito vencido não conta');
ok(rep(comCredito(credSeg({ reposicao: { data: '2026-10-10', hora: '09:00' } })), QUI, '18:00', 3) === 'Você não tem crédito de reposição.', 'crédito já usado não conta');
ok(rep(comCredito(credSeg({ expira: '2026-10-07' })), QUI, '18:00', 3, { hoje: TER, agora: '10:00' }) === 'O seu crédito vale até 07/10. Escolha uma aula até lá.', 'aula depois da validade do crédito: recusada');
const doisCreditos = comCredito({ '2026-09-28': { tipo: 'desmarcacao', expira: '2026-10-28' }, '2026-09-21': { tipo: 'atestado' }, ...credSeg() });
ok((rep(doisCreditos, QUI, '18:00', 3) as { origem: string }).origem === '2026-09-28', 'usa o crédito que vence primeiro (atestado médico, que não vence, por último)');
ok(igual(creditosLivres(doisCreditos, TER).map((c) => c.origem), ['2026-09-28', SEG, '2026-09-21']), 'créditos livres em ordem de vencimento');

const reservas = { [SEG]: { origem: SEG, data: QUI, hora: '18:00' } };
const avisoNoPrazo = { [`titular|${QUA}`]: { tipo: 'titular', chave: QUA, noPrazo: true, expira: '2026-11-05', coachUid: 'X' } };
const pendente = comReservas(comCredito(), reservas, avisoNoPrazo);
ok(igual(mapa(mapa(pendente.atestados)[SEG]).reposicao, { data: QUI, hora: '18:00' }), 'a reserva pendente entra na ficha como a reposição do crédito');
ok(igual(mapa(pendente.atestados)[QUA], { tipo: 'desmarcacao', expira: '2026-11-05', reposicao: null }), 'o "Não irei" no prazo ainda não aplicado já é crédito');
ok((rep(pendente, '2026-10-10', '09:00', 3) as { origem: string }).origem === QUA, 'com o crédito de SEG reservado, a próxima reserva usa o do aviso pendente');
ok(rep(pendente, QUI, '19:30', 3) === 'Você já tem aula nesse dia.', 'a reserva pendente já ocupa o dia');
ok(igual(reservasPorAluno([{ itens: { [SEG]: { ...reservas[SEG], coachUid: 'X', alunoId: 'A1' } } }, { itens: { [SEG]: { ...reservas[SEG], coachUid: 'outro', alunoId: 'B2' } } }], 'X'), { A1: reservas }), 'reservas pendentes por aluno, só as deste coach');
const occRes = ocupacaoDoDia([ana({ atestados: { [SEG]: { tipo: 'desmarcacao' } } }), caio], QUI, { hoje: TER, reservas: { A1: reservas }, config: { grade: SEM_GRADE } });
ok(igual(occRes.map((t) => [t.hora, t.ocupadas]), [['18:00', 1]]), 'a reserva que a Gestão ainda não aplicou já ocupa a vaga');
const occAvisoPend = ocupacaoDoDia([ana()], QUI, { hoje: TER, reservas: { A1: reservas }, config: { grade: SEM_GRADE } });
ok(occAvisoPend.length === 1 && occAvisoPend[0].ocupadas === 1, 'reserva de crédito que ainda é aviso pendente também ocupa');
const desmarcaPend = avaliarAusencia(comReservas(comCredito(), reservas), 'reposicao', SEG, TER10);
ok(!('erro' in desmarcaPend) && desmarcaPend.noPrazo && desmarcaPend.expira === '2026-11-04', 'a reserva pendente pode ser desmarcada no prazo, e o crédito volta com a validade dele');

console.log('\nO ILIMITADO MARCANDO AULA (etapa 6.3)\n');
const ivo = (extra: Dados = {}): Dados => ({ id: 'I9', nome: 'Ivo', plano: { vezes: 'ilimitado' }, presencas: [], atestados: {}, ...extra });
const marca = (a: Dados, data: string, hora: string, vagas: number | null, relogio: Relogio = TER10) => {
  const r = avaliarMarcacao(a, { data, hora }, { relogio, vagas });
  return 'erro' in r ? r.erro : r;
};
ok(igual(marca(ivo(), QUI, '18:00', 2), { aula: { data: QUI, hora: '18:00' }, antecedenciaMin: 3360 }), 'Ilimitado com vaga: marca');
ok(marca(ana(), QUI, '18:00', 2) === 'Só o plano Ilimitado marca aula por aula.', 'quem não é Ilimitado não marca');
ok(marca(ivo({ status: 'pausado' }), QUI, '18:00', 2) === 'Seu plano está pausado.', 'pausado não marca');
ok(marca(ivo(), QUI, '18:00', null) === 'Não há turma nesse dia e horário.', 'sem turma: recusado');
ok(marca(ivo(), QUI, '18:00', 0) === 'Turma lotada.', 'lotada: recusado');
ok(marca(ivo(), TER, '10:59', 2) === 'A aula só pode ser marcada até 1h antes.', '59 min antes: recusado');
ok(String(marca(ivo(), '2026-10-13', '18:00', 2)).includes('próximos 7 dias'), 'além dos 7 dias: recusado');
ok(String(marca(ivo({ marcacoes: { [QUI]: { hora: '07:00' } } }), QUI, '18:00', 2)).includes('uma por dia'), 'uma aula por dia');
const seis = ivo({ marcacoes: Object.fromEntries(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((d) => [d, { hora: '07:00' }])) });
ok(aulasNaSemana(seis, QUA) === 6 && String(marca(seis, '2026-10-11', '18:00', 2, { hoje: SEG, agora: '06:00' })).includes('6 aulas'), 'no máximo 6 na semana');
const comFaltaI = ivo({ marcacoes: { ...mapa(seis.marcacoes), '2026-10-05': { hora: '07:00', noShow: true } } });
ok(aulasNaSemana(comFaltaI, QUA) === 5, 'a falta não conta no limite');
const ivoMarcado = ivo({ marcacoes: { [QUI]: { hora: '18:00' } } });
ok(igual(no(avaliarAusencia(ivoMarcado, 'ilimitado', QUI, TER10)), { aula: { data: QUI, hora: '18:00' }, noPrazo: true, antecedenciaMin: 3360, expira: null }), 'Não irei do Ilimitado: no prazo, sem crédito');
ok(no(avaliarAusencia(ivo(), 'ilimitado', QUI, TER10)) === 'Você não tem aula marcada nesse dia.', 'Não irei sem aula marcada: recusado');
const pendM = marcacoesPorAluno([{ itens: { [QUI]: { data: QUI, hora: '18:00', coachUid: 'X', alunoId: 'I9' } } }, { itens: { [QUI]: { data: QUI, hora: '18:00', coachUid: 'outro', alunoId: 'B2' } } }], 'X');
ok(igual(pendM, { I9: { [QUI]: { data: QUI, hora: '18:00' } } }), 'marcações pendentes por aluno, só as deste coach');
ok(igual(mapa(comMarcacoes(ivo(), pendM.I9).marcacoes), { [QUI]: { hora: '18:00' } }), 'a marcação pendente entra na ficha');
const occM = ocupacaoDoDia([ivo(), caio], QUI, { hoje: TER, marcacoes: pendM, config: { grade: SEM_GRADE } });
ok(igual(occM.map((t) => [t.hora, t.ocupadas]), [['18:00', 1]]), 'a marcação que a rotina ainda não aplicou já ocupa a vaga');
ok(rep(comMarcacoes(comCredito(), { [QUI]: { data: QUI, hora: '07:00' } }), QUI, '18:00', 3) === 'Você já tem aula nesse dia.', 'a reposição não cai no dia da aula marcada');

async function paridade(): Promise<void> {
  const caminho = resolve(__dirname, '..', '..', 'coach', 'gestao-de-alunos', 'presenca-regras.js');
  if (!existsSync(caminho)) { console.log(`\n  ⚠ ${caminho} não encontrado — paridade com o coach PULADA.`); return; }
  const site = await importarEsm(pathToFileURL(caminho).href) as {
    aulasDoDia: (al: unknown[], dia: string, o: unknown) => Array<{ aluno: Dados; tipo: string; chave: string; hora: string; status: string }>;
    previaDesmarcacao: (a: unknown, plan: string, aviso: Relogio) => { noPrazo: boolean; antecedenciaMin: number } | null;
    desmarcar: (a: unknown, plan: string, o: unknown) => { patch?: { atestados: Record<string, { expira: string }> } };
    GRADE_PADRAO: Record<string, string[]>;
    horasDaGrade: (config: unknown, diaChave: string) => string[];
  };
  const checkin = await importarEsm(pathToFileURL(resolve(caminho, '..', 'checkin-regras.js')).href) as {
    donoDoDia: (a: unknown, diaPlanejado: string, diaAlvo: string) => string | null;
  };
  const ilim = await importarEsm(pathToFileURL(resolve(caminho, '..', 'ilimitado-regras.js')).href) as {
    avaliarMarcacao: (a: unknown, aula: unknown, o: unknown) => { ok: true } | { erro: string };
    aulasNaSemana: (a: unknown, dia: string) => number;
  };
  console.log('\nPARIDADE COM O COACH (presenca-regras.js e checkin-regras.js)\n');

  let semente = 20261017;
  const sorteio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const um = <T>(xs: readonly T[]) => xs[Math.floor(sorteio() * xs.length)];
  const alguns = <T>(xs: readonly T[], p: number) => xs.filter(() => sorteio() < p);
  const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const HORAS = ['06:00', '07:00', '12:00', '18:00', '19:30', ''];
  const HOJES = ['2026-10-05', '2026-10-07', '2026-10-11', '2026-12-31'];

  const divergentes: string[] = [];
  let conferidos = 0;
  for (let caso = 0; caso < 400; caso++) {
    const hoje = um(HOJES);
    const semana = Object.values(datasDaSemana(hoje));
    const fichas: Dados[] = Array.from({ length: 4 }, (_, i) => {
      const diasTreino = alguns(DIAS, 0.5);
      const horarios = Object.fromEntries(diasTreino.map((k) => [k, um(HORAS)]));
      const aulas = diasTreino.map((k) => datasDaSemana(hoje)[k]);
      const atestados: Dados = {};
      const faltas: Dados = {};
      for (const iso of alguns(aulas, 0.3)) {
        const t = um(['desmarcacao', 'excecao', 'fechado', 'atestado', 'falta-fora', 'falta-noshow']);
        const aula = sorteio() < 0.5 ? { data: um(semana), hora: um(HORAS) } : undefined;
        if (t === 'falta-fora' || t === 'falta-noshow') faltas[iso] = { tipo: t === 'falta-fora' ? 'fora-do-prazo' : 'no-show', aula };
        else atestados[iso] = { tipo: t === 'atestado' ? undefined : t, antes: um(['fora-do-prazo', 'no-show', 'sem-chamada']), aula, reposicao: null };
      }
      for (const origem of alguns(['2026-09-01', '2026-09-08'], 0.4)) {
        atestados[origem] = { tipo: 'desmarcacao', reposicao: { data: um(semana), hora: um(HORAS), ...(sorteio() < 0.2 ? { foraDoPrazo: true } : {}), ...(sorteio() < 0.2 ? { noShow: true } : {}) } };
      }
      const remarcacoes = Object.fromEntries(alguns(aulas, 0.2).map((iso) => [iso, sorteio() < 0.3 ? um(semana) : { data: um(semana), hora: um(HORAS) }]));
      // Etapa 6.3: o Ilimitado, com aulas marcadas (algumas com falta).
      const ilimitado = sorteio() < 0.5;
      const marcacoes = ilimitado ? Object.fromEntries(alguns(semana, 0.35).map((d) => [d, { hora: um(HORAS), ...(sorteio() < 0.15 ? { noShow: true } : {}), ...(sorteio() < 0.15 ? { foraDoPrazo: true } : {}) }])) : {};
      return {
        id: `F${i}`, nome: `F${i}`, diasTreino, horarios, presencas: alguns(semana, 0.3), presencaHoras: {}, remarcacoes, atestados, faltas,
        ...(ilimitado ? { plano: { vezes: 'ilimitado' }, marcacoes } : {}), ...(sorteio() < 0.1 ? { status: 'pausado' } : {}),
      };
    });
    const fechados = alguns(semana, 0.1);
    for (const dia of semana) {
      const norm = (xs: Array<{ alunoId: string; tipo: string; chave: string; hora: string; status: string }>) =>
        JSON.stringify(xs.map((x) => [x.alunoId, x.tipo, x.chave, x.hora, x.status]).sort());
      const a = norm(aulasDoDia(fichas, dia, { hoje, fechados }));
      const b = norm(site.aulasDoDia(fichas, dia, { hoje, fechados }).map((x) => ({ ...x, alunoId: String(x.aluno.id) })));
      conferidos++;
      if (a !== b) divergentes.push(`caso ${caso}, ${dia}: servidor=${a.slice(0, 160)} coach=${b.slice(0, 160)}`);
    }
    // O veredito do prazo: aula de cada ficha, aviso em horas sorteadas.
    for (const f of fichas) {
      for (const k of f.diasTreino as string[]) {
        const plan = datasDaSemana(hoje)[k];
        const relogio = { hoje: um(semana), agora: um(['00:30', '04:59', '05:00', '05:01', '16:00', '17:31', '23:59']) };
        const r = avaliarAusencia(f, 'titular', plan, relogio);
        if ('erro' in r) continue;
        const p = site.previaDesmarcacao(f, plan, relogio);
        conferidos++;
        if (!p || p.noPrazo !== r.noPrazo || p.antecedenciaMin !== r.antecedenciaMin) divergentes.push(`prazo ${f.id} ${plan}: servidor=${JSON.stringify(r)} coach=${JSON.stringify(p)}`);
        const d = site.desmarcar(f, plan, { aviso: relogio, em: 1 });
        const expiraCoach = r.noPrazo ? d.patch?.atestados[plan]?.expira ?? null : null;
        if (expiraCoach !== r.expira) divergentes.push(`validade ${f.id} ${plan}: servidor=${r.expira} coach=${expiraCoach}`);
      }
      // O Ilimitado marcando (etapa 6.3): o mesmo veredito nos dois lados, em turmas e relógios sorteados.
      for (const dia of semana) {
        const relogio = { hoje: um(HOJES), agora: um(['06:00', '10:00', '17:00', '23:30']) };
        const aula = { data: dia, hora: um(HORAS) };
        const vagas = um([0, 1, 3]);
        const s = avaliarMarcacao(f, aula, { relogio, vagas });
        const c = ilim.avaliarMarcacao(f, aula, { relogio, vagas });
        conferidos++;
        if (('erro' in s) !== ('erro' in c)) divergentes.push(`marcar ${f.id} ${dia} ${aula.hora} vagas=${vagas} ${relogio.hoje} ${relogio.agora}: servidor=${JSON.stringify(s)} coach=${JSON.stringify(c)}`);
        if (aulasNaSemana(f, dia) !== ilim.aulasNaSemana(f, dia)) divergentes.push(`semana ${f.id} ${dia}: servidor=${aulasNaSemana(f, dia)} coach=${ilim.aulasNaSemana(f, dia)}`);
        // Um dia, uma aula: a marcação também ocupa o dia.
        const coachDia = checkin.donoDoDia(f, `ilimitado:${dia}`, dia) != null || !!mapa(f.marcacoes)[dia];
        if (coachDia !== diaJaTemAula(f, dia)) divergentes.push(`dia (Ilimitado) ${f.id} ${dia}: servidor=${diaJaTemAula(f, dia)} coach=${coachDia}`);
      }
      // "Um dia, uma aula" da reposição: com cada crédito livre, cada dia da semana.
      for (const { origem } of creditosLivres(f, '2026-01-01')) {
        for (const dia of semana) {
          const coach = checkin.donoDoDia(f, origem, dia) != null;
          conferidos++;
          if (coach !== diaJaTemAula(f, dia)) divergentes.push(`dia ${f.id} ${origem}→${dia}: servidor=${diaJaTemAula(f, dia)} coach=${coach}`);
        }
      }
    }
  }
  ok(divergentes.length === 0, `servidor e coach concordam em ${conferidos} turmas e prazos sorteados`, divergentes.slice(0, 3).join('\n      '));
  ok(igual(site.GRADE_PADRAO, GRADE_PADRAO), 'a grade padrão de horários é a mesma no servidor e no coach');
  const configs = [{}, { grade: { qua: ['19:10', '07:00', 'x'] } }, { grade: { seg: [] } }, { grade: null }, { grade: ['06:00'] }];
  ok(configs.every((c) => ['seg', 'qua', 'sex', 'sab', 'dom'].every((k) => igual(site.horasDaGrade(c, k), horasDaGrade(c, k)))),
    'a grade salva pelo coach é lida igual nos dois lados');
}

paridade().then(() => {
  console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ presenca.ts conferido.');
  process.exit(falhas ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
