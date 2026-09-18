// @ts-check
/**
 * A GRADE DO CALENDÁRIO MENSAL — matemática de datas, sem DOM.
 *
 * O box já teve uma visão mensal e ela ficou de fora desta versão. É a tela em
 * que o coach enxerga o mês inteiro de uma vez: o que já foi dado, o que está
 * marcado, e o buraco de terça que ninguém tinha notado.
 *
 * ── A semana começa na SEGUNDA ───────────────────────────────────────────────
 * Como em `compartilhado/regras/semana.js` (`segundaDaSemana`) e como no
 * consolidado de volume, que usa semana ISO. Um calendário começando no domingo
 * ao lado de um tracker começando na segunda faria o coach comparar duas
 * semanas diferentes achando que são a mesma.
 *
 * ── Meio-dia UTC em toda conversão ───────────────────────────────────────────
 * 'YYYY-MM-DD' interpretado como meia-noite UTC cai no DIA ANTERIOR em qualquer
 * fuso negativo — e o box está em UTC-3. O treino de segunda apareceria no
 * domingo.
 *
 * @typedef {{dateId: string, dia: number, foraDoMes: boolean, ehHoje: boolean, ehFuturo: boolean}} Dia
 */

export const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** @param {string} dateId 'YYYY-MM-DD' */
function dataDe(dateId) {
  const t = Date.parse(`${dateId}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

const iso = (d) => d.toISOString().slice(0, 10);

/** 'YYYY-MM' → 'setembro de 2026'. */
export function rotuloMes(mesId) {
  const [ano, m] = String(mesId || '').split('-').map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${ano}` : String(mesId || '');
}

/** O mês vizinho, sem depender do fuso local. @param {string} mesId @param {number} passo */
export function mesVizinho(mesId, passo) {
  const [ano, m] = String(mesId || '').split('-').map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(m)) return mesId;
  const d = new Date(Date.UTC(ano, m - 1 + passo, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** O 'YYYY-MM' de uma data. */
export const mesDe = (dateId) => String(dateId || '').slice(0, 7);

/**
 * A grade do mês: semanas de segunda a domingo, incluindo os dias vizinhos que
 * completam a primeira e a última linha.
 *
 * Os dias de fora vêm marcados (`foraDoMes`) em vez de virarem célula em branco:
 * um treino de 31 de agosto que cai na primeira linha de setembro É o treino da
 * semana que o coach está olhando, e escondê-lo faria a semana parecer mais
 * vazia do que foi.
 *
 * @param {string} mesId 'YYYY-MM'
 * @param {string} [hojeId] 'YYYY-MM-DD' — injetado para o teste não depender do relógio
 * @returns {{mesId: string, rotulo: string, semanas: Dia[][]}}
 */
export function gradeDoMes(mesId, hojeId) {
  const [ano, m] = String(mesId || '').split('-').map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { mesId: String(mesId || ''), rotulo: rotuloMes(mesId), semanas: [] };
  }
  const hoje = hojeId || iso(new Date());

  const primeiro = new Date(Date.UTC(ano, m - 1, 1, 12));
  const diaIso = (primeiro.getUTCDay() + 6) % 7; // segunda = 0
  const cursor = new Date(primeiro.getTime());
  cursor.setUTCDate(cursor.getUTCDate() - diaIso);

  const ultimoDia = new Date(Date.UTC(ano, m, 0, 12));
  /** @type {Dia[][]} */
  const semanas = [];

  // Até 6 linhas: é o máximo que um mês ocupa numa grade que começa na segunda
  // (31 dias abrindo num domingo). O teto também impede laço infinito se a
  // aritmética de data falhar.
  for (let linha = 0; linha < 6; linha++) {
    /** @type {Dia[]} */
    const semana = [];
    for (let i = 0; i < 7; i++) {
      const dateId = iso(cursor);
      semana.push({
        dateId,
        dia: cursor.getUTCDate(),
        foraDoMes: mesDe(dateId) !== mesId,
        ehHoje: dateId === hoje,
        ehFuturo: dateId > hoje,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    semanas.push(semana);
    // Passou do fim do mês e a linha já fechou no domingo: não desenha uma
    // sétima linha só de dias do mês seguinte.
    if (cursor.getTime() > ultimoDia.getTime()) break;
  }
  return { mesId, rotulo: rotuloMes(mesId), semanas };
}

/**
 * Treinos indexados por dia.
 *
 * Um dia pode ter MAIS DE UM treino: o coach monta um Hyrox pela manhã e um HIIT
 * à noite, cada um com a sua lousa. Um mapa de um treino por dia esconderia o
 * segundo sem avisar ninguém.
 *
 * A ordem dentro do dia é a de CRIAÇÃO (`geradoEm`). O `classTime` ainda entra
 * na conta, mas só por causa dos treinos salvos antes de o horário sair da
 * Lousa — hoje ele vem vazio em todos, e ordenar só por ele deixaria a ordem ao
 * acaso do navegador.
 *
 * @param {any[]} lousas
 * @returns {Record<string, any[]>}
 */
export function agruparPorDia(lousas) {
  /** @type {Record<string, any[]>} */
  const porDia = {};
  for (const l of lousas || []) {
    const d = l?.dateId;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    (porDia[d] ||= []).push(l);
  }
  // Dentro do dia, ordena pelo horário da turma — é a ordem em que as aulas
  // acontecem, e é como o coach lê a agenda dele.
  for (const d of Object.keys(porDia)) {
    porDia[d].sort((a, b) =>
      String(a.classTime || '').localeCompare(String(b.classTime || ''))
      || String(a.geradoEm || '').localeCompare(String(b.geradoEm || '')));
  }
  return porDia;
}

/**
 * Este treino pode ser reaberto para edição?
 *
 * Só hoje e o futuro. Treino passado é registro do que aconteceu na aula: dá
 * para consultar, não para reescrever. Deixar editar mudaria o histórico que o
 * consolidado de volume já contou — o coach corrigiria uma terça de três semanas
 * atrás e o gráfico do mês mudaria sozinho, sem nada explicando por quê.
 *
 * @param {string} dateId @param {string} [hojeId]
 */
export function editavel(dateId, hojeId) {
  const hoje = hojeId || iso(new Date());
  return typeof dateId === 'string' && dateId >= hoje;
}

/**
 * A chave de cor da modalidade, a partir do sistema do treino.
 *
 * O Híbrido escreve 'HIIT'/'GAP'/'Hipertrofia'/'Hyrox'; `COR_MODALIDADE`
 * (`compartilhado/config/cores-modalidade.js`) indexa por chave minúscula, e é
 * a mesma tabela que o calendário do Montador e o do Portal do Aluno usam. Um
 * mapa próprio aqui daria ao mesmo treino uma cor na Lousa e outra no Portal.
 *
 * @param {string} sistema
 */
export function chaveDeCor(sistema) {
  return String(sistema || '').toLowerCase();
}

/**
 * AS AULAS DE UM TREINO — uma por horário para onde ele foi distribuído.
 *
 * O horário nunca voltou para a Lousa, e não deve voltar: um treino é de um DIA,
 * e o mesmo treino vai para as três ou quatro aulas daquele dia. Mas o COACH
 * precisa ver as aulas no calendário para se organizar — "quarta tem 6h, 7h e
 * 19h" é a informação que ele usa para montar a semana.
 *
 * A resposta já existe e é escrita por quem tem autoridade sobre ela: a
 * distribuição grava `distribuido.turmas` no documento do treino. Aqui só se lê.
 *
 * Um treino AINDA NÃO DISTRIBUÍDO devolve lista vazia, de propósito: ele está
 * montado, mas nenhuma aula foi marcada ainda. A tela mostra isso como pendência
 * em vez de inventar um horário.
 *
 * @param {any} t o documento de `coaches/{uid}/lousas`
 * @returns {{classTime: string, alunos: number}[]} ordenado por horário
 */
export function aulasDoTreino(t) {
  const turmas = t?.distribuido?.turmas;
  if (Array.isArray(turmas) && turmas.length) {
    return turmas
      .map((x) => ({
        classTime: String(x?.classTime || '').trim(),
        alunos: Array.isArray(x?.alunos) ? x.alunos.length : 0,
      }))
      .filter((x) => x.classTime)
      .sort((a, b) => a.classTime.localeCompare(b.classTime));
  }
  // Treino gravado quando o horário ainda morava na Lousa. Continua valendo:
  // apagar a hora dele na tela seria perder informação que o coach escreveu.
  const antigo = String(t?.classTime || '').trim();
  return antigo ? [{ classTime: antigo, alunos: 0 }] : [];
}

/**
 * Os CHIPS de um dia: um por aula, mais um por treino ainda não distribuído.
 *
 * Um chip por aula e não um por treino porque é assim que o dia acontece no box
 * — são quatro aulas, não um treino. É também o que o coach tinha antes, quando
 * cada horário virava um documento separado; a diferença é que agora as quatro
 * aulas apontam para o MESMO treino, e corrigir um "3x8" corrige as quatro.
 *
 * Pendente vai para o fim: o que tem hora é a agenda do dia, e o que não tem é
 * tarefa — some na ordem, aparece no fim da lista.
 *
 * @param {any[]} treinos os treinos daquele dia
 * @returns {{treino: any, classTime: string, alunos: number, pendente: boolean}[]}
 */
export function chipsDoDia(treinos) {
  const chips = [];
  for (const t of treinos || []) {
    const aulas = aulasDoTreino(t);
    if (!aulas.length) {
      chips.push({ treino: t, classTime: '', alunos: 0, pendente: true });
      continue;
    }
    for (const a of aulas) chips.push({ treino: t, ...a, pendente: false });
  }
  return chips.sort((a, b) => {
    if (a.pendente !== b.pendente) return a.pendente ? 1 : -1;
    return a.classTime.localeCompare(b.classTime);
  });
}
