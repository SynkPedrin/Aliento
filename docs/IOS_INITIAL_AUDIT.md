# ALENTO — iOS initial audit

Audit started 2026-10-20. Historical reports are not current test evidence.

Root: `/Users/pedro/Downloads/focus`; Xcode navigator: `Files/focus`. Existing changes preserved (`.DS_Store` modified at baseline). No additional AGENTS.md found within this repository.

| Area | Status | Evidence |
|---|---|---|
| Native project | IMPLEMENTED | ios/App/App.xcodeproj, scheme App, Debug/Release; xcodebuild -list succeeded |
| Toolchain | TESTED | Xcode 27.1 (27A9275), Swift 6.4; project Swift language 5 |
| Deployment | IMPLEMENTED | iOS 15, arm64 device requirement, Capacitor 8.5.3 via SPM |
| Identity | IMPLEMENTED | app.alento, display Alento, version 1.0, build 1 |
| Signing | BLOCKED | Automatic signing, no DEVELOPMENT_TEAM found; distribution not verified |
| IDE build | BLOCKED | Open workspace is a file container without schemes; BuildProject could not locate build log |
| Native bridge | PARTIAL | AlentoStorePlugin implements products, purchase, finish, restore, updates; no appAccountToken; shared pending dictionary not isolated |
| Native paywall | BROKEN | Stripe plans/prices used before StoreKit purchase; native detection requires plugin and can fall back to web |
| Transaction backend | BROKEN | Missing expiration creates 30-day entitlement; ownership binding absent; notification owner selects user_id but reads id; environment case mismatch |
| Web/backend | IMPLEMENTED | Existing Express/Supabase/Stripe; no frontend bundler required |
| Five programs | PARTIAL | Five engines and journeys exist; four are drafts pending clinical review |
| Native navigation | PARTIAL | Remote URL https://alento.citavel.ai points to root landing; needs app entry and runtime verification |
| Notifications | PARTIAL | Web Push exists; APNs implementation not established |
| Privacy/account | PARTIAL | Existing export/delete; deletion blocked by active subscriptions; privacy review outstanding |
| Current tests | NOT_TESTED | npm initially unavailable on shell PATH; historical 54 tests not counted |

No new Supabase project, production database mutation, commercial product creation or public submission performed. Initial failures and corrections are tracked in IOS_TEST_RESULTS.md and IOS_BLOCKERS.md.
