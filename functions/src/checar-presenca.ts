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
  antecedenciaMin, aulasDoDia, avaliarAusencia, avisosPorAluno, chaveDoDia, datasDaSemana, ocupacaoDoDia,
  relogioDoBox, somarDias, type Relogio,
} from './presenca';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else { falhas++; console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`); }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
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
ok(igual(no(r1), { aula: { data: QUA, hora: '07:00' }, noPrazo: true, antecedenciaMin: 120, expira: '2026-11-06' }), 'exatamente 2h antes: no prazo, crédito de 30 dias');
const r2 = avaliarAusencia(ana(), 'titular', QUA, { hoje: QUA, agora: '05:01' });
ok(igual(no(r2), { aula: { data: QUA, hora: '07:00' }, noPrazo: false, antecedenciaMin: 119, expira: null }), '1h59 antes: fora do prazo, sem crédito');
ok(no(avaliarAusencia(ana(), 'titular', QUA, { hoje: QUA, agora: '07:00' })) === 'Essa aula já começou.', 'na hora da aula já não dá para avisar');
ok(no(avaliarAusencia(ana(), 'titular', TER, { hoje: SEG, agora: '07:00' })) === 'Essa aula não é da sua grade.', 'dia fora da grade é recusado');
ok(no(avaliarAusencia(ana({ atestados: { [QUA]: { tipo: 'desmarcacao' } } }), 'titular', QUA, { hoje: TER, agora: '07:00' })).toString().startsWith('Essa aula já foi desmarcada'), 'aula já desmarcada é recusada');
ok(no(avaliarAusencia(ana({ presencas: [QUA] }), 'titular', QUA, { hoje: QUA, agora: '06:00' })) === 'Você já fez check-in nessa aula.', 'quem já fez check-in não desmarca');
ok(no(avaliarAusencia(ana({ horarios: {} }), 'titular', QUA, { hoje: TER, agora: '07:00' })) === 'Essa aula não tem horário definido — fale com o coach.', 'aula sem horário é recusada');
ok(no(avaliarAusencia(ana(), 'titular', '2026-10-30', { hoje: QUA, agora: '07:00' })).toString().includes('próximos 14 dias'), 'aula a mais de 14 dias é recusada');
const remarcada = ana({ remarcacoes: { [SEG]: { data: TER, hora: '18:00' } } });
ok(igual(no(avaliarAusencia(remarcada, 'titular', SEG, { hoje: TER, agora: '15:00' })), { aula: { data: TER, hora: '18:00' }, noPrazo: true, antecedenciaMin: 180, expira: '2026-11-05' }), 'aula remarcada: o prazo mede a aula nova');
const comRep = ana({ atestados: { [SEG]: { tipo: 'desmarcacao', expira: '2026-11-01', reposicao: { data: '2026-10-08', hora: '18:00' } } } });
ok(igual(no(avaliarAusencia(comRep, 'reposicao', SEG, { hoje: '2026-10-08', agora: '15:00' })), { aula: { data: '2026-10-08', hora: '18:00' }, noPrazo: true, antecedenciaMin: 180, expira: '2026-11-01' }), 'reposição no prazo: o crédito volta com a validade que tinha');
ok(no(avaliarAusencia(ana(), 'reposicao', SEG, { hoje: SEG, agora: '06:00' })) === 'Você não tem reposição marcada para essa aula.', 'reposição inexistente é recusada');

console.log('\nOCUPAÇÃO\n');
const bia: Dados = { id: 'B2', nome: 'Bia', diasTreino: ['qua'], horarios: { qua: '07:00' } };
const caio: Dados = { id: 'C3', nome: 'Caio', diasTreino: ['qua'], horarios: { qua: '18:00' } };
const exps = { [QUA]: [{ hora: '07:00', status: 'confirmado' }, { hora: '07:00', status: 'cancelada' }, { hora: '12:00', status: 'confirmado' }] };
const occ = ocupacaoDoDia([ana(), bia, caio], QUA, { hoje: QUA, experimentais: exps, config: { porHorario: { '07:00': 3 } } });
ok(igual(occ.map((t) => [t.hora, t.ocupadas, t.capacidade, t.vagas]), [['07:00', 3, 3, 0], ['12:00', 1, 6, 5], ['18:00', 1, 6, 5]]), 'conta titulares e experimentais (a cancelada não), por horário');
const avisos = avisosPorAluno([{ itens: { [`titular|${QUA}`]: { coachUid: 'X', alunoId: 'B2', noPrazo: false } } }, { itens: { 'titular|2026-10-07': { coachUid: 'outro', alunoId: 'A1', noPrazo: true } } }], 'X');
ok(igual(avisos, { B2: { [`titular|${QUA}`]: { noPrazo: false } } }), 'avisos pendentes por aluno, só os deste coach');
const comAviso = ocupacaoDoDia([ana(), bia], QUA, { hoje: QUA, avisos });
ok(comAviso[0].ocupadas === 1, 'o aviso que a Gestão ainda não aplicou já libera a vaga');
ok(!JSON.stringify(occ).includes('Ana'), 'nenhum nome sai na ocupação');

async function paridade(): Promise<void> {
  const caminho = resolve(__dirname, '..', '..', 'coach', 'gestao-de-alunos', 'presenca-regras.js');
  if (!existsSync(caminho)) { console.log(`\n  ⚠ ${caminho} não encontrado — paridade com o coach PULADA.`); return; }
  const site = await importarEsm(pathToFileURL(caminho).href) as {
    aulasDoDia: (al: unknown[], dia: string, o: unknown) => Array<{ aluno: Dados; tipo: string; chave: string; hora: string; status: string }>;
    previaDesmarcacao: (a: unknown, plan: string, aviso: Relogio) => { noPrazo: boolean; antecedenciaMin: number } | null;
    desmarcar: (a: unknown, plan: string, o: unknown) => { patch?: { atestados: Record<string, { expira: string }> } };
  };
  console.log('\nPARIDADE COM O COACH (presenca-regras.js)\n');

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
        const t = um(['desmarcacao', 'excecao', 'atestado', 'falta-fora', 'falta-noshow']);
        const aula = sorteio() < 0.5 ? { data: um(semana), hora: um(HORAS) } : undefined;
        if (t === 'falta-fora' || t === 'falta-noshow') faltas[iso] = { tipo: t === 'falta-fora' ? 'fora-do-prazo' : 'no-show', aula };
        else atestados[iso] = { tipo: t === 'atestado' ? undefined : t, antes: um(['fora-do-prazo', 'no-show']), aula, reposicao: null };
      }
      for (const origem of alguns(['2026-09-01', '2026-09-08'], 0.4)) {
        atestados[origem] = { tipo: 'desmarcacao', reposicao: { data: um(semana), hora: um(HORAS), ...(sorteio() < 0.2 ? { foraDoPrazo: true } : {}), ...(sorteio() < 0.2 ? { noShow: true } : {}) } };
      }
      const remarcacoes = Object.fromEntries(alguns(aulas, 0.2).map((iso) => [iso, sorteio() < 0.3 ? um(semana) : { data: um(semana), hora: um(HORAS) }]));
      return { id: `F${i}`, nome: `F${i}`, diasTreino, horarios, presencas: alguns(semana, 0.3), presencaHoras: {}, remarcacoes, atestados, faltas };
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
    }
  }
  ok(divergentes.length === 0, `servidor e coach concordam em ${conferidos} turmas e prazos sorteados`, divergentes.slice(0, 3).join('\n      '));
}

paridade().then(() => {
  console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ presenca.ts conferido.');
  process.exit(falhas ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
