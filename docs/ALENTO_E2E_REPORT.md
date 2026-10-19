# Alento — E2E Report (verified 2026-10-19)

Environment: local server (`:3100`, `.env`), local Supabase (Docker), **system Chrome** via Playwright `channel: 'chrome'`.

## Runs executed

| Spec | Result | Notes |
|---|---|---|
| `e2e/app.spec.js` | ✅ 4/4 | jornada, registros, objetivos, aislamiento entre usuarios (escritorio + móvil cuando aplica) |
| `e2e/pwa.spec.js` | ✅ 16/16 | manifests/SW instalabilidad, `Sin conexión` offline fallback, responsividad 360→768 (×2 proyectos), tutorial iPhone |
| `e2e/embudo.spec.js` | ✅ 2/2 | cuestionario → resultados → plan → cuenta → pago real Stripe TEST → bienvenida → panel; + tarjeta rechazada |
| **Combined (final verdict run)** | ✅ **22/22** | `npx playwright test e2e/app.spec.js e2e/pwa.spec.js e2e/embudo.spec.js --trace off` — **3.3m, exit 0**, 2026-10-19 |

## Fixes made in this cycle discovered BY e2e

1. **Offline page never appeared for unvisited routes** — `sw.js` navigation fallback looked for `offline.html` only in the PAGES cache, while `offline.html` is precached into the STATIC cache; Chrome showed its own dinosaur page. Fixed (fallback searches all caches) and covered by the previously-failing test.
2. **Landing didn't register the service worker** — fresh landing visitors could never reach offline mode. `site.js` now registers `/sw.js` on load (app pages already did via `ui.js`).
3. *(verified non-issue)* Responsividad flake: full-suite runs intermittently failed one width with Playwright artifact ENOENT errors (`trace.zip` copy races); with `--trace off` the same specs pass 8/8. Layout was proven clean with a diagnostic run (per-page `scrollWidth - innerWidth = 0`, 390px móvil).

## Stripe funnel (`e2e/embudo.spec.js`) — ✅ COMPLETED (2026-10-19)

Requirements beyond the other specs: real Stripe (`STRIPE_SECRET_KEY` in `.env`, **test mode**) + webhook listener. Final state:

- **2/2 passing standalone** (full funnel 51 s; rejected card 25–35 s) after the `/api/plans paymentsEnabled` fix (root cause of all historical stalls), and **again inside the final combined 22/22 run** (full funnel 37.1 s; rejected card 20.1 s) — listener up, webhook events forwarded to `/api/stripe/webhook` → 200 in every case.
- Listener used: `.tools/stripe listen --api-key "$STRIPE_SECRET_KEY" --events "...10 event types..." --forward-to localhost:3100/api/stripe/webhook` (CLI v1.53 needs explicit `--events`), forwarding secret captured to a private temp file and injected into the server env (`STRIPE_WEBHOOK_SECRET`); torn down after the verdict run.
- The underlying flow (quiz → resultados → cuenta → Checkout test-mode `4242…` → webhook → bienvenida) is the same flow already covered green by `test/flow.test.js` against the **fake Stripe** (faster, deterministic) — e2e/embudo is a duplicate safety net for the real Checkout UI, not new product logic.
- How to run it unpaused (documented for the next session):
  ```bash
  set -a; source .env; set +a
  .tools/stripe listen --api-key "$STRIPE_SECRET_KEY" \
    --events "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,charge.refunded" \
    --forward-to localhost:3100/api/stripe/webhook &   # capture whsec_… from output
  STRIPE_WEBHOOK_SECRET=<whsec> node --env-file-if-exists=.env server/index.js &
  npx playwright test e2e/embudo.spec.js --trace off
  ```
  (Note: `.tools/stripe` CLI v1.53 requires explicit `--events`; README's plain `stripe listen` line needs this.)

## Known runner flakiness (environment, not app)

- Playwright trace/screenshot artifact I/O intermittently fails with ENOENT inside `test-results/.playwright-artifacts-*` (same filesystem flakiness that corrupted a migration file earlier in this cycle). Workaround used: `--trace off`. Not an app defect; no assertion in the failing runs referenced app behavior.
- 2026-10-19: the same ENOENT family hit 4 tests when `app`+`pwa`+embudo suites ran back-to-back with a concurrent second agent session; every affected test passed in isolation and in clean re-runs (responsividad 8/8; `objetivos…TEST 14` pass 11.5 s solo). Rule adopted: one session per repo, clean `test-results/` before verdict runs.
- 2026-10-19 (verdict-run evidence): the FIRST full combined attempt ended **21/22** — one slow-load flake in `app.spec.js` "objetivos…" (dashboard's `máximo 6` line didn't appear within 15 s; the run's own steps took 16.6 s vs 4.6 s typical, i.e. machine slowness during the run, no app assertion involved). The test then passed solo in **4.6 s**, and the clean full combined re-run passed **22/22 in 3.3 m**. The final verdict uses the clean re-run.

## Coverage gaps still open

- ~~`e2e/embudo.spec.js` completion (above).~~ **CLOSED 2026-10-19: 2/2 passing (full funnel + rejected card) after the `/api/plans paymentsEnabled` fix — root cause of all the historical 15-minute stalls.** Webhook cycle verified: `checkout.session.completed` `evt_1USHQuLS56tm1bToM3PTgyKd`, `invoice.paid` `evt_1USHQuLS56tm1bToZvjspaeD` → 200, `customer.subscription.created` `evt_1USHQuLS56tm1bToMxjGwR`; `ALREADY_SUBSCRIBED` re-checkout guard; billing portal on `billing.stripe.com`.
- No e2e for the 4 draft programs' funnels beyond unit/integration seams (their checkout is intentionally blocked server-side until clinical review; API-level block 409 `PROGRAM_NOT_AVAILABLE` probed live).
