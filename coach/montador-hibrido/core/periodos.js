// @ts-check
/**
 * AS CHAVES DE PERÍODO do Dashboard de Volume — semana ISO e mês.
 *
 * DUPLICAÇÃO DECLARADA: as mesmas contas existem em
 * `functions/src/volume-agregado.ts`, e é de lá que vêm os ids dos documentos
 * em `coaches/{uid}/volumeAgregado/`. Não dá para importar: `functions/` é um
 * pacote TypeScript compilado que roda no servidor, e o site é servido estático
 * — são dois runtimes sem caminho entre eles (o mesmo motivo que
 * `functions/src/pesquisa.ts` documenta para os vocabulários dele).
 *
 * O risco concreto se as duas divergirem: o gatilho grava em `2026-W38` e a
 * tela pede `2026-W39`. Não dá erro nenhum — o dashboard só mostra "ainda
 * consolidando" para sempre. Por isso o teste ao lado fixa os mesmos casos de
 * borda que `checar.ts` fixa do outro lado (virada de ano, segunda e domingo da
 * mesma semana), e é neles que a divergência apareceria.
 *
 * Meio-dia UTC em toda conversão: 'YYYY-MM-DD' interpretado como meia-noite UTC
 * cai no dia ANTERIOR em qualquer fuso negativo — e o box está em UTC-3.
 */

/** @param {string} dateId 'YYYY-MM-DD' */
function dataDe(dateId) {
  const t = Date.parse(`${dateId}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Chave ISO-8601 da semana ('2026-W38').
 *
 * ISO e não "semana do mês" porque o mês parte a semana ao meio: segunda 29/09 e
 * quarta 01/10 são a MESMA semana de treino, e uma contagem por mês as jogaria
 * em consolidados diferentes. A semana ISO começa na segunda, que é como a grade
 * do box é lida.
 * @param {string} dateId
 */
export function chaveSemana(dateId) {
  const d = dataDe(dateId);
  if (!d) return '';
  const alvo = new Date(d.getTime());
  // A quinta-feira da semana define o ano ISO — é a regra da própria norma, e é
  // o que faz 31/12/2025 pertencer a 2026-W01.
  const diaIso = (alvo.getUTCDay() + 6) % 7; // segunda = 0
  alvo.setUTCDate(alvo.getUTCDate() - diaIso + 3);
  const ano = alvo.getUTCFullYear();
  const primeiraQuinta = new Date(Date.UTC(ano, 0, 4));
  const diaIsoPrimeira = (primeiraQuinta.getUTCDay() + 6) % 7;
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - diaIsoPrimeira + 3);
  const semana = 1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * 864e5));
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

/** 'YYYY-MM'. @param {string} dateId */
export function chaveMes(dateId) {
  return String(dateId || '').slice(0, 7);
}

/** Segunda e domingo da semana de `dateId`. @param {string} dateId */
export function faixaDaSemana(dateId) {
  const d = dataDe(dateId);
  if (!d) return { inicio: '', fim: '' };
  const diaIso = (d.getUTCDay() + 6) % 7;
  const segunda = new Date(d.getTime());
  segunda.setUTCDate(segunda.getUTCDate() - diaIso);
  const domingo = new Date(segunda.getTime());
  domingo.setUTCDate(domingo.getUTCDate() + 6);
  return { inicio: iso(segunda), fim: iso(domingo) };
}

/** Primeiro e último dia do mês de `dateId`. @param {string} dateId */
export function faixaDoMes(dateId) {
  const mes = chaveMes(dateId);
  if (mes.length !== 7) return { inicio: '', fim: '' };
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 'setembro de 2026'. @param {string} mesId 'YYYY-MM' */
export function rotuloMes(mesId) {
  const [ano, m] = String(mesId || '').split('-').map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${ano}` : String(mesId || '');
}

/** '14/09 a 20/09'. @param {string} dateId */
export function rotuloSemana(dateId) {
  const { inicio, fim } = faixaDaSemana(dateId);
  const curto = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
  return inicio ? `${curto(inicio)} a ${curto(fim)}` : '';
}

/**
 * As chaves de semana ISO que tocam um mês, na ordem.
 *
 * Usa as SEGUNDAS de cada semana e não o dia 1 de cada bloco de 7: um mês tem 4
 * a 6 semanas ISO conforme o dia em que começa, e fatiar de sete em sete a
 * partir do dia 1 daria "semanas" que não existem no consolidado.
 * @param {string} mesId 'YYYY-MM'
 */
export function semanasDoMes(mesId) {
  const { inicio, fim } = faixaDoMes(`${mesId}-01`);
  if (!inicio) return [];
  const chaves = [];
  let cursor = faixaDaSemana(inicio).inicio;
  // Guarda de segurança: nenhum mês tem mais que 6 semanas ISO, e um laço que
  // dependesse só da data pararia de terminar se `faixaDaSemana` devolvesse ''.
  for (let i = 0; i < 6 && cursor && cursor <= fim; i++) {
    chaves.push({ chave: chaveSemana(cursor), inicio: cursor, rotulo: rotuloSemana(cursor) });
    const prox = dataDe(cursor);
    if (!prox) break;
    prox.setUTCDate(prox.getUTCDate() + 7);
    cursor = iso(prox);
  }
  return chaves;
}
