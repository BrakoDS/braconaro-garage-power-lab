// @ts-check
/**
 * Ranking do box (lado coach) — publica `rankingPortal/geral`.
 *
 * Métrica: treinos no mês corrente por aluno = presenças (check-in) ∪ treinos
 * que o aluno registrou no Portal (gastoTreinos). Publica só nome (1º nome) +
 * id + contagem, para o Portal exibir a competição sem expor e-mail.
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

/**
 * @param {any[]} alunos
 * @param {Map<string, any[]>} mapaGastos email → gastos[] (de carregarTodosGastos)
 */
export async function publicarRanking(alunos, mapaGastos) {
  if (!cloudAtivo()) return;
  const d = new Date();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const itens = (alunos || [])
    .filter((a) => (a.status || 'ativo') !== 'inativo')
    .map((a) => {
      const set = new Set();
      (a.presencas || []).forEach((dt) => { if (dt && dt.slice(0, 7) === mes) set.add(dt); });
      const gastos = mapaGastos ? (mapaGastos.get(emailKey(a.email)) || []) : [];
      gastos.forEach((g) => { if (g && g.data && g.data.slice(0, 7) === mes) set.add(g.data); });
      return { id: a.id, nome: (a.nome || '').trim().split(/\s+/)[0] || 'Aluno', treinos: set.size };
    })
    .filter((x) => x.treinos > 0)
    .sort((a, b) => b.treinos - a.treinos)
    .slice(0, 20);
  try {
    await init();
    await _fns.setDoc(_fns.doc(_db, 'rankingPortal', 'geral'), { mes, itens, atualizadoEm: Date.now() });
  } catch (e) { console.warn('Falha ao publicar ranking:', e?.code || e); }
}
