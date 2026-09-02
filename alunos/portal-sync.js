// @ts-check
/**
 * Publicação do Portal do Aluno (lado coach).
 *
 * Para cada aluno que tenha e-mail, grava uma "fatia" só dele em
 * `portal/{email}` (Firestore) — que o próprio aluno lê no app /aluno.
 * A fonte da verdade continua sendo `gestao/{uid}`; isto é só a projeção
 * de leitura para o aluno. Reaproveita o app Firebase já inicializado.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

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

/**
 * A fatia publicada de um aluno (o que o portal precisa mostrar).
 * @param {any} a @param {any[]} todos a lista inteira, para resolver os vínculos
 */
function fatia(a, todos) {
  return {
    id: a.id, nome: a.nome || '', email: emailKey(a.email), fotoUrl: a.fotoUrl || '',
    status: a.status || 'ativo', objetivo: a.objetivo || '', nivel: a.nivel || '',
    sexo: a.sexo || '', nascimento: a.nascimento || '', altura: a.altura || '',
    mensalidade: a.mensalidade || '', vencimento: a.vencimento || '', pagamentos: a.pagamentos || {},
    // Plano e grade de horários: o Portal monta com isso o bloco "Seu plano" e os
    // quadrados de "Seu horário" (verde = veio, vermelho = faltou).
    freqVezes: a.freqVezes || '', diasTreino: a.diasTreino || [], horarios: a.horarios || {},
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
    pagoPor: vinculoPagador(a, todos),
    dependentes: (todos || []).filter((x) => x.pagoPor && x.pagoPor.id === a.id).map((x) => ({
      nome: x.nome || '', escopo: x.pagoPor.escopo === 'plano' ? 'plano' : 'tudo',
      mensalidade: x.mensalidade || '', consumos: x.consumos || [], parceria: x.parceria || null,
    })),
    presencas: a.presencas || [],
    presencaHoras: a.presencaHoras || {},
    // Remarcações: "a segunda dela aconteceu na quinta". O Portal precisa delas
    // para pintar o quadrado certo — sem isso, a semana lá e a do coach divergem.
    remarcacoes: a.remarcacoes || {},
    // Atestados: a aula que virou falta com direito a repor, e a reposição já
    // agendada. O Portal mostra os dois; sem eles o aluno vê só o vermelho.
    atestados: a.atestados || {},
    avaliacoes: a.avaliacoes || [],
    metas: a.metas || [],
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
export async function publicarPortal(alunos) {
  if (!cloudAtivo()) return;
  try {
    await init();
    const comEmail = (alunos || []).filter((a) => emailKey(a.email));
    await Promise.all(comEmail.map((a) =>
      _fns.setDoc(_fns.doc(_db, 'portal', emailKey(a.email)), JSON.parse(JSON.stringify(fatia(a, alunos))))
    ));
  } catch (e) {
    console.warn('Falha ao publicar o Portal do Aluno:', e?.code || e);
  }
}
