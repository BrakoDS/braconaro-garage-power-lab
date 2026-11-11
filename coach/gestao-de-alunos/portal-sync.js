// @ts-check
/**
 * Publicação do Portal do Aluno (lado coach).
 *
 * Para cada aluno que tenha e-mail, grava uma "fatia" só dele em
 * `portal/{email}` (Firestore) — que o próprio aluno lê no app /aluno.
 * A fonte da verdade continua sendo `gestao/{uid}`; isto é só a projeção
 * de leitura para o aluno. Reaproveita o app Firebase já inicializado.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { matrizDe } from '../../compartilhado/regras/matriz-individualizacao.js?v=37';
import { metasGrupoDe, metasCorporaisDe } from './metas-grupo.js?v=37';
import { mensalidadeDoMes } from '../../compartilhado/regras/planos.js';

const V = '10.12.2';
let _db = null, _fns = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, setDoc: fsMod.setDoc };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** `{ nome, escopo }` de quem paga a conta deste aluno, ou null. */
function vinculoPagador(a, todos) {
  const id = a.pagoPor && a.pagoPor.id;
  if (!id) return null;
  const resp = (todos || []).find((x) => x.id === id);
  return { nome: (resp && resp.nome) || '', escopo: a.pagoPor.escopo === 'plano' ? 'plano' : 'tudo' };
}

/** 'AAAA-MM' somado de n meses. @param {string} mesId @param {number} n */
function somarMes(mesId, n) {
  const [a, m] = mesId.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Hoje, 'AAAA-MM-DD', no relógio do aparelho. */
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * O plano e o cadastro de uma ficha (etapa 6.1): com eles, o Portal e o app
 * calculam a mensalidade de cada mês com o mesmo `planos.js` da Gestão — a
 * tabela de 2027, a cortesia, os bônus, a pausa e a regra das semanas.
 * @param {any} a
 */
export function camposDoPlano(a) {
  return {
    plano: a.plano || null, fundador: a.fundador === true, inicio: a.inicio || '', cortesia: a.cortesia || null,
    pausas: a.pausas || [], dupla: a.dupla || null, instagram: a.instagram || [], parceriaLocal: a.parceriaLocal || null,
    indicadoPor: a.indicadoPor || null, indicacoes: a.indicacoes || [], semanasAjuste: a.semanasAjuste || {},
    // Etapa 6.2: os contratos (só o que a conta usa) e o Day Pass que abate na 1ª mensalidade.
    contratos: (Array.isArray(a.contratos) ? a.contratos : []).map((/** @type {any} */ c) => ({
      id: c.id, prazo: c.prazo, vezes: c.vezes, inicio: c.inicio, valorMensal: c.valorMensal, pctBonus: c.pctBonus || 0, total: c.total,
      ...(c.saida ? { saida: { ultimoMes: c.saida.ultimoMes } } : {}),
    })),
    dayPass: a.dayPass || null,
  };
}

/**
 * As semanas de cada mês já resolvidas, para o DEPENDENTE: a semana quebrada da
 * regra das semanas depende da presença, e a presença de um aluno não vai na
 * fatia de outro. Então a Gestão faz a conta e publica o resultado, do ano que
 * passou até o mês que vem, por cima do ajuste do coach.
 * @param {any} x @param {string} hojeIso
 */
export function semanasPublicadas(x, hojeIso) {
  /** @type {Record<string, number>} */ const out = { ...(x.semanasAjuste || {}) };
  const atual = hojeIso.slice(0, 7);
  for (let i = -12; i <= 1; i++) {
    const mes = somarMes(atual, i);
    if (out[mes] != null) continue;
    // A volta da pausa, o início no meio do mês e o mês que o trancamento do
    // contrato cobriu em parte (etapa 6.2): os que dependem da presença.
    const m = mensalidadeDoMes(x, mes);
    if (m.porque && !m.ajuste) out[mes] = m.semanas;
  }
  return out;
}

/**
 * A fatia publicada de um aluno (o que o portal precisa mostrar).
 * @param {any} a @param {any[]} todos a lista inteira, para resolver os vínculos
 * @param {string[]} fechadosDoBox dias em que o box não abriu (feriado confirmado)
 * @param {string} [hojeIso] o dia de hoje (as semanas publicadas dos dependentes)
 */
export function fatia(a, todos, fechadosDoBox = [], hojeIso = hojeLocal()) {
  return {
    id: a.id, nome: a.nome || '', email: emailKey(a.email), fotoUrl: a.fotoUrl || '',
    status: a.status || 'ativo', objetivo: a.objetivo || '', nivel: a.nivel || '',
    // A trava do app mobile. Sai sempre como booleano, e só `true` literal
    // libera: ficha antiga (sem o campo) publica `false` e fica bloqueada, que é
    // o padrão que o box escolheu. O app lê com a mesma regra
    // (`app-mobile/src/core/acessoApp.ts`); o Portal web ignora o campo.
    appLiberado: a.appLiberado === true,
    // A tela simplificada do app (Home só com o treino do dia, duas abas). Mesma
    // regra da trava: só `true` literal liga, e ficha antiga publica `false` — a
    // tela completa de sempre. O app lê em `app-mobile/src/services/portalService.ts`.
    modoLite: a.modoLite === true,
    // Perfil de treino: com objetivo, foco e restrições no documento dele, o Portal
    // calcula a versão do aluno no próprio aparelho, com os mesmos módulos de
    // `compartilhado/regras/` que o coach usa — sem ler a ficha de ninguém.
    // Ficha antiga não tem nenhum dos três: entram vazios, e vazio quer dizer
    // "sem deslocamento", nunca erro.
    // `metasGrupo` é a meta por grupo muscular; as metas corporais vão em `metas`,
    // mais abaixo. Antes as duas saíam do mesmo campo (ver metas-grupo.js).
    foco: a.foco || [], restricoes: a.restricoes || [], metasGrupo: metasGrupoDe(a),
    // A matriz de individualização vai junto, e vai NORMALIZADA (`matrizDe`), não
    // crua: o aparelho do aluno recebe todos os campos preenchidos, com o padrão
    // no lugar do que a ficha não tem. Ficha antiga chega lá como "sem
    // adaptação" em vez de chegar como metade de um objeto.
    matriz: matrizDe(a),
    sexo: a.sexo || '', nascimento: a.nascimento || '', altura: a.altura || '',
    mensalidade: a.mensalidade || '', vencimento: a.vencimento || '', pagamentos: a.pagamentos || {},
    // Plano e grade de horários: o Portal monta com isso o bloco "Seu plano" e os
    // quadrados de "Seu horário" (verde = veio, vermelho = faltou).
    freqVezes: a.freqVezes || '', diasTreino: a.diasTreino || [], horarios: a.horarios || {},
    // Igual para todos os alunos, mas vai em cada fatia porque é assim que o
    // Portal lê — ele só enxerga o próprio documento, nunca a lista inteira.
    fechados: fechadosDoBox,
    // `freqHorario` era UMA hora para a semana toda. Continua sendo publicado
    // como reserva: aluno cadastrado antes da hora por dia ainda mostra a dele.
    freqHorario: a.freqHorario || '',
    // Consumíveis do box: a notinha do Portal e o valor do Pix saem daqui.
    consumos: a.consumos || [],
    // Quem paga a conta de quem. O Portal não lê a ficha de mais ninguém, então o
    // vínculo viaja já resolvido: o dependente recebe o NOME de quem acerta por
    // ele, e o responsável recebe os pedaços que precisa somar. Só isso — nem
    // telefone, nem presença, nem avaliação de terceiro entram na fatia.
    // A parceria vai junto para o Portal mostrar a mensalidade cheia e o desconto
    // na notinha — o aluno enxerga o benefício, e não um preço que sobe e desce.
    parceria: a.parceria || null,
    // O plano, o cadastro e os bônus (etapa 6.1): a mensalidade de cada mês.
    ...camposDoPlano(a),
    pagoPor: vinculoPagador(a, todos),
    dependentes: (todos || []).filter((x) => x.pagoPor && x.pagoPor.id === a.id).map((x) => ({
      nome: x.nome || '', escopo: x.pagoPor.escopo === 'plano' ? 'plano' : 'tudo',
      mensalidade: x.mensalidade || '', consumos: x.consumos || [], parceria: x.parceria || null,
      ...camposDoPlano(x), semanasAjuste: semanasPublicadas(x, hojeIso),
    })),
    presencas: a.presencas || [],
    presencaHoras: a.presencaHoras || {},
    // Remarcações: "a segunda dela aconteceu na quinta". O Portal precisa delas
    // para pintar o quadrado certo — sem isso, a semana lá e a do coach divergem.
    remarcacoes: a.remarcacoes || {},
    // Atestados: a aula que virou falta com direito a repor, e a reposição já
    // agendada. O Portal mostra os dois; sem eles o aluno vê só o vermelho.
    atestados: a.atestados || {},
    // Faltas lançadas pelo coach (desmarcou fora do prazo, no-show): falta já,
    // sem crédito, e que a cobertura automática não resgata (semana.js).
    faltas: a.faltas || {},
    // As aulas marcadas do Ilimitado (etapa 6.3): o Portal mostra e desmarca.
    marcacoes: a.marcacoes || {},
    avaliacoes: a.avaliacoes || [],
    // Só as metas corporais (lista). O mapa antigo por grupo saía aqui também,
    // como objeto; ele já vai em `metasGrupo`.
    metas: metasCorporaisDe(a),
    criadoEm: a.criadoEm || null,
    feedbacksCount: Array.isArray(a.feedbacks) ? a.feedbacks.length : 0,
    atualizadoEm: Date.now(),
  };
}

/**
 * Publica/atualiza `portal/{email}` de todos os alunos que têm e-mail.
 * Silencioso: se a nuvem/regra falhar, não quebra o app do coach.
 * @param {any[]} alunos
 */
export async function publicarPortal(alunos, fechados = []) {
  if (!cloudAtivo()) return;
  try {
    await init();
    const comEmail = (alunos || []).filter((a) => emailKey(a.email));
    await Promise.all(comEmail.map((a) =>
      _fns.setDoc(_fns.doc(_db, 'portal', emailKey(a.email)), JSON.parse(JSON.stringify(fatia(a, alunos, fechados))))
    ));
  } catch (e) {
    console.warn('Falha ao publicar o Portal do Aluno:', e?.code || e);
  }
}
