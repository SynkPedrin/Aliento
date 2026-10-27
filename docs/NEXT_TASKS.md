# Next Tasks

Ordered by priority. Everything here is planned; nothing in this list has been executed without checking the constraints in `docs/AI_CONTEXT.md` (in particular: no real Stripe charges, no production-affecting change without approval).

## P0 — security and access (finish/verify)

- [x] Per-program access control on every premium route (`requireProgram` + `ProgramEntitlementService`).
- [x] Program-scoped data queries: goals, progress, notifications, daily goals, journey state, breathing counts.
- [x] Verify the remaining non-program-scoped premium endpoints are intentional (they are transversal features: mood, breathing sessions, push subscriptions, support). Every route that depends on a program's data is program-scoped.
- [x] Regression check after changes (2026-10-19): `npm test` = **54/54**; multiprograma access tests in `test/flow.test.js` keep passing. Funnel: `e2e/embudo.spec.js` **2/2** real-Stripe passing, plus **full combined Playwright run 22/22** (`app`+`embudo`+`pwa`, 3.3 m).

## P1 — funil Sem Fumo (próximo)

- [x] **Popup «downsell reverso» no plano semanal** (feito em 2026-10-23, sem brinde; quando houver brinde, trocar imagem/texto em `weeklyUpsell`, `public/js/paywall.js`). Na tela final do quiz, se a pessoa estiver com o plano «Prueba de una semana» selecionado e clicar em «Empieza sin ningún riesgo», abrir um popup (modelo visual do Calmio: imagem no topo, título, texto, botão principal laranja, link «No, gracias») reforçando o quanto compensa o plano de 3 meses (preço por dia menor, tempo para criar o hábito). Sem brinde por enquanto: o Calmio oferece o «Pack de Hipnoterapia», o Alento ainda não tem o que dar.
  - Botão principal: «Cambia al plan de 3 meses» → troca a seleção para 3 meses e segue para o checkout.
  - «No, gracias» → segue para o checkout com o plano semanal.
  - Mostrar uma única vez por sessão; registrar `results_step` (ou evento próprio) para medir quantos trocam.
  - Onde: `renderSalesPlans` / `goToCheckout` em `public/js/paywall.js`.

- [ ] **Tradução humana do quiz e da página de venda** (EN primeiro, depois DE). Hoje fora do espanhol é Google Translate (`public/js/translate.js`); a home já tem textos próprios em 6 idiomas (`public/i18n.js`).
- [ ] **Textos do checkout Stripe por idioma** (`custom_text` em `server/billing.js` ainda em espanhol).
- [ ] **E-mail para quem não comprou** (lead sem compra; Resend já integrado em `server/services/mailer.js`).

## P1 — complete the five programs

- [ ] Clinical review of the four draft journeys (Alcohol, Azúcar, Ansiedad, Sueño). Only after review may they be published/commercialized.
- [x] Verify each draft program is complete against the specification checklist (2026-10-19):
  - [x] questionnaire per program (`server/quiz.js` → `PROGRAM_STEPS` — alcohol 9 q, azúcar 6, ansiedad 5, sueño 5),
  - [x] journey definition in `server/content/programs/*.js` (5/5 journeys + `journey-engines.js` wired),
  - [x] chapters/lessons: 10 chapters / 30 lessons per program (seeded locally, checked),
  - [x] results computation (`server/results.js`) now covered by unit tests for ALL five engines (`test/results.test.js` 19 tests),
  - [x] UI pages handle the program (program-scoped quiz/results/paywall/dashboard; catalog states live-verified).
- [x] Accessibility of drafts (2026-10-19, verified live): catalog shows «Próximamente» for the 4 drafts; /api/checkout blocks sale (409 `PROGRAM_NOT_AVAILABLE`); `/api/plans` exposes `purchasable` + paywall shows honest disabled state. Note: commercial activation still flows through admin `commercial_status` = `active`.

## P2 — animations, responsiveness, PWA (verify only, do not regress)

- [ ] Confirm the existing animation/CSS work satisfies "movimientos sutiles, sin distractores"; keep it optional per user settings.
- [ ] Confirm responsive/mobile layout holds for all five program pages (check with narrow viewports).
- [ ] Confirm the PWA manifest and service worker do not cache premium-only data (premium routes must always require an active subscription, even when cached).

## P2 — mobile / App Store preparation (verify only, no store publishing)

- [x] StoreKit 2 / Google Play Billing / RevenueCat migrations exist (`20261016120000_native_billing_and_entitlements.sql`) and per-store subscription sync is implemented in `server/services/store-sync.js`.
- [x] **Wire `createStoreSync` into the server** (2026-10-19): `server/factory.js` builds `storeSync`/`apple`/`googlePlay`; `server/app.js` mounts `server/routes/store.js` (`POST /api/store/transactions`, `POST /api/store/notifications/apple`, `GET /api/store/restore`, `GET /api/store/products`).
- [x] Add node tests for `store-sync` (2026-10-19): `test/store-sync.test.js` — JWS accept/reject cases, idempotency, revocation, restore, cross-program isolation, routes with unconfigured-`503` and Apple refund flows.
- [ ] Prepare TestFlight / store listing metadata: screenshots, privacy labels, support contact. Check `docs/ALENTO_IOS_REPORT.md` and `docs/ALENTO_APP_STORE_CHECKLIST.md` for the prepared plan (do not publish anything).

## Cross-cutting

- [x] Keep `docs/AI_CONTEXT.md`, `docs/CURRENT_STATE.md`, `docs/NEXT_TASKS.md`, `docs/IMPLEMENTATION_LOG.md` and `docs/PRODUCTION_RISKS.md` updated after every significant change (append to the log, refresh current state).
- [x] Re-run `npm test` after every change touching: `server/routes/app.js`, `server/billing.js`, `server/quiz.js`, `server/results.js`, `server/services/*`, `server/programs.js`. Verified: 54/54 passing.
- [x] Playwright E2E: all flows covered by Node integration suite against real database; remote Playwright runs on Vercel alpha deploy confirmed green (22/22). Local Chromium not installed — integration tests sufficient.
- [x] Branding & LP release: SITE-HOME certified as root route; og-alento.png + iOS assets propagated; metadata (JSON-LD, Twitter, favicon, apple-touch) updated. Store listing metadata plan prepared in `docs/ALENTO_APP_STORE_CHECKLIST.md` (no publishing).
- [x] Final audit verdict matrix `ALENTO_FINAL_AUDIT.md` updated with today's evidence.
- [ ] Clinical review of the four draft journeys (Alcohol, Azúcar, Ansiedad, Sueño). Only after review may they be published/commercialized. (Pending — external admin authorization).
- [ ] Apple Developer credentials (signing, TestFlight, store submit) and Google service account — external, by design.
- [ ] Remote Supabase production deploy — requires explicit user authorization. (Not performed: remote read-only only).
- [ ] Admin panel verification, animation/token audit, store metadata/screenshots — documented as next pending cycle.
