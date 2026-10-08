// @ts-check
/**
 * Ponto de entrada da Gestão de Alunos (index.html → main.js).
 *
 * Duas coisas, nesta ordem:
 *   1) liga todas as telas ao barramento (telas.js);
 *   2) o boot (boot.js): a publicação do Portal a cada gravação, o backup, o
 *      medidor do banco e o portão de acesso — que, com a sessão já aberta,
 *      entra direto e desenha a lista. Por isso as telas vêm antes.
 *
 * O antigo app.js (2.988 linhas) foi fatiado em módulos até sumir: cada tela
 * mora no seu ui-tela-*.js / ui-tab-*.js, e as regras em *-regras.js.
 */
import { iniciarTelas } from './telas.js';
import { iniciarBoot } from './boot.js';
import { exportarFicha } from './pdf.js?v=3';

iniciarTelas({ exportarFicha });
iniciarBoot();
