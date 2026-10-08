// @ts-check
/**
 * Medidor e backup do banco local da Gestão.
 *
 * Desde a v2 os alunos moram um por documento (gestao/{uid}/alunos/{id}), e o
 * teto de 1 MiB do Firestore passou a valer por ALUNO. O medidor mostra o
 * total (o tamanho que o blob antigo teria) e a maior ficha — é ela que mede a
 * distância do teto agora. Ver docs/superpowers/specs/2026-10-06-refatoracao-gestao-design.md.
 * `db.comoBlob` pode faltar se o navegador ainda tiver o db.js antigo em cache
 * (ele é carregado sem `?v=`): aí lê a chave antiga direto.
 *
 * Saiu do `app.js` no fatiamento. A conta é pura (`medidaDoBanco`); o resto só
 * lê o banco, escreve no console e baixa o arquivo.
 */
import * as db from './db.js';
import { hoje } from './util/formato.js';
import { $ } from './util/dom.js';
import { avisar } from '../../compartilhado/ui/dialogo.js';

const CHAVE_BANCO_V1 = 'braconaro_gestao_alunos_v1';
/** O teto de um documento do Firestore. */
export const TETO_FIRESTORE = 1024 * 1024;

/** O banco inteiro no formato de backup ({ seq, produtos, feriados, alunos[] }), ou null. */
function blobDoBanco() {
  if (typeof db.comoBlob === 'function') return db.comoBlob();
  try { return JSON.parse(localStorage.getItem(CHAVE_BANCO_V1) || ''); } catch { return null; }
}

/**
 * O tamanho do banco como o Firestore conta (bytes em UTF-8 — acentos ocupam 2;
 * `.length` contaria caracteres) e a maior ficha SEM avaliações e feedbacks,
 * que é o documento gestao/{uid}/alunos/{id}.
 * @param {any} d o blob do banco
 */
export function medidaDoBanco(d) {
  const bytes = (v) => new Blob([JSON.stringify(v)]).size;
  const alunos = Array.isArray(d && d.alunos) ? d.alunos : [];
  const maior = alunos.reduce((m, a) => { const { avaliacoes: _a, feedbacks: _f, ...f } = a || {}; return Math.max(m, bytes(f)); }, 0);
  const pct = (maior / TETO_FIRESTORE) * 100;
  return {
    alunos: alunos.length,
    avaliacoes: alunos.reduce((n, a) => n + ((a && a.avaliacoes) || []).length, 0),
    total: bytes(d || { alunos: [] }),
    maior,
    pct,
    sinal: pct >= 80 ? '🔴' : pct >= 50 ? '🟡' : '🟢',
  };
}

/** Mede o banco local e escreve no console. @param {string} [momento] @returns {number|null} o total em bytes */
export function medirTamanhoBanco(momento = 'boot') {
  try {
    const m = medidaDoBanco(blobDoBanco() || { alunos: [] });
    const modo = typeof db.modoSync === 'function' ? db.modoSync() : 'v1';
    console.log(`${m.sinal} [Gestão · ${momento} · sync ${modo}] ${m.alunos} alunos · ${m.avaliacoes} avaliações · `
      + `total ${(m.total / 1024).toFixed(1)} KB · maior ficha ${(m.maior / 1024).toFixed(1)} KB (${m.pct.toFixed(2)}% do teto de 1 MB por documento)`);
    return m.total;
  } catch (e) {
    console.warn('Não foi possível medir o banco local:', e);
    return null;
  }
}

/** Baixa um JSON com o banco inteiro deste aparelho. */
export function baixarBackupGestao() {
  const d = blobDoBanco();
  if (!d || !Array.isArray(d.alunos) || !d.alunos.length) { avisar({ titulo: 'Nada para salvar', texto: 'O banco local está vazio neste aparelho.' }); return; }
  // Mesmo formato do backup antigo ({ seq, produtos, feriados, alunos[] }): o
  // simulador da migração e qualquer restauração leem os dois iguais.
  const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_garage_power_lab_${hoje()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Liga o botão "Baixar backup". */
export function iniciarBackup() {
  $('#btn-backup')?.addEventListener('click', baixarBackupGestao);
}
