# Alento — Security Report (verified 2026-10-19)

All observations verified against the local stack (local Supabase + local server). No production system was modified.

## Native purchase verification (new this cycle) — STRONG

- **Apple StoreKit 2**: signed JWS required; only `ES256`; X.509 chain must validate to the pinned Apple Root CA - G3 (fingerprint `63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179`); `bundleId` and `environment` must match config. Failure at any step ⇒ no entitlement, request logged in `store_transactions` with `status='rejected'`.
- **Google Play**: verification always via the real `androidpublisher` API with a service account — the client-supplied purchase token is never trusted on its own; unconfigured ⇒ `503` (fail closed).
- **No entitlement without cryptographic verification** is tested in `test/store-sync.test.js` (wrong root/bundle/alg/payload cases).
- **App Store Server Notifications V2** endpoint re-verifies the JWS of every notification (public URL; signature is the gate).
- `store_transactions` audit table: RLS enabled, **zero** client policies ⇒ service-role only.

## Carried-over posture (re-checked)

- **Sessions**: HttpOnly `SameSite=Lax` cookies (`al_at` access JWT from Supabase Auth, `al_rt` rotating refresh), `/api/me` never leaks other users' data.
- **RLS**: personal data only through `db.asUser`; `db.service` reserved for admin/webhook/cron/store-verification paths. Verified live on `store_transactions` and (earlier cycles) on all 33+ user tables.
- **Rate limits**: real Postgres-backed limiter (`hit_rate_limit`) for register/login/reset (per IP), push test (per user), quiz creation. Tests reset the table per suite for determinism.
- **Cron**: `/api/cron/notifications` requires `Bearer CRON_SECRET` (timing-safe compare); unauthenticated run only when the secret is unset (prod must set it — tracked in PRODUCTION_RISKS).
- **Headers**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/mic/geo off), HSTS in production, CSP **per route** (strict app policy; landing additionally allows Google Fonts styles + inline styles for animations). `vercel.json` mirrors this for the Vercel entry — fixed this cycle (landing previously blocked its own fonts in production).
- **Web Push**: endpoint allowlist (official push services only, anti-SSRF); subscription ownership transfer guarded by `p256dh`/`auth` key match; per-program consent.
- **Stripe**: raw-body signature verification; no event is trusted without a valid signature; reconcile script as safety net.
- **Secrets**: none committed; `.env` gitignored; the Stripe webhook signing secret from the local CLI run was kept out of the repo (ephemeral file in /tmp, now removed with the listener).

## Findings this cycle

1. *(fixed)* `vercel.json` global CSP would break landing fonts/styles in production — now per-route like the Express app.
2. *(fixed)* `sw.js` offline fallback could not serve the precached `offline.html` (cache-name mismatch) — fixed; no data was exposed by this bug (SW never caches `/api/*`, verified by e2e).
3. *(accepted risk, documented)* `sharedRateLimiter` is Postgres-backed but per-key; multi-instance deploys already rely on the DB lock for single-open-checkout — one more reason to keep one server instance or move to distributed limits before scaling.

## 2026-10-19 additions

- **Guard for draft programs verified at API level**: `POST /api/checkout` → 409 `PROGRAM_NOT_AVAILABLE` for `coming_soon` (probed live with a real signed-in account); `/api/plans` now also returns `purchasable:false` and the paywall disables the CTA (fail-closed on top of fail-closed).
- **Root cause of the results-page ever-present disabled CTA fixed**: `/api/plans` now returns `paymentsEnabled`, so the paywall button state reflects server truth instead of `undefined`.
- **LP truthfulness pass**: attached SITE-HOME structure kept; fabricated press logos/testimonials/user-count metrics removed; FAQ pricing/cancellation/data/device answers rewritten against verified server behavior; 6 languages consistent; zero `tbd` placeholders left in user-facing copy.

## Not done (by design, needs approval/secrets)

- Real Apple/Google merchant credentials not configured ⇒ native endpoints intentionally inert.
- No penetration test / external audit performed (out of scope this cycle).
- Remote Supabase untouched; production deploy not executed.
