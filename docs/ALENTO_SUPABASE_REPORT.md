# Alento — Supabase Report (verified 2026-10-19)

All checks ran against the **local** Supabase project (Docker, `npx supabase start`, API `127.0.0.1:55521`, DB `127.0.0.1:55522`). The remote project (`gbryzdyawsiaezqysexq`) was **not touched**. No destructive migration was executed anywhere.

## Migration state (local)

13 migrations applied, no pending, no failed:

| Version | Name | Purpose |
|---|---|---|
| 20261014120000 | `aliento_core` | core schema (users/profiles/assessments/journeys…) |
| 20261014121000 | `daily_checkins` | daily check-in records |
| 20261014122000 | `profiles_onboarding` | onboarding state |
| 20261014123000 | `checkout_assessment_fk` | checkout↔assessment linkage |
| 20261014124000 | `push_notifications` | push subscriptions + rate limit plumbing |
| 20261014125000 | `health_consent` | health consent gate |
| 20261014126000 | `access_grants` | courtesy access grants with expiry |
| 20261015090000 | `hardening` | security hardening |
| 20261015091000 | `clinical_review` | draft/published workflow |
| 20261015100000 | `multiprograma` | five-program schema (program-scoped data) |
| 20261016120000 | `native_billing_and_entitlements` | store purchase grants / entitlements |
| **20261018100000** | **`store_transactions`** | **new this cycle: native-purchase audit table** |

## New table: `public.store_transactions` (20261018100000)

Purpose: audit trail for native purchases (StoreKit 2 / Google Play) received by `/api/store/transactions` and `/api/store/notifications/apple`.

Columns: `id uuid`, `provider text`, `transaction_id text`, `original_transaction_id text`, `bundle_id text`, `product_id text`, `program_slug text`, `plan text`, `environment text`, `user_id uuid`, `payload jsonb`, `status text`, `error text`, `received_at timestamptz`, `processed_at timestamptz`, `created_at timestamptz`.

Verified live in the local database:

- `rowsecurity = true`
- `pg_policies` → **zero policies** ⇒ deny-all for client roles (`anon`/`authenticated`); only the service role bypasses RLS. The table is write-audit only; no user-facing endpoint reads it.
- Applied via `npx supabase migration up --local` (no destructive statement; matching rollback file `supabase/rollback/20261018100000_store_transactions.down.sql`).

## RLS spot-checks (from earlier cycles, unchanged)

- All user-scoped tables use `authenticated`-role policies filtered by `user_id`; personal queries run through `db.asUser` (RLS enforced).
- `journey_lessons` / `journey_chapters` / `journey_programs`: draft content (`published = false`) invisible to clients; drafts are admin-only.
- Foreign keys intact; no destructive migrations exist in `supabase/migrations/`.

## Local-stack health

`npx supabase status`: API/auth/REST/Kong/db/Inbucket containers up (needed set for tests). Docker Desktop had a hung CLI window earlier in this cycle (do **not** kill Docker Desktop — other projects live there); it recovered on its own.

## Remote project

## 2026-10-19 — estado local verificado

- **13/13 migrações aplicadas localmente** (últimas: `20261016120000_native_billing_and_entitlements`, `20261018100000_store_transactions`, `20261019100000_alento_canonical_store_products` — data-only, com rollback em `supabase/rollback/`). Nenhuma migração destructive; o projeto Remoto continua intocado.
- Catálogo vivo verificado por SQL: `sem-fumo` = `active`, `alcohol/azucar/ansiedad/sueno` = `coming_soon` (3 dos 4 publicados como teaser; `ansiedad` ainda `published=false`). Venda bloqueada na camada de API por `assertPurchasable`.
- Integrações E2E da suíte usam este Supabase local com contas reais criadas por `scripts/create-comp-account.js` e checkout REAL de teste do Stripe (eventos verificáveis no relatório de billing).

## Never connected/written this cycle. Any remote migration must be explicitly approved (invariant #4 in `docs/AI_CONTEXT.md`).

## Integrity incident (resolved)

`supabase/migrations/20261014120000_aliento_core.sql` was found corrupted on disk (dangling directory entry — same filesystem flakiness later observed in Playwright trace artifacts). It was restored byte-for-byte from the git index blob (`c12c7ee5…`, 26,180 bytes) and verified. A duplicate file with an alternate spelling of the same name was created during recovery and has been removed; only the git-tracked spelling (`aliento_core`) remains.
