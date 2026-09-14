const fs = require('node:fs');

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

async function requestJson(path, options) {
  return fetchJson(path, options);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFromResponse(response) {
  return String(response.headers.get('set-cookie') || '').split(';')[0];
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
  if (['10.','11.','12.','13.'].some((prefix) => RELEASE_VERSION.startsWith(prefix))) {
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

  const sampleBooking = {
    hospitalId: 'hospital-1',
    hospitalName: '똑똑연세내과의원',
    managerIndex: 0,
    managerName: '김민준',
    targetName: '아버지',
    date: '2026-09-20',
    time: '10:00',
    durationHours: 2,
    mode: '차량 동행',
    amount: 45000
  };
  const created = await requestJson('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking: sampleBooking })
  });
  assert(created.response.status === 201 && created.json.success === true, 'Booking create smoke failed');
  assert(/^M10[A-Z0-9]{8}$/.test(created.json.booking?.bookingId || ''), 'Booking create did not return an M10 ID');
  assert(created.json.booking?.revision === 1, 'Booking create revision is not 1');
  assert(created.json.booking?.historyComplete === true, 'New booking history should be complete');
  assert(created.json.booking?.history?.[0]?.type === 'created', 'Booking create history event is missing');
  if (durable) assert(typeof created.json.recoveryKey === 'string' && created.json.recoveryKey.length > 10, 'Durable create did not return a recovery key');

  const recoveryKey = created.json.recoveryKey || '';
  const confirmed = await requestJson('/api/bookings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(recoveryKey ? { 'X-Mosigo-Recovery-Key': recoveryKey } : {})
    },
    body: JSON.stringify({
      action: 'confirm',
      booking: created.json.booking,
      bookingId: created.json.booking.bookingId,
      expectedRevision: created.json.booking.revision,
      recoveryKey
    })
  });
  assert(confirmed.response.ok && confirmed.json.success === true, 'Booking transition smoke failed');
  assert(confirmed.json.booking?.phase === 'confirmed', 'Booking transition did not confirm');
  assert(confirmed.json.booking?.revision === 2, 'Booking revision did not advance');
  assert(confirmed.json.booking?.history?.length === 2, 'Booking history did not append transition');

  const recovered = await requestJson('/api/bookings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(recoveryKey ? { 'X-Mosigo-Recovery-Key': recoveryKey } : {})
    },
    body: JSON.stringify({ booking: confirmed.json.booking, recoveryKey })
  });
  assert(recovered.response.ok && recovered.json.recovered === true, 'Booking recovery smoke failed');
  assert(recovered.json.booking?.bookingId === created.json.booking.bookingId, 'Recovered booking ID changed');
  assert(recovered.json.booking?.phase === 'confirmed', 'Recovered booking phase changed');
  assert(recovered.json.booking?.revision === 2, 'Recovered booking revision changed');

  if (durable) {
    const bookingId = created.json.booking.bookingId;
    const canonical = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(bookingId)}`, {
      headers: { 'X-Mosigo-Recovery-Key': recoveryKey }
    });
    assert(canonical.response.ok && canonical.json.durablePersisted === true, 'Durable canonical read failed');
    assert(canonical.json.booking?.revision === 2, 'Durable canonical read returned the wrong revision');

    const firstShare = await requestJson('/api/booking-shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mosigo-Recovery-Key': recoveryKey
      },
      body: JSON.stringify({ bookingId, ttlMinutes: 60 })
    });
    assert(firstShare.response.status === 201 && firstShare.json.success === true, 'Secure share issuance failed');
    assert(typeof firstShare.json.shareToken === 'string' && firstShare.json.shareToken.length >= 24, 'Secure share token is missing');
    assert(firstShare.json.share?.active === true, 'Secure share should be active after issuance');
    const firstToken = firstShare.json.shareToken;

    const sharedCanonical = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(bookingId)}`, {
      headers: { 'X-Mosigo-Share-Token': firstToken }
    });
    assert(sharedCanonical.response.ok && sharedCanonical.json.booking?.revision === 2, 'Secure share canonical recovery failed');

    const rotatedShare = await requestJson('/api/booking-shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mosigo-Recovery-Key': recoveryKey
      },
      body: JSON.stringify({ bookingId, ttlMinutes: 30 })
    });
    assert(rotatedShare.response.status === 201 && rotatedShare.json.share?.generation >= 2, 'Secure share rotation failed');
    const secondToken = rotatedShare.json.shareToken;
    assert(secondToken && secondToken !== firstToken, 'Secure share rotation did not replace the token');

    const oldShare = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(bookingId)}`, {
      headers: { 'X-Mosigo-Share-Token': firstToken }
    });
    assert(oldShare.response.status === 401 && oldShare.json.success === false, 'Rotated share token should no longer authorize booking access');

    const rotatedCanonical = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(bookingId)}`, {
      headers: { 'X-Mosigo-Share-Token': secondToken }
    });
    assert(rotatedCanonical.response.ok && rotatedCanonical.json.booking?.bookingId === bookingId, 'Rotated share token is not active');

    const revokedShare = await requestJson('/api/booking-shares', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Mosigo-Recovery-Key': recoveryKey
      },
      body: JSON.stringify({ bookingId })
    });
    assert(revokedShare.response.ok && revokedShare.json.share?.active === false, 'Secure share revocation failed');

    const revokedCanonical = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(bookingId)}`, {
      headers: { 'X-Mosigo-Share-Token': secondToken }
    });
    assert(revokedCanonical.response.status === 401 && revokedCanonical.json.success === false, 'Revoked share token should not authorize booking access');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const accountEmail = `smoke-${unique}@example.com`;
    const accountPassword = `Mosigo-${unique}-Pass!`;
    const registered = await requestJson('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', email: accountEmail, password: accountPassword })
    });
    assert(registered.response.status === 201 && registered.json.authenticated === true, 'v13 account registration failed');
    const accountCookie = cookieFromResponse(registered.response);
    assert(/^mosigo_v13_session=/.test(accountCookie), 'v13 registration did not return a session cookie');

    const ownedCreated = await requestJson('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: accountCookie },
      body: JSON.stringify({ booking: sampleBooking })
    });
    assert(ownedCreated.response.status === 201 && ownedCreated.json.accountOwned === true, 'v13 account-owned booking creation failed');
    const ownedBookingId = ownedCreated.json.booking?.bookingId;

    const ownedList = await fetchJson('/api/account?resource=bookings', { headers: { Cookie: accountCookie } });
    assert(ownedList.response.ok && ownedList.json.bookings?.some((item) => item.bookingId === ownedBookingId), 'v13 owned booking listing failed');

    const ownedCanonical = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(ownedBookingId)}`, { headers: { Cookie: accountCookie } });
    assert(ownedCanonical.response.ok && ownedCanonical.json.accessType === 'account-session', 'v13 account session did not authorize owned booking');

    const accountShare = await requestJson('/api/booking-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: accountCookie },
      body: JSON.stringify({ bookingId: ownedBookingId, ttlMinutes: 60 })
    });
    assert(accountShare.response.status === 201 && accountShare.json.ownerAccessType === 'account-session', 'v13 account owner could not issue v12 share');

    const accountRevoke = await requestJson('/api/booking-shares', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: accountCookie },
      body: JSON.stringify({ bookingId: ownedBookingId })
    });
    assert(accountRevoke.response.ok && accountRevoke.json.share?.active === false, 'v13 account owner could not revoke v12 share');

    const loggedOut = await requestJson('/api/account', { method: 'DELETE', headers: { Cookie: accountCookie } });
    assert(loggedOut.response.ok && loggedOut.json.authenticated === false, 'v13 logout failed');
    const afterLogout = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(ownedBookingId)}`, { headers: { Cookie: accountCookie } });
    assert(afterLogout.response.status === 401, 'revoked v13 session should not authorize owned booking');
  }

  for (const asset of ['/v4-functional.js', '/booking-state.js', '/v4-booking.js', '/v6-booking.js', '/v7-booking.js', '/v8-booking.js', '/v9-booking.js', '/v10-booking.js', '/v11-booking.js', '/v11-ui.js', '/v12-sharing.js', '/v12-ui.js', '/v13-account.js', '/v13-ui.js']) {
    const result = await fetchText(asset);
    assert(result.response.ok, `${asset} returned ${result.response.status}`);
    assert(/javascript/i.test(result.response.headers.get('content-type') || ''), `${asset} did not return JavaScript`);
  }

  const v10Asset = await fetchText('/v10-booking.js');
  assert(v10Asset.text.includes('MosigoV10BookingDurability'), 'v10 durability runtime is missing');
  assert(v10Asset.text.includes('X-Mosigo-Recovery-Key'), 'v10 recovery credential flow is missing');
  assert(v10Asset.text.includes("v11.src='v11-booking.js'"), 'v10 does not load the v11 portable recovery runtime');
  assert(v10Asset.text.includes("v11Ui.src='v11-ui.js'"), 'v10 does not load the v11 portable recovery UI');
  assert(v10Asset.text.includes("v12.src='v12-sharing.js'"), 'v10 does not load the v12 secure sharing runtime');
  assert(v10Asset.text.includes("v12Ui.src='v12-ui.js'"), 'v10 does not load the v12 secure sharing UI');
  assert(v10Asset.text.includes("v13.src='v13-account.js'"), 'v10 does not load the v13 account ownership runtime');
  assert(v10Asset.text.includes("v13Ui.src='v13-ui.js'"), 'v10 does not load the v13 account ownership UI');

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

  return health.json.commit;
}

(async () => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const commit = await runChecks();
      const durableRequired = ['10.','11.','12.','13.'].some((prefix) => RELEASE_VERSION.startsWith(prefix));
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
