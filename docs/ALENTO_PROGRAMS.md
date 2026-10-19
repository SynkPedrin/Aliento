# Alento — Programs Report (verified 2026-10-19)

Scope: the five-program architecture. Rule enforced everywhere: **only Sem Fumo is commercially active**; Alcohol, Azúcar, Ansiedad and Sueño are drafts (`commercial_status='coming_soon'`, `published=false`) pending clinical review.

## Program-by-program status

| Program | Quiz | Results | Journey content | Entitlements | Funnel (UI) | Commercial | Clinical review |
|---|---|---|---|---|---|---|---|
| Sem Fumo (`sem-fumo`) | ✅ live | ✅ live | ✅ live | ✅ | ✅ live | ✅ `active` (Stripe test-mode verified) | ✅ done (live product) |
| Alcohol (`alcohol`) | ✅ server-side | ✅ server-side | ✅ seeded (draft) | ✅ RLS-scoped | ✅ threaded | ⛔ `coming_soon` | ⛔ pending (blocking) |
| Azúcar (`azucar`) | ✅ | ✅ | ✅ (draft) | ✅ | ✅ | ⛔ `coming_soon` | ⛔ pending |
| Ansiedad (`ansiedad`) | ✅ | ✅ | ✅ (draft) | ✅ | ✅ | ⛔ `coming_soon` | ⛔ pending |
| Sueño (`sueno`) | ✅ | ✅ | ✅ (draft) | ✅ | ✅ | ⛔ `coming_soon` | ⛔ pending |

Draft journeys are seeded complete but invisible to users (RLS `published`-only) and not purchasable (`assertPurchasable` `409`s; catalog shows "coming soon"). Admin can publish only after the clinical-review workflow.

## What was fixed this cycle (per-program funnel end-to-end)

Before, the whole funnel beyond the quiz defaulted to `sem-fumo` (frontend pages were sem-fumo-only). Now:

- `/test` (`public/js/pages/test.js`) reads the program from `/quiz/<slug>` or `?program=`, validates it against known slugs, and sends it on **every** assessment call (`/api/assessment/quiz|answers|complete`), all redirects, and the per-program privacy note.
- `resultados.js` — Sem Fumo path preserved byte-for-byte (with the chips bug fixed); new per-program result renderer (estimates/dependence gauge/profile/triggers/personal plan per program semantics; alcohol shows the safety notice banner). All customer-facing text in Spanish.
- `paywall.js` — `goToCheckout(plan, btn, { exitOffer, program, fromCatalog })`; `FEATURES_BY_PROGRAM` for the four drafts, exact original `FEATURES` for Sem Fumo; exit offer carries the program.
- `planes.js` / `acceso.js` — read/validate `program`, `GET /api/plans?program=`, checkout redirects per program (no result → `/quiz/<program>`; active other program → `/programas?pago=nuevo`).
- Guardrails: unknown program ⇒ Sem Fumo legacy behavior preserved (live traffic unaffected); `assertPurchasable` still blocks buying the four drafts, so the UI can render their paywalls as preview while checkout refuses.

## Invariants respected

- Access always per program (`ProgramEntitlementService.getEntitlement`); no global premium flag anywhere.
- Content seeds never delete user progress (upsert + version-bump only).
- No fake stats/testimonials/medical claims added in this cycle; result pages label numbers as "Estimación"/"Objetivo del plan", and the safety notice on alcohol states the educational nature.

## Pending (external)

- Clinical review of the four draft journeys — the one blocker for publishing/commercializing them. Nothing in code blocks it; `commercial_status` flips to `active` only via admin after review.

## 2026-10-19 verification

- Catalog live check: `sem-fumo` active (published), `alcohol/azucar/sueno` = `coming_soon`+published (teaser visible), `ansiedad` = `coming_soon`+draft (invisible). Buying any of them is impossible: `assertPurchasable` (409, probed) + paywall disabled state.
- All 5 result engines now have unit tests (`test/results.test.js` 19 tests, 54/54 suite) — including the alcohol clinical safety notice path.
