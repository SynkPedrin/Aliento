# Contrato técnico do Painel de Operação e Growth

Stack real: Express (server/) + Supabase Postgres + front vanilla ES modules (public/). NÃO é Next.js: o painel vive no mesmo projeto.
Dados: `supabase/migrations/20261021100000_growth_panel.sql` (esquemas `growth` e `growth_pii`). Leia esse arquivo: é a fonte de verdade.
Acesso ao banco: `db.service.rows|one|exec(sql, params)` (módulo `server/db.js`). Tests: `node --test test/growth*.test.js` contra o Supabase local (veja `test/flow.test.js` para o padrão: `localSupabaseEnv()`, `loadConfig`, `createDb`).
Estilo: ES modules, comentários em espanhol curtos (igual ao resto do repo), sem dependências novas (use `fetch` global; `fetchImpl` injetável para testes). Nunca imprimir segredos. Textos de UI em espanhol.

## Já existe (não reescrever)
- `server/growth/settings.js`: `settings.get(key)` (segredos já decifrados), `getMasked`, `set(key, value, {by})`, `all()`. Chaves usadas:
  - `pixels.meta` `{pixelId, accessToken, testEventCode}`; `pixels.tiktok` `{pixelId, accessToken, testEventCode}`
  - `ads.meta` `{accountId, accessToken}`; `ads.tiktok` `{advertiserId, accessToken}`
  - `customerio` `{siteId, apiKey, appApiKey, region:'eu'|'us', transactional:{welcome, abandoned...}}` (também há `config.growth.customerio` por env)
  - `anthropic` `{apiKey}` (ou `config.growth.anthropicApiKey`)
  - `goals` `{cac_max:{default:number(cents), ES:..}, roas_min:number, daily_budget_cents:number, min_sample:number}`
  - `ai` `{auto_enabled:boolean (interruptor geral), limits:{pause_cpa_multiple:2, pause_spend_multiple:3, budget_max_step_pct:20, daily_cap_cents}, auto:{promote_variant:true, email_variant:true, creative_brief:true}}`
  - `alerts` `{emails:[...], webhookUrl}`
  - `timezone` `{tz:'Europe/Madrid'}`
- `server/growth/context.js`: `sha256`, `hashEmail`, `hashPhone`, `cleanTouch`, `sanitizeUrl`, `isUuid`.
- `server/growth/tracker.js`: `tracker.record(ev)` guarda em `growth.events` e enfileira em `growth.outbox`. **Formato do payload da outbox** (já produzido):
  - `meta`/`tiktok`: `{event_name (interno), event_id, time (unix s), url (já sanitizada), user:{external_id, email_hash, ip, user_agent, fbp, fbc, ttclid, country}, value_cents, currency, content_name (só o plano)}`
  - `customerio`: `{id, lead_id, user_id, email, event_name, event_id, time, language, topic, data, value_cents, currency, marketing_consent}`
  Nomes internos de evento: page_view, quiz_started, quiz_answered, lead_created, plan_viewed, plan_selected, checkout_started, purchase, app_activated, subscription_renewed, subscription_canceled, payment_failed, refund.
- `server/growth/stripe-hooks.js` (compras/reembolsos → orders/refunds/subscriptions/events), `server/routes/track.js` (`POST /api/track`, `POST /api/lead`, `GET /api/track/config`, `GET /api/track/variant`).

## Módulos a implementar (sobrescrevem os STUBs em server/growth/)
Cada um exporta uma fábrica; a composição está em `server/growth/index.js` (não alterar assinaturas).

### forwarders.js — `createForwarders({db, settings, config, email, fetchImpl, log})`
- `processOutbox({limit=50})` → `{sent, failed, skipped}`: lê `growth.outbox` com `status='pending' and next_attempt_at<=now()` (usar `for update skip locked`), envia, marca `sent`/`failed`, backoff exponencial (1m, 5m, 30m, 2h, 12h; após 6 tentativas `failed`), grava `response`/`last_error`. `skipped` quando o destino deixou de estar configurado.
- Meta Conversions API (`POST https://graph.facebook.com/v21.0/{pixelId}/events?access_token=`) e TikTok Events API (`POST https://business-api.tiktok.com/open_api/v1.3/event/track/`, header `Access-Token`). Mapeamento de nomes: page_view→PageView/PageView, quiz_started→ViewContent/ViewContent, lead_created→Lead/SubmitForm, plan_viewed→`PlanViewed` (custom)/`PlanViewed`, plan_selected→AddToCart/AddToCart, checkout_started→InitiateCheckout/InitiateCheckout, purchase→Purchase/CompletePayment, app_activated→CompleteRegistration/CompleteRegistration. Mesmo `event_id` do evento interno (dedup com o pixel do navegador). `action_source:'website'`, `event_source_url` = `payload.url`. `user_data` com `em` (hash já pronto), `client_ip_address`, `client_user_agent`, `fbp`, `fbc`, `external_id` (sha256), `ttclid`. `testEventCode` das settings quando existir. Valor em unidades da moeda (cents/100). **Nunca** enviar nada além do que está no payload (sem respostas do quiz, sem hábito).
- `customerio` → delega em `email.deliver(payload)`.
- Exporta também `buildMetaBody(payload, cfg)` e `buildTikTokBody(payload, cfg)` (puros, testáveis), e `matchQuality(payload)` → 0..10 (conta campos presentes: em, ip, ua, fbp/fbc, external_id).
- Tests: `test/growth-forwarders.test.js` (fetchImpl simulado: dedup por event_id, retry, mapeamentos, ausência de dados de saúde, hash do e-mail).

### email.js — `createEmail({db, settings, config, fetchImpl, log})`
- `enabled()`; `deliver(payload)` (payload customerio da outbox): `PUT /api/v1/customers/{id}` (Track API, Basic auth siteId:apiKey, host `track-eu.customer.io` ou `track.customer.io` segundo região) com atributos `{email, language, topic, marketing_consent}` + `POST /api/v1/customers/{id}/events` `{name:event_name, id:event_id, timestamp:time, data}`. Idempotente pelo `id` do evento.
- `sendTransactional({to, template, data, language, userId})` via App API `POST https://api.eu.customer.io/v1/send/email` (Bearer appApiKey; `transactional_message_id`, `to`, `message_data`, `identifiers`). Se não configurado, retorna `{skipped:true}`.
- `handleWebhook(body, headers)`: webhook de relatórios do Customer.io (verificar assinatura HMAC `x-cio-signature` com `webhookSecret` das settings `customerio`; se não houver segredo configurado, rejeitar em produção) → grava `growth.email_events` (event: sent/delivered/opened/clicked/unsubscribed/bounced/converted; flow = campaign name; message; variant; language; lead_id/user_id quando vierem como identificadores). Se `unsubscribed`, inserir `growth.consents` kind `marketing_email` granted=false.
- Exporta `FLOWS`: catálogo dos 8 fluxos da especificação (nome, gatilho, sequência, saída) usado pela tela de e-mails e por `docs/GROWTH_EMAIL_FLOWS.md` (criar esse doc com o texto base em espanhol de cada e-mail do funil: assunto + corpo curto, tom Alento acolhedor, sem culpa nem promessa de cura, variáveis `{{quiz.habit}}` etc.).
- Tests: `test/growth-email.test.js`.

### ads.js — `createAds({db, settings, config, fetchImpl, log})`
- `configured()` → `{meta:boolean, tiktok:boolean}`.
- `sync({scope:'daily'|'hourly', days=7})`: importa estrutura (campanha/conjunto/anúncio, nomes, thumbnail, status, orçamento do conjunto) para `growth.ads` e gasto/impressões/cliques/conversões reportadas/views de 3s de vídeo por anúncio e dia para `growth.ad_spend_daily` (upsert). Meta: Marketing API `GET /v21.0/act_{accountId}/insights?level=ad&time_increment=1&fields=...` com paginação; TikTok: `GET /open_api/v1.3/report/integrated/get/` (`data_level=AUCTION_AD`, dimensions ad_id+stat_time_day). `hourly` = só o dia corrente. Mapeie IDs para que `ad_id` = id do anúncio da plataforma (é o que a UTM `utm_content` carrega: Meta `{{ad.id}}`, TikTok `__CID__`).
- `execute(action)` para `growth.ai_actions` aprovadas: `pause_ad` (Meta `POST /{ad_id}?status=PAUSED`; TikTok `POST /ad/status/update/`), `scale_budget` (Meta: `daily_budget` do adset; TikTok: `/adgroup/update/`; respeitar passo máximo `limits.budget_max_step_pct` e teto diário). Devolve `{ok, result, undo_data}`; `undo(action)` reverte usando `undo_data` (reativar/restaurar orçamento). Falhas lançam erro com mensagem clara.
- Tests: `test/growth-ads.test.js` (fetchImpl simulado, upsert idempotente, paginação, mapeamento de IDs, limites de orçamento).

### ai.js — `createAi({db, settings, config, ads, email, experiments, fetchImpl, log})`
- Claude via Messages API (`POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`). Modelos: `claude-sonnet-5-5` (monitor/diário/perguntas) e `claude-opus-5-5` (semanal). Loop de ferramentas (tool_use) com 4 ferramentas: `consultar_banco`(sql somente leitura), `ler_anuncios`(lê growth.ads/ad_spend_daily via views), `propor_acao`(insere em growth.ai_actions, status proposed), `publicar_relatorio`(insere em growth.ai_reports). A IA nunca escreve direto em banco ou contas de anúncio.
- `queryReadonly(sql)`: **duas camadas** — (1) validação textual: um único `select`/`with`, sem `;` múltiplos, só relações `growth.v_*`, sem funções perigosas (`pg_`, `dblink`, `copy`, `set`, `into`), limite de linhas (200) e timeout 5s; (2) execução em transação `read only` com `set local role growth_ai` (o papel só tem SELECT nas views v_*; não há PII nas views).
- Rotinas: `runMonitor()` (de hora em hora: regras determinísticas SEMPRE rodam — queda de conversão vs média 7d, CPA > 2× meta, pixel/outbox parado (pending antigos/`failed`), erros de checkout, `payment_failed` em alta, gasto acima do ritmo — grava `growth.alerts` (sem duplicar alerta aberto do mesmo `code`) e notifica por e-mail (`email.sendTransactional`) e `alerts.webhookUrl` (WhatsApp/Slack via webhook genérico) uma vez; o LLM só redige/explica), `runDaily()` (8h no fuso: ontem vs média 7d, anúncios que ganharam/perderam, mudanças de funil, ações propostas com impacto e confiança), `runWeekly()` (LTV por coorte/fonte, cansaço de criativos, perguntas do quiz que mais derrubam, propostas de teste de preço/quiz, briefs de criativos), `ask(question, {user})` (resposta em português + SQL usado). **Sem chave da Anthropic**, todas as rotinas funcionam por regras e gravam relatório com `llm=false` (marcado como "informe automático por regras").
- Ações e limites (ver `ai` settings): pausar anúncio (CPA > `pause_cpa_multiple`×meta após gastar `pause_spend_multiple`×meta sem venda), subir orçamento (≤ +`budget_max_step_pct`%/dia, teto diário), promover variante de A/B (automático com 95% e amostra mínima, via `experiments.promote`), variante de e-mail (automático), brief de criativo (automático, só documento), mudar preço (SEMPRE aprovação, nunca automático). Marcar `confidence:'low'` quando a amostra < `goals.min_sample`; nada automático com baixa confiança. Tudo com `reason` + números em `data`; botão desfazer via `undo_data`.
- `approve(id, user)` executa via `ads.execute` e grava `executed/failed`; `reject`, `undo`; `autoExecute()` executa só as ações elegíveis a automático e apenas se `ai.auto_enabled` (interruptor geral) estiver ligado. O interruptor geral desliga tudo de uma vez.
- Tests: `test/growth-ai.test.js` (queryReadonly bloqueia DML/PII/tabelas base; informe por regras; alertas sem duplicar; limites de ação; kill switch).

### staff.js — `createStaff({db, settings, config, log})`
- Equipe = `growth.staff` ∪ `public.admin_users` (estes entram como `admin`). `roleOf(userId)` → 'admin'|'marketing'|'readonly'|null.
- 2FA TOTP próprio (RFC 6238, SHA-1, 6 dígitos, janela ±1; secret base32 de 20 bytes cifrado com `settings.encrypt`): `totpSetup(userId)` → `{secret, otpauthUrl}`, `totpEnable(userId, code)`, `verifyTotp(userId, code)`. Sessão 2FA: cookie `al_gt` (HttpOnly, SameSite=Strict, Secure em produção, 12 h) com HMAC (chave derivada de `settings.encrypt`/config) contendo `userId.exp`; `issue2fa(res, userId)`, `has2fa(req)`.
- `requireStaff({roles=['admin','marketing','readonly']})` → middleware Express: 401 sem sessão; 403 sem papel; **428 `TWOFA_REQUIRED`** se o papel exige 2FA e o cookie é inválido (admin e marketing exigem 2FA; readonly também). Marca `req.staff = {userId, role}`.
- `list()`, `grant({email|userId, role})`, `revoke(userId)` (não permite remover o último admin), `audit(req, action, entity, entityId, details)` grava `growth.audit_log`.
- Script `scripts/growth-staff.js` (`npm run growth:staff -- correo rol`): concede papel pelo e-mail (usa `auth.users`).
- Tests: `test/growth-staff.test.js` (TOTP com vetores RFC 6238, rejeita código errado/expirado, cookie adulterado, último admin).

### people.js — `createPeople({db, tracker, auth, log})`
- `search(q)` por e-mail (parcial) → lista `{key, lead_id, user_id, email, topic, language, created_at, status}` (junta `growth_pii.lead_pii`, `auth.users`, `growth.orders`); `timeline(key)` (key = lead_id ou user_id): eventos, respostas do quiz, e-mails, pedidos, reembolsos, consentimentos; `export(key)` (JSON completo para o titular); `erase(key, actor)` chama `growth.erase_person(lead, user, visitor)` **e** apaga o lead em Customer.io quando configurado (best effort), grava `growth.audit_log`.
- Tests: `test/growth-people.test.js`.

### experiments.js — `createExperiments({db, log})`
- `list()`, `create({key,name,kind,variants,goal_event})`, `publicConfig()` (experimentos `running` para o navegador), `assign(visitorId, key)` (estável por hash do visitante + pesos; grava `experiment_assignments`), `activeFor(visitorId)`, `stats(key)` → por variante `{variant, visitors, conversions, rate}` + teste z de duas proporções (`p_value`, `significant` a 95%, `min_sample`), `setStatus(key,status)`, `promote(key, variant)` (status `won`, `winner`, `ended_at`). Conversões = visitantes distintos com o `goal_event` depois da atribuição (cruzar `growth.events` por `visitor_id`).
- Tests: `test/growth-experiments.test.js`.

## API do painel (implementada em `server/routes/growth.js`, montada em `/api/growth`)
Todas exigem equipe + 2FA salvo `/me` e `/2fa/*`. Filtros comuns (query): `from`,`to` (YYYY-MM-DD, padrão últimos 30 dias), `language`, `country`, `device`, `source`, `program`, `variant`. Qualquer endpoint com tabela aceita `?format=csv`.
- `GET /me` → `{user:{email}, role, twofa:{enabled, verified}, canEdit:boolean (admin/marketing)}`
- `POST /2fa/setup` → `{secret, otpauthUrl}`; `POST /2fa/enable {code}`; `POST /2fa/verify {code}` → `{ok:true}`
- `GET /overview` → `{currency, kpis:{today,d7,d30}, ai:{id,title,body,llm,created_at}|null, alerts:[{id,code,severity,message,created_at}]}` onde cada janela = `{revenue_cents, orders, spend_cents, roas, cac_cents, mrr_cents, conversion_pct, visits, quiz_started}`
- `GET /funnel` → `{steps:[{key,label,count,drop_pct}], questions:[{program,question,answers,avg_seconds,drop_pct,distribution:[{answer,total}]}]}`
- `GET /acquisition` → `{rows:[{platform,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend_cents,clicks,cpc_cents,leads,cpl_cents,checkouts,carts_abandoned,purchases,cac_cents,revenue_cents,roas_d0,roas_d30,refunded_cents,reported_conversions}], tree:[…mesmos campos aninhados campaign→adsets→ads], attribution:{last:[{source,orders,revenue_cents}], first:[…], platform:[{platform,reported_conversions,reported_value_cents}]}}`
- `GET /creatives` → `{ads:[{platform,ad_id,ad_name,thumbnail_url,spend_cents,impressions,clicks,ctr_pct,hook_rate_pct,purchases,cost_per_sale_cents,roas,ctr_7d_change_pct,fatigue:boolean}]}`
- `GET /sales` → `{summary:{orders,gross_cents,refunded_cents,net_cents,mrr_cents,active,canceled,failed_payments}, daily:[…], ltv:[{cohort,source,currency,payers,months:[{m,net_cents}],ltv_cents}], subscriptions:[…], rows:[…]}`
- `GET /people?q=` → `{rows:[…]}`; `GET /people/:key` → timeline; `GET /people/:key/export` (JSON download); `DELETE /people/:key` (admin) → `{ok:true}`
- `GET /emails` → `{flows:[{flow,sent,opened,clicked,unsubscribed,converted,revenue_cents,open_rate,click_rate,by_language:[…],by_variant:[…]}], catalog:FLOWS, configured:boolean}`
- `GET /experiments` / `POST /experiments` / `GET /experiments/:key` (stats) / `POST /experiments/:key/status {status}` / `POST /experiments/:key/promote {variant}`
- `GET /ai/reports?kind=` ; `GET /ai/actions?status=` ; `POST /ai/actions/:id/approve|reject|undo` ; `POST /ai/ask {question}` → `{answer, sql, rows}` ; `POST /ai/run {routine:'monitor'|'daily'|'weekly'}` ; `POST /ai/kill-switch {enabled:boolean}` ; `GET /ai/status` → `{llm:boolean, auto_enabled, goals, limits}`
- `GET /settings` → todas (segredos mascarados `********`); `PUT /settings/:key` (admin; corpo = valor); `POST /settings/test/:what` (`meta`|`tiktok`|`customerio`|`ads`) → `{ok, message}`
- `GET /staff` / `POST /staff {email, role}` / `DELETE /staff/:userId` (admin)
- `GET /outbox` → `{pending, failed, sent_24h, match_quality:{meta,tiktok}, last_errors:[…]}` (saúde dos pixels)
- Cron (Bearer `CRON_SECRET`): `/api/cron/growth?job=outbox|monitor|daily|weekly|ads-hourly|ads-daily`.

## Front (public/growth.html + public/js/pages/growth.js + public/css/growth.css)
SPA vanilla com roteamento por hash (`#/overview`, `#/funnel`, `#/acquisition`, `#/creatives`, `#/sales`, `#/people`, `#/emails`, `#/experiments`, `#/ai`, `#/settings`), 10 telas conforme a especificação, filtros globais, exportar CSV, tema Alento (tokens em `public/css/app.css`, Figtree/Varela, `#1E3FFF`, `#3EE0B5`…), responsivo (390 px), acessível. Reusar `public/js/ui.js` (`api`, `h`, `toast`…), `public/js/charts.js` e `public/js/shell.js` quando fizer sentido. `/growth` exige sessão (redirecionar a `/acceso?next=/growth`) e passo de 2FA (configuração com secret + otpauthUrl e verificação).
