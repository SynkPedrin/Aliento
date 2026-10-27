# Alento: versão de 27/10/2026

Esta versão continua a de 23/10 (veja `LEIA-ME_23-Out.md`). Foi feita e testada **só no ambiente local**.

- **Testes:** `npm test` passa **178/178**. Testes novos: `test/release-27out.test.js` e `test/i18n.test.js`.
- **Migração nova:** `supabase/migrations/20261027100000_profile_locale.sql` (o idioma da conta). O rollback está em `supabase/rollback/`.

## O que mudou

### Painel growth (`/growth`)
- **Menu:** cada item tem ícone. "Funis" passou a se chamar **Analytics**, e entraram dois itens novos: **Leads** e **Melhorias futuras**.
- **Analytics** (`public/js/growth/v2.js`, `server/routes/growth.js`):
  - **Filtros embaixo do gráfico:** Geral, Campanha (`utm_campaign`), Conjunto (`utm_term`), Anúncio (`utm_content`), País, Dispositivo, Origem e Idioma.
  - **Linhas por valor:** ao escolher uma dimensão, o gráfico mostra uma linha para cada valor (até 6). Embaixo vem um comparativo com iniciaram, terminaram, leads, oferta, compras e % até a compra, e o melhor fica marcado.
  - **Um valor só:** clicar num valor mostra só a linha dele, com as métricas daquele recorte.
  - **Nomes por extenso:** país e idioma aparecem completos ("Espanha", não "ES").
  - **"Tela a tela":** vem dobrado.
  - **"Zerar métricas":** link discreto no rodapé, só para admin, que pede para digitar `RESETAR`. Não apaga nada, porque os eventos são só de inserção. Grava a data em `growth.settings` (`funnels.reset`) e o painel passa a contar a partir dela.
- **Leads:** e-mails captados no quiz, com nome, país, origem, anúncio e se já comprou. Tem busca e exportação em CSV.
- **Melhorias futuras:** notas com área (Funil/App/E-mail/Tráfego). Dá para marcar como feita, mudar a ordem, editar e excluir. Vem com os 5 exemplos do pedido e é salvo em `growth.settings` (`roadmap`).
- **Traqueamento:**
  - TikTok Ads vem primeiro, e Meta aparece como "Meta Ads", cada rede com seu logo.
  - Cada pixel tem o botão **"Copiar link"**, que monta o link pronto do quiz com as UTMs da rede e o `px`.
  - Saiu o bloco "Link do anúncio / exemplo".
- **Erro de entrar no painel:** quando o navegador estava logado como cliente (por exemplo, depois de uma compra de teste), o painel dava "não autorizado" e só voltava limpando os cookies. Agora ele mostra o login com um aviso, e entrar troca a sessão.

### Site e app
- **Quiz sem pedido de cookies:** no quiz e no resultado o banner não aparece, e quem ainda não escolheu conta como aceite (`public/js/track.js`).
  - **Atenção:** é decisão do negócio, com risco de RGPD na UE.
  - Para voltar ao banner, basta apagar a linha que fica em `initTracking`.
- **Idioma (sem Google Tradutor):** traduções próprias em **espanhol, inglês, francês, alemão, português do Brasil e de Portugal**.
  - A tela abre no idioma do navegador (ou `?lang=en` no link). O seletor fica em todas as telas: no quiz, discreto no topo. Com login, o idioma é salvo na conta (`profiles.locale`) e no perfil.
  - **Já traduzido (tudo):** home, quiz, resultado, página de venda, checkout, login, boas-vindas, suporte, todas as telas do app, as 30 lições da jornada, conquistas, respirações, guia de apoio, mensagens do servidor, e-mail de compra, termos e privacidade (o parágrafo inteiro é traduzido, com negritos e links). A página do Stripe abre no idioma da pessoa.
  - **Revisão recomendada:** termos e privacidade traduzidos devem passar por um jurídico de cada país; vale um nativo ler a página de venda em FR e PT-PT antes de investir em tráfego.
  - **Como funciona (para o dev):** o texto-fonte continua o espanhol escrito no código. As traduções ficam em tabelas `i18n/*.json` (cada linha: espanhol + 5 idiomas) e `npm run i18n:build` gera os catálogos `public/js/lang/<idioma>.js`. No navegador, `public/js/lang/dom.js` troca cada texto da tela pelo do catálogo (sem marcar string por string); no servidor, toda resposta JSON da API sai traduzida pelo cabeçalho `X-Alento-Lang`. Textos com números usam modelos (`'Baja de {a} a {b} cigarrillos al día'`).
  - **Texto novo no código:** rode `npm run i18n:missing`; o teste `test/i18n.test.js` falha se algum texto dos arquivos traduzidos ficar sem tradução.
- **Home:**
  - Saiu "¿No encuentras lo que buscabas? Escríbenos".
  - "Área de usuario" vai para o login.
  - O rodapé ganhou "Contacto" → `/soporte`.
- **Suporte (`/soporte`):** página pública com formulário (nome, e-mail, nº do pedido e mensagem).
  - Chega por e-mail em `SUPPORT_EMAIL`, e responder vai direto para o cliente.
  - Tem limite de 5 envios por hora por IP e um campo-isca contra robôs.
- **Só Sem Fumo:**
  - O catálogo "Mis programas" saiu do menu, e `/programas` leva ao app.
  - O login leva a `/dashboard`, que manda quem não assina para o plano.
  - O PWA instalado abre em `/dashboard`.
  - A tela de assinatura não oferece "começar" a quem já tem acesso.

### E-mail de confirmação de compra (Resend)
- **Envio:** em `server/services/mailer.js`, disparado pelo webhook do Stripe na primeira compra paga.
  - É enviado no idioma da conta (es, en, fr, de, pt-BR, pt-PT), com o plano e o total.
  - Quem comprou sem cadastro recebe o botão **"Crear mi contraseña"**, que é um link de recuperação do Supabase. Quem já tem senha recebe "Entrar".
  - Usa `idempotency-key`, então um webhook repetido não manda o e-mail duas vezes.
- **Proteção:** uma falha de e-mail nunca bloqueia o pagamento.
- **Sem chave:** sem `RESEND_API_KEY`, nada é enviado e o envio só aparece no log.

## Antes de publicar (produção)
1. **Migração:** aplicar `20261027100000_profile_locale.sql` (`npm run db:migrate`).
2. **Vercel:** configurar `RESEND_API_KEY` (criada no Resend, colada direto na Vercel, nunca em chat ou documento), `EMAIL_FROM` (ex.: `Alento <hola@alentohealth.com>`) e `SUPPORT_EMAIL` (a caixa que recebe o suporte).
3. **Resend:** o domínio `alentohealth.com` precisa estar "Verified" (registros DKIM/SPF/DMARC na Spaceship).
4. **Supabase:** em Auth → Email, subir a validade do link (Email OTP Expiration) para **86400 s (24 h)**. O link "Crear mi contraseña" do e-mail de compra usa esse prazo.
5. **Notificações:** a tela de Notificações só começa a enviar com `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` na Vercel. Gere com `npx web-push generate-vapid-keys`.
6. **Compra de teste de ponta a ponta:** conferir o e-mail que chega, o link de criar senha e a venda aparecendo em Vendas e em Leads ("comprou").

## Pendências
- **Revisão jurídica** dos termos e da privacidade traduzidos (EN, FR, DE, PT-BR, PT-PT).
- **Textos do checkout no Stripe** (`custom_text` em `server/billing.js`) e **notificações push** ainda saem em espanhol.
- **Lista completa:** em `docs/NEXT_TASKS.md`.
