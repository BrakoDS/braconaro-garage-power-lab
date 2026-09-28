# Garage Power Lab — site, Central do Coach e Portal do Aluno

Tudo o que roda no navegador do box de treinamento **Garage Power Lab**
(Agudos/SP), mais as regras e as Cloud Functions do Firebase:

- a **landing page** pública (raiz);
- a **Central do Coach** (`/coach/`), atrás de login;
- o **Portal do Aluno** (`/painel-do-aluno/`) e a **Garage Store** (`/garage-store/`);
- `firestore.rules`, `storage.rules` e `functions/` do projeto Firebase
  **`projeto-garage-f0a2f`**.

O app do celular (**Garage App**, Expo) é outro repositório, `app-mobile`, e lê
o mesmo Firebase. Ele confere as próprias regras contra os módulos daqui com
`npm run paridade` (veja [Paridade com o app](#paridade-com-o-app)).

> **Este repositório é público.** Nada de chave privada, conta de serviço ou foto
> de aluno em commit. A mídia de trabalho do box está no `.gitignore` de
> propósito; o lugar dela é o Firebase Storage.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html`, `styles.css`, `app.js` | Landing page (planos, horários, contato) |
| `coach/` | Hub da Central do Coach |
| `coach/gestao-de-alunos/` | Fichas, avaliações, PAR-Q, Matriz, Portal, Registros |
| `coach/montador-de-treino/` | Montador de treinos (turma) |
| `coach/montador-hibrido/` | Montador Híbrido (lousa, distribuição por horário) |
| `coach/montador-individual/` | Montador Individual (a versão de cada aluno) |
| `coach/mensagens/` | Central de Mensagens (chat com o app, mídia) |
| `coach/recordes/` | Mural de Recordes (PRs de todos os alunos) |
| `coach/academia/` | Inventário e catálogo de exercícios |
| `coach/gestao-garage-store/` | Catálogo da Garage Store |
| `painel-do-aluno/` | Portal do Aluno (web) |
| `garage-store/` | Vitrine pública de produtos afiliados |
| `compartilhado/` | Regras puras, config, dados e acesso ao Firebase usados por todos |
| `functions/` | Cloud Functions (TypeScript, `southamerica-east1`) |
| `ferramentas/` | Verificador de imports e prova de renderização |
| `braconaro/`, `icons/` | Imagens e ícones do produto |

## Rodar localmente

Sirva a pasta por HTTP (não abra como `file://`, os módulos ES não carregam):

```bash
npx serve .
```

## Testes

O CI ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) roda tudo
isto em cada PR e antes de cada deploy — o site só vai ao ar se passar:

```bash
node --test $(git ls-files '*.test.js')   # regras, telas e sync (800+ testes)
node ferramentas/verificar-imports.mjs     # nenhum caminho de import quebrado
node ferramentas/comparar-render.mjs       # as telas renderizam igual à referência
cd functions && npm run build && npm run checar
```

`comparar-render` compara com `ferramentas/render-referencia.json`. Mudou uma tela
de propósito? Regrave a referência com `--gravar` no mesmo commit.

Há também `npm run checar:emulador` em `functions/` (precisa de Java): exclusão de
treino contra um Firestore de verdade.

## Deploy

**Só esta pasta faz deploy no Firebase.** Duas outras pastas apontavam para o
mesmo projeto e estão travadas (`.firebaserc` inválido e alvos fora do
`firebase.json`); cada uma tem um `LEIA-ANTES-DE-DEPLOYAR.md`:

- `garage-power-lab/site/` — clone antigo deste repositório;
- `projetos-ia/apps/montador-treino-2.0/` — o Montador 2.0 (sem git), com
  regras antigas que reabririam uma falha de segurança.

| O quê | Como vai ao ar |
|---|---|
| Site (Pages) | Push na `master` → testes → deploy automático |
| `firestore.rules` | Automático quando muda na `master` ([`firebase-rules.yml`](.github/workflows/firebase-rules.yml)) |
| `storage.rules` | **Manual:** `firebase deploy --only storage --project projeto-garage-f0a2f` |
| Cloud Functions | **Manual:** `cd functions && npm run deploy` |

As regras de Storage ficam fora do CI porque a conta de serviço do workflow não
tem a permissão `serviceusage.services.get` que o alvo `storage` exige.

### Coach novo

O coach é uma lista fixa, repetida em quatro lugares que precisam andar juntos:

1. `ehCoach()` em `firestore.rules` (UID);
2. `ehCoach()` em `storage.rules` (UID);
3. `COACH_UIDS` em `functions/src/acesso.ts` (UID);
4. `EMAILS_COACH` em `functions/src/index.ts` (e-mail).

O `compartilhado/firebase/regras.test.js` falha se as listas das regras
divergirem.

## Paridade com o app

O `app-mobile` importa os módulos ESM daqui (regras de semana, nutrição, cargas,
gamificação, versão individual do treino, chat…) e compara com os ports em
TypeScript dele. O CI do app baixa **a `master` deste repositório**; mudar uma
regra em `compartilhado/regras/` ou no Portal sem mudar o app quebra o CI de lá.

## Landing page

- **Planos e valores:** objeto `PLANS` em `app.js`.
- **Horários:** array `DAYS` em `app.js` (o dia atual ganha "Hoje").
- **Contato** (WhatsApp, e-mail, Instagram, endereço, mapa): links no `index.html`.
- **Tema:** variáveis CSS no `:root` de `styles.css`.
- **Fotos:** `braconaro/assets/` (hero, "Sobre" e as modalidades). Para trocar,
  substitua o arquivo ou ajuste o `src` do `<image-slot>` no `index.html`.

O painel **Tweaks** (`tweaks-*.jsx`, React e Babel via CDN) e as fotos arrastáveis
(`braconaro/image-slot.js`) vieram do Claude Design e salvam no `localStorage`
de quem mexe — não mudam o site para os outros visitantes.

## Endereços antigos

A reorganização de setembro/2026 mudou estes caminhos. Quem instalou o Portal
como app no celular antes dela precisa reinstalar (o app instalado guarda o
endereço antigo):

| Antes | Depois |
|---|---|
| `/aluno/` | `/painel-do-aluno/` |
| `/montador/` | `/coach/montador-de-treino/` |
| `/alunos/` | `/coach/gestao-de-alunos/` |
| `/academia/` | `/coach/academia/` |
| `/loja-gestao/` | `/coach/gestao-garage-store/` |
| `/loja/` | `/garage-store/` |
