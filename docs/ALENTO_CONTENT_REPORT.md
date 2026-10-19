# Alento — Content Report (verified 2026-10-19)

Scope: journey content (chapters/lessons), questionnaires, results copy, and landing/i18n content. Standing rule: customer-facing text is **Spanish**; content seeds **never delete user progress**.

## Journey content

- `server/content/programs/*.js` defines per-program journeys; loaded by `npm run content:seed` (upsert-only: lessons are version-bumped when text changes, user progress is never touched — invariant #6, tested in `test/flow.test.js`).
- Sem Fumo: complete, published, live.
- Alcohol / Azúcar / Ansiedad / Sueño: seeded complete but `published = false` — invisible to users (RLS), draft status pending clinical review (see `docs/ALENTO_PROGRAMS.md`).

## Questionnaires (server-side, per program)

- `server/quiz.js` → `PROGRAM_STEPS`: distinct step sequences per program (product/amount/spend/years/first-smoke + per-program extras), used by `computeResult(answers, { program })` in `server/results.js`.
- Front end renders the same steps from the public API; invalid slug falls back to legacy `/test` (Sem Fumo) behavior.

## Results copy (per program)

- Sem Fumo: original copy preserved (personalized estimates, plan, chips — chips rendering bug fixed).
- Others: per-program estimates labeled honestly as «Estimación» / «Objetivo del plan» (no invented medical claims), alcohol includes the «consulta con un profesional» safety notice. Typo fixed («un consumiciones» → «un consumo de alto impacto»).

## Landing + i18n

- `public/i18n.js`: 6 languages (es, pt-BR, pt-PT, en, fr, de) with full dictionaries; the only touched keys this cycle are the store-badge ones (`store.apple.s`/`store.google.s` → `store.web.s`/`store.web.b`), translated honestly («Disponible ya en tu navegador» / «Abrir la app web») in all six.
- Stories/testimonials: the existing landing content was **not modified** this cycle; nothing fake was added. Real-name testimonial assets remain as previously reviewed.
- Legal copy: `/terminos` and `/privacidad` complete (identity template placeholders come from `LEGAL_*` envs); cookies policy covered by `privacidad.html` §8, so the footer's «Política de cookies» points there.

## New copy added this cycle (all Spanish)

- `offline.html`: program-neutral retry CTA («Ver programas» → `/programas?catalogo`) instead of a Sem Fumo dashboard link; explanation that nothing new was saved offline remains.
- Landing web-app badge: `store.web.s`/`store.web.b` (6 languages).
- Per-program privacy note on `/test` (already part of quiz pages, reviewed for program slug correctness).

## Pending (external)

- Clinical review of draft journeys before publishing; localized store metadata only when the native apps are actually submitted (see `docs/ALENTO_APP_STORE_CHECKLIST.md`).

## 2026-10-19 addendum (landing honesty)

- To confirm that the served LP is the attached SITE-HOME: the live copy matches it 1:1 in structure and i18n keys (11 sections; only intentional deltas: real head/CTAs instead of `href="#"` placeholders, added to production already)
- Content pass: fake press logos (Bloomberg/CBS/Yahoo), fake testimonials (photos/names/ages) and invented metrics ("150 mil"/«9 de 10»/«93 %») **removed in all 6 languages**; replaced with verifiable product facts and honest FAQ answers (pricing model, cancellation via «Mi suscripción»/Stripe portal, data export/delete exist in the app, PWA devices; store app marked "in preparation").
- All content in user-facing copy is Spanish-first; `tbd` blocks are now zero in `public/index.html` + `public/i18n.js` (only documented in the convention note).
