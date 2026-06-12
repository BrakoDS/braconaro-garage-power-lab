# Braconaro Garage Power Lab — Landing Page

Landing page (dark · preto/cinza/amarelo) para o box de treinamento
**Braconaro Garage Power Lab** em Agudos/SP. Construída a partir do design
exportado do Claude Design, em HTML/CSS/JS.

## Como abrir

**Sirva a pasta por HTTP** (não abra como `file://`):

```bash
npx serve .        # ou qualquer servidor estático
```

HTTP é necessário porque dois recursos carregam arquivos via rede: o painel
**Tweaks** (compila os `.jsx` com Babel) e os `<image-slot>`. O `<iframe>` do
Google Maps também só carrega bem servido por HTTP.

## Estrutura

```
index.html          Marcação da página (nav, hero, seções, footer)
styles.css          Estilo completo (variáveis de tema no :root)
app.js              Planos (toggle Mensal/Trimestral), horários, menu mobile, reveal
braconaro/
  image-slot.js     Componente de foto arrastável (<image-slot>)
  assets/           Logo e fotos (veja abaixo)
tweaks-panel.jsx    Componentes do painel de personalização
tweaks-app.jsx      Painel "Tweaks" do site (cor, fonte, raios da hero)
```

## Recursos interativos (do Claude Design, adaptados para o site)

- **Painel "Tweaks"** — botão amarelo no canto inferior esquerdo. Abre um painel
  para trocar **cor de destaque**, **fonte dos títulos** e a **intensidade dos
  raios** da hero, ao vivo. As escolhas ficam salvas no navegador
  (`localStorage`, chave `brac-tweaks`).
- **Fotos arrastáveis (`<image-slot>`)** — passe o mouse sobre qualquer foto
  (hero, "Sobre" e as 5 modalidades) e **arraste uma imagem** por cima, ou clique
  para escolher um arquivo. A troca fica salva no navegador (`localStorage`,
  chave `.image-slots.state.json`).

> Observação: no editor do Claude Design esses dois recursos persistem no
> servidor do editor. Aqui foram adaptados para persistir no `localStorage` do
> navegador — ou seja, a personalização vale por navegador/dispositivo. Para
> mudanças definitivas para todos os visitantes, troque os arquivos em
> `braconaro/assets/` e os defaults em `tweaks-app.jsx` / `styles.css`.

## Fotos

As imagens do design acompanham o projeto em `braconaro/assets/`:

| Arquivo                                | Onde aparece             |
| -------------------------------------- | ------------------------ |
| `braconaro/assets/logo-white.png`      | Logo (nav, hero, rodapé) |
| `braconaro/assets/hero-box-v3.jpg`     | Hero (foto do box)       |
| `braconaro/assets/about-athlete-v4.jpg`| Seção "Sobre o box"      |
| `braconaro/assets/mod-forca.png`       | Modalidade · Força       |
| `braconaro/assets/mod-hipertrofia.png` | Modalidade · Hipertrofia |
| `braconaro/assets/mod-hiit.png`        | Modalidade · HIIT        |
| `braconaro/assets/mod-hyrox.png`       | Modalidade · Hyrox       |
| `braconaro/assets/mod-cross.png`       | Modalidade · Cross       |

Para trocar uma foto de forma definitiva, substitua o arquivo correspondente
(ou ajuste o `src` do `<image-slot>` em `index.html`).

## Conteúdo configurável

- **Planos e valores:** objeto `PLANS` em `app.js`.
- **Horários:** array `DAYS` em `app.js` (o dia atual é destacado com "Hoje").
- **Contato (WhatsApp, e-mail, Instagram, endereço, mapa):** links no `index.html`.
- **Tema (cores/fontes):** variáveis CSS em `:root` no topo de `styles.css`,
  ou ao vivo pelo painel **Tweaks**.

## Publicar como site 100% estático (opcional)

Se não quiser os controles interativos em produção, você pode remover o painel
Tweaks e os slots: apague as tags `<script>` de React/Babel e dos `.jsx` no fim
do `index.html`, troque cada `<image-slot ... src="...">` por um `<img src="...">`
e remova `braconaro/image-slot.js`. O visual permanece idêntico.
