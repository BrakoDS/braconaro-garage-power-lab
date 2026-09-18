/**
 * O MONTADOR HÍBRIDO RODANDO NA SUA MÁQUINA, SEM NUVEM E SEM GASTAR OPENAI.
 *
 *     node ferramentas/lousa-local.mjs
 *     # abre http://127.0.0.1:8765/__local/
 *
 * POR QUE ISTO EXISTE: as quatro telas da ferramenta dependem de Cloud
 * Functions que só existem depois de `firebase deploy`, e a leitura da lousa
 * gasta uma chamada paga à OpenAI a cada clique. Sem este arquivo, a única
 * forma de ver a ferramenta funcionando é publicar tudo e pagar por cada teste
 * — o que faz ninguém testar, que é como se descobre um bug de layout em
 * produção.
 *
 * Aqui o servidor devolve o site normal, mas com um `importmap` que troca
 * `cloud/chamadas.js`, o login do Firebase e a lista de alunos por DUBLÊS com
 * dados de exemplo. A ferramenta roda inteira: desenhar no quadro, reconhecer,
 * a prévia comparativa, os alertas com troca em um clique, a prévia por aluno e
 * o dashboard com os três gráficos. Nada sai da máquina.
 *
 * O QUE ISTO **NÃO** TESTA, e por isso não substitui um teste de verdade:
 * a leitura da lousa pela IA (o dublê devolve um treino fixo), as regras do
 * Firestore, e a gravação em lote. Isso só o deploy responde — ver o README da
 * ferramenta.
 *
 * A página do harness é GERADA a partir do `index.html` de verdade, em memória,
 * a cada requisição. É de propósito: uma cópia do HTML aqui dentro divergiria da
 * tela real no primeiro ajuste, e o harness passaria a testar uma ferramenta que
 * não existe mais.
 *
 * ATENÇÃO: isso vale para o HTML, o CSS e os `.js` do site, que são lidos do
 * disco a cada pedido — editar qualquer um deles e recarregar a página basta.
 * Os DUBLÊS abaixo são constantes deste módulo, lidas uma vez na inicialização:
 * depois de mexer num deles, é preciso parar (Ctrl+C) e subir o servidor de
 * novo. Sem isso o navegador recebe o dublê velho e o teste mente em silêncio.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORTA) || 8765;
const APP = '/coach/montador-hibrido';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------------ *
 * Os dublês
 * ------------------------------------------------------------------ */

const TREINO_EXEMPLO = {
  sistema: 'Hipertrofia',
  titulo: 'Full Body A — segunda pesada',
  blocos: [
    { id: 'A', nome: 'Mobilidade', exercicios: [
      { nome: 'Mobilidade de Quadril', bloco: 'A', series: 1, reps: '40s', implemento: '', grupamentos: [], observacao: '' },
      { nome: 'Gato-Camelo', bloco: 'A', series: 1, reps: '30s', implemento: 'Colchonete', grupamentos: ['Core/Abdômen'], observacao: '' },
    ] },
    { id: 'B', nome: 'Aquecimento', exercicios: [
      { nome: 'Airbike', bloco: 'B', series: 1, reps: '3min', implemento: 'Airbike', grupamentos: ['Quadríceps'], observacao: 'ritmo leve' },
    ] },
    { id: 'C', nome: 'Força', exercicios: [
      { nome: 'Agachamento Livre', bloco: 'C', series: 4, reps: '8-12', implemento: 'Barra', grupamentos: ['Quadríceps', 'Glúteo'], observacao: 'RIR 2 · 90s de descanso' },
      { nome: 'Supino Reto', bloco: 'C', series: 4, reps: '10', implemento: 'Barra', grupamentos: ['Peito', 'Tríceps'], observacao: 'RIR 1' },
      { nome: 'Puxada Alta Pegada Aberta', bloco: 'C', series: 3, reps: '12', implemento: 'Cabo', grupamentos: ['Costas', 'Bíceps'], observacao: '' },
    ] },
    { id: 'D', nome: 'Metcon', exercicios: [
      { nome: 'Swing de Kettlebell', bloco: 'D', series: 3, reps: '20', implemento: 'Kettlebell', grupamentos: ['Glúteo', 'Posterior de coxa'], observacao: 'máximo no tempo' },
      { nome: 'Burpee', bloco: 'D', series: 3, reps: 'AMRAP 8min', implemento: 'Peso corporal', grupamentos: ['Peito'], observacao: 'sem pausa' },
    ] },
  ],
  estimativaSeries: 20,
  // As duas trocas que as regras globais do box fazem — é aqui que dá para
  // conferir se a prévia mostra o que foi substituído e por quê.
  substituicoes: [
    { de: 'Pull-ups', para: 'Puxada Alta Pegada Aberta', regra: 'Pull-up ➔ Puxada Alta Pegada Aberta (regra global do box)' },
    { de: 'Corrida 800m', para: 'Airbike', regra: 'Corrida ➔ Airbike (regra global do box)' },
  ],
  avisos: ['O descanso do bloco D estava ilegível na lousa — confirme antes de salvar.'],
};

const DUBLE_CHAMADAS = `
// Dublê de cloud/chamadas.js — gerado por ferramentas/lousa-local.mjs. Nenhuma rede.
const TREINO = ${JSON.stringify(TREINO_EXEMPLO, null, 2)};

/** Atraso de propósito: é ele que mostra o botão desabilitado e o "Lendo a lousa…". */
const demora = (ms = 700) => new Promise((r) => setTimeout(r, ms));

export async function parseWorkoutLousa({ textInput, canvasImageBase64 }) {
  await demora();
  if (!textInput && !canvasImageBase64) throw new Error('A lousa está vazia — escreva o treino ou desenhe no quadro.');
  // SIMULA a decisao do servidor para a tela poder ser vista nos tres estados.
  // Nao e o pre-parser de verdade (aquele e TypeScript e roda no servidor; quem
  // o testa e o npm run checar) — aqui basta uma heuristica para o coach ver
  // como cada caminho aparece na barra de status.
  const conhecidos = ['wall ball', 'burpee', 'agachamento', 'supino', 'kettlebell swing', 'box jump'];
  const texto = String(textInput || '').toLowerCase();
  const temBloco = /(^|\\n)\\s*[abcd]\\s*[—\\-:)]/i.test(texto);
  const temSistema = /(hiit|gap|hipertrofia|hyrox)/i.test(texto);
  const linhasEx = texto.split('\\n').filter((l) => /\\d+\\s*[x×]\\s*\\d+/.test(l));
  const todosConhecidos = linhasEx.length > 0 && linhasEx.every((l) => conhecidos.some((c) => l.includes(c)));

  let origem = 'ia';
  if (!canvasImageBase64 && temBloco && temSistema && linhasEx.length) {
    origem = todosConhecidos ? 'local' : 'parcial';
  }
  console.info('[local] parseWorkoutLousa', {
    caracteres: texto.length, temDesenho: !!canvasImageBase64, origem,
    chamouIA: origem !== 'local',
  });
  return { treino: structuredClone(TREINO), restantes: origem === 'local' ? 40 : 39, origem };
}

export async function checkWorkoutVariability() {
  await demora();
  return {
    alertas: [
      { tipo: 'duplicacao', severidade: 'alta', alvo: 'Agachamento Livre',
        titulo: 'Agachamento Livre repetido em menos de 72h',
        detalhe: 'Já entrou há 46h (Full Body B). O grupo não teve tempo de recuperar.',
        sugestoes: [
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Halter', de: 'Barra', para: 'Halter' },
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Cabo', de: 'Barra', para: 'Cabo' },
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Anilha', de: 'Barra', para: 'Anilha' },
          { acao: 'manter', rotulo: 'Manter a escolha do coach', de: 'Agachamento Livre', para: 'Agachamento Livre' },
        ] },
      { tipo: 'saturacao', severidade: 'media', alvo: 'Barra',
        titulo: 'Barra em 66% dos exercícios da semana',
        detalhe: '8 de 12 exercícios usam Barra. Acima de 60% vira fila de estação na aula e estímulo repetido.',
        sugestoes: [
          { acao: 'trocar-implemento', rotulo: 'Barra ➔ Halter', de: 'Barra', para: 'Halter' },
          { acao: 'manter', rotulo: 'Manter a escolha do coach', de: 'Barra', para: 'Barra' },
        ] },
      { tipo: 'redundancia', severidade: 'media', alvo: 'Quadríceps',
        titulo: 'Quadríceps concentra 48% das séries da semana',
        detalhe: '19 de 40 séries caem em Quadríceps. O resto do corpo está ficando para trás no ciclo.',
        sugestoes: [
          { acao: 'trocar-exercicio', rotulo: 'Trocar um exercício de Quadríceps por outro padrão', de: 'Quadríceps', para: '' },
          { acao: 'manter', rotulo: 'Manter — é foco proposital do ciclo', de: 'Quadríceps', para: 'Quadríceps' },
        ] },
    ],
    resumo: { treinosNaJanela: 4, exerciciosNaJanela: 24, seriesNaJanela: 71,
      usoPorImplemento: { Barra: 8, Halter: 5, Kettlebell: 3 } },
  };
}

/**
 * A distribuição em lote — recebe TODAS as turmas do dia de uma vez.
 *
 * Os perfis cobrem os três casos que a prévia precisa mostrar diferente: lesão
 * COM substituto (troca o exercício), lesão SEM substituto (sai da ficha, com
 * aviso) e aluno sem 1RM (carga sem número). O resto recebe o treino da turma.
 * Cada ficha volta com o \`classTime\` da turma dela, que é como a tela reagrupa.
 */
export async function distributeWorkoutToStudents({ turmas, dryRun }) {
  await demora();
  const CASOS = {
    '001': 'lesao-com-substituto',
    '004': 'lesao-sem-substituto',
    '007': 'sem-1rm',
  };
  const NOMES = {
    '001': 'Ana Prado', '002': 'Bruno Alves', '003': 'Carla Nunes', '004': 'Diego Matos',
    '005': 'Elisa Rocha', '006': 'Fábio Lima', '007': 'Gabi Souza', '008': 'Heitor Dias',
    '009': 'Ivone Castro', '010': 'João Vieira', '011': 'Karina Melo',
    '013': 'Marina Duarte', '014': 'Nelson Braga', '015': 'Otávio Reis',
    '016': 'Priscila Amaral', '017': 'Renê Sampaio',
  };
  const fichas = (turmas || []).flatMap((t) => t.studentIds.map((id) => {
    const caso = CASOS[id] || 'normal';
    const semRm = caso === 'sem-1rm';
    const linhas = [
      { bloco: 'C', blocoNome: 'Força',
        nome: caso === 'lesao-com-substituto' ? 'Leg Press' : 'Agachamento Livre',
        series: 4, reps: '8-12', implemento: 'Barra', observacao: 'RIR 2',
        cargaKg: semRm ? null : 70, percentual: semRm ? null : 70,
        motivos: [
          ...(caso === 'lesao-com-substituto' ? ['Troca por restrição (joelho direito): Agachamento Livre ➔ Leg Press'] : []),
          ...(semRm ? [] : ['Carga: 70% de 100kg — 1RM medido de agachamento']),
        ] },
      { bloco: 'C', blocoNome: 'Força', nome: 'Supino Reto', series: 4, reps: '10',
        implemento: 'Barra', observacao: 'RIR 1', cargaKg: null, percentual: null, motivos: [] },
    ];
    const removidos = caso === 'lesao-sem-substituto'
      ? [{ nome: 'Burpee', motivo: 'Restrição (lombar) sem substituto cadastrado na matriz' }] : [];
    return {
      alunoId: id, nome: NOMES[id] || id, email: id === '010' ? '' : 'aluno' + id + '@exemplo.com',
      nivel: 'intermediario', classTime: t.classTime, linhas, removidos,
      avisos: [
        ...(removidos.length ? ['1 exercício(s) fora da ficha por restrição sem substituto — cadastre a troca na matriz do aluno.'] : []),
        ...(semRm ? ['Sem 1RM de referência na matriz: as cargas saem como orientação da lousa, sem número em kg.'] : []),
      ],
    };
  }));
  console.info('[local] distributeWorkoutToStudents', { dryRun, turmas: (turmas || []).length, alunos: fichas.length });
  return { fichas, gravadas: dryRun ? 0 : fichas.length, semMatriz: [], dryRun: !!dryRun };
}

/**
 * As lousas salvas NESTA sessão do dublê, em memória.
 *
 * O dublê antigo dizia "nada foi gravado" e devolvia sempre o mesmo id. Isso
 * escondia justamente o bug que o coach viu em produção: salvar um treino e
 * não vê-lo aparecer no Calendário. Guardar aqui e devolver em listarLousas
 * faz o fluxo inteiro (salvar ➔ distribuir ➔ Calendário) ser testável local.
 */
const GRAVADAS = [];
let gravacoes = 0;

export function marcaDasLousas() { return gravacoes; }

export async function salvarLousa(_uid, dados, workoutId) {
  await demora(200);
  const id = workoutId || 'treino-local-' + (GRAVADAS.length + 1);
  const i = GRAVADAS.findIndex((x) => x.workoutId === id);
  const doc = Object.assign({}, dados, { workoutId: id });
  if (i >= 0) GRAVADAS[i] = doc; else GRAVADAS.push(doc);
  gravacoes += 1;
  console.info('[local] salvarLousa', { id, dateId: dados.dateId, marca: gravacoes });
  return id;
}
/**
 * Um mês de treinos para o Calendário ter o que desenhar.
 *
 * Espalhados de propósito em segunda, quarta e sexta, com duas aulas num mesmo
 * dia (manhã e noite) e sistemas diferentes — é o que faz aparecer na tela o
 * chip duplo, as quatro cores da legenda e a diferença entre o treino passado
 * (cadeado) e o de hoje/futuro (clicável).
 *
 * NOTA DE ESCAPE: este código vive dentro de um template literal do servidor,
 * então toda interpolação leva barra invertida (\${...}) e todo \\n precisa de
 * DUAS — uma para o template, outra para o dublê. Sem isso o Node resolve a
 * variável cedo demais, ou a quebra de linha vira quebra de verdade e parte a
 * string ao meio. Quem pega isso é a validação de sintaxe do arquivo SERVIDO,
 * não a do servidor: o servidor está sempre válido, o que quebra é o que ele
 * gera.
 */
export async function listarLousas(_uid, inicio, fim) {
  await demora(250);
  const SISTEMAS = ['Hipertrofia', 'HIIT', 'GAP', 'Hyrox'];
  const iso = (d) => d.toISOString().slice(0, 10);
  const out = [];
  // Varre a faixa que a tela pediu e põe treino nas segundas, quartas e sextas.
  for (let d = new Date(inicio + 'T12:00:00Z'); iso(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (![1, 3, 5].includes(dow)) continue;
    const dateId = iso(d);
    const sistema = SISTEMAS[(d.getUTCDate() + dow) % SISTEMAS.length];
    const treino = structuredClone(TREINO);
    treino.sistema = sistema;
    treino.titulo = sistema + ' · ' + dateId.slice(8) + '/' + dateId.slice(5, 7);
    // Sem \`classTime\`: o horário saiu da Lousa e quem decide a hora é a aba
    // Turma. O treino é do DIA.
    // DISTRIBUIDO: e o que faz o calendario mostrar uma aula por horario. Segunda
    // e quarta tem as quatro aulas do box; sexta tem so as duas da manha.
    const horarios = dow === 5 ? ['06:00', '07:00'] : ['06:00', '07:00', '18:00', '19:00'];
    out.push({
      workoutId: 'w-' + dateId + '-a', dateId, treino,
      textoOriginal: 'A — Mobilidade\\n  Mobilidade de quadril · 40s\\n\\nC — Força\\n  Agachamento livre · 4x8-12 · RIR 2',
      geradoEm: dateId + 'T10:00:00.000Z',
      distribuido: {
        turmas: horarios.map((h, i) => ({ classTime: h, alunos: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].slice(0, 3 + i) })),
      },
    });
    // Sexta tem um SEGUNDO treino no mesmo dia — o caso que um mapa de um treino
    // por dia esconderia, e que agora se diferencia pelo título, não pela hora.
    if (dow === 5) {
      const segundo = structuredClone(TREINO);
      segundo.sistema = 'HIIT';
      segundo.titulo = 'HIIT complementar';
      // SEM o campo distribuido: e o caso "montado, ainda nao distribuido" — o chip
      // vazado que o coach usa para achar o buraco da semana.
      out.push({ workoutId: 'w-' + dateId + '-b', dateId, treino: segundo,
        textoOriginal: '', geradoEm: dateId + 'T22:00:00.000Z' });
    }
    // Um treino ANTIGO, com \`classTime\` gravado antes de o campo sair: o
    // calendário tem de continuar mostrando a hora dele.
    if (d.getUTCDate() === 2) {
      const legado = structuredClone(TREINO);
      legado.sistema = 'Hyrox';
      legado.titulo = 'Hyrox (treino antigo, com horário)';
      out.push({ workoutId: 'w-' + dateId + '-legado', dateId, classTime: '06:00', treino: legado,
        textoOriginal: '', geradoEm: dateId + 'T06:00:00.000Z' });
    }
  }
  // O que o coach salvou nesta sessão entra junto — é o que prova na tela que
  // o treino recém-gravado aparece no mês sem recarregar a página.
  for (const g of GRAVADAS) {
    if (g.dateId >= inicio && g.dateId <= fim) out.push(g);
  }
  console.info('[local] listarLousas', { inicio, fim, treinos: out.length, desta_sessao: GRAVADAS.length });
  return out;
}

export async function lerConsolidado(_uid, chave) {
  await demora(150);
  const ehMes = !chave.includes('W');
  const f = ehMes ? 4 : 1;
  // Variação por semana para a linha do mês não sair reta.
  const jitter = ehMes ? 1 : (1 + (Number(chave.slice(-2)) % 3) * 0.18);
  const n = (v) => Math.round(v * f * jitter);
  return {
    chave, periodo: ehMes ? 'mes' : 'semana',
    inicio: '2026-09-14', fim: ehMes ? '2026-09-30' : '2026-09-20',
    treinos: n(4), totalSeries: n(42),
    porGrupo: { peito: n(8), costas: n(11), ombro: n(4), braco: n(6), perna: n(16), gluteo: n(9), core: n(5) },
    metas: { peito: 10 * f, costas: 10 * f, ombro: 10 * f, braco: 10 * f, perna: 10 * f, gluteo: 10 * f, core: 10 * f },
    porImplemento: { Barra: n(14), Halter: n(9), Kettlebell: n(6), Cabo: n(5), Airbike: n(3), Colchonete: n(2), Anilha: n(1), TRX: n(1) },
    percentualImplemento: {}, porSistema: { Hipertrofia: n(2), HIIT: n(1), Hyrox: n(1) },
    // COBERTURA DA TAXONOMIA — os dois estados da faixa do topo, de propósito:
    // a SEMANA tem buraco (faixa de alerta, com os nomes a cobrar) e o MES nao
    // (selo discreto "100% mapeada"). Trocar entre um e outro na tela e so
    // mudar a data do dashboard.
    //
    // Repare que porTipoContagem.indefinido e ALTO nos dois: agachamento e
    // supino estao fora da taxonomia de proposito. E exatamente por isso que o
    // alerta le seriesSemGrupo, e nao indefinido.
    porTipoContagem: { tonelagem: n(22), peso_corporal: n(9), metcon_series: n(6), indefinido: n(5) },
    seriesSemGrupo: ehMes ? 0 : 7,
    exerciciosSemGrupo: ehMes ? [] : ['Devil Press', 'Sled Pull', 'Sandbag Carry'],
    atualizadoEm: new Date().toISOString(),
  };
}
export async function lerMatriz() { return null; }
export async function salvarMatriz() {}
`;

const DUBLE_CLOUD = `
// Dublê do login do Firebase — gerado por ferramentas/lousa-local.mjs.
export function usuario() { return { uid: 'coach-local', email: 'coach@local' }; }
export function cloudAtivo() { return true; }
export async function sessaoAtual() { return usuario(); }
export async function login() { return usuario(); }
export async function criarConta() { return usuario(); }
export async function resetarSenha() {}
export async function carregarParaStore() { return true; }
export function conectarStore() {}
export async function iniciar() {}
export async function sair() {}
`;

const DUBLE_GESTAO = `
// Dublê da Gestão de Alunos — gerado por ferramentas/lousa-local.mjs.
//
// Os horários são o que importa aqui: a aba "Turma" agrupa pelo DIA e pela HORA
// da ficha, então o dublê precisa cobrir os casos que a tela tem de aguentar —
// turma cheia, aluno em horários diferentes conforme o dia, ficha antiga só com
// \`freqHorario\`, aluno sem hora nenhuma, aluno que não treina no dia e inativo.
export function listar() {
  return [
    // 7h de segunda e quarta — a turma da manhã.
    { id: '001', nome: 'Ana Prado', email: 'ana@exemplo.com', nivel: 'iniciante', status: 'ativo',
      diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' } },
    { id: '002', nome: 'Bruno Alves', email: 'bruno@exemplo.com', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' } },
    { id: '003', nome: 'Carla Nunes', email: 'carla@exemplo.com', nivel: 'avancado', status: 'ativo',
      diasTreino: ['seg', 'qua'], horarios: { seg: '07:00', qua: '07:00' } },
    // Treina de manhã na segunda e à noite na quarta — o caso que um campo
    // \`horario_padrao\` único não conseguiria representar.
    { id: '004', nome: 'Diego Matos', email: 'diego@exemplo.com', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['seg', 'qua'], horarios: { seg: '07:00', qua: '19:00' } },
    // A turma das 18h.
    { id: '005', nome: 'Elisa Rocha', email: 'elisa@exemplo.com', nivel: 'iniciante', status: 'ativo',
      diasTreino: ['seg', 'ter', 'qua', 'qui', 'sex'], horarios: { seg: '18:00', ter: '18:00', qua: '18:00', qui: '18:00', sex: '18:00' } },
    { id: '006', nome: 'Fábio Lima', email: 'fabio@exemplo.com', nivel: 'avancado', status: 'ativo',
      diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '18:00', qua: '18:00', sex: '18:00' } },
    // A turma das 19h.
    { id: '007', nome: 'Gabi Souza', email: 'gabi@exemplo.com', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['seg', 'qua'], horarios: { seg: '19:00', qua: '19:00' } },
    { id: '008', nome: 'Heitor Dias', email: 'heitor@exemplo.com', nivel: 'iniciante', status: 'ativo',
      diasTreino: ['qua', 'sex'], horarios: { qua: '19:00', sex: '19:00' } },
    // Ficha antiga: uma hora só para a semana toda, escrita à mão.
    { id: '009', nome: 'Ivone Castro', email: 'ivone@exemplo.com', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['qua'], horarios: {}, freqHorario: '6h30' },
    // Treina hoje, mas a ficha não diz a que horas — vai para o bloco de aviso.
    { id: '010', nome: 'João Vieira', email: '', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['qua'], horarios: {} },
    // Não treina na quarta: não pode aparecer na grade do dia.
    { id: '011', nome: 'Karina Melo', email: 'karina@exemplo.com', nivel: 'avancado', status: 'ativo',
      diasTreino: ['ter', 'qui'], horarios: { ter: '18:00', qui: '18:00' } },
    // Inativo: fora da turma, sempre — e fora da busca de aluno extra também.
    { id: '012', nome: 'Lucas Prado', email: 'lucas@exemplo.com', nivel: 'iniciante', status: 'inativo',
      diasTreino: ['qua'], horarios: { qua: '07:00' } },

    // --- A BASE ALÉM DA GRADE DO DIA ---
    // Estes não treinam na quarta e por isso NÃO aparecem nas turmas montadas.
    // Existem para a busca de "+ Aluno extra" ter o que achar: é exatamente o
    // caso de quem perdeu a aula dele e vem repor noutro dia.
    { id: '013', nome: 'Marina Duarte', email: 'marina@exemplo.com', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['ter', 'qui'], horarios: { ter: '07:00', qui: '07:00' } },
    { id: '014', nome: 'Nelson Braga', email: 'nelson@exemplo.com', nivel: 'avancado', status: 'ativo',
      diasTreino: ['sab'], horarios: { sab: '09:00' } },
    { id: '015', nome: 'Otávio Reis', email: 'otavio@exemplo.com', nivel: 'iniciante', status: 'ativo',
      diasTreino: ['ter', 'qui'], horarios: { ter: '19:00', qui: '19:00' } },
    { id: '016', nome: 'Priscila Amaral', email: 'priscila@exemplo.com', nivel: 'intermediario', status: 'ativo',
      diasTreino: ['sab'], horarios: { sab: '10:00' } },
    // Nome com acento, para conferir que a busca acha digitando sem ele.
    { id: '017', nome: 'Renê Sampaio', email: 'rene@exemplo.com', nivel: 'avancado', status: 'ativo',
      diasTreino: ['ter'], horarios: { ter: '18:00' } },
  ];
}
export async function iniciarSync() {}
export function atualizar() {}
export function aoGravar() {}
`;

/** O index.html de verdade, com os dublês no lugar da rede e sem o login. */
function gerarHarness() {
  const html = fs.readFileSync(path.join(RAIZ, 'coach/montador-hibrido/index.html'), 'utf8');
  const importmap = `  <script type="importmap">
  {
    "imports": {
      "${APP}/cloud/chamadas.js": "/__local/duble-chamadas.js",
      "/compartilhado/firebase/cloud.js": "/__local/duble-cloud.js",
      "/coach/gestao-de-alunos/db.js": "/__local/duble-gestao.js"
    }
  }
  </script>
`;
  return html
    .replace('<link rel="stylesheet" href="./app.css?v=1" />', `${importmap}  <link rel="stylesheet" href="${APP}/app.css" />`)
    .replace('<link rel="manifest" href="./manifest.webmanifest" />', '')
    // Entra direto: o gate depende do Firebase Auth de verdade, que não existe aqui.
    .replace('<script type="module" src="./ui/gate.js?v=1"></script>', `<div style="position:fixed;bottom:10px;right:12px;z-index:99;background:#FFC700;color:#1a1300;
      font:600 11px system-ui;padding:5px 10px;border-radius:999px">MODO LOCAL · sem nuvem, sem OpenAI</div>
    <script type="module">
      document.getElementById('gate').style.display = 'none';
      document.querySelector('main').removeAttribute('hidden');
      document.querySelector('.topbar').removeAttribute('hidden');
      await import('${APP}/ui/app.js');
      window.__pronto = true;
    </script>`);
}

/**
 * A GESTÃO DE ALUNOS em modo local — para testar a aba "Matriz".
 *
 * Aqui basta UM dublê: `config.js` com `CLOUD_ATIVO = false`. Com ele desligado,
 * o app inteiro cai sozinho no caminho local que ele já tem — a porta usa a
 * senha simples, `portal-sync` desiste na primeira linha, `db.iniciarSync` não
 * conecta, e todo o resto (o `db.js` de verdade, o localStorage, o formulário)
 * roda exatamente como em produção. Dublar três módulos daria o mesmo resultado
 * testando menos código real.
 */
const DUBLE_CONFIG = `
// Dublê de config.js — gerado por ferramentas/lousa-local.mjs.
export const CLOUD_ATIVO = false;
export const firebaseConfig = {};
`;

/** Alunos de exemplo, semeados no localStorage antes do app subir. */
const ALUNOS_EXEMPLO = [
  { id: '001', nome: 'Ana Prado', email: 'ana@exemplo.com', nivel: 'iniciante', objetivo: 'Hipertrofia',
    status: 'ativo', freqVezes: '3', foco: ['perna'], criadoEm: 1757000000000,
    matrizIndividualizacao: {
      versao: 1,
      perfil: { fase: 'forca' },
      cargas: {
        referencia: {
          agachamento: { kg: 90, reps: 5, rm: null, medidoEm: '2026-09-01' },
          supino: { kg: null, reps: null, rm: 70, medidoEm: '2026-08-20' },
          terra: { kg: null, reps: null, rm: null, medidoEm: '' },
        },
        rir: '2-3',
        airbike: { rpm: 60, calPorMin: 12, obs: '' },
      },
      adaptacoes: {
        lesoes: [{ regiao: 'joelho', gravidade: 'moderada', desde: '2026-08-01', obs: 'menisco' }],
        impacto: 'converter_airbike', tracao: 'puxada_alta', mobilidade: ['tornozelo'],
        obs: 'evitar carga axial alta',
      },
      historico: { semanaId: '', correcoes: {}, atualizadoEm: 0 },
      atualizadoEm: 1757000000000,
    } },
  { id: '002', nome: 'João Vieira', email: '', nivel: 'intermediario', objetivo: 'Condicionamento',
    status: 'ativo', freqVezes: '4', foco: [], criadoEm: 1757100000000 },
];

/** O index.html da Gestão, sem nuvem e já liberado. */
function gerarHarnessGestao() {
  const html = fs.readFileSync(path.join(RAIZ, 'coach/gestao-de-alunos/index.html'), 'utf8');
  const importmap = `  <script type="importmap">
  { "imports": { "/compartilhado/firebase/config.js": "/__local/duble-config.js" } }
  </script>
`;
  // Script CLÁSSICO, e não módulo: precisa rodar ANTES de `app.js`, e todo
  // módulo é adiado até o documento estar pronto — a semente chegaria depois de
  // o `db.js` já ter lido um localStorage vazio.
  const semente = `  <script>
    try {
      sessionStorage.setItem('braconaro_montador_auth', '1');
      if (!localStorage.getItem('braconaro_gestao_alunos_v1')) {
        localStorage.setItem('braconaro_gestao_alunos_v1', ${JSON.stringify(JSON.stringify({ seq: 2, alunos: ALUNOS_EXEMPLO }))});
      }
    } catch (e) { console.warn('semente local falhou', e); }
  </script>
`;
  return html
    .replace(/<link rel="stylesheet" href="\.\/([^"]+)" \/>/g, '<link rel="stylesheet" href="/coach/gestao-de-alunos/$1" />')
    .replace('<link rel="manifest"', importmap + semente + '  <link rel="manifest"')
    .replace(/<script type="module" src="\.\/app\.js[^"]*"><\/script>/,
      `<div style="position:fixed;bottom:10px;right:12px;z-index:99;background:#f5c518;color:#0a0a0b;
        font:600 11px system-ui;padding:5px 10px;border-radius:999px">MODO LOCAL · sem nuvem</div>
      <script type="module" src="/coach/gestao-de-alunos/app.js"></script>`);
}

const GERADOS = {
  '/__local/': () => ({ corpo: gerarHarness(), tipo: TIPOS['.html'] }),
  '/__local/gestao/': () => ({ corpo: gerarHarnessGestao(), tipo: TIPOS['.html'] }),
  '/__local/duble-config.js': () => ({ corpo: DUBLE_CONFIG, tipo: TIPOS['.js'] }),
  '/__local/duble-chamadas.js': () => ({ corpo: DUBLE_CHAMADAS, tipo: TIPOS['.js'] }),
  '/__local/duble-cloud.js': () => ({ corpo: DUBLE_CLOUD, tipo: TIPOS['.js'] }),
  '/__local/duble-gestao.js': () => ({ corpo: DUBLE_GESTAO, tipo: TIPOS['.js'] }),
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rota = url.pathname === '/__local' ? '/__local/' : url.pathname;
  if (rota === '/__local/gestao') rota = '/__local/gestao/';

  if (GERADOS[rota]) {
    const { corpo, tipo } = GERADOS[rota]();
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(corpo);
    return;
  }
  if (rota === '/') {
    res.writeHead(302, { Location: '/__local/' });
    res.end();
    return;
  }

  // Estático a partir da raiz do repositório. `path.resolve` + a checagem de
  // prefixo barram `../../etc/passwd` — é servidor de desenvolvimento, mas um
  // que serve o disco inteiro por descuido não é aceitável nem aqui.
  const alvo = path.resolve(RAIZ, '.' + decodeURIComponent(rota));
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end('Fora da raiz'); return; }
  fs.readFile(alvo, (erro, dados) => {
    if (erro) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Não encontrado: ' + rota); return; }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(dados);
  });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  Montador Híbrido em MODO LOCAL — sem nuvem, sem OpenAI\n`);
  console.log(`      Lousa do Coach   http://127.0.0.1:${PORTA}/__local/   (abas Lousa e Calendário)`);
  console.log(`      Gestão de Alunos http://127.0.0.1:${PORTA}/__local/gestao/   (aba "Matriz")\n`);
  console.log(`  Ctrl+C para parar.\n`);
});
