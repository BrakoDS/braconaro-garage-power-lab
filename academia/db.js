// @ts-check
/**
 * Camada de dados da Academia (Inventário + Catálogo de Exercícios).
 *
 * Persistência local (localStorage) + sincronização opcional na nuvem
 * (Firestore, documento academia/{uid}). API síncrona; cada escrita também é
 * enviada à nuvem (debounced). No login, adota os dados da nuvem. Na primeira
 * vez (sem dados locais nem na nuvem) semeia com o inventário/catálogo reais.
 */
import { seedData } from './data/seed.js';

const KEY = 'braconaro_academia_v1';

/** Rótulos fixos de categoria de equipamento e tags de treino. */
export const CATEGORIAS = ['Peso livre', 'Máquina', 'Cardio', 'Acessório', 'Estação', 'Corporal'];
export const TAGS = ['HYROX', 'GAP', 'FORÇA', 'HIPERTROFIA', 'CARDIO'];
export const MUSCULOS = [
  'Peito', 'Costas', 'Ombro', 'Trapézio', 'Bíceps', 'Tríceps', 'Antebraço',
  'Core/Abdômen', 'Lombar', 'Quadríceps', 'Posterior de coxa', 'Glúteo',
  'Panturrilha', 'Estabilizadores',
];

function vazio() { return { inventario: [], exercicios: [], seeded: false }; }
function setLocal(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
function ler() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '');
    if (d && Array.isArray(d.inventario) && Array.isArray(d.exercicios)) return d;
  } catch {}
  return vazio();
}

/** Semeia com os dados reais na primeiríssima execução (local vazio e nunca semeado). */
function garantirSeed() {
  const d = ler();
  if (!d.seeded && !d.inventario.length && !d.exercicios.length) {
    const s = seedData();
    setLocal({ inventario: s.inventario, exercicios: s.exercicios, seeded: true });
  }
}

/** Mapa id→músculos da semente, para retrocompatibilidade. */
let _seedMusc = null;
function seedMuscMap() {
  if (!_seedMusc) { _seedMusc = {}; for (const x of seedData().exercicios) _seedMusc[x.id] = x.musculos || []; }
  return _seedMusc;
}
/** Preenche `musculos` em exercícios antigos (que foram semeados antes deste campo). */
function backfillMusculos() {
  const d = ler();
  const map = seedMuscMap();
  let mudou = false;
  for (const x of d.exercicios) {
    if ((!x.musculos || !x.musculos.length) && map[x.id] && map[x.id].length) { x.musculos = map[x.id].slice(); mudou = true; }
  }
  if (mudou) setLocal(d);
  return mudou;
}
garantirSeed();
backfillMusculos();

/* ---------- Sincronização na nuvem ---------- */
let _uid = null, _push = null, _timer = null;

function agendarEnvio() {
  if (!_uid || !_push) return;
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    Promise.resolve(_push(_uid, ler())).catch((e) => console.warn('Falha ao salvar academia na nuvem:', e?.code || e));
  }, 800);
}
function gravar(d) { setLocal(d); agendarEnvio(); }

/**
 * Liga a sincronização — chamar após o login com o uid do coach.
 *  - nuvem com dados → adota a nuvem;
 *  - nuvem vazia + local com dados → semeia a nuvem com o local;
 *  - falha/offline → segue só no local.
 * @param {string} uid @param {() => void} [aoAtualizar]
 */
export async function iniciarSync(uid, aoAtualizar) {
  try {
    const cloud = await import('./cloud-academia.js');
    if (!cloud.cloudAtivo() || !uid) return;
    _uid = uid; _push = cloud.salvar;
    const remoto = await cloud.carregar(uid);
    const temRemoto = remoto && Array.isArray(remoto.inventario) && (remoto.inventario.length || remoto.exercicios.length);
    if (temRemoto) {
      setLocal({ inventario: remoto.inventario, exercicios: remoto.exercicios || [], seeded: true });
      if (backfillMusculos()) await cloud.salvar(uid, ler()); // retrocompat na nuvem
      if (aoAtualizar) aoAtualizar();
    } else {
      await cloud.salvar(uid, ler()); // semeia a nuvem com o local (incl. seed)
    }
  } catch (e) {
    console.warn('Sincronização na nuvem indisponível — usando dados locais.', e?.code || e);
  }
}

/* ---------- Helpers ---------- */
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function idUnico(base, existentes) {
  let id = slug(base) || 'item';
  if (!existentes.includes(id)) return id;
  let i = 2; while (existentes.includes(`${id}_${i}`)) i++;
  return `${id}_${i}`;
}

/* ---------- Inventário ---------- */
export function listarInventario() { return ler().inventario.slice(); }
export function obterEquip(id) { return ler().inventario.find((e) => e.id === id) || null; }

/** Cria ou atualiza um equipamento. Se `dados.id` existir, atualiza; senão cria. */
export function salvarEquip(dados) {
  const d = ler();
  if (dados.id && d.inventario.some((e) => e.id === dados.id)) {
    const e = d.inventario.find((x) => x.id === dados.id);
    Object.assign(e, dados);
    gravar(d); return e;
  }
  const id = idUnico(dados.id || dados.nome, d.inventario.map((e) => e.id));
  const e = { id, nome: '', categoria: 'Acessório', quantidade: 1, area: '', obs: '', ...dados, id };
  d.inventario.push(e);
  gravar(d); return e;
}

/** Remove um equipamento. @returns {number} nº de exercícios que passam a depender dele e ficam sem ele. */
export function removerEquip(id) {
  const d = ler();
  d.inventario = d.inventario.filter((e) => e.id !== id);
  gravar(d);
  return d.exercicios.filter((x) => (x.equipamentoIds || []).includes(id)).length;
}

/** Quantos exercícios usam um equipamento. @param {string} id */
export function exerciciosComEquip(id) {
  return ler().exercicios.filter((x) => (x.equipamentoIds || []).includes(id)).length;
}

/* ---------- Exercícios ---------- */
export function listarExercicios() { return ler().exercicios.slice(); }
export function obterExerc(id) { return ler().exercicios.find((x) => x.id === id) || null; }

/** Cria ou atualiza um exercício. */
export function salvarExerc(dados) {
  const d = ler();
  if (dados.id && d.exercicios.some((x) => x.id === dados.id)) {
    const x = d.exercicios.find((e) => e.id === dados.id);
    Object.assign(x, dados);
    gravar(d); return x;
  }
  const id = idUnico(dados.id || dados.nome, d.exercicios.map((x) => x.id));
  const x = { id, nome: '', equipamentoIds: [], tags: [], musculos: [], obs: '', ...dados, id };
  d.exercicios.push(x);
  gravar(d); return x;
}

/** Remove um exercício. @param {string} id */
export function removerExerc(id) {
  const d = ler();
  d.exercicios = d.exercicios.filter((x) => x.id !== id);
  gravar(d);
}

/**
 * Disponibilidade de um exercício: todos os equipamentos exigidos existem no
 * inventário com quantidade ≥ 1. Retorna os equipamentos que faltam (por nome).
 * @param {any} exerc @returns {{disponivel: boolean, falta: string[]}}
 */
export function disponibilidade(exerc) {
  const inv = ler().inventario;
  const falta = [];
  for (const eqId of exerc.equipamentoIds || []) {
    const eq = inv.find((e) => e.id === eqId);
    if (!eq) falta.push(eqId);
    else if (!(Number(eq.quantidade) >= 1)) falta.push(eq.nome);
  }
  return { disponivel: falta.length === 0, falta };
}
