# Alento · Site institucional

Página única e responsiva, construída a partir de `CONTEUDO-SITE.md` e da identidade da apresentação.

## Arquivos

- `index.html`: as seções do site (navegação, hero, escolha do hábito, números, imprensa, manifesto, método, app, para quem é, histórias, perguntas, chamada final e rodapé). Os textos não ficam no HTML: cada elemento aponta para uma chave em `i18n.js`.
- `i18n.js`: todos os textos em 6 idiomas: espanhol (padrão), português do Brasil, português de Portugal, inglês, francês e alemão. Para mudar um texto, edite aqui.
- `site.css`: layout e responsivo.
- `site.js`: troca de idioma (seletor no topo, `?lang=` na URL, escolha lembrada no navegador), selos das lojas, revelação ao rolar, o sol percorrendo a linha do método, o carrossel de histórias, o acordeão das perguntas e o aviso de cookies.
- `CONTEUDO-SITE.md`: os textos e as notas de cada seção.

## Estrutura

A pasta é independente: tudo o que o site usa está dentro dela.

```
SITE-HOME/
  index.html          estrutura das seções
  i18n.js             textos nos 6 idiomas
  site.css            layout e responsivo do site
  site.js             idiomas, selos, animações, carrossel, perguntas, cookies
  CONTEUDO-SITE.md    textos de referência e notas de cada seção
  assets/
    css/deck.css      base da marca: cores, fonte Varela, mockup do celular
    js/brand.js       logotipo, símbolo e ícones (geometria oficial)
    js/screens.js     tela do app exibida no celular
    fonts/            Varela
    logos/            SVGs oficiais da marca e favicon
    images/           fotografias
    depoimentos/      fotos dos depoimentos
    imprensa/         logos dos veículos (cinza claro)
```

## O que substituir

- **Campos com sublinhado pontilhado menta** (classe `tbd`): dados a confirmar ou preencher, como números, nomes, credenciais, depoimentos, preço e LGPD. Remova a classe depois de preencher.
- **Link do quiz:** a constante `QUIZ_URL` no topo de `site.js`. Os cartões de hábito enviam `?tema=cigarro`, `?tema=alcool` e assim por diante.
- **Selos das lojas:** estão desenhados no padrão oficial e traduzidos. Antes de publicar, a Apple e o Google exigem os arquivos oficiais de cada idioma (Apple: "App Store Marketing Guidelines"; Google: "Google Play badges"). Troque também os links `href="#"`.
- **Idiomas e regras locais:** confira com o jurídico a lei de dados de cada idioma (LGPD, RGPD, DSGVO) e o número de crise citado na pergunta 7 (Brasil 188, Espanha 024, Portugal SNS 24, França 3114, Alemanha 0800 111 0 111). Na Alemanha, o site precisa de uma página de Impressum.
- **Imprensa e depoimentos:** os logos (Bloomberg, CBS, Yahoo Finance) ficam em `assets/imprensa/` e as fotos dos depoimentos em `assets/depoimentos/`. Mantenha só matérias publicadas de fato e depoimentos de usuários reais, com autorização por escrito para nome, idade e foto.

## Visualizar

Abra com um servidor local, porque alguns navegadores bloqueiam scripts locais quando o arquivo é aberto direto:

```bash
npx serve .
```

Adicione `?lang=en` (ou `pt-BR`, `pt-PT`, `fr`, `de`) para abrir num idioma específico. Com `?shot=1`, tudo aparece já no estado final, sem animações (útil para revisão e capturas).

## Para produção

- Hospedagem estática simples (Netlify, Vercel, S3, qualquer servidor web).
- A fonte Figtree vem do Google Fonts. Se preferir, hospede localmente.
- Para SEO em vários idiomas, vale gerar uma versão estática por idioma (ex.: `/es/`, `/en/`) com `hreflang`. Hoje a troca é feita no navegador.
