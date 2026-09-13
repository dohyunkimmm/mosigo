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

  const durable = bookings.json.durableServerPersistence === true;
  if (RELEASE_VERSION.startsWith('10.') || RELEASE_VERSION.startsWith('11.')) {
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
    const canonical = await fetchJson(`/api/bookings?bookingId=${encodeURIComponent(created.json.booking.bookingId)}`, {
      headers: { 'X-Mosigo-Recovery-Key': recoveryKey }
    });
    assert(canonical.response.ok && canonical.json.durablePersisted === true, 'Durable canonical read failed');
    assert(canonical.json.booking?.revision === 2, 'Durable canonical read returned the wrong revision');
  }

  for (const asset of ['/v4-functional.js', '/booking-state.js', '/v4-booking.js', '/v6-booking.js', '/v7-booking.js', '/v8-booking.js', '/v9-booking.js', '/v10-booking.js', '/v11-booking.js', '/v11-ui.js']) {
    const result = await fetchText(asset);
    assert(result.response.ok, `${asset} returned ${result.response.status}`);
    assert(/javascript/i.test(result.response.headers.get('content-type') || ''), `${asset} did not return JavaScript`);
  }

  const v10Asset = await fetchText('/v10-booking.js');
  assert(v10Asset.text.includes('MosigoV10BookingDurability'), 'v10 durability runtime is missing');
  assert(v10Asset.text.includes('X-Mosigo-Recovery-Key'), 'v10 recovery credential flow is missing');
  assert(v10Asset.text.includes("v11.src='v11-booking.js'"), 'v10 does not load the v11 portable recovery runtime');
  assert(v10Asset.text.includes("v11Ui.src='v11-ui.js'"), 'v10 does not load the v11 portable recovery UI');

  const v11Asset = await fetchText('/v11-booking.js');
  assert(v11Asset.text.includes('MosigoV11BookingHandoff'), 'v11 portable recovery facade is missing');
  assert(v11Asset.text.includes('#mosigo-recovery='), 'v11 recovery fragment contract is missing');
  assert(v11Asset.text.includes('history?.replaceState'), 'v11 recovery fragment redaction is missing');
  assert(!v11Asset.text.includes('?recoveryKey='), 'v11 must not put recovery credentials in URL query parameters');

  const v11UiAsset = await fetchText('/v11-ui.js');
  assert(v11UiAsset.text.includes('MosigoV11PortableRecoveryUi'), 'v11 portable recovery UI facade is missing');
  assert(v11UiAsset.text.includes('다른 기기의 예약 이어보기'), 'v11 recovery entry point is missing');
  assert(v11UiAsset.text.includes('mosigo:booking-handoff'), 'v11 recovery success routing is missing');

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
      console.log(`Production smoke passed on attempt ${attempt}; commit=${commit || 'unknown'}; durable=${RELEASE_VERSION.startsWith('10.') || RELEASE_VERSION.startsWith('11.') ? 'required' : 'development'}`);
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
