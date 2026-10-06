# Cloud Functions · Garage Power Lab

Região `southamerica-east1`, Node 22, TypeScript (`src/` → `lib/`).

```bash
npm run build                      # tsc
npm run checar                     # lógica pura (IA, preços, Montador, conquistas e semana do box), sem rede
npm run checar:box                 # só a semana do box
npm run checar:hiit                # só o gerador do HIIT
npm run checar:emulador            # exclusão de treino contra o emulador do Firestore
npm run checar:emulador:conquistas # motor de conquistas de ponta a ponta (Firestore + Functions)
npm run seed:catalogo              # simula o seed do catálogo base; `-- --gravar` grava
npm run deploy                     # build + firebase deploy --only functions
```

## Semana do box (`gerarMatrizSemanalBox`, `salvarSemanaBox`, `publicarSemanaBox`, `salvarInventarioBox`, `registrarSessaoAluno`)

Modelo em `src/modelo-box.ts`, regra pura em `src/semana-box.ts` e o gerador em
`src/gerador-box.ts` (os três conferidos pelo `checar-box`). Os quatro caminhos são **só
leitura** para qualquer cliente (`firestore.rules`); quem grava são estas funções, com o Admin SDK:

| Caminho | Quem grava | Quem lê |
| --- | --- | --- |
| `catalogoExercicios/{id}` | `seed-catalogo.ts` | qualquer logado |
| `coaches/{uid}/semanas/{AAAA-Www}` | `gerarMatrizSemanalBox` / `salvarSemanaBox` / `publicarSemanaBox` | o coach; aluno logado se `status == 'publicado'` |
| `coaches/{uid}/inventario/atual` | `salvarInventarioBox` | o coach |
| `treinoAluno/{email}/historico/{AAAA-MM}` | `registrarSessaoAluno` | o aluno e o coach |

### Gerar a semana (`gerarMatrizSemanalBox`)

O cliente manda **só a semana** e espera a resposta. Nada de exercício, contagem ou rodízio:

```js
const gerar = httpsCallable(getFunctions(app, 'southamerica-east1'), 'gerarMatrizSemanalBox');
const { data } = await gerar({ data: '2026-10-12' });        // ou { semanaId: '2026-W42' }
// data: { semanaId, status: 'rascunho', semanaAnterior, dias, alertas, trocas, avisos, problemasParaPublicar }
```

| Campo do pedido | Para quê |
| --- | --- |
| `semanaId` **ou** `data` | A semana (`'2026-W42'`) ou qualquer dia dela (`'2026-10-12'`). |
| `variacao` (0–999, opcional) | Outro sorteio para a mesma semana ("sortear de novo"). |
| `substituirRascunho` (opcional) | Gera por cima de um rascunho existente. Sem isso, rascunho existente → `already-exists`. Semana publicada nunca é sobrescrita (`failed-precondition`). |

O que o servidor faz, nesta ordem:

1. **Grade fixa** (`GRADE_SEMANAL`): seg H1 · ter Cross (+H1 alternativa) · qua H2 · qui Hyrox ·
   sex H3 (+HIIT alternativa) · sáb HIIT (+H3 alternativa). O primeiro treino do dia é o principal;
   `sessaoForca` e `blocosMetabolicos` dizem o papel de cada um.
2. **Matriz** (`MATRIZ_H`): as 6 instâncias de cada H, na ordem do bloco. Terça repete o bloco do
   H1 da segunda; sábado repete o do H3 da sexta. Dia sem H fica com bloco vazio.
3. **Rodízio:** lê `semanas/{semana anterior}` e joga para o fim da fila a variação exata usada lá.
   Ela só volta se a instância não tiver outra opção — e então sai em `avisos`.
4. **Trava de equipamento:** enquanto o dia passar do limite ativo de `inventario/atual`, o
   exercício conflitante mais para o fim do bloco é re-sorteado entre os da mesma instância que não
   usam aquele recurso nem estouram outro. Cada troca sai em `trocas`; o que não tem troca
   possível fica em `alertas`, e a semana não publica até o coach resolver.
5. Grava como `rascunho`, com a prescrição de `PRESCRICAO_FORCA` (4 × 8-12, cadência 3010) e o
   descanso de cada exercício em `descansoSeg` (`descansoDaVaga`): **45 s** em `estabilizar_tronco`;
   **120 s** nas vagas 1 e 2 do H1 e do H2 (compostos pesados); **90 s** no resto. Exercício salvo
   pelo coach sem `descansoSeg` herda o `descansos.entreSeriesSeg` do dia.

Determinístico: mesma semana + mesma semana anterior + mesmo catálogo + mesmo inventário = mesma
semana. O HIIT sai montado (estações em `dias.sexta.hiit` e `dias.sabado.hiit`, o mesmo nos dois dias;
ver "HIIT" abaixo); Cross e Hyrox saem só sinalizados com formato e descrição, e os movimentos
deles ainda são do coach.

### Regras de conta

- **Equipamento:** cada exercício do bloco principal ocupa uma estação de cada recurso que usa.
  `flexora` e `extensora` consomem a mesma `maquinaLegs` (uma máquina híbrida, limite 1). Passou do
  limite ativo (`total - emManutencao`) vira `alertas`, e semana com alerta não publica.
- **Bloco principal:** 6 exercícios em dia com sessão H; vazio em dia só metabólico.
- **Volume (aluno e dashboard do coach):** cada série soma 1,0 ao músculo principal e 0,5 ao
  secundário. No dashboard, a separação vem de `grupamentosSecundarios`, que a leitura de lousa grava
  desde 05/10/2026; lousa antiga, sem o campo, continua 1,0 em tudo. RIR alto não descarta série.
- **Presença em Cross/Hyrox/HIIT** entra no histórico sem volume (o conteúdo ainda não é estruturado).
- Aluno lendo a semana precisa filtrar `where('status', '==', 'publicado')` — a regra recusa a
  consulta que poderia trazer rascunho.

Deploy, sempre por função (ver o aviso das funções órfãs):

```bash
firebase deploy --only functions:gerarMatrizSemanalBox,functions:salvarSemanaBox,functions:publicarSemanaBox,functions:salvarInventarioBox,functions:registrarSessaoAluno,functions:opcoesTrocaBox
```

A mudança do 0,5 no dashboard está em funções que JÁ existem — `parseWorkoutLousa` e
`aggregateVolumeMetrics` — e só vale depois do deploy delas.

### HIIT (`src/gerador-hiit.ts`, conferido pelo `checar-hiit`)

Módulo separado da matriz H. Regras do coach (05/10/2026):

- **4 estações** — Pernas, Core, Superiores, Cardio — em ordem sorteada, cada uma com o protocolo
  `PROTOCOLO_HIIT` ("2 Músicas de Tabata (16 rounds no total). 4x cada exercício.").
- **4 slots por estação, exatos.** Unilateral (`unilateral: true` no catálogo) ocupa 2 slots
  seguidos, lado D e depois E; bilateral ocupa 1. Unilateral nunca começa no último slot.
- **Sem repetição no dia:** nem entre estações, nem com o bloco de força do dia (`proibidos` = o H3,
  que divide a sexta e o sábado com o HIIT). Um HIIT por semana, o mesmo nos dois dias.
- **Rodízio:** o que esteve no HIIT da semana anterior vai para o fim da fila; repetir vira aviso.
- **Equipamento:** a turma (`alunosPorAula` do inventário, padrão **6**) se divide entre as 4
  estações, que rodam ao mesmo tempo. Alunos por estação = turma ÷ 4, para cima (6 → 2).
  - um exercício exige alunos por estação × consumo por aluno (1 de cada recurso que os
    `equipamentos` tocam, ou `hiit.consumoPorAluno`). Se nem sozinho cabe (clean com sandbag para 2
    alunos, com 1 sandbag), sai do sorteio e fica em `foraPorEquipamento`;
  - no round N toda estação está no slot N: o slot N das 4 estações somado também respeita o limite
    (wall ball em Pernas e em Superiores nunca no mesmo slot se o box tiver só 2 bolas);
  - recurso **fixo no espaço** (`RECURSOS_FIXOS_HIIT`: o TRX, 2 unidades ancoradas lado a lado) serve a
    UMA estação por HIIT, em qualquer slot: duas estações no TRX juntariam os alunos no mesmo canto.
    Violação (só por edição à mão) vira alerta com `estacoes` e impede publicar.
  - sem combinação dentro do inventário, sai completo assim mesmo, com `alertas` (como o bloco H).

**Catálogo:** `hiit: { estacoes: [...] }` (lista fechada `ESTACOES_HIIT`) marca o exercício para o
HIIT. Os de força que servem também (TRX, ponte, step-up, abdominais) ganharam `hiit` no
`catalogo-base.ts`; os só de HIIT, sem instância de força, estão em `catalogo-hiit.ts` — o bloco H
não os vê (`lerExercicioCatalogo` descarta; `lerItemCatalogo` lê os dois).

**Inventário:** `inventario/atual` ganhou os recursos do HIIT (`RECURSOS_HIIT`: kettlebell 10,
wall ball 4, caixote 4, corda naval 2, corda de pular 2, sandbag 1, air bike 2, TRX 2, halteres 4)
e `alunosPorAula`. Um inventário gravado antes disso é lido com os números de fábrica do HIIT. Os
recursos do HIIT ficam fora de `RECURSOS_INVENTARIO`: o bloco H continua sem contar TRX nem
kettlebell.

**Nos callables:**

- `gerarMatrizSemanalBox` monta o HIIT depois dos blocos H e grava `alertasHiit`, `alunosPorAula` e
  `geracao.hiitFora`; os avisos do HIIT entram em `geracao.avisos` com `HIIT:` na frente.
- `salvarSemanaBox` valida o `hiit` de cada dia (`lerHiit`: o pedido manda só os ids, o servidor
  calcula lado D/E, nome, protocolo e `consumoPorAluno`). **Dia sem a chave `hiit` no pedido mantém o
  HIIT gravado** (`diasComHiitGravado`): a troca manual do bloco H manda só o bloco. `hiit: null` apaga.
- Não publica com: estação incompleta, `alertasHiit`, ou exercício no bloco H e no HIIT do mesmo dia.
  Semana gerada antes do HIIT (dia de HIIT com `hiit` ausente) não trava.
- `salvarInventarioBox` aceita `alunosPorAula` e os recursos do HIIT, e a reconferência das semanas
  abertas refaz `alertasHiit` com a turma nova (pelo `consumoPorAluno` gravado, sem reler o catálogo).
- A trava de semana publicada também olha o HIIT: dia que passou não muda de estação.

## Motor de conquistas (`calcularConquistasXP*`)

Grava `conquistas_aluno/{email}`: `{ xpAtual, conquistasDesbloqueadas, ultimaAtualizacao }`.
O aluno só lê esse documento (`firestore.rules`); quem grava é a função, com o Admin SDK.

| Função | Dispara em | Por quê |
| --- | --- | --- |
| `calcularConquistasXP` | `gastoTreinos/{email}` | treinos lançados, check-in rápido, água, creatina |
| `calcularConquistasXPPortal` | `portal/{email}` | presenças do coach, avaliações, pagamentos, feedbacks |
| `calcularConquistasXPDesafios` | `desafios/{email}` | desafios concluídos |

`rotinas/{email}` (só alimenta "1ª vez no app") não tem gatilho: muda a cada hábito marcado
e entra no próximo recálculo dos outros três.

Regras do motor (`src/conquistas.ts`, todas conferidas pelo `checar-conquistas`):

- **Quem decide a medalha** é `medalhas()` de `src/gamificacao.ts`, a mesma regra do app e do site.
- **Medalha não se perde.** Várias regras olham a janela atual ("5 treinos numa semana"); o que
  foi conquistado fica. Ids gravados à mão pelo coach também ficam (sem somar XP).
- **XP é derivado:** soma de `XP_POR_MEDALHA` das medalhas desbloqueadas. Editar `xpAtual` à mão
  é desfeito no próximo disparo; para dar XP, conceda a medalha.
- **Meses de casa** = o maior entre `mesesDesde(portal.criadoEm)` (regra do app) e os meses pagos
  em `portal.pagamentos` (regra do site). As duas telas divergiam; o servidor não tira de ninguém
  uma medalha que alguma delas já mostrava.
- **Fuso:** a função roda em UTC e as regras usam a data local; o cálculo roda em
  `America/Sao_Paulo` (`noFusoDoBox`), de forma síncrona, sem afetar as outras funções.
- **Idempotente:** relê tudo a cada disparo e só grava se algo mudou.

Alunos que já existiam só ganham o documento no próximo evento (check-in, ficha, desafio).

### Marco zero (lançamento em 01/10/2026)

`DATA_DE_CORTE = '2026-10-01'` em `src/conquistas.ts`: data de calendário do box (00:00 em
São Paulo = 03:00 UTC), comparada com as datas `YYYY-MM-DD` que o banco já usa. O corte é aplicado
nos DADOS de entrada (`contextoDoAluno`), nunca na regra: `gamificacao.ts` segue idêntica ao
original do site.

| Dado | O que conta |
| --- | --- |
| Presenças, check-ins e treinos lançados | só dias >= 01/10/2026 (frequência, streak, calorias) |
| Desafios concluídos | só os concluídos a partir do corte (`em`; sem ele, a `semana`) |
| Meses de casa | contam a partir de 01/10/2026 (ou da entrada, se depois); outubro/2026 pago é o mês 1 |
| 1º acesso ao app | **exceção**: vale de qualquer data |
| Avaliações | **exceção**: qualquer avaliação garante a medalha da 1ª; "3 avaliações" só com as feitas a partir do corte |
| Feedbacks | entram como estão: `feedbacksCount` é um contador sem datas (ver pendência abaixo) |
| `conquistas_aluno` gravado antes do corte | descartado; o próximo cálculo reescreve do zero |

O Portal recorta o streak do Header com a mesma data (`portal-aluno-web/src/lib/gamificacao.ts`);
o `checar-conquistas` confere que as duas datas são iguais.

**Pendência:** sem data por feedback, um aluno com 10 feedbacks antigos ganha "Deu retorno" e
"Voz ativa" já no lançamento. Para recortar, é preciso registrar a data de cada feedback (ou uma
linha de base `feedbacksAntesDoCorte` gravada uma vez) na Gestão.

## Código compartilhado

O deploy envia só esta pasta, então nada aqui pode importar de `../compartilhado` ou de outro
repositório em tempo de execução. A estratégia, a mesma que este repositório já usa para níveis,
músculos e padrões, é **cópia + verificação automática**:

| Aqui | Original | Quem confere |
| --- | --- | --- |
| `src/gamificacao.ts` | `app-mobile/src/core/gamificacao.ts`, porte de `compartilhado/regras/gamificacao.js` | `checar-conquistas` roda os dois lados sobre os mesmos dados |
| `XP_POR_MEDALHA` (`src/conquistas.ts`) | `ACHIEVEMENTS_CATALOG` em `portal-aluno-web/src/lib/achievementsCatalog.ts` | `checar-conquistas` compara medalha a medalha |

Mudou uma regra ou um XP? Mude no original e na cópia, e rode `npm run checar`. Se faltar o
repositório vizinho (clone parcial), a comparação é pulada com aviso, sem falhar.

**Evolução recomendada:** um pacote único (`@garage/regras`) publicado num registro privado ou
consumido por workspace, importado pelo site, pelo app, pelo Portal e por aqui. Hoje os quatro
projetos são repositórios separados, sem build em comum, e montar isso custaria mais que manter
as cópias conferidas.

## Testando o motor nos emuladores

Pré-requisitos: Java 11+ (os emuladores rodam na JVM) e o Firebase CLI (`npm i -g firebase-tools`).

1. Segredo falso para a função de IA carregar (o arquivo está no `.gitignore`):

   ```bash
   echo OPENAI_API_KEY=teste > .secret.local
   ```

2. Teste automático, que sobe, testa e derruba tudo:

   ```bash
   npm run checar:emulador:conquistas
   ```

   Ele grava um check-in, uma marcação de água, um treino de 620 kcal e uma avaliação na ficha, e
   confere a cada passo o que a função escreveu em `conquistas_aluno`.

3. Para mexer à mão e ver a função reagir:

   ```bash
   npm run build
   firebase emulators:start --only functions,firestore --project demo-garage
   ```

   Abra a Emulator UI (http://127.0.0.1:4000), aba Firestore. Crie
   `gastoTreinos/aluno@teste.com` com `gastos: [{ data: "AAAA-MM-DD", calorias: 600 }]` (data de
   hoje), ou edite `agua` / `creatina.checks`. Em seguida veja `conquistas_aluno/aluno@teste.com`
   aparecer ou mudar, e os logs da função na aba Logs. O projeto `demo-*` garante que nada sai
   da sua máquina.
