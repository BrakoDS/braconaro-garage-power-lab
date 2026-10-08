// @ts-check
/**
 * Ponto de entrada da Gestão de Alunos.
 *
 * Orquestra a inicialização enquanto o `app.js` é fatiado: primeiro liga as
 * telas que já moram em módulo próprio, depois carrega o `app.js` (que ainda
 * tem o resto e faz o login). A ordem importa — o `app.js` pode entrar e
 * desenhar a lista logo ao carregar (sessão já aberta), e a lista precisa
 * estar ligada antes disso.
 *
 * Cada tela extraída entra aqui com o seu `iniciar…`; quando o `app.js` acabar,
 * o login e a sequência pós-login vêm para cá também.
 */
import * as db from './db.js';
import { iniciarNavegacao } from './navegacao.js';
import { iniciarLista } from './ui-lista.js';
import { iniciarPerfil } from './ui-perfil.js';
import { iniciarFotoDoPerfil } from './ui-fotos.js';
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
import { iniciarTelaFinanceiro } from './ui-tela-financeiro.js';
import { iniciarTelaCobrancas } from './ui-tela-cobrancas.js';

iniciarNavegacao();
iniciarLista({ listar: db.listar });
iniciarPerfil({ obter: db.obter });
iniciarFotoDoPerfil();
iniciarTabDados();
iniciarTabAvaliacoes();
iniciarTabProgresso();
iniciarTabAnamnese();
iniciarTabParq();
iniciarTabFinanceiro();
iniciarTabMatriz();
iniciarTabPortal();
iniciarTabRegistros();
iniciarTelaCheckin();
iniciarTelaFinanceiro();
iniciarTelaCobrancas();

await import('./app.js');
