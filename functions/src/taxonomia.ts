/**
 * TAXONOMIA DOS METCONS — que músculo trabalha um Burpee, e como se conta.
 *
 * ── O problema que isto resolve ──────────────────────────────────────────────
 * O Dashboard de Volume some com exercício calistênico e de condicionamento. A
 * causa NÃO é carga: `consolidar()` nunca olhou kg, e conta série com carga zero
 * igual a série com 100 kg. A causa é o `grupamentos` vir VAZIO.
 *
 * E vinha vazio de propósito: o prompt manda o modelo devolver lista vazia em
 * vez de chutar ("na dúvida, não invente"), que é a regra certa para um nome que
 * ele não reconhece. Só que um Burpee não é dúvida — é um movimento com perfil
 * fixo, que o modelo às vezes classifica e às vezes não. O resultado é um
 * gráfico que muda conforme o humor da leitura.
 *
 * ── Por que uma tabela, e não um prompt melhor ───────────────────────────────
 * Mesmo motivo de `REGRAS_GLOBAIS`: o que é sempre verdade no box mora em
 * código. Um Wall Ball trabalha quadríceps hoje, amanhã e no mês que vem; pedir
 * isso à IA a cada leitura é pagar para sortear a mesma resposta. Aqui é
 * determinístico, versionado e testado — e um erro de mapeamento se conserta
 * num lugar só, em vez de em cada treino já salvo.
 *
 * ── Onde é aplicada: NAS DUAS PONTAS, e isso é intencional ───────────────────
 *  1. Na LEITURA (`lousa.ts`): o documento nasce com os grupamentos certos, e o
 *     coach já vê na prévia o que vai contar.
 *  2. Na CONSOLIDAÇÃO (`volume-agregado.ts`): como rede, pelo NOME do exercício,
 *     quando o `grupamentos` gravado está vazio.
 *
 * A segunda ponta existe porque o gatilho de volume lê treinos JÁ SALVOS. Sem
 * ela, esta correção só valeria para treino novo, e todo o histórico do box
 * continuaria fora do gráfico até alguém reescrever cada lousa à mão.
 */

/**
 * Como a carga daquele movimento se mede — e por que ela pode faltar sem que
 * isso seja erro de digitação do coach.
 *
 *  - `tonelagem`: carga externa em kg é a medida (agachamento, supino, remada).
 *  - `peso_corporal`: a carga É o atleta (burpee, flexão, air squat). Não existe
 *    kg a escrever, e cobrar um seria pedir um dado que não existe.
 *  - `metcon_series`: tem implemento com kg, mas o estímulo é o relógio e a
 *    repetição (wall ball, kettlebell swing, thruster). A carga é um parâmetro
 *    do movimento, não o placar dele.
 *
 * Nenhum dos três muda a contagem de SÉRIES por grupo — série é série. O campo
 * existe para a tela poder dizer "sem kg porque é peso corporal" em vez de
 * deixar um espaço vazio que parece dado faltando.
 */
export type TipoContagem = 'tonelagem' | 'peso_corporal' | 'metcon_series';

export type PerfilExercicio = {
  /** Nome canônico, para a tela e para as mensagens. */
  nome: string;
  /** Termos que casam por substring no nome escrito na lousa. */
  termos: string[];
  /** Rótulos de `MUSCULOS_LABEL` — o que o movimento treina de fato. */
  primarios: string[];
  /** Rótulos de `MUSCULOS_LABEL` — o que ele recruta junto. */
  secundarios: string[];
  tipoContagem: TipoContagem;
  /**
   * O implemento com que o box faz esse movimento.
   *
   * Existe para o CAMINHO RÁPIDO do pré-parser: sem ele, um treino lido sem IA
   * sairia com implemento vazio e a rosca de variabilidade do dashboard — que
   * conta exercício por implemento — mostraria um buraco que não existe.
   */
  implemento: string;
  /**
   * Carga de referência do box, em kg, quando o coach não escreve nenhuma.
   *
   * Só faz sentido em `metcon_series`: é o implemento padrão do galpão (a bola
   * de 6 kg, o kettlebell de 16). NÃO entra na contagem de séries por grupo, e
   * hoje NENHUM cálculo a consome — está aqui porque é o número que o box usa
   * e porque é ele que uma futura tonelagem vai precisar. Enquanto nada ler,
   * ela é documentação verificada por teste, não cálculo.
   */
  cargaPadraoKg?: number;
};

/**
 * A tabela.
 *
 * Só entra aqui movimento de PERFIL FIXO — aquele cuja musculatura não depende
 * de como o coach o prescreveu. Agachamento e supino ficam de fora de propósito:
 * a IA os classifica bem, e duplicar o que já funciona só cria um segundo lugar
 * para errar.
 *
 * Sobre primário × secundário: os dois creditam a série INTEIRA, seguindo a
 * convenção que `volume-agregado.ts` já documenta e que o Portal do Aluno usa.
 * A separação está aqui porque é verdade sobre o movimento e porque a tela pode
 * querer mostrá-la — não para virar peso 0,5 escondido num gráfico.
 */
export const TAXONOMIA: PerfilExercicio[] = [
  {
    nome: 'Burpee',
    termos: ['burpee', 'burpees'],
    primarios: ['Peito', 'Core/Abdômen'],
    secundarios: ['Quadríceps', 'Ombro', 'Tríceps'],
    tipoContagem: 'peso_corporal',
    implemento: 'Peso corporal',
  },
  {
    nome: 'Wall Ball',
    termos: ['wall ball', 'wallball', 'wall balls', 'arremesso na parede'],
    primarios: ['Quadríceps', 'Glúteo'],
    secundarios: ['Ombro'],
    tipoContagem: 'metcon_series',
    implemento: 'Bola',
    cargaPadraoKg: 6,
  },
  {
    nome: 'Kettlebell Swing',
    termos: ['kettlebell swing', 'kb swing', 'swing russo', 'swing americano', 'swing'],
    primarios: ['Posterior de coxa', 'Glúteo'],
    secundarios: ['Core/Abdômen', 'Ombro'],
    tipoContagem: 'metcon_series',
    implemento: 'Kettlebell',
    cargaPadraoKg: 16,
  },
  {
    nome: 'Box Jump',
    termos: ['box jump', 'boxjump', 'salto na caixa', 'salto caixa', 'step up', 'subida na caixa'],
    primarios: ['Quadríceps', 'Glúteo'],
    secundarios: ['Panturrilha'],
    tipoContagem: 'peso_corporal',
    implemento: 'Caixa',
  },
  {
    nome: 'Thruster',
    termos: ['thruster', 'thrusters'],
    primarios: ['Quadríceps', 'Ombro'],
    secundarios: ['Glúteo', 'Tríceps'],
    tipoContagem: 'metcon_series',
    implemento: 'Barra',
    cargaPadraoKg: 20,
  },
  {
    nome: 'Flexão de braço',
    termos: ['flexao de braco', 'flexao', 'flexoes', 'push up', 'pushup', 'push ups'],
    primarios: ['Peito'],
    secundarios: ['Tríceps', 'Ombro', 'Core/Abdômen'],
    tipoContagem: 'peso_corporal',
    implemento: 'Peso corporal',
  },
  {
    nome: 'Air Squat',
    termos: ['air squat', 'airsquat', 'agachamento livre sem carga', 'agachamento corporal'],
    primarios: ['Quadríceps', 'Glúteo'],
    secundarios: ['Core/Abdômen'],
    tipoContagem: 'peso_corporal',
    implemento: 'Peso corporal',
  },
  {
    nome: 'Abdominal',
    termos: ['abdominal', 'abdominais', 'sit up', 'situp', 'sit ups', 'prancha', 'plank', 'russian twist'],
    primarios: ['Core/Abdômen'],
    secundarios: [],
    tipoContagem: 'peso_corporal',
    implemento: 'Colchonete',
  },
  {
    nome: 'Afundo',
    termos: ['afundo', 'avanco', 'lunge', 'lunges', 'passada'],
    primarios: ['Quadríceps', 'Glúteo'],
    secundarios: ['Posterior de coxa'],
    tipoContagem: 'peso_corporal',
    implemento: 'Peso corporal',
  },
  {
    nome: 'Mountain Climber',
    termos: ['mountain climber', 'escalador', 'polichinelo', 'jumping jack'],
    primarios: ['Core/Abdômen'],
    secundarios: ['Quadríceps', 'Ombro'],
    tipoContagem: 'peso_corporal',
    implemento: 'Peso corporal',
  },
  {
    nome: 'Airbike',
    termos: ['airbike', 'air bike', 'assault bike', 'bike'],
    primarios: ['Quadríceps'],
    secundarios: ['Costas', 'Ombro'],
    tipoContagem: 'peso_corporal',
    implemento: 'Airbike',
  },
  {
    nome: 'Remo ergômetro',
    // 'ergometro' sozinho fica de fora: casaria também em "bike ergômetro".
    termos: ['remo ergometro', 'remoergometro', 'rowing', 'row erg', 'remada no remo'],
    primarios: ['Costas'],
    secundarios: ['Quadríceps', 'Bíceps', 'Core/Abdômen'],
    tipoContagem: 'peso_corporal',
    implemento: 'Remo',
  },
  {
    nome: 'Corda naval',
    termos: ['corda naval', 'battle rope', 'battlerope'],
    primarios: ['Ombro'],
    secundarios: ['Core/Abdômen', 'Antebraço'],
    tipoContagem: 'peso_corporal',
    implemento: 'Corda naval',
  },
  {
    nome: 'Pular corda',
    termos: ['pular corda', 'double under', 'doubleunder', 'single under', 'corda'],
    primarios: ['Panturrilha'],
    secundarios: ['Antebraço'],
    tipoContagem: 'peso_corporal',
    implemento: 'Corda',
  },
  {
    nome: 'Farmer Walk',
    termos: ['farmer walk', 'farmers walk', 'caminhada do fazendeiro', 'sled push', 'empurrar treno', 'treno'],
    primarios: ['Antebraço', 'Core/Abdômen'],
    secundarios: ['Costas', 'Quadríceps'],
    tipoContagem: 'metcon_series',
    implemento: 'Halter',
    cargaPadraoKg: 24,
  },
  {
    nome: 'Slam Ball',
    termos: ['slam ball', 'slamball', 'medicine ball slam', 'arremesso de bola'],
    primarios: ['Core/Abdômen'],
    secundarios: ['Ombro', 'Costas'],
    tipoContagem: 'metcon_series',
    implemento: 'Bola',
    cargaPadraoKg: 9,
  },
];

/** Minúsculas, sem acento, hífen virando espaço — a mesma forma de `lousa.ts`. */
function normalizarNome(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O perfil de um exercício pelo nome, ou `null`.
 *
 * Casa por substring, como `regraGlobalDe`. A ordem de comparação é do termo
 * MAIS LONGO para o mais curto, dentro de toda a tabela: sem isso "swing"
 * casaria antes de "kettlebell swing" só por estar numa entrada anterior, e
 * "corda" roubaria "corda naval".
 */
export function perfilDe(nomeExercicio: string): PerfilExercicio | null {
  const n = normalizarNome(nomeExercicio);
  if (!n) return null;
  let achado: { perfil: PerfilExercicio; tamanho: number } | null = null;
  for (const p of TAXONOMIA) {
    for (const t of p.termos) {
      if (!n.includes(t)) continue;
      if (!achado || t.length > achado.tamanho) achado = { perfil: p, tamanho: t.length };
    }
  }
  return achado?.perfil ?? null;
}

/**
 * Os grupamentos de um exercício pela taxonomia: primários e secundários juntos,
 * sem repetição e na ordem em que a tabela os declara.
 *
 * Devolve lista vazia para o que não está mapeado — que é o comportamento certo:
 * a taxonomia cobre o que ela conhece, e não deve chutar pelo resto.
 */
export function gruposDoExercicio(nomeExercicio: string): string[] {
  const p = perfilDe(nomeExercicio);
  if (!p) return [];
  return [...new Set([...p.primarios, ...p.secundarios])];
}

/**
 * Completa o `grupamentos` de um exercício quando ele veio vazio.
 *
 * NUNCA sobrescreve o que já está preenchido. Se a IA classificou, a leitura
 * dela é sobre AQUELA lousa — pode haver qualificador que a tabela não conhece
 * ("burpee só com salto"), e trocar a leitura específica pela genérica seria
 * perder informação em nome de padronizar.
 */
export function completarGrupamentos(nomeExercicio: string, grupamentos: string[] | undefined): string[] {
  const atuais = Array.isArray(grupamentos) ? grupamentos.filter((g) => typeof g === 'string' && g.trim()) : [];
  if (atuais.length) return atuais;
  return gruposDoExercicio(nomeExercicio);
}
