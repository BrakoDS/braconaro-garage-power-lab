// @ts-check
/**
 * Liga TODAS as telas da Gestão ao barramento, numa ordem só.
 *
 * Usada pelo main.js (o app de verdade) e pela vitrine local — que antes
 * repetia esta lista à mão e ficava para trás a cada tela nova. O que muda
 * entre os dois entra por `o` (a vitrine troca o que falaria com o mundo de
 * fora: o PDF, a prévia do Portal, o WhatsApp).
 *
 * A ORDEM importa num ponto: o roteador e o perfil ligam ANTES das telas e
 * das abas. Os ouvintes de um evento rodam na ordem em que foram ligados, então
 * a tela (ou o painel da aba) já está visível quando o módulo dela desenha.
 */
import * as db from './db.js';
import { iniciarModais } from './util/dom.js';
import { iniciarNavegacao } from './navegacao.js';
import { iniciarLista } from './ui-lista.js';
import { iniciarPerfil } from './ui-perfil.js';
import { iniciarFotoDoPerfil } from './ui-fotos.js';
import { iniciarModalAluno } from './ui-modal-aluno.js';
import { iniciarTabDados } from './ui-tab-dados.js';
import { iniciarTabAvaliacoes } from './ui-tab-avaliacoes.js';
import { iniciarTabProgresso } from './ui-tab-progresso.js';
import { iniciarTabAnamnese } from './ui-tab-anamnese.js';
import { iniciarTabParq } from './ui-tab-par-q.js';
import { iniciarTabFinanceiro } from './ui-tab-financeiro.js';
import { iniciarTabMatriz } from './ui-tab-matriz.js';
import { iniciarTabPortal } from './ui-tab-portal.js';
import { iniciarTabRegistros } from './ui-tab-registros.js';
import { iniciarTelaCheckin } from './ui-tela-checkin.js';
import { iniciarTelaAgenda } from './ui-tela-agenda.js';
import { iniciarTelaFinanceiro } from './ui-tela-financeiro.js';
import { iniciarTelaCobrancas } from './ui-tela-cobrancas.js';
import { iniciarTelaAvisos } from './ui-tela-avisos.js';
import { iniciarTelaMural } from './ui-tela-mural.js';
import { iniciarTelaDesafios } from './ui-tela-desafios.js';
import { iniciarTelaLeads } from './ui-tela-leads.js';

/**
 * @param {{
 *   exportarFicha?: (a: any) => any,
 *   urlPrevia?: string,
 *   avisos?: Parameters<typeof iniciarTelaAvisos>[0],
 * }} [o]
 *   exportarFicha: gera o PDF da ficha (o app passa o pdf.js); urlPrevia: a
 *   página da prévia do Portal; avisos: o que a tela de aviso usa de fora
 */
export function iniciarTelas(o = {}) {
  // Primeiro quem mostra: o roteador de telas e o perfil (que troca o painel da aba).
  iniciarNavegacao();
  iniciarModais();
  iniciarLista({ listar: db.listar });
  iniciarPerfil({ obter: db.obter, exportar: o.exportarFicha });
  iniciarFotoDoPerfil();
  iniciarModalAluno();
  // As abas do perfil.
  iniciarTabDados();
  iniciarTabAvaliacoes();
  iniciarTabProgresso();
  iniciarTabAnamnese();
  iniciarTabParq();
  iniciarTabFinanceiro();
  iniciarTabMatriz();
  iniciarTabPortal(o.urlPrevia ? { urlPrevia: o.urlPrevia } : {});
  iniciarTabRegistros();
  // As telas do box.
  iniciarTelaCheckin();
  iniciarTelaAgenda();
  iniciarTelaFinanceiro();
  iniciarTelaCobrancas();
  iniciarTelaAvisos(o.avisos);
  iniciarTelaMural();
  iniciarTelaDesafios();
  iniciarTelaLeads();
}
