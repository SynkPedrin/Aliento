# AI Context (for AI assistants working on Alento)

This document is the shared context for any AI agent (human or model) that continues work on the Alento repository. Read it before touching code, and update it when the architecture or invariants change.

## What Alento is

Alento is a Spanish-language SaaS ("SaaS en español") that helps people stop smoking:

- A **free questionnaire** (cuestionario) produces personal results.
- A **paid subscription** (Stripe Checkout) unlocks the premium area.
- The premium area includes: dashboard, journey (jornada) with lessons and progress, consumption/habit/activity records, goals, breathing exercises, mood diary, charts, achievements, push notifications, support.
- The same codebase also serves **five programs**: Sem Fumo (published), Alcohol, Azúcar, Ansiedad and Sueño. Programs are clinically separate products that share infrastructure.

Stack: Node (22+) + Express 5 (server and Vercel serverless entry in `api/`), Supabase (Postgres + Auth + RLS), Stripe, and a plain HTML/CSS/JS frontend with no build step.

## Commands

```bash
npm install
npx supabase start                 # Supabase local in Docker (ports 555xx)
npm run db:migrate:local          # apply supabase/migrations to the local database
npm run content:seed              # load the journey content (never deletes user progress)
npm test                         # node --test integration tests (require local Supabase)
npm start                        # real server with Stripe in test mode (port 3100)
npm run demo                     # same product with simulated payments
```

- The integration tests use a **fake Stripe** (`scripts/fake-stripe.js`) and a real local Supabase: they never create real charges.
- E2E (`npx playwright test e2e/app.spec.js e2e/pwa.spec.js`) needs the local server on `:3100` and system Chrome. `e2e/embudo.spec.js` additionally needs a real Stripe **test-mode** listener: `.tools/stripe listen --api-key "$STRIPE_SECRET_KEY" --events "checkout.session.completed,customer.subscription.created,…" --forward-to localhost:3100/api/stripe/webhook`, then restart the server with the session's signing secret (`STRIPE_WEBHOOK_SECRET`). `server/services/notifications.js` uses Web Push with VAPID keys from config (dummy keys are fine for tests).

## Architecture map

- `server/app.js` — central Express app: routing, auth on every request, rate limiting, error mapping. Mounts the route modules.
- `server/routes/account.js` — registration, login, sessions, password recovery, account deletion, export.
- `server/routes/public.js` — public funnel: quiz, catalog, checkout, billing portal.
- `server/routes/app.js` — premium area. Every premium route is protected per program (see invariants).
- `server/routes/admin.js` — admin-only content and program management.
- `server/auth.js` — Supabase Auth session/refresh cookies.
- `server/billing.js` — Stripe Checkout, subscriptions, webhooks, reconciliation, per-program subscriptions.
- `server/quiz.js`, `server/results.js` — questionnaire definitions and per-program result computation (`computeResult(answers, { program, strategyOverride })`).
- `server/services/` — entitlements (per-program access), journey engine (chapters/lessons), stats/progress, notifications, achievements, support, and native-billing sync (`store-sync.js`, `apple-jws.js`, `google-play.js`).
- `server/routes/store.js` — `/api/store/*` native purchase endpoints (transactions, App Store Server Notifications V2, restore, product map).
- `server/programs.js` — five-program catalog and per-program access state.
- `server/services/entitlements.js` — `ProgramEntitlementService.getEntitlement(userId, programSlug)`: the single place that decides if a user may use a program.
- `supabase/migrations/` — full schema history; RLS policies live in migrations (user-scoped access).
- `test/flow.test.js` — the main integration suite (users, payments via fake Stripe, journey, notifications, access control).
- `public/js/pages/` — plain-JS frontend pages.

## Invariants (never break these)

1. **Access is per program, never global.** There is no "user is premium" flag. Every premium route calls the entitlement service with the program in question, and data queries are scoped by `program_slug`. A user with only Alcohol access must be blocked from Sem Fumo routes and vice versa.
2. **Never expose or depend on global `activeSubscription` checks for premium routes.** `requireAccess` (any active subscription, any program) only establishes a basic session; the per-program check happens afterwards in every premium route.
3. **User-scoped data always runs as the authenticated user** (`db.asUser`): RLS is what protects other users' rows. System queries use `db.service` and bypass RLS.
4. **Never run real Stripe charges, never alter real subscriptions, never delete production data or roll back migrations.** Tests use fake Stripe; only an explicitly approved production action may change live billing.
5. **Only Sem Fumo is commercially published** (active / purchasable). Alcohol, Azúcar, Ansiedad and Sueño journeys are drafts, pending clinical review (`published = false` in `seed-content`).
6. **Content seeds never delete user progress**; they only upsert the content and version lessons when they change.
7. **Web Push**: only official push services are allowed; notifications are program-scoped by `program_slug` in `notification_preferences`.
8. Keep uncommitted changes (they contain the in-flight multiprograma work) — build on top, do not revert them.
9. **Native purchases grant nothing without cryptographic verification.** `POST /api/store/transactions` verifies the Apple StoreKit 2 signed JWS (ES256, X.509 chain to the pinned Apple Root CA - G3, bundle id + environment checks) and Google Play purchases through the real `androidpublisher` API. Without `APPLE_BUNDLE_ID` / Google Play credentials configured the endpoints answer `503` — they never simulate access.
10. **The app is not in the App Store / Google Play yet.** The landing must not show store badges or claim native availability; it advertises the web app (PWA) honestly. Store badge artwork is only added when the apps are actually published.

## Where to look for what

| Question | File |
|---|---|
| How is access checked for a premium route? | `server/routes/app.js` (`requireProgram`), `server/services/entitlements.js` |
| How are subscriptions stored per program? | `server/billing.js`, `public.subscriptions` (migration `20261015100000_multiprograma.sql`) |
| How does a user progress through lessons? | `server/services/journey.js` |
| How are stats/charts computed? | `server/services/stats.js` |
| How do notifications decide what to send? | `server/services/notifications.js` |
| How is the catalog shown with access states? | `server/programs.js` (`catalogFor`) |
| What does the test suite verify? | `test/flow.test.js` (core) and `test/store-sync.test.js` (native billing) |
| How is a native (StoreKit/Play) purchase activated? | `server/routes/store.js` → `server/services/apple-jws.js` / `google-play.js` → `store-sync.js` → entitlements |
| How is the landing built and translated? | `public/index.html` + `public/site.js` + `public/i18n.js` (6 languages, no build step); CTAs → `/test?program=<slug>` |
| Which CSP applies where? | `server/app.js` (per-route: landing relaxed, app strict) and `vercel.json` (same rules for the Vercel entry) |

Further reading: `docs/CURRENT_STATE.md`, `docs/NEXT_TASKS.md`, `docs/IMPLEMENTATION_LOG.md`, `docs/PRODUCTION_RISKS.md`.
