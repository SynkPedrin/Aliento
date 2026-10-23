# Alento: versão de 23/10/2026

Este pacote é o repositório do Alento com tudo o que foi feito a partir do código que você entregou.
Tudo foi desenvolvido e testado **só em ambiente local**: Supabase local e Stripe simulado (`scripts/demo.js`).
Nada foi aplicado em produção.

- **Ponto de partida:** o commit `f5d879d` ("Baseline: código recebido do dev") é exatamente o código original. Para ver tudo o que mudou:
  ```bash
  git log --oneline f5d879d..HEAD
  git diff f5d879d --stat
  ```
- **Testes:** `npm test` passa **171/171**, rodando contra o Supabase local. Os testes apagam settings `pixel:%`, então **nunca rode contra o banco de produção**.
- **Fora do pacote:** `.env` e `node_modules`. Use o `.env.example` como base.

---

## Como rodar local

Requer Node 22+ e Docker (aqui usamos OrbStack).

```bash
npm install
npx supabase start          # banco local
npm run db:migrate:local    # aplica as migrações
npm run local               # sobe o Supabase + o app em modo demo (Stripe simulado) em http://localhost:3100
```

Rotas úteis:
- **Quiz:** `/quiz/sem-fumo`. Para refazer do zero, use `/quiz/sem-fumo?nuevo`.
- **Painel de gestão:** `/growth`.
- **App do cliente:** `/dashboard`, depois da compra.

---

## O que foi feito

### 1. Quiz Sem Fumo (modelo Calmio, visual Alento)
- **Conteúdo:** 30 telas e 22 perguntas na ordem e com o conteúdo do quiz de referência (Calmio, que é do Gui), incluindo imagens e animações. As referências ficam em `docs/QUIZ_REFERENCIA.md` e `docs/referencia-calmio/`.
- **Personalização:** usa as respostas, conforme sexo, tempo fumando, cigarro/vape etc. O "tipo de fumante" sai do radar (`server/results.js`).
- **Captura:** pede e-mail e nome no fim. O nome vai em `growth_pii.lead_pii.first_name`.
- **Evento `quiz_step`:** disparado a cada tela, para a retenção por pergunta no painel.
- **Arquivos principais:**
  - `server/quiz.js` (QUIZ_VERSION 4);
  - `public/js/pages/test.js`;
  - `server/content/funnels/sem-fumo-es.js`;
  - `public/js/content/sem-fumo-es.js`.

### 2. Resultado e página de venda (`public/js/pages/resultados.js`)
- **Telas:** perfil → explicação → projeção → página de venda (`#planes`).
- **Topo:** a página de venda abre **sem logo e sem "Entrar"**.
- **Seção do pulmão:**
  - O vídeo fica no centro e a linha do tempo embaixo, com 7 marcos: Ahora, 20 min, 12 h, 2 semanas, 1 año, 5 años, 10 años.
  - De cada ponto sai um conector até o texto do benefício, distribuído em volta do pulmão.
  - Os textos mudam sozinhos entre **cigarro** e **vape/nicotina** conforme a resposta.
- **"Lo que obtienes a cambio":** barras animadas com fontes (Jha/NEJM, ACS, Gepner).
- **Planos:** semanal, 3 meses (recomendado) e 1 mês, com o texto legal, o checkbox de termos e os logos de pagamento.
- **Prova social e garantia:**
  - ticker com e-mails mascarados de compras recentes;
  - carrossel de depoimentos que avança sozinho;
  - FAQ;
  - selo de garantia de 14 dias.

### 3. Checkout e cobrança
- **Sem botão voltar no Stripe** (sem `cancel_url`). Quem volta pelo "atrás" do navegador vê uma **oferta de 20%**, uma vez por quiz, via cupom do Stripe `STRIPE_EXIT_COUPON`.
- **Preço de introdução:**
  - O primeiro período sai com desconto e depois renova pelo preço cheio, via subscription schedule criado após o checkout.
  - Os preços de renovação usam o lookup `folego_<plano>_renovacion` ou as envs `STRIPE_RENEWAL_SEM_FUMO_*`.
  - São criados com `npm run stripe:setup -- --semanal-renovacion 19.99 --mensual-renovacion 55.99 --trimestral-renovacion 99.99`.
- **Compra sem login antes:** fluxo Anúncio → quiz → compra → criar senha → instalar app.
  - `POST /api/checkout/guest` cria a conta com o e-mail do quiz e senha aleatória, e marca `profiles.needs_password`.
  - Se o e-mail já existir, devolve `LOGIN_REQUIRED` e manda para o login.
  - Depois do pagamento, `/bienvenida` pede "Crea tu acceso" (`POST /api/auth/first-password`) e oferece instalar o PWA.
- **Popup do plano semanal:** se a pessoa estiver com a semana selecionada ao clicar em "Empieza sin ningún riesgo", aparece **uma vez por sessão** um popup mostrando quanto compensa o de 3 meses (preço por dia).
  - "Cambia al plan de 3 meses" vai ao checkout trimestral; "No, gracias" segue com o semanal.
  - O código fica em `weeklyUpsell`, em `public/js/paywall.js`.

### 4. App do cliente
- **Fundo branco** no app e no quiz. O painel continua escuro.
- **"Metas de tu plan" agora são do sistema:** o lead não marca mais checkbox. Quando a semana de uma meta termina, ela é marcada como cumprida ao carregar o painel (`server/routes/app.js`, `server/services/program-companion.js`).

### 5. Painel de gestão v2 (`/growth`)
- **Login:** só e-mail e senha, sem cadastro público. Usuários são criados em Configurações → Equipe. O 2FA fica desligado por padrão e volta com `GROWTH_REQUIRE_2FA=true`.
- **Menu:**
  - **Visão geral:** faturamento de hoje, 7 e 30 dias.
  - **Funis:** curva de retenção por pergunta, estilo VTurb, com filtros de país, dispositivo e origem.
  - **Vendas:** UTMs de cada venda, com uma gaveta de detalhes do cliente.
  - **Funis de e-mail.**
  - **Modo IA.**
  - **Traqueamento.**
  - **Configurações.**
- **Pixels nomeados:** vários por rede (Meta/TikTok), por exemplo "PIXEL PERFIL 10", cada um com código.
  - O parâmetro `?px=<código>` na URL do anúncio escolhe o pixel, no navegador e no servidor (CAPI/Events API). Sem `px`, vale o pixel padrão.
  - Tokens criptografados com `GROWTH_ENCRYPTION_KEY`.

### 6. Migrações novas (aplicar em produção, nesta ordem)
- `supabase/migrations/20261024100000_lead_name.sql`: adiciona `growth_pii.lead_pii.first_name`.
- `supabase/migrations/20261025100000_guest_checkout.sql`: adiciona `profiles.needs_password`.

Os rollbacks ficam em `supabase/rollback/`.

---

## Antes de mandar tráfego (checklist de produção)

1. Aplicar as 2 migrações acima no Supabase de produção (`npm run db:migrate`).
2. **Stripe live:**
   - criar os preços de renovação (`stripe:setup` com as flags `--*-renovacion`);
   - criar o cupom de 20% e pôr o ID em `STRIPE_EXIT_COUPON`;
   - confirmar `EXIT_OFFER_PLAN`;
   - configurar o webhook no domínio novo e pôr o segredo em `STRIPE_WEBHOOK_SECRET`.
3. **E-mail de recuperação de senha do Supabase:** confirmar o SMTP de produção e o redirect para `APP_URL/restablecer`. Quem compra e fecha a aba antes de criar a senha só entra por aí.
4. **Pixels:** cadastrar em Traqueamento e validar com o *test event code* que `Purchase` chega uma vez só (navegador + servidor deduplicados pelo `eventId`).
5. **Compra real de ponta a ponta:** quiz → semanal → criar senha → app.
   - Conferir no Stripe se a renovação está agendada pelo preço cheio.
   - Conferir se a venda aparece em Vendas com as UTMs.
   - Reembolsar no fim.

## Pendências conhecidas
- **Conteúdo do app em 9 capítulos × 9 tarefas,** liberado por progresso + dias, com a frase do dia. Hoje são 3 lições por capítulo.
- **Sequências de e-mail com Resend** e consentimento de marketing para a UE.
- **Conversões do Google Ads.**
- **Traduções** (EN etc.).
- **Popup do plano semanal sem brinde** por enquanto: quando houver um, trocar a imagem e o texto em `weeklyUpsell`.
- A lista completa está em `docs/NEXT_TASKS.md`.
