# Current State (implementation status, verified 19/10/2026)

Date of last verification: **2026-10-19**. All commands below were executed against the **local** Supabase (Docker) and a **fake Stripe**; no production data was touched.

## Verified this cycle (2026-10-19)

- `npm test` — **40 tests, 40 passing** (31 in `test/flow.test.js` + 9 in `test/store-sync.test.js`; local Supabase + fake Stripe).
- Playwright E2E — **final combined run 22/22 passing** (2026-10-19, 3.3 m, exit 0): `e2e/app.spec.js` (4) + `e2e/embudo.spec.js` (2, real Stripe TEST funnel) + `e2e/pwa.spec.js` (16, both projects). Earlier standalone runs: app+pwa 20/20, embudo 2/2. See `docs/ALENTO_E2E_REPORT.md`.
- **Critical funnel bug found and fixed via the Stripe-funnel e2e**: the results page crashed (`ReferenceError: xyChart is not defined` — missing import) right after finishing the quiz, leaving users a skeleton at the money moment. Fixed and verified rendering (headings, estimates, plans) in a real browser.
- Per-program funnel is fully threaded end to end: `/quiz/<slug>` and `?program=` → quiz → per-program results → per-program paywall/plans → checkout → access. See `docs/ALENTO_PROGRAMS.md`.
- Native billing (StoreKit 2 + Google Play) is **wired and tested**: routes `/api/store/*`, cryptographic verification, entitlement sync, notifications V2. See `docs/ALENTO_BILLING_REPORT.md`.
- Migration `20261018100000_store_transactions.sql` applied locally; `store_transactions` table has RLS enabled and **zero** client policies (service-role only). See `docs/ALENTO_SUPABASE_REPORT.md`.
- Landing fixes: no fake store badges (honest web-app CTA), footer links all resolve to real pages (`/terminos`, `/privacidad`, `#…` sections), CSP for Google Fonts mirrored to `vercel.json` for the Vercel entry, `offline.html` retry link no longer hardcodes Sem Fumo. See `docs/ALENTO_FINAL_AUDIT.md`.

## Verified: the integration test suite is green

`npm test` runs `node --test --test-concurrency=1 "test/**/*.test.js"` — **31 tests, 31 passing** (run on 2026-10-16 after fixing four server bugs).

Covered behavior includes: registration/login, checkout and Stripe webhooks (fake), per-program subscription independence, access control (premium routes vs. subscription), RLS user isolation, journey progress (chapters/lessons/responses), per-program goals, achievements, push consent and deduplication, refunds/cancellations, cron authentication, and program catalog/access states.

## What is implemented and working

- **Authentication** (P0): Supabase Auth sessions with refresh cookies, registration with consent, login/logout, password change. ✅
- **Stripe checkout and webhooks** (P0): Checkout Sessions, subscription sync, webhook handling with signature verification, event idempotency/ordering, refunds and disputes cancel access, reconciliation by verifiable identifiers. Test-mode only. ✅
- **Per-program access control** (P0): five programs; every premium route checks the entitlement of the requested program; data queries are program-scoped. A user with only Alcohol access is blocked from Sem Fumo routes and vice versa. ✅ (tested by `multiprograma: acceso por programa` and `multiprograma: cancelar un programa no cancela los demás`)
- **Journey, progress, goals, charts, achievements** (P1): per-program questionnaires, personalized plans, daily goals, chapters/lessons, breathing, mood, achievements, and the stats/charts endpoints. ✅
- **Programs 2–5 content**: alcohol, azucar, ansiedad and sueno journeys exist with questionnaires and content. They are **drafts** (not published, not purchasable) pending clinical review. ✅
- **Notifications** (P1): Web Push consent per program, daily/weekly/exercise reminders, achievement alerts, dedupe per day, anti-SSRF endpoint allowlist, protected cron. ✅
- **Admin**: content review workflow (drafts require clinical review), program commercial states, access grants. ✅
- **Mobile/App Store prep** (P2): migrations and services for StoreKit 2, Google Play Billing and RevenueCat exist (`supabase/migrations/20261016120000_native_billing_and_entitlements.sql`, `server/services/store-sync.js`, `server/billing-mappings.js`). The store-sync service now receives the billing instance and runs the same activation path as Stripe, and it **is wired**: `server/factory.js` builds `storeSync`/`apple`/`googlePlay` and `server/app.js` mounts `server/routes/store.js` at `/api/store/*`. Native purchases without configured credentials answer `503` (no simulation).
- **Landing page** (P2): the institutional landing now serves the **SITE-HOME** static page (`public/index.html`, `public/site.css`, `public/site.js`, `public/i18n.js`, `public/assets/**`) — multi-section, i18n in 6 languages, animations, store badges. CSP was made per-route (landing relaxed for inline styles + Google Fonts; app routes keep the strict policy). Quiz CTAs now point to `/test?program=<slug>` for all five programs. ✅ (verified in a real browser)

## Bugs fixed in the current cycle (2026-10-16)

Four backend bugs made several integration tests fail; all are fixed and re-verified:

1. `server/routes/app.js` — `PUT /api/app/onboarding`:
   - `changeStrategy(userId, program, strategy, reason)` was called without the `program` argument, and
   - `updateGoal(req, program, changes)` was called with the arguments swapped (`updateGoal(req, { start_date })`).
   The onboarding therefore always failed with 409/500, `onboarded_at` was never set, and every premium endpoint answered `ONBOARDING_REQUIRED`.
2. `server/billing.js` — `buildPersonalPlan`: the `update personalized_plans …` statement bound a `$2` parameter that the statement never referenced (`could not determine data type of parameter $2`). Creating a new plan version (e.g. when the user changes strategy) always failed. The statement now uses the correct placeholder.
3. `server/routes/app.js` — `PUT /api/app/notifications`: the INSERT listed 11 columns (including `weekly_summary`) but the VALUES had only 9 `$` placeholders, so every preferences update failed with 500 and the `enabled` flag was never stored. Added the missing `$10`.
4. `server/services/store-sync.js` — onboarding/bienvenida achievement used a non-existent slug (`bienvenida`); the catalog slug is `primer-paso`. Also, the purchase flow did not run the activation step that the Stripe path performs; `createStoreSync` now accepts the billing instance and runs the same `ensureActivated` path.

## Cycle 2026-10-16 — Landing page swap to SITE-HOME + integration

- Replaced `public/index.html` with the SITE-HOME multi-section page (hero, program picker, numbers, press, manifesto, method, app screens, for-whom, stories, FAQ, final CTA, footer) with all texts loaded from `public/i18n.js` (6 languages).
- Upgraded the landing `<head>`: full `title`/`description`/`og` meta, `theme-color`, `viewport-fit=cover`, favicon pointing to the new logo (`/assets/logos/alento-icone-app.svg`), apple-touch-icon, PWA manifest link.
- Made the Content-Security-Policy **per route**: the landing allows inline styles + Google Fonts stylesheets (`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`); every other route keeps the strict policy.
- Fixed `public/site.js` quiz links: `QUIZ_URL = '/test'` + `QUIZ_PROGRAM` map (`cigarro→sem-fumo`, `alcool→alcohol`, `acucar→azucar`, `ansiedade→ansiedad`, `sueno→sueno`) so CTAs/goals resolve to `/test?program=<slug>`.
- Verified in a real browser (Playwright + system Chrome): page renders all sections, no JS errors, i18n language switch works (ES→PT-BR), quiz CTAs → `/test`, goals → `/test?program=*`, no horizontal overflow at 390px, favicon/logo render, footer renders.

## Verified limitations of this session

- Playwright E2E is fully executable with system Chrome. Full combined run `npx playwright test e2e/app.spec.js e2e/pwa.spec.js e2e/embudo.spec.js --trace off` = **22/22 (3.3 m, exit 0)** on 2026-10-19 (run with `--trace off`; the Playwright trace-artifact writer intermittently hits ENOENT on this machine — runner flake, not app failure; one 21/22 attempt preceded it and is documented in the E2E report).
- **`e2e/embudo.spec.js` (real Stripe test-mode funnel): 2/2 PASSING (2026-10-19, 1.1–1.4 min after the `/api/plans paymentsEnabled` fix — see IMPLEMENTATION_LOG).** Root cause of all earlier "funnel time-outs" was the always-disabled results CTA, not Checkout latency.
- Local Supabase: all 13 migrations applied (incl. `20261018100000_store_transactions`); RLS verified per table. Canonical `alento_canonical_store_products` mapping migration (data-only, + rollback) applied **locally only**.
- The remote Supabase project was only ever read; all testing used the local Supabase (ports 55521/55522).
- Catalog invariants re-verified live: `sem-fumo` = `active`+published; `alcohol/azucar/ansiedad/sueno` = `coming_soon` (not sellable — `/api/checkout` returns 409 `PROGRAM_NOT_AVAILABLE`; paywall CTA disabled with honest notice).
- **Branding & SITE-HOME LP certificado 2026-10-19**: ícone iOS oficial (`ios-1024.png`) propagado para `AppIcon-512@2x.png`; splashscreen oficial 2732×2732 nos assets xcassets; imagem `og-alento.png` (1200×630) gerada para compartilhamento (WhatsApp/Twitter/OG); favicon SVG `/assets/brand/alento-icone-app.svg` + PNG fallback `/assets/icons/favicon-32.png` inseridos no `<head>`; meta tags OG/Twitter + JSON-LD Organization com logo adicionados a `public/index.html`; headline hero `"Respira de novo."` verificada corretamente (dois <span> dentro de <h1>); zero `tbd` restante em todo o markup/i18n; QUIZ_URL alterado de `/test` para `/quiz`; todos os 6 idiomas de i18n atualizados consistente; 11 seções de SITE-HOME preservadas; estrutura visual idêntica ao attachment.

## Current git state

The working tree contains an **uncommitted diff** (server/, test/, public/, vercel.json, new store modules, new docs). Those changes were authored by earlier sessions and preserved + extended on 2026-10-19 (per-program funnel frontend, native billing wiring + tests, landing fixes, docs). Do not revert them. Do not commit `.env`, `SITE-HOME.zip` or any credential file.
