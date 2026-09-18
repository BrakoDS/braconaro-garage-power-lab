// @ts-check
/**
 * AS TURMAS DO DIA — agrupar os alunos pelo horário em que eles treinam.
 *
 * O coach dava a mesma aula três vezes por dia e salvava o treino uma vez por
 * horário, escolhendo os alunos na mão em cada rodada. Este módulo é a conta que
 * monta as turmas sozinho: pega os alunos ativos, olha em que horário cada um
 * treina NAQUELE DIA DA SEMANA, e devolve os blocos prontos.
 *
 * ── O horário já existe na ficha, e é POR DIA ────────────────────────────────
 * A Gestão de Alunos guarda `diasTreino` (`['seg','qua','sex']`) e `horarios`
 * (`{seg:'07:00', qua:'19:00'}`) — o próprio formulário diz "marque os dias e a
 * hora de cada um, eles podem ser diferentes". Não existe (nem deve existir) um
 * `horario_padrao` único: quem treina 7h na segunda e 19h na quarta não tem UM
 * horário padrão, e um campo assim brigaria com o mapa por dia até alguém
 * descobrir qual dos dois o sistema estava usando.
 *
 * O campo antigo `freqHorario` (uma hora só para a semana toda) entra como
 * fallback, exatamente como a tela da Gestão já faz: ficha velha não pode
 * aparecer sem turma só porque o formato mudou.
 *
 * Módulo puro: sem DOM, sem rede.
 *
 * @typedef {{id: string, nome: string, nivel?: string, status?: string,
 *            diasTreino?: string[], horarios?: Record<string,string>, freqHorario?: string}} Aluno
 * @typedef {{horario: string, rotulo: string, alunos: Aluno[], excede: boolean}} Turma
 */
import { diaSemanaDe } from '../../../compartilhado/regras/datas-treino.js';

/** O mesmo teto do servidor e de `ALUNOS_POR_SESSAO` no inventário do box. */
export const MAX_POR_TURMA = 8;

/** A chave dos alunos que treinam no dia mas não têm hora cadastrada. */
export const SEM_HORARIO = '';

/**
 * Lê uma hora de texto livre. O `freqHorario` antigo era digitado à mão e vem de
 * tudo quanto é jeito: "19 Horas", "19h", "18h–19h", "6:30". Mesma regra de
 * `horaParaInput` na Gestão — nas faixas pega o começo, que é o que interessa.
 * @param {string} [txt] @returns {string} 'HH:MM' ou ''
 */
export function normalizarHora(txt) {
  const m = String(txt || '').match(/(\d{1,2})\s*[:h]?\s*(\d{2})?/);
  if (!m) return '';
  const h = Number(m[1]);
  if (!(h >= 0 && h <= 23)) return '';
  const min = m[2] && Number(m[2]) < 60 ? m[2] : '00';
  return `${String(h).padStart(2, '0')}:${min}`;
}

/** 'HH:MM' → '19h' / '6h30', que é como se fala a hora no box. */
export function horaLegivel(hhmm) {
  const m = String(hhmm || '').match(/^(\d{2}):(\d{2})$/);
  return m ? `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}` : String(hhmm || '').trim();
}

/**
 * O horário deste aluno NAQUELE dia da semana, ou '' se ele não tem.
 * @param {Aluno} aluno @param {string} diaChave 'seg'…'dom'
 */
export function horarioDoAluno(aluno, diaChave) {
  const doDia = (aluno?.horarios || {})[diaChave];
  return normalizarHora(doDia) || normalizarHora(aluno?.freqHorario);
}

/** O aluno treina neste dia da semana? */
export function treinaNoDia(aluno, diaChave) {
  const dias = aluno?.diasTreino;
  // Ficha sem `diasTreino` é ficha antiga, de antes de o campo existir. Ela
  // entra na grade do dia em vez de sumir: é o coach que sabe se aquele aluno
  // treina hoje, e uma lista curta demais é pior que uma com um nome a mais.
  if (!Array.isArray(dias) || !dias.length) return true;
  return dias.includes(diaChave);
}

const ativo = (a) => (a?.status || 'ativo') !== 'inativo';

/**
 * As turmas do dia, montadas a partir das fichas.
 *
 * Ordem: por horário crescente, e o bloco SEM horário por último. Ele fica no
 * fim, e não escondido, porque aluno sem hora cadastrada é justamente o que o
 * coach precisa ver para arrumar — some daqui e ele descobre na aula.
 *
 * @param {Aluno[]} alunos a lista da Gestão
 * @param {string} dateId 'YYYY-MM-DD' do treino
 * @returns {Turma[]}
 */
export function montarTurmas(alunos, dateId) {
  const dia = diaSemanaDe(dateId);
  /** @type {Map<string, Aluno[]>} */
  const porHora = new Map();

  for (const a of alunos || []) {
    if (!a?.id || !ativo(a) || !treinaNoDia(a, dia)) continue;
    const h = horarioDoAluno(a, dia);
    if (!porHora.has(h)) porHora.set(h, []);
    porHora.get(h)?.push(a);
  }

  return [...porHora.entries()]
    .sort(([a], [b]) => {
      if (a === SEM_HORARIO) return 1;
      if (b === SEM_HORARIO) return -1;
      return a.localeCompare(b);
    })
    .map(([horario, lista]) => ({
      horario,
      rotulo: horario ? horaLegivel(horario) : 'Sem horário na ficha',
      // Ordem alfabética dentro da turma: é como o coach procura um nome numa
      // lista de oito, e a ordem de cadastro não diz nada para ele.
      alunos: [...lista].sort((x, y) => String(x.nome || '').localeCompare(String(y.nome || ''))),
      excede: lista.length > MAX_POR_TURMA,
    }));
}

/**
 * Move um aluno de turma — o que avisou que hoje vem no outro horário.
 *
 * Devolve turmas NOVAS, nunca muta.
 *
 * A turma que ficou vazia CONTINUA na tela. Parece lixo e não é: "19h — ninguém
 * hoje" é informação (existe aquela aula, e ela está vazia), e é o que permite
 * mover o aluno de volta se o coach errou o clique. Sumir o bloco obrigaria ele
 * a recriar o horário na mão para desfazer. Quem garante que turma vazia não é
 * gravada é `paraEnvio`, que já a descarta.
 *
 * @param {Turma[]} turmas @param {string} alunoId @param {string} destino 'HH:MM' ou SEM_HORARIO
 * @returns {Turma[]}
 */
export function moverAluno(turmas, alunoId, destino) {
  const aluno = (turmas || []).flatMap((t) => t.alunos).find((a) => a.id === alunoId);
  if (!aluno) return turmas;

  const semEle = (turmas || []).map((t) => ({ ...t, alunos: t.alunos.filter((a) => a.id !== alunoId) }));
  const jaExiste = semEle.some((t) => t.horario === destino);
  const comEle = jaExiste
    ? semEle.map((t) => (t.horario === destino ? { ...t, alunos: [...t.alunos, aluno] } : t))
    : [...semEle, { horario: destino, rotulo: destino ? horaLegivel(destino) : 'Sem horário na ficha', alunos: [aluno], excede: false }];

  return ordenar(comEle);
}

/** Tira um aluno da distribuição de hoje — o que avisou que vai faltar. */
export function removerAluno(turmas, alunoId) {
  return ordenar((turmas || []).map((t) => ({ ...t, alunos: t.alunos.filter((a) => a.id !== alunoId) })));
}

/** Acrescenta um bloco de horário vazio, para o coach encaixar alguém nele. */
export function adicionarHorario(turmas, horario) {
  const h = normalizarHora(horario);
  if (!h || (turmas || []).some((t) => t.horario === h)) return turmas;
  return ordenar([...(turmas || []), { horario: h, rotulo: horaLegivel(h), alunos: [], excede: false }]);
}

/** Reordena, recalcula o excesso e descarta só o bloco sem horário E sem ninguém. */
function ordenar(turmas) {
  return turmas
    .filter((t) => t.alunos.length || t.horario)
    .map((t) => ({ ...t, excede: t.alunos.length > MAX_POR_TURMA }))
    .sort((a, b) => {
      if (a.horario === SEM_HORARIO) return 1;
      if (b.horario === SEM_HORARIO) return -1;
      return a.horario.localeCompare(b.horario);
    });
}

/**
 * O que vai para a Cloud Function: só turma com aluno E com horário.
 *
 * O bloco "sem horário" é descartado de propósito. A ficha do aluno é publicada
 * por horário no Portal, e gravar a turma dele com `classTime` vazio faria o
 * treino chegar sem dizer a que aula ele pertence — o coach precisa cadastrar a
 * hora, e a tela avisa isso em vez de gravar torto.
 *
 * @param {Turma[]} turmas
 * @returns {{classTime: string, studentIds: string[]}[]}
 */
export function paraEnvio(turmas) {
  return (turmas || [])
    .filter((t) => t.horario && t.alunos.length)
    .map((t) => ({ classTime: t.horario, studentIds: t.alunos.map((a) => a.id) }));
}

/**
 * O que impede a distribuição, em texto que o coach lê.
 * Lista vazia = pode distribuir.
 * @param {Turma[]} turmas
 */
export function impedimentos(turmas) {
  const problemas = [];
  const cheias = (turmas || []).filter((t) => t.excede);
  for (const t of cheias) {
    problemas.push(`${t.rotulo}: ${t.alunos.length} alunos — o teto por aula é ${MAX_POR_TURMA}.`);
  }
  if (!paraEnvio(turmas).length) {
    problemas.push('Nenhuma turma com horário e aluno. Cadastre a hora na ficha ou mova alguém para um horário.');
  }
  return problemas;
}

/** Quantos alunos, no total, vão receber o treino. */
export function totalDeAlunos(turmas) {
  return paraEnvio(turmas).reduce((n, t) => n + t.studentIds.length, 0);
}
