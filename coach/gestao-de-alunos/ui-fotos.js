// @ts-check
/**
 * Fotos no Firebase Storage: escolher, comprimir e subir, e apagar.
 *
 * Usado pelo cabeçalho do perfil (foto do aluno) e pela aba Avaliações (fotos
 * de progresso). Os caminhos ficam sob `gestao/{uid}/{alunoId}/` (ver storage.rules).
 */
import * as storage from '../../compartilhado/regras/storage-alunos.js?v=14';
import { avisar } from '../../compartilhado/ui/dialogo.js?v=14';
import * as db from './db.js?v=14';
import { estado, on, EVENTOS } from './estado.js?v=14';
import { reg } from './registro.js?v=14';

/** Abre o seletor de arquivos de imagem e chama cb(file). @param {(f: File) => void} cb */
export function escolherFoto(cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) cb(f); inp.remove(); });
  document.body.appendChild(inp); inp.click();
}

/** Comprime e sobe a foto; devolve a URL. @param {string} path @param {File} file @param {number} maxDim */
export async function uploadFoto(path, file, maxDim) {
  if (!storage.storageAtivo() || !estado.uid) throw new Error('storage-indisponivel');
  const blob = await storage.comprimir(file, maxDim);
  return await storage.enviar(path, blob);
}

/** O aviso de falha no upload, com o que conferir. @param {any} e */
export function avisoStorage(e) {
  console.warn('Falha no upload da foto:', e?.code || e);
  avisar({ titulo: 'Foto não enviada', texto: 'Não foi possível enviar a foto. Confirme que você está logado e que o Firebase Storage está ativado com as regras publicadas (ver storage.rules).' });
}

/** Apaga um arquivo do Storage, sem quebrar se falhar. @param {string} path */
export function apagarArquivo(path) {
  if (!estado.uid || !storage.storageAtivo()) return;
  storage.apagar(path).catch(() => {});
}

/** Apaga do Storage as fotos de uma avaliação. @param {string} id @param {any} av */
export function apagarFotosDaAvaliacao(id, av) {
  if (!av) return;
  Object.keys(av.fotos || {}).forEach((slot) => apagarArquivo(`gestao/${estado.uid}/${id}/aval-${av.num}-${slot}.webp`));
}

/** Apaga do Storage o avatar + todas as fotos de avaliação de um aluno. @param {any} a */
export function apagarFotosDoAluno(a) {
  if (!a) return;
  if (a.fotoUrl) apagarArquivo(`gestao/${estado.uid}/${a.id}/avatar.webp`);
  (a.avaliacoes || []).forEach((av) => apagarFotosDaAvaliacao(a.id, av));
}

/**
 * A foto do cabeçalho do perfil: o clique na foto ('trocar-foto', emitido pelo
 * ui-perfil.js) abre o seletor, sobe a imagem e grava o endereço na ficha. A
 * gravação emite 'alunos-mudaram', e é isso que redesenha o cabeçalho e a lista.
 * Chamar uma vez, antes do resto do app.
 */
export function iniciarFotoDoPerfil() {
  on(EVENTOS.TROCAR_FOTO, () => {
    const a = estado.alunoAtual; if (!a) return;
    escolherFoto(async (file) => {
      const el = document.querySelector('#p-avatar'); if (el) el.classList.add('loading');
      try {
        const url = await uploadFoto(`gestao/${estado.uid}/${a.id}/avatar.webp`, file, 600);
        db.atualizar(a.id, { fotoUrl: url });
        reg('foto-perfil', a, 'Foto de perfil trocada pelo coach');
        estado.alunoAtual = db.obter(a.id);
      } catch (e) { avisoStorage(e); }
      finally { const el2 = document.querySelector('#p-avatar'); if (el2) el2.classList.remove('loading'); }
    });
  });
}
