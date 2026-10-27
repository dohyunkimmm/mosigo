const fs = require('node:fs');
const { requiresDurableStorage } = require('./smoke-policy.js');

const BASE_URL = process.env.MOSIGO_PRODUCTION_URL || 'https://mosigo-nine.vercel.app';
const EXPECTED_COMMIT = process.env.EXPECTED_COMMIT || '';
const MAX_ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS || 12);
const RETRY_MS = Number(process.env.SMOKE_RETRY_MS || 10000);
const RELEASE_VERSION = (() => {
  try { return fs.readFileSync('VERSION', 'utf8').trim(); } catch (error) { return ''; }
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(path, options = {}) {
  const response = await fetch(new URL(path, BASE_URL), { redirect: 'follow', ...options });
  const text = await response.text();
  return { response, text };
}

async function fetchJson(path, options = {}) {
  const { response, text } = await fetchText(path, options);
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} returned invalid JSON (${response.status}): ${text.slice(0, 160)}`);
  }
  return { response, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runChecks() {
  const root = await fetchText('/');
  assert(root.response.ok, `/ returned ${root.response.status}`);
  assert(root.text.includes('<title>모시고 |'), 'Production root is missing the Mosigo title');
  assert(root.response.headers.get('x-content-type-options') === 'nosniff', 'Missing X-Content-Type-Options header');
  assert(root.response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Unexpected Referrer-Policy header');

  const health = await fetchJson('/api/health');
  assert(health.response.ok, `/api/health returned ${health.response.status}`);
  assert(health.json.ok === true && health.json.status === 'ready', 'Health endpoint is not ready');
  assert(health.json.environment === 'production', `Health endpoint environment is ${health.json.environment}`);
  if (EXPECTED_COMMIT) {
    assert(
      health.json.commit === EXPECTED_COMMIT,
      `Production is still on ${health.json.commit || 'unknown commit'}; expected ${EXPECTED_COMMIT}`
    );
  }

  const hospitals = await fetchJson('/api/hospitals?managerAvailable=1&sameDay=1&sort=wait&numOfRows=6');
  assert(hospitals.response.ok, `/api/hospitals returned ${hospitals.response.status}`);
  assert(hospitals.json.success === true, 'Hospital API did not report success');
  assert(hospitals.json.schemaVersion === 'v4', `Unexpected hospital schema: ${hospitals.json.schemaVersion}`);
  assert(Array.isArray(hospitals.json.items) && hospitals.json.items.length > 0, 'Hospital API returned no smoke-test items');

  const bookings = await fetchJson('/api/bookings');
  assert(bookings.response.ok, `/api/bookings returned ${bookings.response.status}`);
  assert(bookings.json.success === true, 'Booking API did not report success');
  assert(bookings.json.schemaVersion === 'v10', `Unexpected booking schema: ${bookings.json.schemaVersion}`);
  assert(bookings.json.resource === 'durable-booking-resource', `Unexpected booking resource: ${bookings.json.resource}`);
  assert(bookings.json.authoritativeTransitions === true, 'Booking API transition authority is not enabled');
  assert(bookings.json.recoverable === true, 'Booking API recovery is not enabled');
  assert(bookings.json.traceable === true, 'Booking lifecycle trace is not enabled');
  assert(bookings.json.historyValidation === 'server', 'Booking history is not server-validated');
  assert(bookings.json.coordinated === true, 'Same-device booking coordination is not enabled');
  assert(bookings.json.coordinationScope === 'same-device', `Unexpected coordination scope: ${bookings.json.coordinationScope}`);
  assert(bookings.json.coordinationTransport === 'storage-event', `Unexpected coordination transport: ${bookings.json.coordinationTransport}`);
  assert(bookings.json.snapshotConflictPolicy === 'higher-revision-wins', 'Unexpected snapshot conflict policy');
  assert(bookings.json.equalRevisionConflictPolicy === 'stored-snapshot-wins', 'Unexpected equal-revision conflict policy');
  assert(bookings.json.bookingIdVersion === 'M10', `Unexpected booking ID version: ${bookings.json.bookingIdVersion}`);
  assert(Array.isArray(bookings.json.actions) && bookings.json.actions.includes('cancel'), 'Booking API actions are incomplete');
  assert(bookings.json.secureSharing === true, 'v12 secure sharing capability is not enabled');
  assert(bookings.json.shareCredential === 'opaque-expiring-share-token', 'Unexpected v12 share credential');
  assert(bookings.json.shareEndpoint === '/api/booking-shares', 'Unexpected v12 share endpoint');
  assert(bookings.json.shareRevocable === true && bookings.json.shareRotatable === true, 'v12 share revocation/rotation is not enabled');
  assert(bookings.json.accountOwnership === true, 'v13 account ownership capability is not enabled');
  assert(bookings.json.accountEndpoint === '/api/account', 'Unexpected v13 account endpoint');
  assert(bookings.json.accountSessionCredential === 'http-only-secure-cookie', 'Unexpected v13 account session credential');

  const shareCapability = await fetchJson('/api/booking-shares');
  assert(shareCapability.response.ok, `/api/booking-shares returned ${shareCapability.response.status}`);
  assert(shareCapability.json.success === true, 'Booking-share API did not report success');
  assert(shareCapability.json.schemaVersion === 'v12', `Unexpected booking-share schema: ${shareCapability.json.schemaVersion}`);
  assert(shareCapability.json.resource === 'secure-booking-share-resource', `Unexpected booking-share resource: ${shareCapability.json.resource}`);
  assert(shareCapability.json.enabled === true, 'Secure booking-share storage is not enabled');
  assert(shareCapability.json.revocable === true && shareCapability.json.rotatable === true, 'Secure sharing controls are incomplete');
  assert(shareCapability.json.rawTokenStoredServerSide === false, 'Server must not store raw share tokens');
  assert(shareCapability.json.ownerAccountSession === true, 'v13 account owners should be able to manage v12 sharing');

  const accountCapability = await fetchJson('/api/account');
  assert(accountCapability.response.ok, `/api/account returned ${accountCapability.response.status}`);
  assert(accountCapability.json.success === true, 'Account API did not report success');
  assert(accountCapability.json.schemaVersion === 'v13', `Unexpected account schema: ${accountCapability.json.schemaVersion}`);
  assert(accountCapability.json.resource === 'account-ownership-resource', `Unexpected account resource: ${accountCapability.json.resource}`);
  assert(accountCapability.json.enabled === true, 'Account ownership storage is not enabled');
  assert(accountCapability.json.sessionCredential === 'http-only-secure-cookie', 'Account session is not cookie-backed');
  assert(accountCapability.json.bookingOwnership === true && accountCapability.json.bookingListing === true, 'Account ownership/listing capability is incomplete');

  const durable = bookings.json.durableServerPersistence === true;
  if (requiresDurableStorage(RELEASE_VERSION)) {
    assert(durable, 'v10+ release requires durable server persistence to be configured');
  }
  if (durable) {
    assert(bookings.json.persistence === 'server-durable', 'Durable capability should report server-durable persistence');
    assert(bookings.json.recoveryScope === 'booking-key', 'Durable recovery should use booking-key scope');
    assert(bookings.json.serverConflictPolicy === 'revision-plus-etag-cas', 'Durable conflict policy is not active');
  } else {
    assert(bookings.json.persistence === 'client-local-fallback', 'Unconfigured storage should remain an explicit local fallback');
    assert(bookings.json.recoveryScope === 'same-device', 'Fallback recovery scope should remain same-device');
  }

  // The production smoke is intentionally read-only for every commit. Write-path
  // integration is covered by local tests until an isolated, expiring test store
  // is provisioned. Never create account/booking/share records in Production.

  for (const asset of ['/v4-functional.js', '/booking-state.js', '/v4-booking.js', '/v6-booking.js', '/v7-booking.js', '/v8-booking.js', '/v9-booking.js', '/v10-booking.js', '/v11-booking.js', '/v11-ui.js', '/v12-sharing.js', '/v12-ui.js', '/v13-account.js', '/v13-ui.js']) {
    const result = await fetchText(asset);
    assert(result.response.ok, `${asset} returned ${result.response.status}`);
    assert(/javascript/i.test(result.response.headers.get('content-type') || ''), `${asset} did not return JavaScript`);
  }

  const v10Asset = await fetchText('/v10-booking.js');
  assert(v10Asset.text.includes('MosigoV10BookingDurability'), 'v10 durability runtime is missing');
  assert(v10Asset.text.includes('X-Mosigo-Recovery-Key'), 'v10 recovery credential flow is missing');
  assert(v10Asset.text.includes("v11.src='/runtime/booking-handoff.js'"), 'v10 does not load the v11 portable recovery runtime');
  assert(v10Asset.text.includes("v11Ui.src='/runtime/booking-handoff-ui.js'"), 'v10 does not load the v11 portable recovery UI');
  assert(v10Asset.text.includes("v12.src='/runtime/booking-sharing.js'"), 'v10 does not load the v12 secure sharing runtime');
  assert(v10Asset.text.includes("v12Ui.src='/runtime/booking-sharing-ui.js'"), 'v10 does not load the v12 secure sharing UI');
  assert(v10Asset.text.includes("v13.src='/runtime/account-ownership.js'"), 'v10 does not load the v13 account ownership runtime');
  assert(v10Asset.text.includes("v13Ui.src='/runtime/account-ui.js'"), 'v10 does not load the v13 account ownership UI');

  const v11Asset = await fetchText('/v11-booking.js');
  assert(v11Asset.text.includes('MosigoV11BookingHandoff'), 'v11 portable recovery facade is missing');
  assert(v11Asset.text.includes('#mosigo-recovery='), 'v11 recovery fragment contract is missing');
  assert(v11Asset.text.includes('history?.replaceState'), 'v11 recovery fragment redaction is missing');
  assert(!v11Asset.text.includes('?recoveryKey='), 'v11 must not put recovery credentials in URL query parameters');

  const v11UiAsset = await fetchText('/v11-ui.js');
  assert(v11UiAsset.text.includes('MosigoV11PortableRecoveryUi'), 'v11 portable recovery UI facade is missing');
  assert(v11UiAsset.text.includes('다른 기기의 예약 이어보기'), 'v11 recovery entry point is missing');
  assert(v11UiAsset.text.includes('#mosigo-share='), 'v11 recovery modal does not accept v12 share links');

  const v12Asset = await fetchText('/v12-sharing.js');
  assert(v12Asset.text.includes('MosigoV12SecureSharing'), 'v12 secure sharing facade is missing');
  assert(v12Asset.text.includes('#mosigo-share='), 'v12 secure share fragment contract is missing');
  assert(v12Asset.text.includes('X-Mosigo-Share-Token'), 'v12 secure share credential header is missing');
  assert(v12Asset.text.includes('history?.replaceState'), 'v12 secure share fragment redaction is missing');
  assert(v12Asset.text.includes('setOwnerAccessProvider'), 'v12 sharing is not wired for v13 account owners');
  assert(!v12Asset.text.includes('?shareToken='), 'v12 must not put share credentials in query parameters');

  const v12UiAsset = await fetchText('/v12-ui.js');
  assert(v12UiAsset.text.includes('MosigoV12SecureSharingUi'), 'v12 secure sharing UI facade is missing');
  assert(v12UiAsset.text.includes('공유 링크 폐기'), 'v12 share revocation control is missing');
  assert(v12UiAsset.text.includes('안전한 이어보기 링크 복사'), 'v12 expiring share copy control is missing');

  const v13Asset = await fetchText('/v13-account.js');
  assert(v13Asset.text.includes('MosigoV13AccountOwnership'), 'v13 account ownership facade is missing');
  assert(v13Asset.text.includes("ACCOUNT_API='/api/account'"), 'v13 account endpoint wiring is missing');
  assert(v13Asset.text.includes("credentials:'same-origin'"), 'v13 account requests must use same-origin cookie credentials');
  assert(!v13Asset.text.includes('localStorage'), 'v13 account session must not be stored in localStorage');
  assert(!v13Asset.text.includes('sessionStorage'), 'v13 account session must not be stored in sessionStorage');

  const v13UiAsset = await fetchText('/v13-ui.js');
  assert(v13UiAsset.text.includes('계정 로그인 · 예약 이어보기'), 'v13 account login entry is missing');
  assert(v13UiAsset.text.includes('내 예약 보기'), 'v13 owned booking list UI is missing');
  assert(v13UiAsset.text.includes('현재 예약을 내 계정에 연결'), 'v13 booking claim UI is missing');

  const robots = await fetchText('/robots.txt');
  assert(robots.response.ok && /Sitemap:\s*https:\/\/mosigo-nine\.vercel\.app\/sitemap\.xml/i.test(robots.text), 'robots.txt is not production-ready');

  const sitemap = await fetchText('/sitemap.xml');
  assert(sitemap.response.ok && /<loc>https:\/\/mosigo-nine\.vercel\.app\/<\/loc>/.test(sitemap.text), 'sitemap.xml is not production-ready');

  console.log('Read-only smoke: verified production API capabilities and assets without creating test records.');
  return health.json.commit;
}

(async () => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const commit = await runChecks();
      const durableRequired = requiresDurableStorage(RELEASE_VERSION);
      console.log(`Production smoke passed on attempt ${attempt}; commit=${commit || 'unknown'}; durable=${durableRequired ? 'required' : 'development'}`);
      process.exit(0);
    } catch (error) {
      lastError = error;
      console.warn(`Production smoke attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}`);
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_MS);
    }
  }

  console.error(`Production smoke failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message || 'unknown error'}`);
  process.exit(1);
})();
