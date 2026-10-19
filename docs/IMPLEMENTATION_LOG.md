# Implementation Log

Chronological record of implemented work. New entries are appended at the top of the current cycle (newest first). Format: date · area · what changed · why · how verified.

## 2026-10-16 — Fix `buildPersonalPlan` placeholder (server/billing.js)

- **Problem**: `buildPersonalPlan` created a new version of the personalized plan by running
  `update personalized_plans set current_version = current_version + 1, assessment_id = $3 where id = $1`,
  while the parameter array supplied `$1, $2, $3`. Postgres could not infer the type of the unused `$2`
  and every strategy change (or first plan rebuild) threw `could not determine data type of parameter $2`.
- **Fix**: bind `$2` correctly — the statement now uses `assessment_id = $2` and binds `[plan.id, assessment.id]`.
- **Verified**: tests `7 · objetivos…` and the whole suite pass (`npm test`, 31/31).

## 2026-10-16 — Fix onboarding route argument order (server/routes/app.js)

- **Problem**: after the multiprograma change, `changeStrategy` and `updateGoal` gained a `program` parameter, but the `/api/app/onboarding` PUT still called them with the old signatures:
  - `changeStrategy(userId, goal, 'Meta confirmada…')` (missing `program`),
  - `updateGoal(req, { start_date })` (arguments swapped).
  The request always failed, `complete: true` never ran, `profiles.onboarded_at` was never set, and every premium endpoint answered `ONBOARDING_REQUIRED` — including the concurrent-request test that showed 25×409.
- **Fix**: call both helpers with the program (`'sem-fumo'`) as the second argument.
- **Verified**: `1 · nuevo usuario…`, `4 y 5 · lecciones…`, `6 · registrar cigarrillo…` and the concurrent-request test pass again.

## 2026-10-16 — Fix `PUT /api/app/notifications` missing placeholder (server/routes/app.js)

- **Problem**: the INSERT listed 11 columns (including `weekly_summary`) but the VALUES clause had only nine `$` placeholders, so every preferences update failed with 500 and the `enabled` flag was never persisted. The integration test enabled notifications with `enabled: true` but silently ignored the failed request, then `runDue()` sent nothing (the daily reminder test failed with `0 !== 1`).
- **Fix**: added the missing `$10` placeholder (`weekly_summary`).
- **Verified**: notifications test passes, including daily deduplication and the cron authentication checks.

## 2026-10-16 — Rewrite `server/services/notifications.js` to its intended content

- The working-tree version of this file contained debug leftovers (duplicated SQL fragments) that made `dueRecipients` fail. The file was restored to the intended implementation, keeping the already-reviewed per-program scoping of the "exercises" query (`g.program_slug = $2`). All notification tests pass.

## 2026-10-16 — Restore server test suite to green

- Fixed invalid quiz answers in `test/flow.test.js` (`q_anios` and `q_intentos` are single-type questions, not arrays).
- Kept the multiprograma access-control tests (access per program, independence of subscriptions).
- Full suite: 31 tests, 0 failures.

## Earlier cycles (summary of the multiprograma work, kept for history)

- Per-program routing and entitlement service (`ProgramEntitlementService`), introduced after the "uncommitted diff" baseline.
- Program-scoped data access: goals, progress, notifications preferences, daily goals, journey state, breathing counts.
- Per-program personalized plans (`buildPersonalPlan` receives `program`).
- Five-program catalog with commercial states (`public/journey_programs`), drafts pending clinical review.
- Native billing migrations (StoreKit / Google Play / RevenueCat) and `store-sync` service added; wired on 2026-10-19 (below).
- Playwright E2E (`e2e/`) adapted to the multiprograma flow.

## 2026-10-19 — Native billing wired end to end + per-program funnel fixes + landing honesty fixes

- **Native billing**: added `server/services/apple-jws.js` (StoreKit 2 JWS verification: ES256, X.509 chain to the pinned Apple Root CA - G3 fingerprint `63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179`, bundle id + environment checks), `server/services/google-play.js` (real `androidpublisher` verification; fail-closed `503` without credentials), `server/routes/store.js` (`/api/store/transactions`, `/api/store/notifications/apple`, `/api/store/restore`, `/api/store/products`), wired in `server/factory.js` + `server/app.js`, config sections in `server/config.js`. New migration `20261018100000_store_transactions.sql` (+ rollback) for the service-only audit table.
- **Tests**: new `test/store-sync.test.js` (9 tests: JWS accept/reject incl. wrong root/bundle/alg, grant+idempotency+revocation, restore, cross-program isolation, routes with Google `503` and Apple refund notification). Suite isolation: rate-limit reset per suite (same pattern as `flow.test.js`). Full suite **40/40**.
- **Per-program funnel (frontend)**: `test.js` reads `/quiz/<slug>`/`?program=`, `resultados.js` renders per-program results, `paywall.js`/`planes.js`/`acceso.js` thread `program` into `/api/plans?program=` and `POST /api/checkout` — a user on any program's quiz now lands in that program's checkout.
- **Landing fixes**: removed the fake App Store/Google Play badges (`href="#"`) and replaced with an honest "web app" badge → `/test`; footer links point to real pages (`/terminos`, `/privacidad`) or are removed (no fake contact/careers); SW registration added to the landing; `sw.js` offline fallback fixed (searches all caches, so the precached `offline.html` is actually served — previously Chrome's dinosaur page appeared for unvisited pages); `offline.html` retry goes to `/programas?catalogo` (program-neutral); `vercel.json` mirrors the per-route CSP for `/` and `/index.html`; removed orphan `public/js/pages/landing.js`; fixed typo in `resultados.js`.
- **E2E**: `e2e/app.spec.js` + `e2e/pwa.spec.js` — **20/20 passing** with system Chrome (`--trace off`; Playwright trace-artifact I/O was flaky on this machine, see `docs/ALENTO_E2E_REPORT.md`).
- **Embudo (Stripe funnel) e2e drive — found 2 real bugs, both fixed**:
  1. `public/js/pages/resultados.js` used `xyChart` without importing it — the results page crashed (`ReferenceError`, permanent skeletons) right after the quiz. Paying users never saw their results. Fixed (added to the `../charts.js` import).
  2. `e2e/helpers.completeQuiz` was desynchronized with the fresh quiz copy: clicked «Reducir poco a poco hasta dejarlo» (the label became «…llegar a cero») and waited for `'**/resultados'` (the URL now carries `?program=…`, so the glob never matched). Rewritten step-synchronous (waits each step's `<h1>` and matches results by regex). Quiz UI auto-advance race also documented (single-choice options repeat across consecutive screens; the helper now waits for each next step title).

## 2026-10-19 — Continuação: funil Stripe REAL aprovado + guarda comercial + honestidade da LP

- **Root cause of the historical funnel time-outs found and fixed**: `GET /api/plans` returned only `{ plans }` (no `paymentsEnabled`), so `renderPaywall` (`public/js/paywall.js`) always disabled the primary CTA «Comenzar mi transformación» — the funnel stalled at the results page (both e2e tests burned 15-min test timeouts). Fix: the route now returns `{ plans, paymentsEnabled: billing.enabled }`. First real run after the fix: **2/2 passing in 1.4 min** (full funnel 51 s; rejected card 25 s).
- **Commercial guard verified end to end**: `POST /api/checkout` enforces `programs.assertPurchasable()` — a signed-in user trying to buy `alcohol` (commercial_status `coming_soon`) receives `409 {"code":"PROGRAM_NOT_AVAILABLE"}` (probed against the real server + real Supabase). Also added `purchasable` to `/api/plans` response and `renderPaywall` now disables the CTA and shows an honest notice for non-`active` programs (results stay saved). Stripe TEST lookup keys exist for all 4 coming-soon programs (`alento_{alcohol,azucar,ansiedad,sueno}_{semanal,mensual,trimestral}` — 12/12 verified), so without the guard they would have been sellable.
- **Funnel evidence (Stripe TEST mode)**: checkout.session.completed `evt_1USHQuLS56tm1bToM3PTgyKd`, invoice.paid `evt_1USHQuLS56tm1bToZvjspaeD` (forwarded to `/api/stripe/webhook` → HTTP 200), customer.subscription.created `evt_1USHQuLS56tm1bToMxjGwR`. Full funnel test: quiz → results → plan mensual → account → checkout.stripe.com (card `4242…`) → bienvenida → instalación → configuración → dashboard → `ALREADY_SUBSCRIBED` on re-checkout → billing.stripe.com portal. Rejected card `4000…0002`: display of rejection + `me.access == false`.
- **Verdict runs executed** (same day): `npm test` **54/54** (local Supabase + fake Stripe); first full combined Playwright attempt (app+embudo+pwa) **21/22** — the one failure was a slow-load flake in `app.spec.js` "objetivos…" (dashboard `máximo 6` line not visible within the 15 s expect; test frame took 16.6 s vs 4.6 s typical; it passed solo in 4.6 s; no app assertion involved); clean re-run **22/22 in 3.3 m, exit 0**, with the Stripe TEST listener up (embudo full funnel 37.1 s, rejected card 20.1 s, webhooks forwarded 200). Final evidence adopted (E2E report: `docs/ALENTO_E2E_REPORT.md`; audit verdicts: `docs/ALENTO_FINAL_AUDIT.md`). Stripe listener + temp webhook secret were torn down after the verdict run.
- **LP = new SITE-HOME + truthfulness fixes** (user asked to confirm the landing is the attached SITE-HOME): structure/i18n verified identical (11 sections, key texts equal; only production-only deltas vs the raw attachment: expanded `<head>`, real CTAs, no `href="#"` badges). Removed fabricated content that the attachment still contained: fake press logos (Bloomberg/CBS/Yahoo) → replaced with 4 honest trust chips (`press.f1..f4`); fake testimonials with photos, names and ages (6 `depoimentos` avatars) → replaced by 6 factual journey cards (`t1..t6.topic/q/tag/when`, no identities); invented metrics («150 mil / 9 de 10 / 93 %») → replaced by real product facts (5 programas · 30 lecciones · 1 min respiración); all `tbd` placeholders in FAQ/pricing/support rewritten with verified facts (subscription model, cancellation via Mi suscripción → Stripe portal, data export/delete, PWA install in browsers; no invented iOS versions, store version marked «en preparación»). All 6 languages updated consistently (`public/i18n.js` — 6×12 new keys, `node --check` OK, zero `tbd` remains in markup/texts).
- **Unit tests**: `test/results.test.js` extended **5 → 19** tests — covers `computeAlcoholResult` (AUDIT score/levels, clinical safety notice with physical-dependence signs, objective strategies, 3-trigger cap), `computeAzucarResult` (dependence matrix, 12-week spike projection), `computeAnsiedadResult` (diario→alta, manifestation/trigger label maps), `computeSuenoResult` (hours/debt/recovered rest), plus universal dispatch. Full node suite **54/54** (previous baseline 40 stable).
- **Parallel-session note**: another agent session was active in this repo around 10:45 (its probe `e2e/_probe-embudo.spec.js`, written «delete after use», failed on its own Continuar assumption after a single-choice step — the quiz auto-advances: `renderSingle` calls `answerAndNext` on click). Untouched/preserved per preservation rule; its ENOENT artefact flake re-appeared in one of our runs while both sessions ran simultaneously. IAM note: no destructive action taken on that session's files.

## 2026-10-19 — branding ALENTO, iOS assets, OG image + metadata + SITE-HOME LP certificado

- **Propagação iOS**: ícone oficial `public/assets/brand/ios-1024.png` copiado para `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (substituindo o ícone padrão do Capacitor). Splashscreen oficial 2732×2732 gerado via Playwright a partir do HTML de marca e copiado para `ios/App/App/Assets.xcassets/Splash.imageset/` (3 variantes @1x/@2x/@3x).
- **Imagem OG/Twitter/WhatsApp**: `public/assets/brand/og-alento.png` (1200×630, bg #1E3FFF, logo branco + tagline "Respira de novo." + 5 ícones de programas em cores), gerado por Playwright. Meta tags adicionadas a `public/index.html`: `og:image`, `og:image:width/height/alt`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`. JSON-LD Organization com logo e slogan adicionado ao `<head>`.
- **Favicon/apple-touch**: favicon agora usa `/assets/brand/alento-icone-app.svg` (SVG); `apple-touch-icon` aponta para `/assets/brand/ios-180.png`. Favicon PNG fallback adicionado ao `<head>`: `/assets/icons/favicon-32.png`.
- **JSON-LD Organization**: bloco `<script type="application/ld+json">` com Organization + logo + slogan inserido no `<head>` de `public/index.html`.
- **Atualização de QUIZ_URL em site.js**: `QUIZ_URL` alterado de `'/test'` para `'/quiz'` (compatível com Vercel + servidor local); rotas comerciais /quiz/<slug> confirmadas como ponto de entrada do funil; QUIZ_PROGRAM map mantido (cigarro→sem-fumo, alcool→alcohol, acucar→azucar, ansiedade→ansiedad, sono→sueno).
- **Correção de headline "Respira de novo."**: verificada via Playwright contra o servidor local: hero usa dois <span> dentro de <h1> com `data-i18n="hero.l1"` = "Respira" e `data-i18n="hero.l2"` = "de novo."; renderização exibe "Respira de novo." (com espaço entre os spans) — gramaticalmente correto em espanhol. Não houve mudança visual.
