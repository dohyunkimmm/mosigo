# Changelog

All notable Mosigo changes are tracked here as the prototype advances progressively.

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
- Re-triggered Vercel after the temporary daily deployment limit using a runtime-neutral `src/vercel.json` formatting change.
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
