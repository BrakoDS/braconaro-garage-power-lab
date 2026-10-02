# Cloud Functions · Garage Power Lab

Região `southamerica-east1`, Node 22, TypeScript (`src/` → `lib/`).

```bash
npm run build                      # tsc
npm run checar                     # lógica pura (IA, preços, Montador e conquistas), sem rede
npm run checar:emulador            # exclusão de treino contra o emulador do Firestore
npm run checar:emulador:conquistas # motor de conquistas de ponta a ponta (Firestore + Functions)
npm run deploy                     # build + firebase deploy --only functions
```

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
