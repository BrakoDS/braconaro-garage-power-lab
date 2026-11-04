// @ts-check
/**
 * O aviso de que a NUVEM RECUSOU uma gravação (permissão negada) — a faixa no
 * topo da Gestão, com o botão de recarregar.
 *
 * Quando aparece: as regras do Firestore exigem o carimbo do servidor em toda
 * gravação de ficha (Fase 1 · etapa 1). Uma aba aberta antes de uma versão
 * nova pode ficar sem gravar; a edição continua guardada no aparelho (na fila)
 * e sobe depois de recarregar. Rede caindo não avisa: a fila sobe sozinha
 * quando a rede volta, como sempre.
 */

/** Mostra a faixa (uma só, por mais recusas que cheguem). @param {any} e o erro do envio */
export function avisarGravacaoRecusada(e) {
  if (!e || e.code !== 'permission-denied' || document.getElementById('aviso-nuvem')) return;
  const el = document.createElement('div');
  el.id = 'aviso-nuvem';
  el.setAttribute('role', 'alert');
  el.innerHTML = '<span>A nuvem recusou a última gravação. O que você editou está guardado neste aparelho; '
    + '<b>recarregue a página</b> para subir.</span> <button type="button" class="btn btn-sm">Recarregar</button>';
  el.querySelector('button')?.addEventListener('click', () => location.reload());
  document.body.prepend(el);
}
