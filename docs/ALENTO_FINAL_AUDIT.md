# Alento — Final Audit (V4.0 master release preparation, verified 2026-10-19)

Per-area verdicts. Evidence: `npm test` **54/54**, Playwright **full combined run 22/22** (`app` 4 + `embudo` 2 + `pwa` 16 — real Stripe TEST in the funnel tests, 3.3 m, exit 0), local Supabase 13/13 migrations, details in the companion reports listed at the bottom.

## Verdict matrix

| # | Area | Verdict | Evidence / notes |
|---|---|---|---|
| 1 | Integration suite (`npm test`) | ✅ PASS | **54/54** (flow + store-sync + results engines 5/5 programs after extending results tests 5→19), run 2026-10-19 |
| 2 | Playwright E2E (`app`+`embudo`+`pwa`) | ✅ PASS | **final combined run 22/22** (escritorio+móvil, `--trace off`, real Stripe TEST mode in `embudo`) on 2026-10-19; first attempt was 21/22 with 1 slow-load flake (passed solo 4.6 s and in the clean re-run); ENOENT artifact flake documented with `--trace off` workaround |
| 3 | Stripe funnel e2e (`embudo`) | ✅ PASS (TEST mode) | **2/2 (1.1–1.4 min)** after fixing root cause (`/api/plans` was missing `paymentsEnabled` → CTA permanently disabled); real Sessão/portal paths + rejected-card path; webhook events `checkout.session.completed`/`invoice.paid`/`customer.subscription.created` forwarded 200 |
| 4 | Per-program funnels (quiz→results→paywall→checkout) | ✅ PASS | Program threaded through every page; sem-fumo legacy path preserved; **commercial guard probed live: 409 `PROGRAM_NOT_AVAILABLE` for `coming_soon`**; `/api/plans` now exposes `purchasable` and the paywall disables the CTA with an honest notice |
| 5 | Multiprogram catalog & journeys | ✅ PASS | 5 programs; drafts invisible (RLS) + `coming_soon`; seeds never delete progress |
| 6 | Access control (per-program entitlements) | ✅ PASS | `requireProgram` + `ProgramEntitlementService`; cross-program isolation both in flow tests and store-sync tests |
| 7 | Stripe billing | ✅ PASS (test-mode scope) | Checkout/webhooks/idempotency/refunds/reconciliation; **no real charges or subscription changes** |
| 8 | Native billing — Apple StoreKit 2 | ✅ PASS (code+tests) / 🟡 needs credentials | JWS ES256 + pinned Apple Root CA-G3 chain + bundle/env; notifications V2; restore; audit table; endpoints 503 until configured |
| 9 | Native billing — Google Play | ✅ PASS (code+tests) / 🟡 needs service account | real `androidpublisher` verification; fail-closed 503 |
| 10 | Supabase schema/RLS | ✅ PASS | 13 migrations applied locally; new `store_transactions` service-only; no destructive migration; remote project untouched |
| 11 | Security posture | ✅ PASS | per-route CSP (Express + `vercel.json`), rate limits, cron secret, push allowlist, webhook signatures, no secrets committed |
| 12 | PWA (manifest/SW/offline) | ✅ PASS | installability green; offline fallback bug fixed (SW cache lookup) + landing SW registration |
| 13 | Landing honesty (no fake badges/links) | ✅ PASS | store badges removed (web-app CTA instead), all footer links resolve, dead `landing.js` removed; **2026-10-19: attached SITE-HOME confirmed as LP** (structure + i18n keys identical; only production deltas: real `<head>`, real CTAs). Fabricated press logos/testimonials/metrics removed in 6 languages; no `tbd` placeholders left |
| 14 | Spanish customer-facing copy | ✅ PASS | quiz/results/paywall/offline/landing remain Spanish; FAQ pricing/cancellation/data/device answers rewritten with verified product facts (no invented store versions; store version marked «en preparación») |
| 15 | i18n 6 languages | ✅ PASS | 12 new keys × 6 languages for the honest press/stories facts + rewritten FAQ; `node --check` OK |
| 16 | iOS build (Capacitor) | ✅ PASS (project validated) / 🟡 store needs credentials | **Capacitor 8.5.3 installed (dev-only); `cap add ios` with SPM (no CocoaPods); `xcodebuild -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO` → `BUILD SUCCEEDED`** (bundle `app.alento`). Device signing/TestFlight/store submit needs Apple credentials (by design, not touched) |
| 17 | App Store/Play metadata & publishing | ⛔ BLOCKED (external, by design) | nothing published; checklist written |
| 18 | Clinical review of programs 2–5 | ⛔ BLOCKED (external) | the blocker for publishing/commercializing drafts; code fully ready; **unit tests for all 5 engines now exist** |
| 19 | Production deploy | ⛔ NOT DONE (by design) | requires explicit authorization; all verification local |

## Honesty checks (V4.0 mandate)

- No fake stats/testimonials/medical claims introduced; result numbers labeled «Estimación»/«Objetivo del plan»; alcohol safety notice present.
- No dead buttons on the landing anymore (badges/links fixed); no mock pretending to be a store listing; Apple Pay (frontend wallet) not conflated with StoreKit (IAP verification).
- Draft programs visibly «coming soon», not purchasable, not published.

## Regression safety for the live Sem Fumo funnel

- Sem Fumo logic in `resultados.js`/`paywall.js`/`test.js` preserved exactly for the no-param/legacy paths; guards fall back to legacy behavior.
- `flow.test.js` covers the whole sem-fumo funnel against real DB + fake Stripe: green 31/31.
- `e2e/app.spec.js` (sem fumo journey) green 4/4 in both viewports.

## Known flaky environment (documented, not app bugs)

- Playwright trace artifact ENOENT mid-run (workaround `--trace off`).
- Docker Desktop CLI hung earlier in the cycle (self-recovered; other user projects share the daemon).
- A migration file was corrupted on disk once (recovered from git index; duplicate removed).

## Scope note

`SITE-HOME/` (repo root) is an earlier design-source folder of the landing (own `index.html`/`site.js`/assets). It is **not served** (the server and Vercel only publish `public/`). It still contains its own pre-release store badges as design placeholders; keep it out of any deployment until its design is adopted or it is archived.

## Companion reports

`docs/ALENTO_PROGRAMS.md` · `docs/ALENTO_CONTENT_REPORT.md` · `docs/ALENTO_BILLING_REPORT.md` · `docs/ALENTO_SUPABASE_REPORT.md` · `docs/ALENTO_SECURITY_REPORT.md` · `docs/ALENTO_E2E_REPORT.md` · `docs/ALENTO_IOS_REPORT.md` · `docs/ALENTO_APP_STORE_CHECKLIST.md` · `docs/ALENTO_PRODUCTION_RELEASE.md`
