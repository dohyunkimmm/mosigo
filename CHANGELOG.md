# Changelog

All notable Mosigo changes are tracked here as the prototype advances progressively.

## v9.0.0 — 2026-09-13

### Coordinated booking beta
- Advanced `/api/bookings` from the v8 traceable resource to a v9 `coordinated-booking-resource` contract while preserving server-authoritative lifecycle transitions, ordered history/revision validation, and same-device recovery.
- Added same-device multi-tab coordination through `storage` events so a newer booking snapshot can be revalidated through `PUT /api/bookings` and hydrated into the established booking runtime instead of leaving tabs on divergent state.
- Added revision-aware local snapshot guards: higher revisions win for the same booking, stale revisions cannot overwrite a newer snapshot, and equal-revision divergence follows an explicit `stored-snapshot-wins` policy before canonical revalidation.
- Added deterministic cross-booking selection using `updatedAt` followed by booking ID as a tie-break when timestamps are equal.
- Added clear propagation for snapshot/latest-key removal, plus explicit `invalid-snapshot` handling for malformed JSON and storage key/booking ID mismatches.
- Split the v9 facade into synchronous local `getSnapshot()` and asynchronous server-revalidated `getCanonical()` reads so the meaning of local versus validated booking state is explicit.
- Changed newly generated booking IDs to M9 with timestamp material plus entropy to reduce same-millisecond collision risk while preserving compatibility with existing M4/M6/M7/M8/M9 IDs.
- Added focused behavior coverage for higher-revision adoption, equal-revision divergence, deterministic cross-booking ties, clear propagation, malformed storage events, and canonical revalidation, while retaining booking API and static/runtime regression coverage.
- Kept persistence and coordination boundaries explicit: `persistence: client-local`, `recoveryScope: same-device`, `coordinationScope: same-device`, and `durableServerPersistence: false`.

### Final QA
- Passed PR #31 Quality run #57 for the initial v9 coordination implementation and merged it through GitHub server-side squash merge.
- Passed PR #32 Quality run #59 for coordination hardening and merged it through GitHub server-side squash merge.
- Verified final app-source `main` Quality run #60 succeeded on GitHub-verified commit `ec9e73e57c51ec2e56821dbdff0ecdd6dbc7ca7a`.
- Verified Vercel Production deployment `dpl_9YTYKh3KebYBPc6QwGEQVAdCwpjn` is `READY` from that exact verified app-source commit.
- Confirmed `/api/health` reports commit `ec9e73e57c51ec2e56821dbdff0ecdd6dbc7ca7a`, `/api/bookings` exposes the v9 coordination policies, and `/v9-booking.js` is served successfully.
- Confirmed automated Production Smoke run #31 completed successfully against the final v9 app source.
- Confirmed the only runtime warning observed remains the previously known Node 24 `url.parse()` deprecation warning on `/api/hospitals`, with no v9 booking runtime error group.

### Scope
v9 advances Mosigo from a Traceable Booking Beta to a **Coordinated Booking Beta** by coordinating validated booking snapshots across tabs on the same device and making conflict handling deterministic. It still does not provide durable database persistence, authentication/account ownership, cross-device synchronization, a tamper-proof audit log, or real operational booking storage.

## v8.0.0 — 2026-09-13

### Traceable booking beta
- Advanced `/api/bookings` from the v7 recoverable resource to a v8 `traceable-booking-resource` contract while preserving server-authoritative lifecycle transitions and same-device recovery.
- Added canonical `revision` and ordered `history` metadata to booking responses so creation and lifecycle commands carry an explicit resource trace.
- Added server validation for history sequence continuity, booking identity, timestamps, legal lifecycle transitions, action/type matching, revision length, and agreement between the final history event and the current booking phase.
- Changed newly generated booking IDs to M8 format while preserving compatibility with existing M4, M6, M7, and M8 booking IDs.
- Added explicit legacy recovery migration: older v7 same-device snapshots without history are recovered as `legacy_import` traces with `historyComplete: false` instead of being rejected or represented as a complete audit trail.
- Added `src/v8-booking.js` as a read-only browser trace facade over the established v6 sync and v7 recovery layers, exposing canonical history, revision, completeness, and trace status without replacing the proven booking UI.
- Kept persistence scope explicit through `persistence: client-local`, `recoveryScope: same-device`, and `durableServerPersistence: false`; v8 does not claim durable server storage or a tamper-proof audit log.
- Extended booking API tests for v8 capability discovery, M4/M6/M7/M8 compatibility, trace creation, legal lifecycle history, stale revision rejection, phase/history conflict rejection, legacy snapshot migration, and expanded error behavior.
- Extended structural QA to require the v7→v8 extension load, `v8-booking.js`, revision/history consumption, and JavaScript syntax validity.
- Extended Production Smoke to require the v8 capability contract, create an M8 booking, append a `confirm` history event through `PATCH`, recover the traced booking through `PUT`, verify revision/history preservation, and require the deployed `v8-booking.js` asset.

### Final QA
- Passed PR #29 Quality run #53 and merged the v8 trace implementation through GitHub server-side squash merge.
- Verified `main` Quality run #54 succeeded on GitHub-verified commit `e4a010838424631ce3b36189e0a3022cca30a554`.
- Verified Vercel Production deployment `dpl_Dv7SPzv4np5VNiBsz8snZVppPGcq` is `READY` from that exact verified `main` commit.
- Confirmed `/api/health` reports commit `e4a010838424631ce3b36189e0a3022cca30a554`, `/api/bookings` exposes the v8 traceable-resource capability, and `/v8-booking.js` is served successfully.
- Confirmed automated Production Smoke run #25 completed successfully, including live `GET`, `POST`, `PATCH`, and `PUT` booking checks for history and revision behavior.
- Confirmed the v8 Production smoke path returned `POST /api/bookings` 201 plus `PATCH /api/bookings` and `PUT /api/bookings` 200. The only runtime warning observed was the previously known Node 24 `url.parse()` deprecation warning on the hospital API path, with no v8 booking request failures.

### Scope
v8 advances Mosigo from a Recoverable Booking Beta to a **Traceable Booking Beta** by carrying a server-validated lifecycle history and revision with each canonical booking resource while preserving same-device recovery. The history is integrity-checked within the submitted resource but is not a durable or tamper-proof audit system because database persistence, authentication, account ownership, cross-device recovery, and real operational booking storage remain outside this release.

## v7.0.0 — 2026-09-13

### Recoverable booking beta
- Advanced `/api/bookings` from the v6 command-only surface to a v7 recoverable booking-resource contract while preserving server-authoritative lifecycle transition validation.
- Added `PUT /api/bookings` to revalidate an existing booking snapshot without resetting its booking ID, lifecycle phase, or timestamps.
- Changed newly generated booking IDs to M7 format while preserving compatibility with existing M4, M6, and M7 booking IDs.
- Added `src/v7-booking.js` to persist canonical booking snapshots in `localStorage` by booking ID and automatically recover the latest same-device booking when a new browser session starts.
- Exposed explicit booking hydration from the stable v4 runtime and booking-state events/hydration from the v6 sync layer so a validated recovered snapshot can restore the existing booking UI without replacing the proven flow.
- Kept the recovery boundary explicit: the API reports `persistence: client-local`, `recoveryScope: same-device`, and `durableServerPersistence: false`; v7 does not claim database-backed server persistence.
- Extended booking API tests for v7 capability discovery, M4/M6/M7 compatibility, snapshot recovery, invalid recovery input, and the expanded `GET, POST, PUT, PATCH` method contract.
- Extended structural QA to require `v7-booking.js`, localStorage recovery, v6→v7 extension loading, booking sync events, and runtime hydration wiring.
- Extended Production Smoke to create an M7 booking, recover it through `PUT /api/bookings`, verify the booking ID/phase are preserved, and require the deployed `v7-booking.js` asset.

### Final QA
- Passed PR #27 Quality run #49 and merged the v7 recovery implementation through GitHub server-side squash merge.
- Verified `main` Quality run #50 succeeded on GitHub-verified commit `01fda01e4efac0a33488a0a19331ff286c7de2b5`.
- Verified Vercel Production deployment `dpl_EH4uGnWCcJ5dWRqTLSykQ3Zeuek6` is `READY` from that exact verified `main` commit.
- Confirmed `/api/health` reports commit `01fda01e4efac0a33488a0a19331ff286c7de2b5`, `/api/bookings` exposes the v7 recoverable-resource capability, and `/v7-booking.js` is served successfully.
- Confirmed automated Production Smoke run #21 completed successfully, including live booking capability, create, and recovery checks.
- Confirmed the v7 Production smoke path returned `POST /api/bookings` 201 and `PUT /api/bookings` 200. The only runtime warning observed was the previously known Node 24 `url.parse()` deprecation warning on the hospital API path, with no v7 booking request failures.

### Scope
v7 advances Mosigo from a Pilot-ready Beta to a **Recoverable Booking Beta** by making an active booking resumable across new tabs/browser sessions on the same device and revalidating the recovered state through the server API. Durable database persistence, cross-device/account recovery, authentication, and real operational booking storage remain outside this release.

## v6.0.0 — 2026-09-13

### Pilot-ready beta
- Added a v6 `/api/bookings` command surface with capability discovery (`GET`), validated booking creation (`POST`), and lifecycle commands (`PATCH`) for `confirm`, `start`, `complete`, and `cancel`.
- Added `src/lib/booking-service.js` to reuse the shared booking state machine as the server-side transition authority, including explicit request validation, stable M6 booking IDs, compatibility with existing M4/M6 IDs, and structured 4xx errors for invalid input or transitions.
- Kept v6 intentionally non-durable for this milestone: the booking API declares `persistence: client-session`, while server commands own legal transition validation and the browser remains the session persistence fallback.
- Added `src/v6-booking.js` after the stable v4 booking runtime to mirror booking creation and lifecycle changes through `/api/bookings` without replacing the existing UI flow.
- Added best-effort queued synchronization, session-scoped remote shadow state, sync/fallback status, and local-flow continuity when the booking API cannot be reached.
- Extended automated tests with the v6 booking command contract, request validation, legal/illegal transition coverage, booking-ID compatibility, browser sync asset/order checks, and JavaScript syntax validation.
- Extended Production Smoke to require the v6 booking API capability contract and the deployed `v6-booking.js` asset in addition to the existing health, hospital, security-header, crawler, and runtime checks.

### Final QA
- Passed the v6 booking API and browser-sync Pull Request Quality gates and the corresponding `main` Quality gates.
- Encountered Vercel build-rate limiting after the first v6 `main` deployments; no speculative runtime workaround or extra feature change was used to bypass the platform limit.
- Re-triggered Production once with PR #25 using a runtime-neutral `src/vercel.json` formatting-only change after the deployment quota became available.
- Verified Vercel Production deployment `dpl_5vBYdXu3uewPExqp91c5UvYvSFQu` is `READY` from GitHub-verified `main` commit `3f4979403d2ade81495eb4b8a60e3f7e60f2f851`.
- Confirmed `/api/health` reports that exact Production commit, `/api/bookings` returns the v6 booking-command capability with authoritative transitions enabled, and `/v6-booking.js` is served successfully.
- Confirmed final `main` Quality run #46 and automated `Production Smoke` run #17 completed successfully.

### Scope
v6 advances Mosigo from a product-ready public demo to a **Pilot-ready Beta** by moving booking validation and lifecycle authority across a server API boundary while preserving the proven v4/v5 UX, client-session persistence fallback, prototype hospital data, and the explicit non-production-service positioning. Durable database persistence, user identity, and real operational booking infrastructure remain outside this release.

## v5.0.0 — 2026-09-12

### Product-ready demo
- Added low-risk production security headers through `src/vercel.json`: `X-Content-Type-Options`, `Referrer-Policy`, and a scoped `Permissions-Policy`.
- Added `/api/health` so Production readiness and the deployed Git commit can be verified from the running application surface.
- Added `robots.txt` and `sitemap.xml` for basic public-demo crawler discovery against the canonical Production URL.
- Added visible `:focus-visible` keyboard focus treatment and `prefers-reduced-motion` fallbacks across the main prototype and extension-page transition behavior.
- Changed event/game extension iframes to mount lazily only when opened, while keeping page-specific iframe titles and lazy-loading semantics.
- Added automated product-readiness regression checks for keyboard focus, reduced motion, lazy extension surfaces, and MP4 footprint budgets.
- Added automated production-readiness checks for crawler files, security headers, health endpoint presence, and Vercel deployment policy.
- Added stable-version consistency checks across `VERSION`, `package.json`, `README.md`, and `CHANGELOG.md`.
- Added a post-Quality `Production Smoke` workflow that waits for the relevant Production deployment and validates the deployed public surface after `main` QA succeeds.
- Restricted automatic Vercel Git deployments to verified `main` so feature/PR branches no longer consume deployment quota; Pull Requests continue to use GitHub Quality as their pre-merge gate.

### Final QA
- Passed the v5 Pull Request and `main` Quality gates after production hardening, Production Smoke automation, accessibility/performance regression coverage, and the main-only Vercel deployment policy.
- Re-triggered the temporarily rate-limited Production path once with a runtime-neutral `src/vercel.json` formatting-only change after the quota became available.
- Verified Vercel Production deployment `dpl_Hme5kDFHHhY7o7NfYZRbAdo48jwz` is `READY` from GitHub-verified `main` commit `f3db1e8d6015ad46c51200fd477f4b5a4b133c07`.
- Confirmed GitHub Vercel deployment statuses are successful for that exact `main` commit.
- Confirmed automated `Production Smoke` run #9 completed successfully against the deployed Production surface.
- Confirmed the final runtime smoke window had no HTTP request failures; one Node 24 `url.parse()` deprecation warning was emitted on the serverless runtime path, while the repository contains no direct `url.parse` or `require('url')` usage.

### Scope
v5 advances Mosigo from a functional prototype to a product-ready public demo by hardening deployment, regression QA, accessibility, performance behavior, discovery metadata, and Production verification while preserving the established v4 product flow and the project’s prototype-only positioning.

## v4.0.0 — 2026-09-12

### Functional prototype
- Enriched the prototype hospital dataset with stable IDs, ratings, review counts, specialties, linked-manager availability, same-day availability, open/closed state, and prototype wait-time data.
- Extended `/api/hospitals` with deterministic recommended/rating/wait sorting plus `managerAvailable` and `sameDay` filters while preserving the existing `items` response contract.
- Added API query metadata (`total`, `returned`, applied filters, sort, and limit) and an explicit `v4` schema marker for runtime verification.
- Expanded free-text hospital search so symptom/specialty terms can match the prototype data model instead of relying only on hospital or department names.
- Added a separate `v4-functional.js` browser layer so v4 behavior can advance without re-coupling the v3 `index-core.js` structure.
- Added explicit hospital-search request states for loading, empty results, API fallback, and retry UX.
- Upgraded hospital result cards to expose prototype open/closed status, wait-time examples, rating/review context, same-day availability, and linked-manager counts.
- Added a shared booking state machine covering `idle → requesting → confirmed → in_progress → completed` plus scheduled cancellation.
- Connected the existing booking UI to the shared state model with validation for hospital/manager selection, deterministic booking IDs, and consistent phase-driven status copy.
- Persisted active booking state in `sessionStorage` and restore the selected hospital, manager, schedule, transport mode, home/live state, and order status after an in-tab refresh.
- Disabled forward booking progression when a selected hospital has no linked manager and kept cancellation/completion transitions synchronized with the existing demo flow.
- Extended automated QA to cover v4 API filters, sort order, metadata, specialty search, functional-layer loading, booking lifecycle transitions/restore, and JavaScript syntax.

### Final QA
- Passed the v4 Pull Request and `main` Quality gates after the functional search and booking-state changes.
- Re-triggered Vercel after the temporary daily deployment limit using a runtime-neutral `src/vercel.json` formatting-only change.
- Verified Production deployment `dpl_DH2KHqg5mVeTMobUgz1CucvVRzgW` is `READY` from GitHub-verified `main` commit `2acd44d632bfb95005d02e13980daedc8312828e`.
- Runtime-smoke-tested the public root page plus `v4-functional.js`, `booking-state.js`, and `v4-booking.js` with successful HTTP responses.
- Runtime-smoke-tested `/api/hospitals?managerAvailable=1&sameDay=1&sort=wait&numOfRows=6` and confirmed the v4 schema marker, filter metadata, and sorted prototype results.
- Confirmed no Production runtime `error` or `fatal` logs during the v4 final QA window.

### Scope
v4 advances Mosigo from a maintainable prototype to a more functional prototype with explicit data/query behavior, resilient hospital-search states, and a persistent booking lifecycle while keeping the project intentionally prototype-only rather than presenting it as a live medical or reservation service.

## v3.0.0 — 2026-09-12

### Maintainability
- Separated prototype hospital data from the Vercel API handler into `src/data/hospitals.js`.
- Moved hospital search, department-code resolution, query normalization, and result limiting into `src/lib/hospital-query.js`.
- Kept the public `/api/hospitals` response contract and cache headers unchanged while reducing handler responsibilities.
- Added focused unit coverage for the hospital query module and retained API contract tests.
- Generalized structural QA and the Release workflow so the same quality/release path can be reused beyond v2.
- Added a comment-safe `src/index.html` source-structure audit for inline CSS/JavaScript and linked asset sizes.
- Extracted seven inline style blocks into `src/index.css` while preserving cascade order.
- Extracted the two large classic inline JavaScript blocks into `src/index-core.js` and `src/index-post.js`, preserving `new_ext-pages.js` between them so execution order stays unchanged.
- Reduced `src/index.html` from 421,695 bytes to 139,541 bytes without changing the intended rendered flow by moving CSS/JavaScript to same-directory assets.
- Added regression checks for balanced HTML comments, externalized index assets, script order, local asset integrity, JavaScript syntax, and a 200 KB structural size guard for `index.html`.
- Unified Pull Request, `main`, and Release verification behind the same `npm run quality` gate.

### Final QA
- Passed the v3 automated test suite and source-structure audit after the index asset extraction.
- Verified the v3 application source on a GitHub-verified `main` Vercel Production deployment.
- Runtime-smoke-tested the Production root page and the extracted `index.css`, `index-core.js`, and `index-post.js` assets with successful HTTP responses.
- Runtime-smoke-tested `/api/hospitals?qd=D006` and confirmed the expected prototype orthopedics result.
- Confirmed no Production runtime `error` or `fatal` logs during the v3 final QA window.

### Scope
v3 improves source structure, maintainability, and regression protection while preserving the established prototype product flow. Product-level data realism and functional expansion are intentionally deferred to v4.

## v2.0.0 — 2026-09-12

### Baseline
- Recovered the approved Vercel Drop source without mixing older deployments.
- Migrated the recovered source to GitHub `main`.
- Connected GitHub `main` to Vercel Production with `src` as the Root Directory.
- Verified the production deployment and public alias.
- Synchronized the GitHub README and Notion Mosigo documentation.

### v2 hardening
- Added a repository-level Node.js test runner that does not change the Vercel application root.
- Added smoke tests for the prototype hospital API: default response, department filtering, name filtering, row limits, and method rejection.
- Added static-site QA for required entrypoints, essential metadata, local HTML/CSS asset references, and classic inline JavaScript syntax.
- Added a GitHub Actions quality workflow for pull requests and `main`.
- Added a guarded manual Release workflow that reruns QA and creates the Git tag/GitHub Release from `VERSION` only after final QA.
- Kept repository-wide Actions permissions read-only while granting `contents: write` only to the Release workflow.
- Added `.gitignore` protection for environment files, local Vercel metadata, dependencies, logs, and editor files.

### Final QA
- Verified GitHub Actions Quality checks on the v2 final `main` path.
- Verified Vercel Production is deployed from a GitHub-verified `main` commit.
- Runtime-smoke-tested the public root page, event page, game page, hospital API, and department-filtered hospital API.
- Confirmed no Production runtime `error` or `fatal` logs during final QA.

### Scope
v2 preserves the restored prototype UI and runtime behavior. Structural refactoring and product-level feature expansion are intentionally deferred to later versions.
