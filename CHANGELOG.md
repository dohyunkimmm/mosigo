# Changelog

All notable Mosigo changes are tracked here as the prototype advances progressively.

## v10.0.0 — 2026-09-13

### Durable Booking Beta
- Advanced `/api/bookings` from the v9 coordinated resource to a v10 `durable-booking-resource` while preserving server-authoritative lifecycle transitions, revision/history validation, and same-device coordination.
- Added Private Vercel Blob-backed canonical booking persistence so Production reports `persistence: server-durable` and `durableServerPersistence: true`.
- Added accountless durable recovery using booking ID plus a recovery key. The raw recovery key is returned to the client once and only its SHA-256 hash is stored with the durable record.
- Added durable canonical `GET /api/bookings?bookingId=...` recovery guarded by `X-Mosigo-Recovery-Key`.
- Added revision-aware durable lifecycle commands. `PATCH /api/bookings` requires the expected canonical revision and recovery credential before applying `confirm`, `start`, `complete`, or `cancel`.
- Added Blob ETag compare-and-swap writes so a concurrent stale writer cannot overwrite a newer canonical booking. Production capability reports `serverConflictPolicy: revision-plus-etag-cas`.
- Changed newly generated booking IDs to M10 while retaining compatibility with M4/M6/M7/M8/M9/M10 booking IDs.
- Added `src/lib/booking-store.js` as the private Blob storage adapter and kept Blob runtime dependencies isolated under the Vercel Root Directory.
- Added `src/v10-booking.js` and `MosigoV10BookingDurability` for durable capability discovery, recovery, and canonical reads on top of the established v9 coordination runtime.
- Preserved v7/v9 localStorage recovery and storage-event coordination as the explicit fallback path when durable storage is unavailable outside the configured Production environment.
- Bound the connected Vercel Blob resource through `BLOB_STORE_ID` and delegated authentication to Vercel runtime OIDC without committing static credentials.
- Extended unit, API, runtime, and Production Smoke coverage for durable storage configuration, recovery credentials, M10 IDs, canonical reads, lifecycle transitions, and Blob conflict handling.

### Final QA
- Passed PR #36 Quality #67 for the v10 durable-persistence foundation and merged through GitHub server-side squash merge.
- Passed PR #37 Quality #69 for project Blob binding, PR #38 Quality #71 for Vercel-connected `BLOB_STORE_ID` recognition, and PR #39 Quality #73 for runtime OIDC handling.
- Verified final app-source `main` commit `00c2fad6d35f39eddce86ac01a28750e183eec1a` is GitHub-verified and deployed to Vercel Production as `dpl_EtV9X9buqmzMYhSwJjBtciy749pw` in `READY` state.
- Confirmed live `/api/bookings` reports `schemaVersion: v10`, `resource: durable-booking-resource`, `persistence: server-durable`, `durableServerPersistence: true`, `recoveryScope: booking-key`, and `serverConflictPolicy: revision-plus-etag-cas`.
- Confirmed Production Smoke #45 completed successfully against the final v10 app source, including live durable booking creation, lifecycle transition, recovery, and canonical GET verification.

### Scope
v10 advances Mosigo from a **Coordinated Booking Beta** to a **Durable Booking Beta** by moving the canonical booking resource from client-local persistence to private server durable storage. It still does not provide user-account authentication, account ownership, broad booking listing/search, a tamper-proof audit system, or real operational healthcare booking infrastructure. The recovery key is a prototype booking credential, not a user identity system.

## v9.0.0 — 2026-09-13

### Coordinated Booking Beta
- Added same-device multi-tab coordination through `storage` events on top of the v8 traceable booking resource.
- Added revision-aware local snapshot guards: higher revisions win, stale revisions cannot overwrite newer snapshots, and equal-revision divergence follows `stored-snapshot-wins` before server revalidation.
- Added deterministic cross-booking selection using `updatedAt` followed by booking ID as a tie-break.
- Added snapshot/latest-key clear propagation and explicit malformed snapshot handling.
- Split local `getSnapshot()` from async server-revalidated `getCanonical()` reads.
- Changed newly generated booking IDs to M9 timestamp-plus-entropy format while preserving earlier compatible IDs.
- Added behavior tests for higher-revision adoption, equal-revision divergence, deterministic ties, clear propagation, malformed storage events, and canonical revalidation.

### Final result
- Final v9 app source: `ec9e73e57c51ec2e56821dbdff0ecdd6dbc7ca7a`.
- Verified Vercel Production deployment: `dpl_9YTYKh3KebYBPc6QwGEQVAdCwpjn`.
- Production Smoke #31 succeeded.
- v9 remained intentionally `client-local` and `same-device`; durable storage was deferred to v10.

## v8.0.0 — 2026-09-13

### Traceable Booking Beta
- Added canonical booking `revision` and ordered lifecycle `history`.
- Added server validation for history sequence, identity, timestamps, legal transitions, action/type mapping, revision/history agreement, and final phase consistency.
- Added explicit legacy recovery migration through `legacy_import` with `historyComplete: false`.
- Added `v8-booking.js` as a read-only trace facade over the established booking runtime.
- Preserved same-device recovery and explicitly kept durable server persistence out of scope.

### Final result
- Final v8 app source: `e4a010838424631ce3b36189e0a3022cca30a554`.
- Verified Vercel Production deployment: `dpl_Dv7SPzv4np5VNiBsz8snZVppPGcq`.
- Production Smoke #25 succeeded.

## v7.0.0 — 2026-09-13

### Recoverable Booking Beta
- Added `PUT /api/bookings` for validated booking snapshot recovery.
- Added booking-ID keyed `localStorage` snapshots and same-device automatic recovery.
- Added explicit runtime hydration so only server-validated recovered state restores the established booking UI.
- Preserved server lifecycle authority while keeping persistence `client-local` and recovery scope `same-device`.

### Final result
- Final v7 app source: `01fda01e4efac0a33488a0a19331ff286c7de2b5`.
- Verified Vercel Production deployment: `dpl_EH4uGnWCcJ5dWRqTLSykQ3Zeuek6`.
- Production Smoke #21 succeeded.

## v6.0.0 — 2026-09-13

### Pilot-ready Beta
- Added the `/api/bookings` command surface with capability discovery, validated booking creation, and lifecycle commands for confirm/start/complete/cancel.
- Added server-side request validation and lifecycle transition authority through the shared booking state machine.
- Added browser booking synchronization over the established v4 booking UI while preserving local continuity when the API is unavailable.
- Kept persistence session/client scoped for this milestone.

### Final result
- Verified v6 app-source Production deployment: `dpl_5vBYdXu3uewPExqp91c5UvYvSFQu`.
- Final v6 release/tag SHA: `c36fc2966e195d960cf4995d05d03832ad9a2ddc`.
- v6.0.0 GitHub Release was verified immutable.

## v5.0.0 — 2026-09-12

### Product-ready Demo
- Added low-risk Production security headers, `/api/health`, crawler discovery files, keyboard focus treatment, reduced-motion fallbacks, and lazy extension-page loading.
- Added automated product-readiness checks for accessibility, MP4 footprint, crawler files, security headers, health endpoint presence, and deployment configuration.
- Added stable-version consistency checks across `VERSION`, `package.json`, README, and CHANGELOG.
- Added post-Quality Production Smoke against the public runtime.

### Final result
- Verified Production deployment from a GitHub-verified `main` commit.
- Production Smoke succeeded and the public demo readiness path was established for later versions.

## v4.0.0 — 2026-09-12

### Functional Prototype
- Enriched the prototype hospital dataset and added deterministic search/filter/sort metadata.
- Added explicit loading, empty, retry, and API fallback states to hospital search.
- Added the shared booking state machine for request/confirm/progress/complete/cancel lifecycle behavior.
- Added session persistence and restoration of active booking UI state.
- Added automated QA for hospital query behavior, booking lifecycle transitions, restoration, and JavaScript syntax.

## v3.0.0 — 2026-09-12

### Maintainable Prototype
- Separated prototype data, query logic, and API handler responsibilities.
- Externalized the main page CSS and JavaScript while preserving execution order and rendered flow.
- Added structural source audits, asset integrity checks, syntax checks, and an `index.html` size guard.
- Unified PR, `main`, and Release verification behind `npm run quality`.

## v2.0.0 — 2026-09-12

### Stabilized baseline
- Recovered the approved prototype source and established GitHub `main` as the repository baseline.
- Connected `main` to Vercel Production with `src` as the Root Directory.
- Added repository-level Node.js tests, static-site QA, GitHub Actions Quality, release automation foundations, and `.gitignore` protections.
- Verified the public prototype surface and hospital API as the stable base for subsequent versions.
