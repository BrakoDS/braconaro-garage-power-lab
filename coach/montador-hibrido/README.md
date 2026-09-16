# Montador de Treinos Híbrido — Lousa do Coach & Dashboard de Volume

O coach escreve e desenha o treino num quadro branco, a IA estrutura, o motor de
variabilidade avisa o que está repetindo na semana, a turma recebe a ficha
ajustada aluno a aluno e o volume é consolidado sozinho.

Quatro etapas, quatro abas, nessa ordem:

```
1 · Lousa  ──▶  2 · Alertas  ──▶  3 · Turma  ──▶  4 · Volume
quadro          variabilidade      até 8 alunos    semana e mês
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
| `distributeWorkoutToStudents` | `matriz_individualizacao` ➔ ficha de cada aluno, gravada em lote |
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

A quarta ferramenta da barra, **Texto**, não é caneta: ela tira o canvas do
caminho (`pointer-events: none`) para o coach digitar. Sem ela, um quadro com
canvas por cima é uma textarea em que é impossível clicar.

## Onde os dados moram

```
coaches/{uid}/lousas/{workoutId}                   o treino da lousa
coaches/{uid}/lousas/{workoutId}/fichas/{alunoId}  a ficha de cada aluno
coaches/{uid}/matriz_individualizacao/{alunoId}    lesões, restrições, 1RM
coaches/{uid}/volumeAgregado/{chave}               '2026-W38' e '2026-09'
treinoAluno/{email}                                a fatia que o Portal lê
lousaUso/{email}                                   cota diária (só a function escreve)
```

Tudo debaixo de `coaches/{uid}`, que a regra `match /{sub=**}` já cobre — a
ferramenta inteira nasceu **sem afrouxar uma linha de `firestore.rules`**.
`treinoAluno/{email}` é a exceção intencional: é a coleção que o aluno já lê no
Portal, e a regra dela já autoriza o coach a escrever.

### A matriz de individualização

```js
{
  nome: 'Ana Prado',
  email: 'ana@exemplo.com',          // sem e-mail, a ficha não chega ao Portal
  nivel: 'iniciante',                // iniciante | intermediario | avancado
  lesoes: [{
    regiao: 'joelho direito',
    evitar: ['agachamento'],         // casa por substring, nos dois sentidos
    substituir: [{ de: 'Agachamento Livre', para: 'Leg Press' }],
  }],
  restricoes: ['gestante'],
  rm1: { 'Agachamento Livre': 100 }, // kg
}
```

Restrição **sem** substituto tira o exercício da ficha e avisa — nunca some em
silêncio. Aluno sem 1RM recebe a orientação da lousa, nunca um número estimado.

## Como o volume é contado

Uma série conta **inteira** para cada grupamento que a lousa marcou. É diferente
do 1,0/0,5 de `compartilhado/regras/volume.js`, e de propósito: lá existe a
distinção entre músculo primário e secundário porque o catálogo da Academia a
carrega; aqui a lousa escrita à mão não distingue, e inventar um peso 0,5 para o
segundo grupamento seria precisão falsa.

Consequência: `totalSeries` (séries prescritas) **não** é a soma de `porGrupo`
(um exercício multiarticular credita mais de um grupo). São perguntas diferentes,
e o dashboard mostra cada uma no seu lugar.

A meta semanal padrão (10 séries por grupo) é o mesmo número que o aluno vê no
Portal — `META_SERIES_SEMANAIS.hipertrofia` em
`compartilhado/regras/metas-aluno.js`. `checar.ts` compara os dois no CI. O coach
sobrescreve por grupo em `coaches/{uid}.config.metasVolume`.

## Como testar

### 1. Automático (segundos, nada a configurar)

```bash
node --test 'coach/montador-hibrido/core/*.test.js'   # 45 testes da lógica do cliente
cd functions && npm ci && npm run checar              # 90+ asserções dos módulos do servidor
node ferramentas/verificar-imports.mjs                # a fiação: todo caminho existe?
```

### 2. A ferramenta inteira no navegador, sem nuvem e sem gastar OpenAI

```bash
node ferramentas/lousa-local.mjs
# abre http://127.0.0.1:8765/__local/
```

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
- **O desenho não sobrevive ao recarregar a página.** O rascunho local guarda
  texto, título, data e o treino já reconhecido; o canvas, não. São centenas de
  KB por lousa e o localStorage tem cota de poucos MB — duas lousas encheriam e a
  terceira derrubaria junto o rascunho de texto que cabia.
- **Não há tela para cadastrar a `matriz_individualizacao`.** As functions leem
  a matriz e a distribuição inteira depende dela, mas hoje ela só existe se
  alguém criar o documento no console do Firestore. Aluno sem matriz recebe o
  treino da turma sem ajuste e o coach vê o aviso — ou seja, a ferramenta
  funciona sem ela, só não individualiza. A tela de cadastro é o próximo passo
  óbvio; `cloud/chamadas.js` já exporta `lerMatriz` e `salvarMatriz` para ela.
- **`aggregateVolumeMetrics` recalcula o mês inteiro a cada lousa salva.** Com o
  volume atual do box (dezenas de treinos por mês) isso é barato. Se um dia o
  histórico crescer a ponto de pesar, o caminho é um contador incremental por
  documento em vez da varredura — não está aqui porque otimizar antes de doer
  custaria a simplicidade de "recontar é sempre correto".
