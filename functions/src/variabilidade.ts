/**
 * MOTOR DE ALERTAS E VARIABILIDADE — parte pura, sem rede e sem Firebase.
 *
 * O problema que ele resolve é de rotina, não de prescrição: o coach monta oito
 * aulas por semana na correria e, sem perceber, repete agachamento na segunda e
 * na quarta, põe barra em todo exercício de três dias seguidos, e faz a turma
 * empurrar a semana inteira sem puxar nada. Nada disso aparece olhando UMA
 * lousa — só olhando a semana. É isso que este módulo faz: recebe o treino novo
 * e os treinos dos últimos 7 dias e devolve o que está saturando, com a troca
 * pronta para o coach aceitar em um clique.
 *
 * Ele NUNCA altera o treino. Devolve alerta e sugestão; quem decide é o coach,
 * e "manter a escolha" é resposta legítima — há motivo de periodização para
 * repetir de propósito, e um motor que troca sozinho estaria desfazendo o
 * trabalho dele em silêncio.
 */
import { exerciciosDo, normalizar, type TreinoEstruturado } from './lousa';

/** Repetir o mesmo exercício dentro desta janela é duplicação. */
export const JANELA_DUPLICACAO_H = 72;
/** Acima desta fatia dos exercícios da janela, o implemento está saturado. */
export const TETO_SATURACAO = 0.6;
/** Acima desta fatia das séries da janela, o grupamento está redundante. */
export const TETO_REDUNDANCIA = 0.45;
/** Abaixo disto a amostra é pequena demais para a porcentagem significar algo. */
const MINIMO_PARA_PORCENTAGEM = 6;

/**
 * Famílias de implemento que trocam entre si sem mudar o padrão de movimento.
 *
 * As chaves são a forma normalizada (minúscula, sem acento) do que o coach
 * escreve na lousa; os valores são o rótulo com que a troca é oferecida. Peso
 * corporal e cardio ficam de fora de propósito: não existe "trocar o
 * implemento" de uma prancha, e oferecer isso seria ruído em cima de ruído.
 */
export const ALTERNATIVAS_IMPLEMENTO: Record<string, string[]> = {
  barra: ['Halter', 'Cabo', 'Anilha', 'Kettlebell'],
  'barra livre': ['Halter', 'Cabo', 'Anilha', 'Kettlebell'],
  halter: ['Barra', 'Cabo', 'Kettlebell', 'Anilha'],
  halteres: ['Barra', 'Cabo', 'Kettlebell', 'Anilha'],
  kettlebell: ['Halter', 'Barra', 'Anilha', 'Cabo'],
  kb: ['Halter', 'Barra', 'Anilha', 'Cabo'],
  cabo: ['Halter', 'Elástico', 'Barra', 'Kettlebell'],
  polia: ['Halter', 'Elástico', 'Barra', 'Kettlebell'],
  anilha: ['Halter', 'Kettlebell', 'Barra', 'Cabo'],
  anilhas: ['Halter', 'Kettlebell', 'Barra', 'Cabo'],
  smith: ['Barra', 'Halter', 'Cabo'],
  elastico: ['Cabo', 'Halter', 'Kettlebell'],
};

export type TipoAlerta = 'duplicacao' | 'saturacao' | 'redundancia';
export type Severidade = 'alta' | 'media' | 'baixa';

/** Uma troca que a tela oferece em um clique. `de`/`para` são o que muda. */
export type Sugestao = {
  acao: 'trocar-implemento' | 'trocar-exercicio' | 'manter';
  rotulo: string;
  de: string;
  para: string;
};

export type Alerta = {
  tipo: TipoAlerta;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  /** Nome do exercício, implemento ou grupamento a que o alerta se refere. */
  alvo: string;
  sugestoes: Sugestao[];
};

/** Um treino já salvo, como o Firestore devolve. */
export type TreinoHistorico = {
  id: string;
  /** 'YYYY-MM-DD' */
  dateId: string;
  /** ISO — é o que sustenta a conta em HORAS da duplicação. */
  geradoEm: string;
  treino: TreinoEstruturado;
};

const pct = (parte: number, total: number): number => (total ? Math.round((parte / total) * 100) : 0);

/**
 * Horas entre dois instantes, ou `null` quando alguma das datas não é
 * aproveitável. `null` faz a duplicação cair para a comparação por DIA — um
 * treino antigo sem `geradoEm` (ou com o campo corrompido) não pode derrubar a
 * checagem inteira nem disparar alerta falso.
 */
function horasEntre(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) / 36e5;
}

/** Dias inteiros entre dois 'YYYY-MM-DD', ou `null`. */
function diasEntre(aId: string, bId: string): number | null {
  const a = Date.parse(`${aId}T12:00:00Z`);
  const b = Date.parse(`${bId}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(Math.abs(a - b) / 864e5);
}

/** As trocas de implemento oferecidas para um exercício, no máximo quatro. */
function sugestoesDeImplemento(implemento: string, nomeExercicio: string): Sugestao[] {
  const alt = ALTERNATIVAS_IMPLEMENTO[normalizar(implemento)] || [];
  const trocas: Sugestao[] = alt.map((para) => ({
    acao: 'trocar-implemento',
    rotulo: `${implemento} ➔ ${para}`,
    de: implemento,
    para,
  }));
  trocas.push({
    acao: 'manter',
    rotulo: 'Manter a escolha do coach',
    de: nomeExercicio,
    para: nomeExercicio,
  });
  return trocas;
}

/**
 * DUPLICAÇÃO — o mesmo exercício outra vez dentro de 72h.
 *
 * A conta é em HORAS e não em dias porque o box tem aula de manhã e de noite: o
 * mesmo exercício na noite de segunda e na manhã de quarta é menos de 72h ainda
 * que sejam "dois dias atrás". Quando a data do histórico não dá para ler em
 * hora, a comparação cai para dias (72h ≈ 3 dias) em vez de sumir.
 */
function alertasDuplicacao(
  treino: TreinoEstruturado,
  agoraIso: string,
  historico: TreinoHistorico[],
): Alerta[] {
  const alertas: Alerta[] = [];
  const vistos = new Set<string>();

  for (const ex of exerciciosDo(treino)) {
    const chave = normalizar(ex.nome);
    if (!chave || vistos.has(chave)) continue;

    for (const h of historico) {
      const igual = exerciciosDo(h.treino).find((x) => normalizar(x.nome) === chave);
      if (!igual) continue;

      const horas = horasEntre(agoraIso, h.geradoEm);
      const dentro = horas === null
        ? (diasEntre(agoraIso.slice(0, 10), h.dateId) ?? 99) * 24 < JANELA_DUPLICACAO_H
        : horas < JANELA_DUPLICACAO_H;
      if (!dentro) continue;

      const quando = horas === null ? `em ${h.dateId}` : `há ${Math.round(horas)}h`;
      vistos.add(chave);
      alertas.push({
        tipo: 'duplicacao',
        severidade: 'alta',
        titulo: `${ex.nome} repetido em menos de ${JANELA_DUPLICACAO_H}h`,
        detalhe: `Já entrou ${quando} (${h.treino.titulo || h.dateId}). O grupo não teve tempo de recuperar.`,
        alvo: ex.nome,
        sugestoes: sugestoesDeImplemento(ex.implemento, ex.nome),
      });
      break; // um alerta por exercício: o mais recente basta para a decisão
    }
  }
  return alertas;
}

/**
 * SATURAÇÃO DE EQUIPAMENTO — um implemento em mais de 60% dos exercícios da
 * janela.
 *
 * Isto não é só estímulo: é logística de aula. Oito alunos e uma fila de barra
 * significa gente parada, e o inventário do box é justamente o que o Montador
 * já usa para dizer se a estação cabe na turma.
 *
 * O piso de `MINIMO_PARA_PORCENTAGEM` existe porque numa segunda-feira a janela
 * tem um treino só: com 4 exercícios, três de barra dão 75% e o alerta
 * apareceria sempre, todo começo de semana, até virar ruído que o coach ignora.
 */
function alertasSaturacao(exerciciosJanela: { nome: string; implemento: string }[]): Alerta[] {
  const comImplemento = exerciciosJanela.filter((e) => normalizar(e.implemento));
  if (comImplemento.length < MINIMO_PARA_PORCENTAGEM) return [];

  const contagem = new Map<string, { rotulo: string; n: number }>();
  for (const e of comImplemento) {
    const k = normalizar(e.implemento);
    const atual = contagem.get(k) || { rotulo: e.implemento, n: 0 };
    atual.n += 1;
    contagem.set(k, atual);
  }

  const alertas: Alerta[] = [];
  for (const [, { rotulo, n }] of contagem) {
    const fatia = n / comImplemento.length;
    if (fatia <= TETO_SATURACAO) continue;
    alertas.push({
      tipo: 'saturacao',
      severidade: fatia > 0.8 ? 'alta' : 'media',
      titulo: `${rotulo} em ${pct(n, comImplemento.length)}% dos exercícios da semana`,
      detalhe: `${n} de ${comImplemento.length} exercícios usam ${rotulo}. Acima de ${Math.round(TETO_SATURACAO * 100)}% vira fila de estação na aula e estímulo repetido.`,
      alvo: rotulo,
      sugestoes: sugestoesDeImplemento(rotulo, rotulo),
    });
  }
  return alertas;
}

/**
 * REDUNDÂNCIA DE ESTÍMULO — um grupamento levando mais de 45% das séries da
 * janela.
 *
 * Conta SÉRIE e não exercício: dois exercícios de peito com 4 séries pesam mais
 * na semana do que quatro exercícios de core com 1 passagem, e é a série que o
 * Dashboard de Volume usa como moeda.
 */
function alertasRedundancia(exerciciosJanela: { series: number; grupamentos: string[] }[]): Alerta[] {
  const porGrupo = new Map<string, number>();
  let total = 0;
  for (const e of exerciciosJanela) {
    for (const g of e.grupamentos || []) {
      porGrupo.set(g, (porGrupo.get(g) || 0) + e.series);
      total += e.series;
    }
  }
  if (total < MINIMO_PARA_PORCENTAGEM) return [];

  const alertas: Alerta[] = [];
  for (const [grupo, series] of porGrupo) {
    const fatia = series / total;
    if (fatia <= TETO_REDUNDANCIA) continue;
    alertas.push({
      tipo: 'redundancia',
      severidade: 'media',
      titulo: `${grupo} concentra ${pct(series, total)}% das séries da semana`,
      detalhe: `${series} de ${total} séries caem em ${grupo}. O resto do corpo está ficando para trás no ciclo.`,
      alvo: grupo,
      sugestoes: [{
        acao: 'trocar-exercicio',
        rotulo: `Trocar um exercício de ${grupo} por outro padrão de movimento`,
        de: grupo,
        para: '',
      }, {
        acao: 'manter',
        rotulo: 'Manter — é foco proposital do ciclo',
        de: grupo,
        para: grupo,
      }],
    });
  }
  return alertas;
}

export type ResultadoVariabilidade = {
  alertas: Alerta[];
  resumo: {
    treinosNaJanela: number;
    exerciciosNaJanela: number;
    seriesNaJanela: number;
    usoPorImplemento: Record<string, number>;
  };
};

/**
 * A análise inteira.
 *
 * `historico` já vem filtrado pela janela de 7 dias (quem consulta o Firestore
 * é `index.ts`); aqui a janela só é reaberta para a conta de 72h, que é mais
 * estreita. Ordem dos alertas: duplicação primeiro, porque é a única que aponta
 * um exercício específico e tem troca óbvia; saturação e redundância vêm depois
 * porque pedem uma decisão sobre a semana, não sobre uma linha.
 */
export function analisarVariabilidade(
  treino: TreinoEstruturado,
  historico: TreinoHistorico[],
  agoraIso: string,
): ResultadoVariabilidade {
  const doNovo = exerciciosDo(treino);
  const doHistorico = historico.flatMap((h) => exerciciosDo(h.treino));
  const janela = [...doNovo, ...doHistorico];

  const usoPorImplemento: Record<string, number> = {};
  for (const e of janela) {
    const rotulo = e.implemento?.trim();
    if (rotulo) usoPorImplemento[rotulo] = (usoPorImplemento[rotulo] || 0) + 1;
  }

  return {
    alertas: [
      ...alertasDuplicacao(treino, agoraIso, historico),
      ...alertasSaturacao(janela),
      ...alertasRedundancia(janela),
    ],
    resumo: {
      treinosNaJanela: historico.length + 1,
      exerciciosNaJanela: janela.length,
      seriesNaJanela: janela.reduce((s, e) => s + (e.series || 0), 0),
      usoPorImplemento,
    },
  };
}
