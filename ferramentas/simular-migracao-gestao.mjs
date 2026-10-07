/**
 * SIMULADOR DA MIGRAÇÃO DA GESTÃO — ensaio geral, sem tocar no Firestore.
 *
 * Pega o backup baixado pelo botão "Baixar backup" da Gestão (o blob v1, igual
 * ao documento gestao/{uid}) e roda a migração INTEIRA contra um banco em
 * memória: trava, backup, lotes, verificação, virada e a remontagem de volta.
 * Responde, antes de qualquer escrita em produção:
 *
 *  - o blob do box migra, ou algum dado bloqueia (id repetido, avaliação sem
 *    número…)? Bloqueio sai listado, com o aluno;
 *  - quantos documentos e lotes vão ser gravados;
 *  - qual a maior ficha depois do corte (a distância nova do teto de 1 MB);
 *  - ida e volta dá o mesmo dado?
 *
 *     node ferramentas/simular-migracao-gestao.mjs caminho/backup_garage_power_lab_AAAA-MM-DD.json
 *
 * Sai com 1 se a migração não chegaria ao fim. Não grava nada em lugar nenhum.
 */
import fs from 'node:fs';
import { migrarNuvem, planejarMigracao, remontar, canonico, bytesJSON, normalizarEmail, CAMPO_EMAIL_NORM }
  from '../coach/gestao-de-alunos/db-migracao.js';
import { portaEmMemoria } from '../coach/gestao-de-alunos/db-memoria.js';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node ferramentas/simular-migracao-gestao.mjs <backup.json>');
  process.exit(2);
}
const blob = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

console.log(`\nBackup: ${arquivo}`);
console.log(`Documento v1 hoje: ${kb(bytesJSON(blob))} (${((bytesJSON(blob) / (1024 * 1024)) * 100).toFixed(1)}% do teto de 1 MB)`);

const plano = planejarMigracao(blob, { agora: Date.now(), aparelho: 'simulador' });
for (const a of plano.avisos) console.log(`  aviso: ${a}`);
if (!plano.ok) {
  console.log('\n✗ A migração NÃO rodaria. Problemas a corrigir na Gestão antes:');
  for (const p of plano.problemas) console.log(`  - ${p}`);
  process.exit(1);
}

const maiores = plano.fichas.map((f) => ({ id: f.id, nome: f.dados.nome || '', b: bytesJSON(f.dados) }))
  .sort((x, y) => y.b - x.b).slice(0, 5);
const semEmail = plano.fichas.filter((f) => !f.dados[CAMPO_EMAIL_NORM]).length;
console.log(`\nPlano: ${plano.contagem.alunos} fichas, ${plano.contagem.avaliacoes} avaliações, ${plano.contagem.feedbacks} feedbacks`);
console.log(`Fichas sem e-mail válido (sem acesso ao app até corrigir): ${semEmail}`);
console.log('Maiores fichas depois do corte:');
for (const m of maiores) console.log(`  ${m.id.padEnd(8)} ${kb(m.b).padStart(10)}  ${m.nome}`);

const porta = portaEmMemoria(blob);
const r = await migrarNuvem(porta, { aparelho: 'simulador', log: (m) => console.log(`  · ${m}`) });
console.log(`\nResultado: ${r.estado}${r.lotes ? ` (${r.lotes} lote(s))` : ''}`);
if (r.estado !== 'migrado') {
  console.log(JSON.stringify(r, null, 2));
  process.exit(1);
}

// Ida e volta: o que a Gestão v2 vai remontar tem de ser o blob de hoje.
const volta = remontar(porta.docs.get(''), await porta.lerSubcolecoes());
const esperado = JSON.parse(JSON.stringify(blob));
esperado.alunos = esperado.alunos.filter((a) => a && typeof a === 'object' && !Array.isArray(a));
for (const a of esperado.alunos) {
  a[CAMPO_EMAIL_NORM] = normalizarEmail(a.email);
  a.avaliacoes = Array.isArray(a.avaliacoes) ? a.avaliacoes.slice().sort((x, y) => (x.num || 0) - (y.num || 0)) : [];
  a.feedbacks = Array.isArray(a.feedbacks) ? a.feedbacks.slice().sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0)) : [];
}
const porId = (l) => canonico(l.slice().sort((x, y) => String(x.id).localeCompare(String(y.id))));
const { migracao: _t, ...metaEsperado } = esperado;
const { migracao: _t2, ...metaVolta } = volta;
const iguais = porId(volta.alunos) === porId(esperado.alunos)
  && canonico({ ...metaVolta, alunos: [] }) === canonico({ ...metaEsperado, alunos: [] });
console.log(iguais
  ? '✓ Ida e volta: o blob remontado é o de hoje (+ emailNorm). Nada se perde.\n'
  : '✗ Ida e volta NÃO bate — não migrar.\n');
process.exitCode = iguais ? 0 : 1;
