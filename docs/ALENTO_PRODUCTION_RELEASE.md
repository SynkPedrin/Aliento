# Alento — Production Release (V4.0 master preparation, 2026-10-19)

This document states **what is ready for production**, **what is validated where**, and **exactly what remains before any production rollout**. It does NOT authorize a production deployment — that requires explicit approval (invariants #4/#8 in `docs/AI_CONTEXT.md`).

## 1. What this release contains (all verified in the local stack)

1. **Per-program funnels** for the five programs (quiz/results/paywall/plans/checkout threading) with Sem Fumo behavior preserved for legacy traffic.
2. **Native billing stack**: `/api/store/*` (StoreKit 2 JWS verification with pinned Apple Root CA - G3, Google Play `androidpublisher` verification, notifications V2, restore, product map), entitlement sync through the same activation path as Stripe, `store_transactions` audit table (service-only RLS).
3. **Landing integrity fixes**: honest web-app badge replacing fake store badges, real footer links, service-worker registration on the landing, SW offline-fallback fix, per-route CSP mirrored to `vercel.json`, `offline.html` program-neutral retry.
4. **Frontend test threading fixes** (documented in `docs/ALENTO_PROGRAMS.md`) and honest per-program results copy.

## 2. Validation status (local only)

- `npm test` = **40/40** (local Supabase + fake Stripe).
- Playwright `e2e/app.spec.js` + `e2e/pwa.spec.js` = **20/20** (system Chrome, local server).
- Stripe Checkout funnel e2e (`embudo`): environment prepared and verified reachable; full 15-min run still pending an unattended window (see E2E report §Stripe).
- No production data touched. Remote Supabase only ever read (earlier cycles).

## 3. Required before production rollout (ordered)

1. **Approval** by the project owner (explicit). ⛔ pending
2. **Migration on remote Supabase**: apply `20261018100000_store_transactions.sql` only (review first; rollback file exists). ⛔ pending approval
3. **Env vars** on the deployment (values stay secret):
   - Native billing when enabling it: `APPLE_BUNDLE_ID`, `APPLE_APP_STORE_ENV`, `APPLE_PRODUCT_*`, `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PRODUCT_*` — until then endpoints answer 503 by design.
   - Verify present: `STRIPE_*` (incl. per-program `STRIPE_PRICE_*`), `CRON_SECRET`, `VAPID_*`, `LEGAL_*`.
4. **Deploy** to Vercel/server entry with the new code (commit; `vercel.json` CSP entries included). ⛔ pending approval
5. **Post-deploy verification**: landing font/CSP check on `/`, `/api/config` reachability, one test-mode purchase→webhook round trip in the production Stripe TEST keys, `store_transactions` rejects logging (probe with an invalid JWS).
6. **Monitoring**: billing reconcile cron, `store_transactions` status='rejected' alerting, cron notifications health.

## 4. Explicitly NOT in this release (kept honest)

- No native app build (needs `npx cap add ios` decision + CocoaPods/SPM + Apple account) — backend contract ready and tested.
- No store publishing; the landing therefore advertises the web app, not the stores.
- No publishing of programs 2–5 (clinical review pending; they remain invisible/non-purchasable).
- No changes to real subscriptions, prices, or production flows were made this cycle.

## 5. Rollback strategy

- Migration has a matching `supabase/rollback/20261018100000_store_transactions.down.sql`; code can roll forward-only (remove `/api/store` mount = inert again).
- Landing/CSP changes are plain static/JSON edits, instantly revertible via git.

## 6. Sign-off

Development verification complete on 2026-10-19 by the AI engineering pass (evidence in the companion reports). Production rollout awaits the owner's explicit approval per invariant #4.

## 2026-10-19 status update

- Funnel: **2/2 real-Stripe E2E passing** (root cause fixed, see ALENTO_BILLING_REPORT). Result-level test coverage now includes all 5 result engines (54/54 unit).
- iOS: native project `ios/App/` exists; **`BUILD SUCCEEDED`** for the simulator (SPM, no CocoaPods). Nothing signed/submitted.
- LP: attached SITE-HOME confirmed with honest content in 6 languages.
- Still BLOCKED by design: clinical review of programs 2–5, Apple/Google credentials, remote migrations, any production deploy.
