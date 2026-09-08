/**
 * Fixtures da pesquisa de exercício/mobilidade/técnica — respostas cruas do
 * Responses API, no formato completo (`output[].content[].text`), do jeito que
 * `functions/src/fixtures/social-ml.ts` guarda HTML de mentira para o parser de
 * preço. Cada uma força um caminho específico de `extrairProposta`: a boa, a
 * recusada por padrão de movimento e as que sujam vocabulário fechado (músculo,
 * equipamento) sem derrubar a proposta inteira.
 */

/** Mesmo envelope usado em `checar.ts`: `output → content → text`. */
const envelope = (texto: string) => ({
  output: [{ content: [{ type: 'output_text', text: texto }] }],
});

/** Exercício bem formado — todo campo dentro do vocabulário fechado. */
export const BOA_EXERCICIO = envelope(JSON.stringify({
  tipo: 'exercicio',
  nome: 'Agachamento búlgaro com halteres',
  padrao: 'quadriceps',
  musculos: ['Quadríceps', 'Glúteo'],
  tags: ['MUSCULAÇÃO'],
  equipamentoIds: ['barra', 'caixote-inventado'],
  nivel: 'intermediario',
  tempoMedioSeg: 40,
  obs: 'Pé de trás apoiado no caixote, desce até o joelho da frente formar 90°. Cuidado: manter o tronco ereto evita sobrecarregar a lombar.',
  equipamentoFaltante: ['Banco búlgaro'],
  fontes: ['https://exemplo.com/agachamento-bulgaro'],
}));

/** Técnica bem formada, no formato de passos numerados de `academia/data/seed.js`. */
export const BOA_TECNICA = envelope(JSON.stringify({
  tipo: 'tecnica',
  nome: 'Myo-reps',
  resumo: 'Uma série de ativação até quase a falha, seguida de mini-séries curtas com pausa breve.',
  comoExecutar: [
    '1. Faça uma série de ativação de 12 a 20 repetições, perto da falha.',
    '2. Descanse de 20 a 30 segundos, só respirando, sem soltar o equipamento.',
    '3. Faça uma mini-série de 3 a 5 repetições e repita o descanso curto.',
    '4. Repita as mini-séries de 3 a 5 vezes até não conseguir mais tirar 3 repetições limpas.',
    'No box: melhor em equipamento que não precisa remontar (polia, máquina) — na barra livre o tempo de descanso curto se perde ajustando anilha.',
  ].join('\n'),
  objetivo: 'Hipertrofia com pouco volume de série completa — bom quando o tempo de aula está curto.',
  fontes: ['https://exemplo.com/myo-reps'],
}));

/** Sem `padrao` nenhum: é o caso que `converter()` do montador descartaria em silêncio. */
export const SEM_PADRAO = envelope(JSON.stringify({
  tipo: 'exercicio',
  nome: 'Movimento sem classificação',
  padrao: '',
  musculos: [],
  tags: [],
  equipamentoIds: [],
  nivel: 'intermediario',
  tempoMedioSeg: 30,
  obs: 'A IA não conseguiu resolver o padrão de movimento.',
  equipamentoFaltante: [],
  fontes: [],
}));

/** `padrao` presente, mas fora do vocabulário fechado — mesma recusa do SEM_PADRAO. */
export const PADRAO_INVENTADO = envelope(JSON.stringify({
  tipo: 'exercicio',
  nome: 'Exercício com padrão que a IA inventou',
  padrao: 'rotacional', // não existe em PADROES
  musculos: ['Peito'],
  tags: ['MUSCULAÇÃO'],
  equipamentoIds: [],
  nivel: 'iniciante',
  tempoMedioSeg: 35,
  obs: 'Padrão de movimento fora do que o box classifica.',
  equipamentoFaltante: [],
  fontes: [],
}));

/** Um músculo real e um inventado: o inventado cai fora, o resto sobrevive. */
export const MUSCULO_INVENTADO = envelope(JSON.stringify({
  tipo: 'exercicio',
  nome: 'Remada unilateral com halter',
  padrao: 'puxar',
  musculos: ['Costas', 'Deltoide posterior extendido'], // segundo não existe no vocabulário
  tags: ['MUSCULAÇÃO', 'MODALIDADE-INVENTADA'],
  equipamentoIds: ['barra'],
  nivel: 'intermediario',
  tempoMedioSeg: 35,
  obs: 'Apoiar o joelho e a mão no banco, puxar o halter até a linha do quadril.',
  equipamentoFaltante: [],
  fontes: [],
}));

/** Pede equipamento que o box não tem — o inventário do teste só conhece barra/caixote. */
export const EQUIP_FORA_DO_INVENTARIO = envelope(JSON.stringify({
  tipo: 'exercicio',
  nome: 'Leg press 45°',
  padrao: 'quadriceps',
  musculos: ['Quadríceps'],
  tags: ['MUSCULAÇÃO'],
  equipamentoIds: ['leg_press_45'], // não está no inventário enviado
  nivel: 'intermediario',
  tempoMedioSeg: 40,
  obs: 'Empurrar a plataforma até quase a extensão total do joelho, sem travar.',
  equipamentoFaltante: [],
  fontes: [],
}));

/** JSON truncado no meio — o mesmo tipo de falha que `analise.ts` já trata na leitura da IA. */
export const JSON_QUEBRADO = envelope('{"tipo": "exercicio", "nome": "Agachamento livre", "padrao": ');

/** Resposta sem texto nenhum. */
export const VAZIA = envelope('');

/**
 * `nome` e `obs` carregam payload de XSS. O módulo não escapa nada — só prova
 * que a string chega intacta e não executa; quem escapa é a tela (Task 3).
 */
export const MALICIOSA = envelope(JSON.stringify({
  tipo: 'exercicio',
  nome: '<script>alert(1)</script>',
  padrao: 'core',
  musculos: ['Core/Abdômen'],
  tags: ['MUSCULAÇÃO'],
  equipamentoIds: [],
  nivel: 'iniciante',
  tempoMedioSeg: 30,
  obs: '"><svg onload=alert(1)> Prancha isométrica, manter o quadril alinhado.',
  equipamentoFaltante: [],
  fontes: [],
}));
