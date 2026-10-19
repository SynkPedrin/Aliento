# Production Risks

Operational risks for the Alento system. Local development uses the fake Stripe and the local Supabase; production behavior depends on the remote Supabase project, the real Stripe account and the deployed Vercel/server entry. Nothing here authorizes any action — approval is required for production-affecting changes.

## Billing and subscriptions (high impact)

- **Real Stripe account is live.** All code paths fixed in this cycle were verified only with the fake Stripe and the local database. Any production deployment of these fixes must be reviewed before it is active.
- **Native-billing endpoints are wired but inert until configured.** `server/routes/store.js` + `store-sync.js` are live in the app; without `APPLE_BUNDLE_ID` (and product ids) / `GOOGLE_PLAY_PACKAGE_NAME` + service-account JSON they answer `503`. When enabling them: the Apple Root CA - G3 fingerprint is **pinned** in `server/services/apple-jws.js` (`63343ABF…9179`) — if Apple rotates the root, verification must be updated deliberately. `APPLE_APP_STORE_ENV` must match the build's StoreKit environment (`sandbox` for TestFlight, `production` for App Store). Google verification requires a service-account with Android Publisher access — a misconfigured account must fail closed (`503`/`4xx`), never grant access.
- **App Store Server Notifications V2** (`POST /api/store/notifications/apple`) also verifies JWS signatures. The notifications URL must be registered in App Store Connect and is public: keep rate limiting and never trust unverified payloads.
- **Webhook handlers depend on event ordering.** `billing.js` deliberately re-reads the current subscription state on every event, which is resilient but makes manual inspection harder. Keep the "reconcile" script (`npm run billing:reconcile`) as the safety net for orphaned subscriptions.
- **Access grants (cortesía)**: grants are stored with `expires_at` and must be revoked explicitly (`npm run admin:grant -- … --revoke`). An expired grant must never keep access — verify `ProgramEntitlementService` filters `expires_at` (it does; do not regress).

## Data isolation and privacy (high impact)

- **RLS is the last line of defense** for user data. Every query that touches personal data must run through `db.asUser(...)`; system queries (`db.service`) intentionally bypass RLS and are only used for admin/webhook/cron jobs. A regression that switches a personal query to `service` would expose other users' data.
- **33+ protected tables**: any new personal table must add RLS policies in the same migration. Verify before merging a migration that adds a table without policies.
- **Export and account deletion**: `/api/account/export` and account deletion intentionally return other users' data impossible. Keep the guard that refuses deletion while a subscription is active.
- **Support messages** are stored per user and the guide is pre-written; support conversations are personal data like any other.

## Notifications

- **Web Push keys (VAPID)** are shared per deployment. Rotating them affects every user's subscriptions; coordinate rotation with the maintainer.
- **Push subscription ownership**: a subscription endpoint is transferred only if the requesting user has the same `p256dh`/`auth` keys — keep that check; it prevents hijacking devices between accounts.
- **Local time computation**: reminder times are stored per user timezone and computed in SQL with `now() at time zone`. A timezone database change in the hosting provider could shift delivery windows; monitor first deliveries after any Supabase provider change.

## Operations and deployment

- **Rate limiting is in-memory per server instance** (`sharedRateLimiter` in `server/auth.js`). With more than one server instance, limits are per instance and the in-memory user locks (`billing.js`) do not serialize across instances. The database still enforces single open checkout per user/program.
- **Cron endpoints** require a secret (`CRON_SECRET`); the notification cron is unauthenticated when the secret is missing — ensure the production environment always defines it.
- **Local dev server** (`:3100`) runs with Stripe in test mode; production runs through the Vercel entry (`api/`). Verify the deployed environment has the updated code and migrations applied.
- **Migrations are destructive-free but not revertible**: `supabase/migrations/` only adds/alter; `supabase/rollback/` contains the matching `.down.sql` files for some migrations. Review any migration that drops data before running it on production.
- **Remote Supabase project** was only ever read in this cycle. Any production-affecting change (new migrations, column changes, admin grants) needs explicit user approval before execution.

## Added 2026-10-19 (funnel + catalog cycle)

- **Coming-soon programs were technically sellable at the paywall** (Stripe TEST lookup keys exist for the 4 drafts — 12/12 verified), although the catalog only showed «Próximamente». Mitigated today: `/api/checkout` enforces `assertPurchasable` (409 `PROGRAM_NOT_AVAILABLE`, probed live), `/api/plans` returns `purchasable`, and the paywall disables the CTA with an honest notice. A draft program CANNOT complete a paid checkout anymore; admin `commercial_status = active` remains the single unlock.
- **Funnel root cause fixed**: `/api/plans` omitted `paymentsEnabled` → results-page CTA permanently disabled (the historical full-funnel "time-out"). Now fixed and verified with 2/2 real-Stripe E2E passes.
- **Landing truthfulness**: the attached SITE-HOME design contained fabricated press logos, testimonials (photos/names/ages) and inflated metrics. Replaced with fact-checked content in the 6 languages; no `tbd` placeholders remain in texts. Any FUTURE marketing claims must be fact-checked the same way before publishing.
- **Parallel agent sessions**: while this cycle ran, ANOTHER agent session was see operating in the same working tree (`e2e/_probe-embudo.spec.js`, `/tmp/probe*.log`). Risk: simultaneous edits/diagnostic runs of the same repo + shared Playwright artefact dirs (ENOENT flakes). Coordination needed: define exactly ONE active session per repo.
- **Stripe TEST lookup keys** (`alento_*`, 12) and legacy (`folego_*`) all exist with recurring prices; the plan `anual` remains intentionally unconfigured (server logs a benign warning).

## Added 2026-10-19 (branding + LP + iOS release)

- **Remote Supabase branding config**: transactional email templates (Supabase Auth) and Push VAPID keys are configured remotely; no local asset changes affect them. OG image + iOS splash are front-end only; no backend risk.
- **Favicon / og-image URL permanence**: all new brand assets use `/assets/brand/` canonical path (deduplicated from `/assets/logos/`); risk of drift minimized but if `/assets/brand/` is deleted or restructured, icons and OG tags would break — treat as a deploy‑blocking check. Cache‑busting via filename hash not used (assets versioned by content-hash at build time).
- **App Store / Play Store metadata**: new logo ALENTO + OG image + updated metadata prepared in `docs/ALENTO_APP_STORE_CHECKLIST.md`; no publishing performed (external credentials required). Risk: if store review flags the new brand assets as "non-compliant" or "misleading", rollback would mean reverting favicon/og:image/json-ld to prior versions — keep prior assets available until store approval.
- **Vercel production URL**: latest verified production deployment `aliento-j3j98pb3a-pgvenegeroles09-9629s-projects.vercel.app` (READY, 3d old). New branding assets deployed will be visible at that URL after next Vercel redeploy (triggered by commit or manual `vercel redeploy`). No auto‑deploy flag — changes must be committed + pushed to trigger rebuild.
- **Splash / icon dimensions**: iOS splash 2732×2732 and appicon 1024×1024 generated from official `public/assets/brand/` SVG renders; any discrepancy between designed size and Capacitor/iOS expected size could cause asset rejection — verified dimensions match (1024px and 2732px confirmed via sips).
