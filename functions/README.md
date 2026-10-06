# Cloud Functions · Garage Power Lab

Região `southamerica-east1`, Node 22, TypeScript (`src/` → `lib/`).

```bash
npm run build                      # tsc
npm run checar                     # lógica pura (IA, preços, Montador, conquistas e semana do box), sem rede
npm run checar:box                 # só a semana do box
npm run checar:hiit                # só o gerador do HIIT
npm run checar:cross               # só os geradores do Cross e do Hyrox
npm run checar:emulador            # exclusão de treino contra o emulador do Firestore
npm run checar:emulador:conquistas # motor de conquistas de ponta a ponta (Firestore + Functions)
npm run seed:catalogo              # simula o seed do catálogo (força, HIIT e Cross); `-- --gravar` grava
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
ver "HIIT" abaixo), e também o WOD da terça (`dias.terca.cross`) e o Hyrox da quinta
(`dias.quinta.hyrox`) — ver "Cross e Hyrox" abaixo.

### Regras de conta

- **Equipamento:** cada exercício do bloco principal ocupa uma estação de cada recurso que usa.
  `flexora` e `extensora` consomem a mesma `maquinaLegs` (uma máquina híbrida, limite 1). Passou do
  limite ativo (`total - emManutencao`) vira `alertas`, e semana com alerta não publica.
- **Bloco principal:** 6 exercícios em dia com sessão H; vazio em dia só metabólico.
- **Volume (aluno e dashboard do coach):** cada série soma 1,0 ao músculo principal e 0,5 ao
  secundário. No dashboard, a separação vem de `grupamentosSecundarios`, que a leitura de lousa grava
  desde 05/10/2026; lousa antiga, sem o campo, continua 1,0 em tudo. RIR alto não descarta série.
- **Presença em Cross/Hyrox/HIIT** entra no histórico sem volume (decisão do coach, 06/10/2026: a
  conta de volume das sessões metabólicas fica para uma etapa própria).
- Aluno lendo a semana precisa filtrar `where('status', '==', 'publicado')` — a regra recusa a
  consulta que poderia trazer rascunho.

Deploy, sempre por função (ver o aviso das funções órfãs):

```bash
firebase deploy --only functions:gerarMatrizSemanalBox,functions:salvarSemanaBox,functions:publicarSemanaBox,functions:salvarInventarioBox,functions:registrarSessaoAluno,functions:opcoesTrocaBox,functions:opcoesTrocaHiitBox,functions:opcoesTrocaCrossBox,functions:opcoesTrocaHyroxBox
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
  HIIT gravado** (`diasComConteudoGravado`, que também preserva o `cross` e o `hyrox`): a troca manual do bloco H manda só o bloco. `hiit: null` apaga.
- Não publica com: estação incompleta, `alertasHiit`, ou exercício no bloco H e no HIIT do mesmo dia.
  Semana gerada antes do HIIT (dia de HIIT com `hiit` ausente) não trava.
- `salvarInventarioBox` aceita `alunosPorAula` e os recursos do HIIT, e a reconferência das semanas
  abertas refaz `alertasHiit` com a turma nova (pelo `consumoPorAluno` gravado, sem reler o catálogo).
- A trava de semana publicada também olha o HIIT: dia que passou não muda de estação.
- **Troca manual** (`opcoesTrocaHiitBox`, regra em `src/edicao-hiit.ts`): os exercícios da estação para um
  exercício do HIIT, com os conflitos calculados pelo `contarHiit` sobre o HIIT já trocado. Só do
  mesmo tamanho (bilateral × bilateral, unilateral × unilateral). Bloqueiam: já no HIIT, tamanho
  diferente, equipamento (sozinho, soma do slot, TRX em outra estação) e estar no bloco H do dia;
  só o rodízio é aviso. A troca do bloco H (`opcoesTrocaBox`) ganhou o conflito `noHiit`. Quem grava
  é o `salvarSemanaBox`, como sempre.

### Cross e Hyrox (`src/gerador-cross.ts` e `src/gerador-hyrox.ts`, conferidos pelo `checar-cross`)

Um WOD e um Hyrox por semana, nos dias da grade que os têm (terça e quinta). Regras do coach (06/10/2026):

**Aula de Cross: 1 · Técnica / Força + 2 · WOD** (06/10/2026)

A aula tem 60 min. Antes do WOD, um bloco de **Técnica / Força** (10–12 min) no movimento principal do
dia, e o WOD fica em até `MINUTOS_MAX_WOD` = **15 min**.

- **Foco obrigatório:** todo WOD tem ao menos um movimento com `cross.tecnica` no catálogo (15 hoje:
  olímpicos, barra, kettlebell e ginástica; cardio nunca é foco). O foco é o da categoria mais à frente
  em `CATEGORIAS_FOCO` — **olímpico > barra > kettlebell > ginástica** — que caiba no inventário
  (`tecnicaDoWod`). O foco escolhido FICA enquanto estiver no WOD; só muda quando ele mesmo sai.
- **Dinâmica fixa por movimento** (calibrada pela aula de 06/10: power clean em EMOM 10 min, 3 por
  minuto subindo a carga): tipo (técnica, força, skill), dinâmica, minutos, objetivo e carga.
- **Equipamento:** duplas revezando — turma ÷ 2 (para cima) unidades do foco (6 alunos = 3 barras). Não
  soma com o WOD (é antes). Passou: alerta em `alertasCross` com `bloco: 'tecnica'`.
- **Na semana:** `cross.tecnica` (`TecnicaProgramada`, com as `alternativas` de foco do WOD); `null` =
  nenhum movimento serve (não publica); ausente = WOD gravado antes do bloco (não trava). O pedido de
  salvar pode mandar `tecnica: { exercicioId }` para escolher o foco; o resto sai do catálogo.
- **Troca no WOD:** bloqueia também "tira a técnica" (tirar o último movimento que serve de foco); o
  movimento que entra no lugar do foco vira o foco (`viraFoco`, só informa).

**WOD do Cross**

- **Formato** sorteado entre AMRAP, EMOM, For Time e Chipper (`REGRA_FORMATO_CROSS`), nunca o da
  semana anterior. Tempo (até 15 min, com a Técnica antes): AMRAP 12–15 min; For Time 3 ou 4 rodadas,
  4 min por rodada até o cap de 15; EMOM movimentos × rodadas entre 12 e 15 min (cada minuto um
  movimento, a lista reinicia); Chipper 15 min.
- **Movimentos:** 3–4 (Chipper: 5), sem repetir **padrão** (`PADROES_CROSS`: cardio, agachar, quadril,
  empurrar, puxar, corpo_todo, olimpico, core) e com um **cardio** abrindo o WOD.
- **Rodízio:** primeiro sem nenhum movimento do Cross da semana anterior; sem combinação nova, repete
  o mínimo possível, com aviso. O H1 da terça não entra (é alternativa, de outra turma). No EMOM com
  turma de 6, air bike, corda de pular e corda naval (2 de cada) não cabem: os cardios sem equipamento
  (corrida, shuttle run, polichinelo, high knees, mountain climber) dão a variedade.
- **Prescrição** calculada pelo servidor (`movimentoCross`): RX = `cross.rx` do catálogo (uma rodada de
  AMRAP) × fator do formato (EMOM 0,6; Chipper 2); **Scaled = RX × 0,7**; arredondados para a lousa
  (`arredondarPrescricao`). A carga RX/Scaled é texto do catálogo (`'40/30 kg'` = homem/mulher).
- **Equipamento — regra mista** (`src/conta-cross.ts`):
  - **EMOM (estrito):** a turma inteira faz o mesmo movimento no mesmo minuto — cada movimento exige
    turma × consumo por aluno, e os movimentos não somam (minutos diferentes);
  - **AMRAP, For Time, Chipper (escalonado):** a turma se espalha pelo WOD — cada movimento tem turma ÷
    nº de movimentos (para cima) alunos ao mesmo tempo, e os movimentos **somam** (dois movimentos de
    barra no mesmo AMRAP disputam as mesmas barras).
  - sem combinação que caiba, sai completo assim mesmo, com `alertasCross` (como o HIIT).

**Hyrox**

- **Formato** em rodízio (`REGRA_FORMATO_HYROX`), nunca o da semana anterior: **prova completa** (as 8
  estações, uma corrida antes de cada); **metade A** (estações 1–4) e **metade B** (5–8), com a corrida
  dobrada; **compromised running** (4 estações sorteadas — preferindo as que não estiveram no Hyrox da
  semana anterior —, 2 rodadas de corrida + metade da estação).
- **Níveis:** Iniciante, Intermediário, Avançado e Competição — prescrição de cada estação e corrida
  (com a air bike como alternativa, mesmo esforço sem impacto) por nível. Dados em `src/catalogo-hyrox.ts`,
  portados do `hyrox.js` do montador antigo; as estações ficam FORA do `catalogoExercicios/`.
- **Equipamento:** for time em rodízio, então a estação só precisa das unidades dela **ativas** (1 sled,
  1 sandbag). Sem elas, entra a **substituta** da estação (sled em manutenção → Plate push e Remada no
  TRX); sem substituta que caiba, a estação fica e vira `alertasHyrox`.

**Catálogo:** `cross: { padrao, unidade, rx, carga?, consumoPorAluno? }` marca o movimento para o WOD.
Os que já existiam (TRX, KB, wall ball, terra, frontal…) ganharam `cross` no próprio item; os só de
Cross — barra olímpica **do chão** (o box não tem rack: power clean, hang power clean, ground to overhead,
push press, thruster, sumo deadlift high pull), corrida e farmer com kettlebells — estão em
`catalogo-cross.ts`. `catalogo-completo.ts` junta os três arquivos (é o que o seed grava).

**Inventário:** `inventario/atual` ganhou `barraOlimpica` (4) e `sled` (1) (`RECURSOS_CROSS_HYROX`). O
resto do que o Cross e o Hyrox usam é o equipamento do HIIT e o monocross, nas mesmas linhas.

**Na semana:** `dias.terca.cross` (`WodProgramado`) e `dias.quinta.hyrox` (`HyroxProgramado`), `null` em
semana gerada antes disso (não trava a publicação). O pedido de salvar manda só o formato, os
minutos/rodadas e os ids (`lerCross`), ou o formato e as estações com `substituta` (`lerHyrox`); o
servidor calcula o resto. Não publica com: WOD com menos movimentos que o formato pede,
`alertasCross` ou `alertasHyrox`. A reconferência do inventário refaz os dois pelo consumo gravado.

**Nos callables** (06/10/2026):

- Gerar, salvar, publicar e a reconferência do inventário gravam a MESMA conta (`contaDaSemana`):
  `alertas`, `alertasHiit`, `alertasCross`, `alertasHyrox` e `problemasParaPublicar`; as
  `semanasAfetadas` do inventário trazem os quatro alertas.
- `salvarSemanaBox` preserva o `cross` e o `hyrox` gravados quando o pedido não traz a chave
  (`diasComConteudoGravado`) — a tela de antes deles continua salvando sem apagar nada. A trava de
  semana publicada também olha os dois: dia que passou não muda de WOD nem de estação.
- **Troca manual** (regra em `src/edicao-cross.ts`):
  - `opcoesTrocaCrossBox({ semanaId, posicao })`: o pool do Cross para um movimento do WOD.
    Bloqueiam: já no WOD, padrão de outro movimento, tirar o único cardio, equipamento (regra mista
    sobre o WOD trocado). Só o rodízio é aviso. Formato, tempo e posição ficam; a prescrição do
    novo sai do catálogo.
  - `opcoesTrocaHyroxBox({ semanaId, estacao })`: a outra variante da estação (a substituta, ou de
    volta à da prova), bloqueada se o equipamento dela não está ativo.
  - Os dois dizem `travada`, `temHoje` e `publicada`, como as trocas do H e do HIIT.

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
