/**
 * DISTRIBUIÇÃO PARA A TURMA — parte pura, sem rede e sem Firebase.
 *
 * A aula é coletiva e o treino é UM, mas a ficha que cada aluno recebe é dele:
 * a Ana não faz agachamento livre (joelho), o João puxa 60kg e a Bia puxa 25kg,
 * e ninguém quer que o coach reescreva a lousa oito vezes. Este módulo é a
 * conta que transforma o treino da lousa na versão de cada um dos até 8 alunos
 * da turma, a partir da `matriz_individualizacao` de cada aluno.
 *
 * Três coisas acontecem aqui, nesta ordem, e a ordem importa:
 *   1. LESÃO/RESTRIÇÃO troca ou remove o exercício. Vem primeiro porque não
 *      adianta calcular carga de um movimento que o aluno não vai fazer.
 *   2. BALIZAMENTO POR 1RM põe o número em kg, a partir do 1RM registrado e do
 *      percentual do bloco naquele sistema.
 *   3. O que não deu para resolver vira AVISO — nunca silêncio. Um exercício
 *      que o aluno precisa evitar e não tem substituto sai da ficha com o
 *      motivo escrito; se ele sumisse sem aviso, o coach descobriria no meio da
 *      aula.
 *
 * Mesma decisão de `compartilhado/regras/perfil-treino.js` no montador
 * individual: a versão do aluno é DERIVADA, não uma segunda fonte de verdade.
 * O que se guarda é o treino da lousa e a matriz; a ficha é recalculada.
 */
import { BLOCOS, normalizar, type BlocoId, type ExercicioLousa, type Sistema, type TreinoEstruturado } from './lousa';

/** Teto de alunos por turma — o mesmo `ALUNOS_POR_SESSAO` de `compartilhado/dados/equipamentos.js`. */
export const ALUNOS_POR_TURMA = 8;

/** Incremento mínimo de carga no box: não existe anilha de 1kg em par. */
const PASSO_KG = 2.5;
/** Abaixo disso a conta devolve orientação de esforço, não um número que ninguém consegue montar. */
const CARGA_MINIMA_KG = 2.5;

/**
 * Percentual do 1RM por bloco, em cada sistema.
 *
 * Mobilidade (A) e aquecimento (B) não aparecem: não se baliza carga de
 * alongamento, e inventar 30% de 1RM para uma ativação de glúteo daria um
 * número preciso e errado. Força (C) e Metcon (D) aparecem porque é neles que
 * o coach escreve carga na lousa — e o metcon é sempre mais leve que o bloco de
 * força no MESMO sistema, porque lá a carga concorre com o relógio.
 */
export const PERCENTUAL_POR_BLOCO: Record<Sistema, Partial<Record<BlocoId, number>>> = {
  Hipertrofia: { C: 0.70, D: 0.50 },
  Hyrox: { C: 0.65, D: 0.45 },
  HIIT: { C: 0.55, D: 0.40 },
  GAP: { C: 0.50, D: 0.35 },
};

/**
 * Ajuste por nível sobre o percentual do bloco.
 *
 * Iniciante desce porque a técnica ainda está sendo construída e o 1RM dele é,
 * na prática, uma estimativa; avançado sobe pouco, de propósito — 5% é o que
 * cabe sem transformar a aula coletiva em prescrição de atleta.
 */
export const FATOR_NIVEL: Record<string, number> = {
  iniciante: 0.90,
  intermediario: 1,
  avancado: 1.05,
};

export type Lesao = {
  /** 'joelho direito', 'ombro' — texto do coach, usado só para explicar o aviso. */
  regiao: string;
  /** Termos de exercício a evitar; casa por substring normalizada. */
  evitar: string[];
  /** Trocas já decididas pelo coach na ficha do aluno. */
  substituir: { de: string; para: string }[];
};

export type MatrizAluno = {
  alunoId: string;
  nome: string;
  email: string;
  nivel: 'iniciante' | 'intermediario' | 'avancado';
  lesoes: Lesao[];
  /** Restrições sem lesão associada (gestante, pós-operatório, orientação médica). */
  restricoes: string[];
  /** Exercício (nome normalizado ou como escrito) → 1RM em kg. */
  rm1: Record<string, number>;
};

export type LinhaDoAluno = {
  bloco: BlocoId;
  blocoNome: string;
  nome: string;
  series: number;
  reps: string;
  implemento: string;
  observacao: string;
  /** kg calculado a partir do 1RM, ou `null` quando não há 1RM registrado. */
  cargaKg: number | null;
  /** Percentual do 1RM efetivamente aplicado (já com o fator de nível). */
  percentual: number | null;
  /** Por que esta linha está diferente da turma. Vazio = igual à lousa. */
  motivos: string[];
};

export type FichaDoAluno = {
  alunoId: string;
  nome: string;
  email: string;
  nivel: string;
  linhas: LinhaDoAluno[];
  /** Exercícios que o aluno NÃO faz, com o motivo. */
  removidos: { nome: string; motivo: string }[];
  avisos: string[];
};

/** Preenche uma matriz mínima quando o aluno ainda não tem ficha individualizada. */
export function matrizPadrao(alunoId: string, nome = '', email = ''): MatrizAluno {
  return { alunoId, nome: nome || alunoId, email, nivel: 'intermediario', lesoes: [], restricoes: [], rm1: {} };
}

/**
 * Normaliza o que veio do Firestore. A matriz é editada por humano e vive há
 * meses no banco: campo ausente, `lesoes` como objeto em vez de array, `rm1`
 * com string no lugar de número — tudo isso já apareceu em coleção antiga deste
 * repositório, e nenhum deles pode derrubar a distribuição de uma turma
 * inteira por causa de um aluno.
 */
export function lerMatriz(bruto: unknown, alunoId: string): MatrizAluno {
  const d = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const nivel = ['iniciante', 'intermediario', 'avancado'].includes(String(d.nivel))
    ? (d.nivel as MatrizAluno['nivel'])
    : 'intermediario';

  const lesoes: Lesao[] = Array.isArray(d.lesoes)
    ? d.lesoes.flatMap((l): Lesao[] => {
      if (!l || typeof l !== 'object') return [];
      const o = l as Record<string, unknown>;
      return [{
        regiao: typeof o.regiao === 'string' ? o.regiao : '',
        evitar: Array.isArray(o.evitar) ? o.evitar.filter((x): x is string => typeof x === 'string') : [],
        substituir: Array.isArray(o.substituir)
          ? o.substituir.flatMap((s) => {
            const t = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
            return typeof t.de === 'string' && typeof t.para === 'string' ? [{ de: t.de, para: t.para }] : [];
          })
          : [],
      }];
    })
    : [];

  const rm1: Record<string, number> = {};
  if (d.rm1 && typeof d.rm1 === 'object') {
    for (const [k, v] of Object.entries(d.rm1 as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) rm1[normalizar(k)] = n;
    }
  }

  return {
    alunoId,
    nome: typeof d.nome === 'string' && d.nome.trim() ? d.nome.trim() : alunoId,
    email: typeof d.email === 'string' ? d.email.trim().toLowerCase() : '',
    nivel,
    lesoes,
    restricoes: Array.isArray(d.restricoes) ? d.restricoes.filter((x): x is string => typeof x === 'string') : [],
    rm1,
  };
}

/** Arredonda para o incremento que existe no galpão. */
export function arredondarCarga(kg: number): number {
  return Math.round(kg / PASSO_KG) * PASSO_KG;
}

/**
 * A carga de trabalho do aluno naquela linha, ou `null` quando não dá para
 * calcular.
 *
 * `null` é resposta legítima e comum: aluno novo não tem 1RM, mobilidade não
 * tem carga, e metade dos exercícios de metcon é peso corporal. A ficha mostra
 * a orientação da lousa nesses casos — o que NÃO pode acontecer é aparecer um
 * número tirado de estimativa, porque o aluno confia no número impresso.
 */
export function cargaDeTrabalho(
  rm1: number | undefined,
  sistema: Sistema,
  bloco: BlocoId,
  nivel: string,
): { cargaKg: number | null; percentual: number | null } {
  const base = PERCENTUAL_POR_BLOCO[sistema]?.[bloco];
  if (!base || !rm1 || !Number.isFinite(rm1) || rm1 <= 0) return { cargaKg: null, percentual: null };

  const percentual = base * (FATOR_NIVEL[nivel] ?? 1);
  const kg = arredondarCarga(rm1 * percentual);
  if (kg < CARGA_MINIMA_KG) return { cargaKg: null, percentual: null };
  return { cargaKg: kg, percentual: Math.round(percentual * 100) / 100 };
}

/**
 * A lesão que pega este exercício, ou `null`.
 *
 * Casa por substring nos dois sentidos ("agachamento" na ficha pega
 * "Agachamento Búlgaro" na lousa; "Agachamento Livre" na ficha pega
 * "agachamento" escrito curto). É deliberadamente amplo: errar para o lado de
 * proteger demais custa uma troca desnecessária que o coach desfaz na prévia;
 * errar para o lado de proteger de menos custa o joelho do aluno.
 */
function lesaoQuePega(nomeExercicio: string, lesoes: Lesao[]): Lesao | null {
  const n = normalizar(nomeExercicio);
  if (!n) return null;
  for (const l of lesoes) {
    for (const termo of l.evitar) {
      const t = normalizar(termo);
      if (t && (n.includes(t) || t.includes(n))) return l;
    }
  }
  return null;
}

/** O substituto que a ficha já define para este exercício, ou `null`. */
function substitutoDe(nomeExercicio: string, lesoes: Lesao[]): string | null {
  const n = normalizar(nomeExercicio);
  for (const l of lesoes) {
    for (const s of l.substituir) {
      const de = normalizar(s.de);
      if (de && (n.includes(de) || de.includes(n)) && s.para.trim()) return s.para.trim();
    }
  }
  return null;
}

/** A linha de um exercício para um aluno — ou `null` quando ele não faz. */
function linhaParaAluno(
  ex: ExercicioLousa,
  blocoNome: string,
  matriz: MatrizAluno,
  sistema: Sistema,
): { linha: LinhaDoAluno } | { removido: { nome: string; motivo: string } } {
  const motivos: string[] = [];
  let nome = ex.nome;

  const lesao = lesaoQuePega(ex.nome, matriz.lesoes);
  if (lesao) {
    const sub = substitutoDe(ex.nome, matriz.lesoes);
    if (!sub) {
      // Sem substituto na ficha, o aluno não faz — e o coach vê isso na prévia,
      // antes de enviar. É o mesmo tratamento de `perfil-treino.js` no montador
      // individual: devolver o exercício proibido em silêncio seria pior.
      return {
        removido: {
          nome: ex.nome,
          motivo: `Restrição${lesao.regiao ? ` (${lesao.regiao})` : ''} sem substituto cadastrado na matriz`,
        },
      };
    }
    nome = sub;
    motivos.push(`Troca por restrição${lesao.regiao ? ` (${lesao.regiao})` : ''}: ${ex.nome} ➔ ${sub}`);
  }

  const rm1 = matriz.rm1[normalizar(nome)] ?? matriz.rm1[normalizar(ex.nome)];
  const { cargaKg, percentual } = cargaDeTrabalho(rm1, sistema, ex.bloco, matriz.nivel);
  if (cargaKg !== null && percentual !== null) {
    motivos.push(`Carga por 1RM: ${Math.round(percentual * 100)}% de ${rm1}kg = ${cargaKg}kg`);
  }

  return {
    linha: {
      bloco: ex.bloco,
      blocoNome,
      nome,
      series: ex.series,
      reps: ex.reps,
      implemento: ex.implemento,
      observacao: ex.observacao,
      cargaKg,
      percentual,
      motivos,
    },
  };
}

/** A ficha completa de um aluno a partir do treino da lousa. */
export function fichaDoAluno(treino: TreinoEstruturado, matriz: MatrizAluno): FichaDoAluno {
  const nomeDoBloco = new Map<string, string>(BLOCOS.map((b) => [b.id, b.nome]));
  const linhas: LinhaDoAluno[] = [];
  const removidos: { nome: string; motivo: string }[] = [];

  for (const b of treino.blocos) {
    for (const ex of b.exercicios) {
      const r = linhaParaAluno(ex, b.nome || nomeDoBloco.get(b.id) || b.id, matriz, treino.sistema);
      if ('linha' in r) linhas.push(r.linha);
      else removidos.push(r.removido);
    }
  }

  const avisos: string[] = [];
  if (removidos.length) {
    avisos.push(`${removidos.length} exercício(s) fora da ficha por restrição sem substituto — cadastre a troca na matriz do aluno.`);
  }
  if (!Object.keys(matriz.rm1).length) {
    avisos.push('Sem 1RM registrado: as cargas saem como orientação da lousa, sem número em kg.');
  }
  for (const r of matriz.restricoes) {
    if (r.trim()) avisos.push(`Restrição na ficha: ${r.trim()}`);
  }

  return {
    alunoId: matriz.alunoId,
    nome: matriz.nome,
    email: matriz.email,
    nivel: matriz.nivel,
    linhas,
    removidos,
    avisos,
  };
}

/** As fichas da turma inteira — o que a prévia mostra e o lote grava. */
export function distribuir(treino: TreinoEstruturado, matrizes: MatrizAluno[]): FichaDoAluno[] {
  return matrizes.slice(0, ALUNOS_POR_TURMA).map((m) => fichaDoAluno(treino, m));
}
