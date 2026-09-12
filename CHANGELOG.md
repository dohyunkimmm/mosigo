# Changelog

All notable Mosigo changes are tracked here as the prototype advances progressively.

## Unreleased — v3

### Maintainability
- Separated prototype hospital data from the Vercel API handler into `src/data/hospitals.js`.
- Moved hospital search, department-code resolution, query normalization, and result limiting into `src/lib/hospital-query.js`.
- Kept the public `/api/hospitals` response contract and cache headers unchanged while reducing handler responsibilities.
- Added focused unit coverage for the hospital query module and retained API contract tests.
- Generalized structural QA and the Release workflow so the same quality/release path can be reused beyond v2.
- Added a comment-safe `src/index.html` source-structure audit for inline CSS/JavaScript and linked asset sizes.
- Extracted seven inline style blocks into `src/index.css` while preserving cascade order.
- Extracted the two large classic inline JavaScript blocks into `src/index-core.js` and `src/index-post.js`, preserving `new_ext-pages.js` between them so execution order stays unchanged.
- Reduced `src/index.html` from 421,695 bytes to 139,541 bytes without changing the rendered flow by moving CSS/JavaScript to same-directory assets.
- Added regression checks for balanced HTML comments, externalized index assets, script order, local asset integrity, JavaScript syntax, and a 200 KB structural size guard for `index.html`.

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
