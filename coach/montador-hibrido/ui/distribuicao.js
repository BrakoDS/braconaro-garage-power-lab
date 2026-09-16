// @ts-check
/**
 * MÓDULO 3 — DISTRIBUIÇÃO E PERSONALIZAÇÃO.
 *
 * Escolhe até 8 alunos, mostra COMO o treino coletivo fica na ficha de cada um
 * e só então envia.
 *
 * A lista de alunos vem da Gestão de Alunos por import direto, que é o padrão
 * do projeto — o Montador Individual já faz igual (`montador-individual/ui/alunos.js`).
 * A ficha da Gestão é a fonte da verdade de quem treina no box; uma segunda
 * lista aqui dentro significaria cadastrar o mesmo aluno duas vezes e ver um
 * aluno inativo continuar aparecendo na turma.
 *
 * A PRÉVIA NÃO É CALCULADA AQUI. Ela vem do servidor com `dryRun: true`, pelo
 * mesmo caminho do envio. Reimplementar no navegador a troca por lesão e o
 * balizamento por 1RM daria dois resultados possíveis para a mesma pergunta, e
 * o coach aprovaria um para enviar o outro.
 */
import * as gestaoDb from '../../gestao-de-alunos/db.js';
import { distributeWorkoutToStudents } from '../cloud/chamadas.js';
import { esc } from './render-treino.js';
import { resumo } from '../core/lousa-modelo.js';
import * as store from './store.js';
import { avisar, confirmar } from '../../../compartilhado/ui/dialogo.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** O mesmo teto do servidor e de `ALUNOS_POR_SESSAO` no inventário do box. */
const MAX_TURMA = 8;

/** @param {{uid: () => string, irPara: (aba: string) => void}} ctx */
export function montar(ctx) {
  const alvo = $('#turma-corpo');
  const btnPrever = $('#turma-prever');
  const btnEnviar = $('#turma-enviar');
  if (!alvo) return;

  alvo.addEventListener('change', (ev) => {
    const cb = /** @type {HTMLInputElement} */ (ev.target);
    if (!cb.matches('input[data-aluno]')) return;
    const id = cb.getAttribute('data-aluno') || '';
    const turma = new Set(store.ler().turma);
    if (cb.checked) {
      if (turma.size >= MAX_TURMA) {
        cb.checked = false;
        avisar({ titulo: 'Turma cheia', texto: `A aula comporta ${MAX_TURMA} alunos. Desmarque alguém antes de incluir outro.` });
        return;
      }
      turma.add(id);
    } else {
      turma.delete(id);
    }
    // A prévia deixa de valer assim que a turma muda: ela é por aluno.
    store.atualizar({ turma: [...turma], fichas: [] });
  });

  btnPrever?.addEventListener('click', () => executar(ctx, { dryRun: true, botao: btnPrever }));
  btnEnviar?.addEventListener('click', () => executar(ctx, { dryRun: false, botao: btnEnviar }));

  store.aoMudar(() => desenhar(alvo));
  desenhar(alvo);
}

let ocupado = false;

async function executar(ctx, { dryRun, botao }) {
  if (ocupado) return;
  const est = store.ler();

  if (!est.treino) {
    await avisar({ titulo: 'Sem treino', texto: 'Reconheça a lousa antes de distribuir.' });
    ctx.irPara('lousa');
    return;
  }
  if (!est.workoutId) {
    await avisar({
      titulo: 'Treino não salvo',
      texto: 'Este treino ainda não chegou à nuvem. Volte à Lousa, reconheça de novo e confirme na prévia.',
    });
    ctx.irPara('lousa');
    return;
  }
  if (!est.turma.length) {
    await avisar({ titulo: 'Turma vazia', texto: 'Selecione pelo menos um aluno.' });
    return;
  }

  if (!dryRun) {
    const ok = await confirmar({
      titulo: 'Enviar para a turma?',
      texto: `${est.turma.length} aluno(s) vão receber a ficha de ${est.dateId}`
        + `${est.classTime ? ` (${est.classTime})` : ''}. Isso substitui o que já estava publicado para esse dia.`,
      ok: 'Enviar',
    });
    if (!ok) return;
  }

  ocupado = true;
  botao.disabled = true;
  const rotulo = botao.textContent;
  botao.textContent = dryRun ? 'Calculando…' : 'Enviando…';

  try {
    const r = await distributeWorkoutToStudents({
      workoutId: est.workoutId,
      studentIds: est.turma,
      classTime: est.classTime,
      dryRun,
    });
    store.atualizar({ fichas: r.fichas });

    if (r.semMatriz?.length) {
      // Aviso e não erro: o aluno recebe o treino da turma como está. O coach
      // precisa saber para cadastrar a matriz, mas a aula não para por isso.
      await avisar({
        titulo: 'Alunos sem matriz de individualização',
        texto: `${r.semMatriz.length} aluno(s) ainda não têm lesões, restrições e 1RM cadastrados — `
          + 'eles recebem o treino da turma sem ajuste. Cadastre a matriz para o balizamento de carga funcionar.',
      });
    }
    if (!dryRun) {
      await avisar({ titulo: 'Treino enviado', texto: `${r.gravadas} ficha(s) gravada(s) para a aula de ${est.dateId}.` });
    }
  } catch (e) {
    await avisar({ titulo: dryRun ? 'Não deu para prever' : 'Não deu para enviar', texto: /** @type {Error} */ (e).message });
  } finally {
    ocupado = false;
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

/** Alunos ativos da Gestão. Inativo não entra na turma. */
function alunosAtivos() {
  try {
    return gestaoDb.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
  } catch (e) {
    console.warn('Lista de alunos indisponível:', e);
    return [];
  }
}

function desenhar(alvo) {
  const est = store.ler();
  const alunos = alunosAtivos();
  const selecionados = new Set(est.turma);

  const cabecalho = est.treino
    ? `<div class="card"><h3>${esc(est.treino.titulo || 'Treino')}</h3>
         <p class="mut">${esc(resumo(est.treino))} · ${esc(est.dateId)}${est.classTime ? ` · ${esc(est.classTime)}` : ''}</p></div>`
    : '<p class="vazio">Reconheça a lousa para montar a turma.</p>';

  const listaAlunos = alunos.length
    ? `<div class="card">
         <h3>Turma <span class="mut">(${selecionados.size}/${MAX_TURMA})</span></h3>
         <ul class="turma-lista">
           ${alunos.map((a) => `
             <li class="turma-item${selecionados.has(a.id) ? ' on' : ''}">
               <label>
                 <input type="checkbox" data-aluno="${esc(a.id)}" ${selecionados.has(a.id) ? 'checked' : ''} />
                 <span class="turma-nome">${esc(a.nome || a.id)}</span>
                 <span class="mut">${esc(a.nivel || '')}</span>
               </label>
             </li>`).join('')}
         </ul>
       </div>`
    : `<div class="card"><h3>Nenhum aluno ativo</h3>
         <p class="mut">Cadastre os alunos em <a href="../gestao-de-alunos/index.html">Gestão de Alunos</a> — é de lá que a turma sai.</p></div>`;

  const previa = est.fichas?.length
    ? `<h3 class="secao">Prévia por aluno</h3>${est.fichas.map(cardDaFicha).join('')}`
    : '<p class="vazio">Use <b>Prever ajustes</b> para ver a ficha de cada aluno antes de enviar.</p>';

  alvo.innerHTML = cabecalho + listaAlunos + previa;
}

function cardDaFicha(f) {
  const linhas = (f.linhas || []).map((l) => `
    <li class="ex">
      <div class="ex-topo">
        <span class="ex-nome">${esc(l.nome)}</span>
        <span class="ex-prescricao">${l.series ? `${l.series}×` : ''}${esc(l.reps || '')}</span>
      </div>
      <div class="ex-baixo">
        ${l.cargaKg != null
          ? `<span class="ex-chip carga">${l.cargaKg} kg${l.percentual ? ` · ${Math.round(l.percentual * 100)}% 1RM` : ''}</span>`
          : `<span class="ex-chip mudo">sem 1RM</span>`}
        ${l.implemento ? `<span class="ex-chip mudo">${esc(l.implemento)}</span>` : ''}
        ${l.observacao ? `<span class="ex-obs">${esc(l.observacao)}</span>` : ''}
      </div>
      ${(l.motivos || []).map((m) => `<p class="ex-motivo">${esc(m)}</p>`).join('')}
    </li>`).join('');

  const removidos = (f.removidos || []).length
    ? `<div class="nota nota-aviso"><b>Fora da ficha</b>
         <ul>${f.removidos.map((r) => `<li>${esc(r.nome)}<small>${esc(r.motivo)}</small></li>`).join('')}</ul>
       </div>`
    : '';

  const avisos = (f.avisos || []).length
    ? `<div class="nota"><ul>${f.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`
    : '';

  return `
    <article class="card ficha">
      <header class="ficha-h">
        <h4>${esc(f.nome)}</h4>
        <span class="ex-chip mudo">${esc(f.nivel)}</span>
        ${f.email ? '' : '<span class="ex-chip aviso">sem e-mail — não chega ao Portal</span>'}
      </header>
      <ul class="bloco-lista">${linhas}</ul>
      ${removidos}${avisos}
    </article>`;
}
