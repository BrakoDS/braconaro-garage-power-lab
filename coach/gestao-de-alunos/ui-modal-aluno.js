// @ts-check
/**
 * Modal "+ Cadastrar novo aluno" — o mesmo formulário da aba Dados
 * (ui-tab-dados.js), com o ID editável.
 *
 * Saiu do `app.js` no fatiamento. Ao cadastrar, grava (`db.criar` — que
 * publica o Portal e avisa a lista), registra na aba Registros e pede o perfil
 * do aluno novo pelo barramento ('abrir-perfil'), como o clique num card.
 */
import * as db from './db.js?v=14';
import { formDadosHTML, wireForm, lerForm } from './ui-tab-dados.js?v=14';
import { $, abrirModal, fecharModal } from './util/dom.js?v=14';
import { emit, EVENTOS } from './estado.js?v=14';
import { reg } from './registro.js?v=14';
import { avisar as avisarReal } from '../../compartilhado/ui/dialogo.js?v=14';

/** @type {{ avisar: (o: any) => any }} */
let deps = { avisar: avisarReal };

/**
 * Liga o botão "+" e o formulário do modal. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarModalAluno(d = {}) {
  deps = { ...deps, ...d };
  $('#fab-novo')?.addEventListener('click', () => {
    $('#modal-aluno-body').innerHTML = formDadosHTML({}, { idEditavel: true });
    wireForm($('#modal-aluno-body'));
    abrirModal('modal-aluno');
    setTimeout(() => $('input[name=id]', $('#modal-aluno-body'))?.focus(), 50);
  });
  $('#form-novo')?.addEventListener('submit', (/** @type {any} */ e) => {
    e.preventDefault();
    const dados = lerForm(e.target);
    if (!dados.nome) { deps.avisar({ texto: 'Informe o nome do aluno.' }); return; }
    const novo = db.criar(dados);
    if (!novo) { deps.avisar({ texto: 'Já existe um aluno com esse ID. Escolha outro.' }); return; }
    reg('aluno-criado', novo, 'Aluno cadastrado', { chave: `aluno-criado:${novo.id}` });
    fecharModal('modal-aluno');
    emit(EVENTOS.ABRIR_PERFIL, novo.id);
  });
}
