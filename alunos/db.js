// @ts-check
/**
 * Camada de dados da Gestão de Alunos.
 *
 * Persistência local (localStorage) + sincronização opcional na nuvem
 * (Firestore, documento gestao/{uid}). O app continua usando a API síncrona
 * normalmente; cada escrita também é enviada à nuvem (debounced) e, no login,
 * os dados da nuvem são carregados. Last-write-wins (igual ao montador).
 */
const KEY = 'braconaro_gestao_alunos_v1';

function setLocal(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
function ler() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '');
    if (d && typeof d === 'object' && Array.isArray(d.alunos)) return d;
  } catch {}
  return { seq: 0, alunos: [] };
}

/* ---------- Sincronização na nuvem ---------- */
let _uid = null, _push = null, _timer = null;

function agendarEnvio() {
  if (!_uid || !_push) return;
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    Promise.resolve(_push(_uid, ler()))
      .catch((e) => console.warn('Falha ao salvar alunos na nuvem:', e?.code || e));
  }, 800);
}

/** Grava local e (se conectado) agenda envio à nuvem. */
function gravar(d) { setLocal(d); agendarEnvio(); }

/**
 * Liga a sincronização na nuvem — chamar após o login, com o uid do coach.
 *  - nuvem com dados        → adota a nuvem (sobrescreve o local);
 *  - nuvem vazia + local cheio → semeia a nuvem com o local;
 *  - falha (regra não publicada / offline) → segue só no local, sem quebrar.
 * @param {string} uid
 * @param {() => void} [aoAtualizar] chamado quando os dados da nuvem chegam
 */
export async function iniciarSync(uid, aoAtualizar) {
  try {
    const cloud = await import('./cloud-alunos.js');
    if (!cloud.cloudAtivo() || !uid) return;
    _uid = uid;
    _push = cloud.salvar;
    const remoto = await cloud.carregar(uid);
    const temRemoto = remoto && Array.isArray(remoto.alunos) && remoto.alunos.length;
    if (temRemoto) {
      setLocal(remoto);                       // adota a nuvem
      if (aoAtualizar) aoAtualizar();
    } else {
      const local = ler();
      if (local.alunos.length) await cloud.salvar(uid, local); // semeia a nuvem
    }
  } catch (e) {
    console.warn('Sincronização na nuvem indisponível — usando dados locais.', e?.code || e);
  }
}

/* ---------- API ---------- */
/** @returns {any[]} todos os alunos (mais recentes primeiro) */
export function listar() {
  return ler().alunos.slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

/** @param {string} id */
export function obter(id) {
  return ler().alunos.find((a) => a.id === id) || null;
}

/** Cria um aluno e retorna o registro (com ID gerado). @param {any} dados */
export function criar(dados) {
  const d = ler();
  d.seq += 1;
  const id = String(d.seq).padStart(3, '0');
  const aluno = { status: 'ativo', avaliacoes: [], criadoEm: Date.now(), ...dados, id };
  d.alunos.push(aluno);
  gravar(d);
  return aluno;
}

/** Atualiza campos de um aluno. @param {string} id @param {any} dados */
export function atualizar(id, dados) {
  const d = ler();
  const a = d.alunos.find((x) => x.id === id);
  if (!a) return null;
  Object.assign(a, dados);
  gravar(d);
  return a;
}

/** Remove um aluno. @param {string} id */
export function remover(id) {
  const d = ler();
  d.alunos = d.alunos.filter((a) => a.id !== id);
  gravar(d);
}

/** Adiciona uma avaliação (numeração automática). @param {string} id @param {any} av */
export function addAvaliacao(id, av) {
  const d = ler();
  const a = d.alunos.find((x) => x.id === id);
  if (!a) return null;
  a.avaliacoes = a.avaliacoes || [];
  const num = (a.avaliacoes.reduce((m, x) => Math.max(m, x.num || 0), 0) || 0) + 1;
  const aval = { num, criadoEm: Date.now(), ...av };
  a.avaliacoes.push(aval);
  gravar(d);
  return aval;
}

/** Remove uma avaliação pelo número. @param {string} id @param {number} num */
export function removerAvaliacao(id, num) {
  const d = ler();
  const a = d.alunos.find((x) => x.id === id);
  if (!a || !a.avaliacoes) return;
  a.avaliacoes = a.avaliacoes.filter((x) => x.num !== num);
  gravar(d);
}
