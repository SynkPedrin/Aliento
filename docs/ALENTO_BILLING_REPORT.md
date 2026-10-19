# Alento — Billing Report (verified 2026-10-19)

Status legend: ✅ verified with evidence · 🟡 prepared/pending external dependency · ⛔ not done (by design).

## Stripe web billing (Sem Fumo live; other programs `coming_soon`)

- **Checkout** ✅ — `POST /api/checkout` creates real Checkout Sessions (test mode locally). `program` and `exitOffer` are threaded from every funnel page; `assertPurchasable` blocks unknown/inactive programs, so only Sem Fumo can actually be purchased. When Stripe price env vars are missing, plans render as *unavailable* — the UI never fakes a purchasable plan.
- **Webhooks** ✅ — signature-verified (`stripe listen` locally; see E2E report for the live listener run), event idempotency + ordering handled in `server/billing.js` (re-reads remote subscription state on every event: resilient to out-of-order delivery).
- **Per-program independence** ✅ — tested (`test/flow.test.js`): subscribing to one program never grants or cancels another; cancellation/refund/dispute revoke only the affected program.
- **Reconciliation** ✅ — `npm run billing:reconcile` re-syncs from Stripe by verifiable identifiers (safety net for orphaned/missed webhooks).
- **Real money** ✅ not touched — no real charges, no real subscription modified; production Stripe keys were never used for writes.
- **Price env vars**: per-program `STRIPE_PRICE_*` documented in `.env.example`; `stripe:setup` creates lookup keys. Missing refs ⇒ plan shows unavailable (fail-closed, no fallback to another program's price).

## 2026-10-19 — funnel cycle addenda (billing)

- **Root cause of the historical funnel stalls fixed**: `GET /api/plans` omitted `paymentsEnabled` → `renderPaywall` disabled the CTA forever (every run died waiting for a button that could never appear). Route now returns `{ plans, paymentsEnabled: billing.enabled, purchasable }`.
- **First real run after the fix**: `e2e/embudo.spec.js` 2/2 in 1.4 min (full funnel 51 s incl. checkout.stripe.com + bienvenida + dashboard + Stripe billing portal; declined card 4242/4000 tests in 25 s). Re-runs stable (1.1 min).
- **Webhook evidence (Stripe TEST)**: `checkout.session.completed` `evt_1USHQuLS56tm1bToM3PTgyKd`, `invoice.paid` `evt_1USHQuLS56tm1bToZvjspaeD`, `customer.subscription.created` `evt_1USHQuLS56tm1bToMxjGwR` — all forwarded to `POST /api/stripe/webhook` with HTTP 200 via local `stripe listen`.
- **Guard double-checked**: commercial gating is now enforced in TWO layers: `POST /api/checkout` → `programs.assertPurchasable` (409 `PROGRAM_NOT_AVAILABLE` — probed live with a signed-in real account) and `/api/plans` → `purchasable:false` for non-`active` programs, with the paywall showing an honest disabled state instead of a purchasable plan.
- **Stripe TEST price inventory verified**: 12/12 lookup keys `alento_{alcohol,azucar,ansiedad,sueno}_{semanal,mensual,trimestral}` exist with recurring prices; `folego_*` for sem-fumo; plan `anual` intentionally unconfigured (benign warning).

## Native billing — StoreKit 2 (Apple) ✅ code+tests, 🟡 needs Apple credentials

Flow: app → `POST /api/store/transactions` (signed JWS from `Transaction.unifiedReceipt`/`AppTransaction`) → `server/services/apple-jws.js`:
1. Verifies **ES256** signature (only `ES256` accepted).
2. Rebuilds the X.509 chain from `x5c` and validates it to a **pinned root**: Apple Root CA - G3, SHA-256 fingerprint `63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179` (fetched from `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer`).
3. Checks `bundleId` equals `APPLE_BUNDLE_ID` and `environment` matches `APPLE_APP_STORE_ENV` (`sandbox`/`production`).
4. Only then `storeSync.applyStoreTransaction(...)` grants/extends the per-program entitlement (same activation path as Stripe) and writes a `store_transactions` audit row.

Also implemented:

- `POST /api/store/notifications/apple` — App Store Server Notifications V2 (each `payload` is itself a signed JWS; same verification; refund/`EXPIRED`/`GRACE_PERIOD_EXPIRED` revoke access).
- `GET /api/store/restore` — returns the caller's active native grants (per program).
- `GET /api/store/products` — public product-id map per program/plan (env-overridable `APPLE_PRODUCT_*`).
- Fail-closed: without `APPLE_BUNDLE_ID` everything answers `503` — **no entitlement is ever granted without cryptographic verification** (tested).

Tested: `test/store-sync.test.js` — valid chain accepted (OpenSSL-forged chain to a test root passed via `rootCaPem`), altered payload rejected, foreign root rejected (the real Apple root is *not* trusted in tests and the test root is *not* trusted when the verifier is pinned to Apple's), wrong bundle/algorithm rejected, grant idempotent + revocation propagates, restore lists only active grants, cross-program isolation holds, refund notification flow.

## Native billing — Google Play Billing ✅ code+tests, 🟡 needs service account

- `server/services/google-play.js` — service-account JWT → Google Auth token → `androidpublisher.purchases.subscriptionsv2.get` real API call. Accepted states: `SUBSCRIPTION_STATE_ACTIVE`, `SUBSCRIPTION_STATE_IN_GRACE_PERIOD`.
- Product ids `aliento_<program>_<plan>` by default, env-overridable `GOOGLE_PRODUCT_*`; package name from `GOOGLE_PLAY_PACKAGE_NAME`.
- Fail-closed `503` without credentials (tested: no access invented, no state mutated).

## Env contract (`.env.example` updated)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_EXIT_COUPON`, per-program `STRIPE_PRICE_*`; `APPLE_BUNDLE_ID`, `APPLE_APP_STORE_ENV`, `APPLE_PRODUCT_*`; `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PRODUCT_*`. Native endpoints stay inert (`503`) until each set is configured — documented in `docs/ALENTO_APP_STORE_CHECKLIST.md`.

## Evidence

- `npm test` = **40/40** (31 flow + 9 store-sync) on local Supabase + fake Stripe, 2026-10-19.
- RLS on `store_transactions`: enabled, zero client policies (see `docs/ALENTO_SUPABASE_REPORT.md`).
- Web Stripe funnel exercised through real Stripe Checkout **test mode** in `e2e/embudo.spec.js` (see `docs/ALENTO_E2E_REPORT.md` for the recorded run status).
