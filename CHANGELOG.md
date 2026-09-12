# Changelog

All notable Mosigo changes are tracked here as the prototype advances progressively.

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
- Added a GitHub Actions quality workflow for pull requests and `main`.
- Added `.gitignore` protection for environment files, local Vercel metadata, dependencies, logs, and editor files.

### Scope
v2 preserves the restored prototype UI and runtime behavior. Structural refactoring and product-level feature expansion are intentionally deferred to later versions.
