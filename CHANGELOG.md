# Changelog

All notable Mosigo changes are tracked here as the prototype advances progressively.

## v14.0.0 — 2026-09-17

### Operational SaaS Workspace
- Added a dedicated responsive `/ops.html` Operations workspace on top of the existing v13 account-ownership model without replacing the consumer/mobile prototype.
- Added operational overview metrics, next-action queue, owned-booking search/filter, desktop table, mobile booking cards, booking detail drawer, and account/session security view.
- Added secure-share issue/status/revoke controls for account-owned bookings using the existing v12 server-validated sharing contract.
- Added `src/v14-ops.css` with a dedicated operational design-token layer, desktop sidebar/topbar hierarchy, responsive density, restrained Mosigo accent, focus-visible treatment, accessible status states, drawer layering, toast feedback, and reduced-motion support.
- Added `src/v14-ops.js` using the real `/api/account`, `/api/account?resource=bookings`, `/api/bookings?bookingId=...`, and `/api/booking-shares` contracts.
- Kept organization/team multi-tenancy, RBAC, billing plans, operator assignment, and other unimplemented admin capabilities out of the workspace instead of presenting mock functionality.
- Added `tests/v14-static.test.js` covering Operations information architecture, real API usage, responsive visual system, keyboard accessibility, and release-metadata separation.
- Restricted automatic Vercel Git deployment to `main` so PR/feature branches do not automatically create Preview deployments.

### Production QA
- Passed PR #53 Quality #109 for the v14 Operational SaaS candidate.
- Merged v14 application source to `main` as `f2d64e41c931c2f9d6ee06618f8c97acc7282bff`.
- After the rolling Vercel build quota advanced, verified current v14 source on GitHub-verified `main` commit `10833362d8b5e57b4fb2cf3a560eea50f83fd4c4`.
- Verified Vercel Production deployment `dpl_EzKJmaYXK1n4mS6ZguVZaZ6JBvRo` reached `READY` from that main commit.
- Confirmed live `/ops.html` returns HTTP 200 with the `Mosigo Operations · v14` workspace.

### Scope
v14 advances Mosigo from **Account Ownership Beta** to an **Operational SaaS Workspace** by exposing account-owned booking and secure-sharing capabilities in a denser operator-oriented interface. It remains a prototype: it does not add real healthcare back-office infrastructure, organization/team tenancy, role-based access control, billing, payment settlement, or operator-assignment systems.

## v13.0.0 — 2026-09-15

### Account Ownership Beta
- Added `/api/account` as a v13 account-ownership resource with email/password authentication, scrypt password hashing, and HttpOnly/Secure/SameSite=Lax session cookies.
- Added single-account ownership binding for durable bookings and recovery-key claim for existing bookings.
- Added account-scoped booking listing and cookie-authenticated canonical booking access for cross-device continuation.
- Integrated account owners with the existing v12 secure-share issue/status/revoke flow without exposing account session credentials to browser storage.
- Added `src/v13-account.js` and `src/v13-ui.js` for login/register, owned booking listing/opening, current-booking claim, logout, and integrated share management.
- Added account store/API/runtime/static tests and extended Production Smoke with register → owned booking create → list/read → share issue/revoke → logout denial.

### Production QA
- Passed PR #49 Quality #97 for the pre-deployment v13 candidate.
- Merged v13 application source to `main` as `a256090be1be886623ac9b61ddca2ef052167259`.
- Verified Vercel Production deployment `dpl_GRSVQAij38unaGM1rn3WWdm3gXrV` reached `READY` from that GitHub-verified main commit.
- Confirmed live `/api/health` reports `a256090be1be886623ac9b61ddca2ef052167259`, live `/api/account` reports the enabled v13 ownership contract, and live `/v13-account.js` plus `/v13-ui.js` return HTTP 200.
- Passed Production Smoke #69 including account registration, owned booking creation, cross-device-style account listing/read, v12 share management by account owner, logout, and post-logout denial.

### Scope
v13 advances Mosigo from **Secure Sharing Beta** to **Account Ownership Beta**. It introduces prototype account authentication and booking ownership, but it is not a production identity platform and does not provide real operational healthcare booking infrastructure, payment settlement, or broad back-office administration.

## v12.0.0 — 2026-09-15

### Secure Sharing Beta
- Added `/api/booking-shares` as a v12 secure share management resource layered over the stable v10 durable booking contract.
- Added expiring, revocable, rotatable single-booking share capabilities with a 60-minute default TTL, 5-minute minimum, and 24-hour maximum.
- Generated opaque share tokens from 24 random bytes and persisted only SHA-256 token hashes in Private Vercel Blob. Raw share tokens are returned to the client only when issued and are not stored server-side.
- Enforced one active share grant per booking. Issuing or rotating a new link invalidates the prior token, while owner recovery credentials can explicitly revoke the active grant.
- Added temporary share-token authorization to `/api/bookings` through `X-Mosigo-Share-Token` while preserving `schemaVersion: v10`, `resource: durable-booking-resource`, M10 IDs, durable recovery, lifecycle authority, and revision + ETag CAS behavior.
- Added `src/v12-sharing.js` and `MosigoV12SecureSharing` for secure share issuance, rotation, revocation, URL-fragment handoff, fragment redaction, recipient recovery, and session-scoped share access.
- Added `src/v12-ui.js` for owner copy/revoke controls, recipient temporary-access status, successful shared-booking routing, and owner/recipient UI separation.
- Kept share credentials out of query strings and persisted recipient share tokens only in `sessionStorage`, never `localStorage`.
- Added fail-closed validation for persisted share records including version, booking ID, token hash, issue/expiry timestamps, revocation timestamp, and generation.
- Added clipboard fallback and immediate rollback revocation when a newly issued secure share link cannot be delivered to the clipboard.
- Added UI/UX polish that separates the desktop portfolio guide from the interactive app, removes duplicate demo CTA competition, and aligns home/settings visual priority with actual DOM order.
- Added `tests/booking-share-store.test.js`, `tests/booking-shares.test.js`, `tests/v12-sharing.test.js`, `tests/v12-static.test.js`, and Production Smoke coverage for issue/read/rotate/revoke behavior, token storage rules, fragment redaction, owner/recipient controls, malformed-record rejection, and v12 asset wiring.

### Production QA
- Merged the initial v12 Secure Sharing implementation to `main` as `4495db5d2bc868dfe5e2cd82dee3bc5fcaa4fe2f` while keeping `VERSION` at `11.0.0` until Production could be verified.
- Passed PR #47 Quality #93 for the pre-deployment security and UI/UX hardening changes.
- Merged the hardened app source to `main` as `b5494fe5b71d0af0c3d70c52d0afc8f1f19302f8`.
- Verified Vercel Production deployment `dpl_8ukUTSmncjMDntPG7gAUq9nwcFM8` reached `READY` from the hardened GitHub-verified `main` commit.
- Confirmed live `/api/health` reports `b5494fe5b71d0af0c3d70c52d0afc8f1f19302f8`, live `/api/bookings` reports secure sharing enabled while remaining v10/M10, and live `/api/booking-shares` reports the enabled v12 secure-share capability.
- Confirmed live `/v12-sharing.js` and `/v12-ui.js` return HTTP 200 with the hardened share-delivery and recipient UX logic.
- Passed main Quality #94 and Production Smoke #65, including secure share issuance, shared canonical read, token rotation with old-token denial, new-token authorization, revocation, and post-revoke denial.

### Scope
v12 advances Mosigo from **Portable Recovery Beta** to **Secure Sharing Beta** by replacing raw permanent recovery-link sharing as the primary handoff flow with temporary server-validated bearer capabilities. It still does not provide user-account authentication, identity ownership, broad booking listing/search, a tamper-proof audit system, or real operational healthcare booking infrastructure. Share tokens are temporary booking capabilities and should only be shared with intended recipients.

## v11.0.0 — 2026-09-14

### Portable Recovery Beta
- Added accountless cross-device booking handoff on top of the v10 durable recovery contract using `#mosigo-recovery=...` URL fragments.
- Added portable recovery link creation and parsing in `src/v11-booking.js` through `MosigoV11BookingHandoff`, carrying the booking ID plus recovery key as the booking capability.
- Redacted the recovery fragment with `history.replaceState` before durable recovery so the recovery credential is removed from the visible URL before the v10 recovery request runs.
- Kept recovery credentials out of query strings and delegated canonical recovery to `MosigoV10BookingDurability.recover(...)` instead of introducing a new server-side ownership or account model.
- Added a booking-status action to copy a portable recovery link and a landing entry point labeled `다른 기기의 예약 이어보기`.
- Added `src/v11-ui.js` and `MosigoV11PortableRecoveryUi` for an in-app recovery sheet with labeled input, explicit error state, keyboard handling, and successful routing to the existing `s-order` booking status screen.
- Preserved the v10 server contract without a schema bump: `/api/bookings` remains `schemaVersion: v10`, `resource: durable-booking-resource`, newly created bookings remain M10, and Private Vercel Blob plus revision + ETag CAS semantics remain unchanged.
- Added `tests/v11-handoff.test.js`, `tests/v11-static.test.js`, and Production Smoke coverage for v11 asset wiring, fragment redaction, no query-secret transport, recovery UI entry points, successful handoff routing, and continued v10 durable API behavior.
- Tightened Vercel Git deployment policy from `*` to `**` branch matching so slash-named non-main branches do not consume Preview deployments while `main` remains deployable.

### Production QA
- Passed PR #41 Quality #80 for the Portable Recovery Beta implementation and merged it as `c73e939a6ed178f0ce349ece95ad88af89028fb0`.
- Passed main Quality #81 after the v11 feature merge.
- Passed PR #42 Quality #82 and main Quality #83 for the Production Smoke retry-window hardening without changing v11 application source.
- Passed PR #43 Quality #85 for the Vercel preview-branch guard and merged it as `b402aa16ad4f3217f506e423a10b34c7aa25f71d`.
- Verified Vercel Production deployment `dpl_HH1M8gqpF4ECfF1nyciLmUdKbuhv` reached `READY` from GitHub-verified `main` commit `b402aa16ad4f3217f506e423a10b34c7aa25f71d`.
- Confirmed live `/v11-booking.js` and `/v11-ui.js` return HTTP 200 and live `/api/health` reports commit `b402aa16ad4f3217f506e423a10b34c7aa25f71d`.
- Confirmed Production Smoke #59 completed successfully against the v11 Production deployment while preserving the durable v10/M10 booking contract.

### Scope
v11 advances Mosigo from a **Durable Booking Beta** to a **Portable Recovery Beta** by letting a booking capability move between devices without adding accounts. It still does not provide user-account authentication, identity ownership, broad booking listing/search, a tamper-proof audit system, or real operational healthcare booking infrastructure. The recovery link is a bearer capability and must only be shared with the intended recipient.

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
- Finalized v10 release metadata on GitHub-verified commit `09be83e946c0aba4b1f958e24d10c7b22719030b`, preserving `00c2fad6d35f39eddce86ac01a28750e183eec1a` as the final application-source commit.
- Confirmed final Quality #76 and Production Smoke #47 succeeded for the v10 release-finalization path.
- Confirmed Automatic Release #20 succeeded and created immutable GitHub Release `v10.0.0` (Release ID `387877616`) with the tag targeting `09be83e946c0aba4b1f958e24d10c7b22719030b`.

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
