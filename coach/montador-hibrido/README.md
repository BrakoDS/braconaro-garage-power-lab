# Montador de Treinos Híbrido — Lousa do Coach & Dashboard de Volume

O coach escreve e desenha o treino num quadro branco, a IA estrutura, o motor de
variabilidade avisa o que está repetindo na semana, a turma recebe a ficha
ajustada aluno a aluno e o volume é consolidado sozinho.

Quatro etapas, nessa ordem, mais o Calendário ao lado:

```
1 · Lousa  ──▶  2 · Alertas  ──▶  3 · Turma  ──▶  4 · Volume     Calendário
quadro          variabilidade      até 8 alunos    semana e mês    o mês inteiro
```

## Por que esta ferramenta existe ao lado das outras duas

O box já tem o **Montador de Treinos** (gera o treino) e o **Montador
Individual** (monta a aula linha a linha). Nenhum dos dois resolve o caso que
este resolve: o coach que já sabe o treino de cabeça e escreve no quadro em dois
minutos, mas depois perde vinte digitando aquilo num formulário. Aqui o quadro
**é** a entrada.

## As quatro Cloud Functions

Todas em `functions/src/`, região `southamerica-east1`, acesso por
`token.admin === true` ou pela allowlist `EMAILS_COACH` (ver `exigirCoach` em
`index.ts`).

| Função | O que faz |
|---|---|
| `parseWorkoutLousa` | Quadro (JPEG/WEBP, qualidade 0,8) + texto ➔ treino estruturado, via OpenAI Vision |
| `checkWorkoutVariability` | Treino novo × últimos 7 dias ➔ alertas e sugestões de troca |
| `distributeWorkoutToStudents` | TODAS as turmas do dia ➔ ficha de cada aluno, num lote só |
| `aggregateVolumeMetrics` | Gatilho: recalcula o consolidado da semana e do mês a cada lousa salva |

A lógica pura de cada uma mora num módulo irmão (`lousa.ts`, `variabilidade.ts`,
`distribuicao.ts`, `volume-agregado.ts`), sem rede e sem Firebase, coberta por
`npm run checar` dentro de `functions/`.

## As regras globais do box

Aplicadas **depois** da leitura, de forma determinística, e registradas em
`treino.substituicoes` para o coach ver na prévia:

- Pull-up (e barra fixa, chin-up, pull ups…) ➔ **Puxada Alta Pegada Aberta**
- Corrida (e esteira, sprint, run…) ➔ **Airbike**

Ficam em código e não no prompt de propósito: a IA lê o que está escrito na
lousa, e o coach escreve "pull-up" porque é assim que ele fala. Se a regra
morasse só no prompt, um modelo distraído devolveria "pull-up" e ninguém saberia.

## As três canetas

A cor **é dado**, não decoração — e o prompt da função diz isso à IA:

| Caneta | Significado |
|---|---|
| Preto `#1A1A1A` | Títulos, exercícios e blocos (A Mobilidade, B Aquecimento, C Força, D Metcon) |
| Vermelho `#D32F2F` | Intensidade, RIR, descansos e observações de carga |
| Azul `#1976D2` | Séries, repetições, subdivisões da turma e estações dos 8 alunos |

Os cards do treino estruturado devolvem as mesmas cores (observação em vermelho,
série/repetição em azul), para o coach reconhecer o próprio quadro no resultado.

### O quadro é digitável, e o texto também é colorido

O coach **digita** o treino (num `contenteditable`, não numa textarea) e marca
com as mesmas três cores; o canvas por cima continua lá para quando rabiscar uma
seta for mais rápido. A barra tem **dois eixos**: o MODO (digitar / desenhar)
decide quem recebe o toque, e a COR vale para os dois ao mesmo tempo.

Como a cor do texto é dado, ela vai para a IA: `paraPrompt()` anota os trechos
como `[[vermelho]]…[[/vermelho]]` e o prompt ensina o modelo a lê-los. Colchete
duplo porque treino de verdade tem "[3 rounds]" escrito pelo coach.

### Um Desfazer só, para as duas camadas

O histórico guarda o **quadro inteiro** — texto e traço juntos — e não uma pilha
por camada. Um desfazer por camada obrigaria o coach a lembrar qual foi a última
coisa em que mexeu antes de escolher o botão certo; com um só, `↶ Desfazer`
(e `Ctrl`/`Cmd`+`Z`) volta o que aconteceu por último, seja lá o que for.

Digitar vira um passo depois de uma pausa de 700 ms: sem ela, cada tecla seria um
passo e apagar uma palavra custaria quinze cliques. Traço pronto vira passo na
hora, porque o gesto já acabou. A pilha para em 30 passos (`core/historico.js`).

O **Limpar** apaga as duas camadas de uma vez — e é justamente o clique mais caro
de errar, por isso ele também é um passo do histórico: dá para voltar dele.

### Não existe campo de horário na Lousa

Um treino é de um **dia**; quem decide a que horas cada turma o faz é a aba
Turma, que agrupa os alunos pelos horários de verdade da ficha. Um `classTime` no
documento do treino seria uma segunda resposta para a mesma pergunta — e a
errada, porque o mesmo treino vai para os três horários do dia.

Por isso `paraGravar()` grava só `dateId`, `titulo`, `textoOriginal` e `treino`.
O `classTime` continua existindo onde ele significa alguma coisa: na ficha que a
distribuição escreve para cada aluno. O Calendário ainda sabe ler treinos antigos
que têm o campo (mostra a hora no chip); os novos mostram o título.

### Calendário e Volume releem depois de cada gravação

As duas telas leem do Firestore, então não carregam no boot — quem só quer montar
a aula de hoje nunca as abre. Mas elas também **não podem ler uma vez só por
sessão**: o treino recém-salvo não apareceria, e o Calendário diria que o dia
está vazio quando ele não está. O coach conclui que não salvou e remonta o treino
que já estava lá.

O gesto que a própria tela ensina leva direto a isso: "clique num dia vazio para
montar nele" tira o coach do Calendário já carregado, ele monta, distribui e
volta — para o mesmo mês em cache.

`marcaDasLousas()` (em `cloud/chamadas.js`) conta as gravações da sessão. Cada
tela guarda a marca de quando leu e relê só quando ela mudou: passear entre abas
não custa leitura, salvar sempre custa. O contador mora junto de `salvarLousa`,
que é o único ponto de escrita, para que nenhuma tela futura possa esquecer de
avisar. A marca só avança **depois** de uma leitura bem-sucedida, senão uma falha
de rede prenderia a tela num mês vazio.

### `workoutId` é um endereço, não um rótulo

`salvarLousa` grava com `merge` no documento que o `workoutId` aponta.
Reaproveitá-lo para um treino que não é aquele **não dá erro nenhum**: sobrescreve
o treino antigo em silêncio. O coach descobre dias depois, pelo Calendário, que a
segunda virou a quarta — ou conclui que o sistema "não salva".

Era exatamente o que acontecia: `store.limpar()` existia e nunca era chamado por
ninguém. O botão "Limpar" apagava o quadro e deixava o `workoutId` do treino
anterior no rascunho — que vive no `localStorage` e atravessa dias. O box gravou
um único documento, reescrito a cada aula.

Duas travas, porque uma só deixa buraco:

1. **"Limpar" quer dizer treino novo**, não quadro em branco: zera o rascunho
   inteiro (`store.limpar()`), e com ele o `workoutId`. A data fica — é o único
   campo que o coach repete de propósito.
2. **O id anda com a data dele** (`workoutDateId`). Mudou a data, é outro treino:
   grava documento novo, mesmo sem passar pelo Limpar.

O que continua regravando no MESMO documento, e deve: corrigir a lousa e mandar
ler de novo (o "3x8" que a IA leu como "3x3"), e reabrir um treino pelo
Calendário. Os dois casos têm teste de navegador.

### O horário voltou ao Calendário — vindo da distribuição

O campo de horário não voltou para a Lousa, e não deve voltar: um treino é de um
DIA, e o mesmo treino vai para as três ou quatro aulas daquele dia. Mas o coach
precisa VER as aulas para montar a semana — "quarta tem 6h, 7h, 18h e 19h" é a
informação que ele usa.

A resposta já existia e é escrita por quem tem autoridade sobre ela: a
distribuição grava `distribuido.turmas` no documento do treino. `aulasDoTreino()`
só lê, e `chipsDoDia()` transforma cada aula num chip. O Calendário mostra
**uma linha por aula**, como no formato antigo — a diferença é que as quatro
apontam para o MESMO treino, então corrigir um "3x8" corrige as quatro.

Um treino montado e ainda **não distribuído** vira um chip vazado, com bolinha,
no fim do dia: ele é pendência, não agenda. O rodapé conta os dois separados
("18 treinos e 45 aulas · 4 ainda sem horário"), porque são perguntas diferentes.

No celular o nome do sistema sai e a **hora fica** — a cor já diz qual é o
sistema, e a hora é o que o coach foi ler ali. Uma tarja só de cor seria bonita e
não responderia a pergunta.

### Calendário

O mês inteiro em grade, com um chip por treino colorido pela tabela de
modalidades que o Montador e o Portal já usam. Treino de **hoje ou do futuro**
reabre na Lousa para edição; treino **passado** abre só para leitura — o
consolidado de volume já contou aquele dia, e deixar reescrever faria o gráfico
do mês mudar sozinho. Clicar num dia vazio já leva à Lousa com a data preenchida.

## Onde os dados moram

```
coaches/{uid}/lousas/{workoutId}                   o treino da lousa
coaches/{uid}/lousas/{workoutId}/fichas/{alunoId}  a ficha de cada aluno
gestao/{uid} → alunos[].matrizIndividualizacao     a matriz (a Gestão é a dona)
coaches/{uid}/volumeAgregado/{chave}               '2026-W38' e '2026-09'
treinoAluno/{email}                                a fatia que o Portal lê
lousaUso/{email}                                   cota diária (só a function escreve)
```

Tudo debaixo de `coaches/{uid}`, que a regra `match /{sub=**}` já cobre — a
ferramenta inteira nasceu **sem afrouxar uma linha de `firestore.rules`**.
`treinoAluno/{email}` é a exceção intencional: é a coleção que o aluno já lê no
Portal, e a regra dela já autoriza o coach a escrever.

### As turmas do dia se montam sozinhas

O horário de cada aluno **já estava na ficha da Gestão** — `diasTreino`
(`['seg','qua','sex']`) e `horarios` (`{seg:'07:00', qua:'19:00'}`), um mapa por
dia. A aba Turma lê isso e agrupa: o coach abre e as turmas estão prontas.

**Não existe um campo `horario_padrao`, e não deve existir.** O horário não é
único: o próprio formulário da Gestão diz "marque os dias e a hora de cada um —
eles podem ser diferentes". Quem treina 7h na segunda e 19h na quarta não tem um
horário padrão, e um campo assim brigaria com o mapa por dia até alguém descobrir
qual dos dois o sistema estava usando. A ficha antiga com `freqHorario` (uma hora
para a semana toda) entra como fallback, como a Gestão já faz.

O coach ajusta o que fugiu da rotina — mover quem hoje vem noutro horário, tirar
quem avisou que falta, criar um bloco novo — e um botão só distribui tudo. A
turma esvaziada **continua na tela**: "19h — ninguém hoje" é informação, e é o
que permite desfazer o clique errado; quem impede que ela seja gravada é
`paraEnvio`.

### Aluno extra (reposição)

Cada bloco **com horário** tem um `+ Aluno extra` que busca na base ativa
inteira, **ignorando dia e horário da ficha** — é assim que se acha quem perdeu a
segunda e vem repor na quarta. Quem já está numa turma de hoje aparece
desabilitado, dizendo onde está: sumir com o nome faria o coach procurar um aluno
que existe, não achar, e concluir que ele não está cadastrado.

Adicionar quem já está noutro horário **move**, não duplica — aluno em duas
turmas é o caso que o servidor recusa, porque no mesmo lote a última escrita do
documento dele venceria em silêncio.

A tarja **"Reposição"** é só para o coach reconhecer quem está fora da rotina.
Ela não vai ao servidor: a ficha de um aluno de reposição é a mesma ficha,
calculada com a mesma matriz, e um campo que ninguém lê é um campo que um dia
alguém trata como regra.

O bloco **"sem horário na ficha"** aparece no fim e não é enviado. A ficha é
publicada por horário no Portal, e gravar com `classTime` vazio faria o treino
chegar ao aluno sem dizer de que aula ele é.

### A matriz de individualização

A matriz **não é deste app**: ela é o campo `matrizIndividualizacao` dentro da
ficha do aluno na Gestão, definido por
`compartilhado/regras/matriz-individualizacao.js`. O Híbrido só **lê**. Quem
edita é a aba **Matriz** da ficha do aluno
(`coach/gestao-de-alunos/matriz-ui.js`), e é de lá que vem a verdade.

O que a distribuição usa dela:

| Campo | Efeito na ficha do aluno |
|---|---|
| `cargas.referencia.{agachamento,supino,terra}` | 1RM medido, ou estimado por Epley ➔ a carga em kg |
| `perfil.fase` | força puxa mais, resistência puxa menos, na mesma aula |
| `nivel` (topo da ficha) | iniciante −10%, avançado +5% |
| `adaptacoes.impacto` | `converter_airbike` troca burpee/salto/corrida por Airbike |
| `adaptacoes.tracao` | vira aviso na linha de tração (elástico, puxada alta) |
| `adaptacoes.mobilidade` | vira aviso de amplitude no exercício que ela toca |
| `adaptacoes.lesoes` | vira aviso de contexto — **não** dispara troca sozinha |
| `cargas.rir` | a zona habitual do aluno, mostrada ao lado da prescrição |

Três decisões que valem explicar:

- **Só os três levantamentos balizam carga.** Leg press não puxa do 1RM de
  agachamento — a alavanca é outra e o número sairia preciso e errado.
  Exercício que não casa com um dos três sai sem kg, com a orientação da lousa.
- **Lesão não troca exercício sozinha.** Quem executa são `impacto`, `tracao` e
  `mobilidade`, que são declarativas. A lista de lesões acompanha a ficha como
  contexto, com um aviso — para o coach não achar que o sistema já tratou o caso.
- **Fase e nível se compõem, mas dentro de 30–85% do 1RM.** Dois multiplicadores
  multiplicam: sem o teto, avançado em bloco de força chegaria a 81%, e sem o
  piso, iniciante em resistência cairia abaixo de qualquer estímulo. 90% do 1RM
  numa aula de oito pessoas não é prescrição, é acidente esperando acontecer.

## Como o volume é contado

Uma série conta **inteira** para cada grupamento que a lousa marcou. É diferente
do 1,0/0,5 de `compartilhado/regras/volume.js`, e de propósito: lá existe a
distinção entre músculo primário e secundário porque o catálogo da Academia a
carrega; aqui a lousa escrita à mão não distingue, e inventar um peso 0,5 para o
segundo grupamento seria precisão falsa.

Consequência: `totalSeries` (séries prescritas) **não** é a soma de `porGrupo`
(um exercício multiarticular credita mais de um grupo). São perguntas diferentes,
e o dashboard mostra cada uma no seu lugar.

### Burpee e Wall Ball no gráfico: a taxonomia

Exercício calistênico e de metcon sumia do gráfico por grupamento. **A causa não
era carga** — `consolidar()` nunca olhou kg, e conta série de 0 kg igual a série
de 100 kg. A causa era o `grupamentos` chegar VAZIO.

E chegava vazio de propósito: o prompt manda a IA devolver lista vazia em vez de
chutar. Regra certa para um nome que ela não reconhece, errada para um Burpee,
que tem perfil fixo — o resultado era um gráfico que mudava conforme o humor da
leitura.

`taxonomia.ts` é a tabela determinística desses movimentos, com primários,
secundários, `tipoContagem` (`tonelagem` / `peso_corporal` / `metcon_series`) e a
carga padrão do galpão. Mesma razão de `REGRAS_GLOBAIS`: o que é sempre verdade
no box mora em código, não num prompt sorteado a cada leitura.

**Aplicada nas duas pontas, e isso é o ponto:**

1. Na **leitura** (`lousa.ts`), depois das regras globais — assim "Corrida 400m",
   que já virou "Airbike", casa com a tabela.
2. Na **consolidação** (`volume-agregado.ts`), como rede, pelo NOME, quando o
   `grupamentos` gravado está vazio.

A segunda existe porque o gatilho lê treinos **já salvos**. Sem ela a correção só
valeria para treino novo, e todo o histórico do box ficaria fora do gráfico até
alguém reescrever cada lousa à mão.

A tabela **nunca sobrescreve** o que a IA classificou: a leitura dela é sobre
AQUELA lousa e pode ter qualificador que a tabela não conhece. O que ela não
conhece continua vazio e aparece como `indefinido` em `porTipoContagem` — que é o
alarme de que a tabela precisa crescer, em vez de um zero silencioso.

A meta semanal padrão (10 séries por grupo) é o mesmo número que o aluno vê no
Portal — `META_SERIES_SEMANAIS.hipertrofia` em
`compartilhado/regras/metas-aluno.js`. `checar.ts` compara os dois no CI. O coach
sobrescreve por grupo em `coaches/{uid}.config.metasVolume`.

## Como testar

### 1. Automático (segundos, nada a configurar)

```bash
node --test 'coach/montador-hibrido/core/*.test.js'   # a lógica pura do cliente
cd functions && npm ci && npm run checar              # 90+ asserções dos módulos do servidor
node ferramentas/verificar-imports.mjs                # a fiação: todo caminho existe?
```

### 2. A ferramenta inteira no navegador, sem nuvem e sem gastar OpenAI

```bash
node ferramentas/lousa-local.mjs
# Lousa e Calendário:  http://127.0.0.1:8765/__local/
# Gestão (aba Matriz): http://127.0.0.1:8765/__local/gestao/
```

O dublê do Calendário semeia um mês de treinos em segundas, quartas e sextas,
com duas turmas na sexta e os quatro sistemas — é o que faz aparecer na tela o
dia com dois chips, as quatro cores da legenda e o cadeado do treino passado.

Um dos treinos semeados é **antigo** e ainda traz `classTime` — está lá de
propósito, para provar que o chip com hora continua sendo lido depois que o campo
de horário saiu da Lousa.

Sobe o site com as chamadas de rede trocadas por dublês com dados de exemplo.
Dá para desenhar com as três canetas, reconhecer (devolve um treino fixo em
~0,7s), ver a prévia comparativa, aceitar trocas nos alertas, montar a turma e
ler o dashboard com os três gráficos. **Nada sai da máquina e nada é gravado.**

Os três alunos do dublê cobrem os três casos que importam:

| Aluno | Caso |
|---|---|
| Ana Prado | lesão **com** substituto ➔ o exercício é trocado |
| João Vieira | lesão **sem** substituto ➔ sai da ficha, com aviso · e sem e-mail ➔ não chega ao Portal |
| Bia Toledo | sem 1RM ➔ carga sai como orientação, nunca um número estimado |

Não testa: a leitura da lousa pela IA, as regras do Firestore e a gravação em
lote. Para isso, o passo 3.

### 3. De verdade, contra Firebase e OpenAI

Pré-requisitos: projeto no plano **Blaze** (function com saída para a internet
exige) e o secret da OpenAI.

```bash
firebase functions:secrets:set OPENAI_API_KEY     # só na primeira vez
cd functions && npm run deploy                    # publica as 4 functions
```

O site é publicado pelo GitHub Pages ao entrar na `master` (`.github/workflows/deploy.yml`).
Depois, em `/coach/montador-hibrido/`, logado com um e-mail de `EMAILS_COACH`.

**Para testar a distribuição você precisa criar a matriz na mão**, no console do
Firestore — ainda não existe tela para isso (ver *Limites conhecidos*). Crie
`coaches/{seu-uid}/matriz_individualizacao/{id-do-aluno-na-Gestão}` com o
formato documentado acima.

Roteiro mínimo, e o que conferir em cada passo:

1. **Lousa** — escreva `Pull-ups 3x máx` e `Corrida 800m`. Na prévia, o bloco
   "Regras do box aplicadas" tem que mostrar as duas substituições.
2. **Alertas** — salve dois treinos com o mesmo exercício em dias seguidos. O
   segundo tem que disparar *Duplicação < 72h*.
3. **Turma** — "Prever ajustes" não grava nada; "Enviar" grava. Confira em
   `coaches/{uid}/lousas/{id}/fichas/` e em `treinoAluno/{email}`.
4. **Volume** — o consolidado aparece alguns segundos **depois** de salvar a
   lousa (é gatilho, é assíncrono). Se ficar em "ainda consolidando", veja
   `firebase functions:log --only aggregateVolumeMetrics`.

`core/periodos.js` duplica de propósito a conta de semana ISO de
`functions/src/volume-agregado.ts` — são dois runtimes sem caminho entre eles. Os
dois testes fixam os mesmos casos de borda (virada de ano, segunda × domingo)
porque a divergência entre eles **não daria erro nenhum**: o gatilho gravaria em
`2026-W38`, a tela pediria `2026-W39`, e o dashboard ficaria eternamente
"consolidando".

## Limites conhecidos

- **A cota é de 40 leituras de lousa por dia** (`LIMITE_LOUSA`). É trava contra
  bug — clique duplo, retry de rede —, não limite de uso normal.
- **O desenho não sobrevive ao recarregar a página**, e não volta ao reabrir um
  treino pelo Calendário. O rascunho local guarda texto, título, data e o treino
  já reconhecido; o canvas, não. São centenas de
  KB por lousa e o localStorage tem cota de poucos MB — duas lousas encheriam e a
  terceira derrubaria junto o rascunho de texto que cabia.
- **`matriz-individualizacao.js` veio do branch `etapa5a-portal`,** onde nasceu
  com o teste dele. A cópia aqui é idêntica à que foi escrita lá; o teste ficou
  no branch de origem, e os dois se encontram no merge.
- **A fonte da matriz nasceu no branch `etapa5a-portal`.** Enquanto ela não
  entrar na `master`, a checagem de vocabulário de `checar.ts` avisa e não
  falha — um check que ninguém consegue deixar verde é um check que todo mundo
  aprende a ignorar. Assim que a fonte entrar, as oito listas passam a ser
  conferidas a cada CI.
- **`aggregateVolumeMetrics` recalcula o mês inteiro a cada lousa salva.** Com o
  volume atual do box (dezenas de treinos por mês) isso é barato. Se um dia o
  histórico crescer a ponto de pesar, o caminho é um contador incremental por
  documento em vez da varredura — não está aqui porque otimizar antes de doer
  custaria a simplicidade de "recontar é sempre correto".
