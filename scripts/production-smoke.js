const BASE_URL = process.env.MOSIGO_PRODUCTION_URL || 'https://mosigo-nine.vercel.app';
const EXPECTED_COMMIT = process.env.EXPECTED_COMMIT || '';
const MAX_ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS || 12);
const RETRY_MS = Number(process.env.SMOKE_RETRY_MS || 10000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(path) {
  const response = await fetch(new URL(path, BASE_URL), { redirect: 'follow' });
  const text = await response.text();
  return { response, text };
}

async function fetchJson(path) {
  const { response, text } = await fetchText(path);
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
  assert(bookings.json.schemaVersion === 'v6', `Unexpected booking schema: ${bookings.json.schemaVersion}`);
  assert(bookings.json.authoritativeTransitions === true, 'Booking API transition authority is not enabled');
  assert(Array.isArray(bookings.json.actions) && bookings.json.actions.includes('cancel'), 'Booking API actions are incomplete');

  for (const asset of ['/v4-functional.js', '/booking-state.js', '/v4-booking.js', '/v6-booking.js']) {
    const result = await fetchText(asset);
    assert(result.response.ok, `${asset} returned ${result.response.status}`);
    assert(/javascript/i.test(result.response.headers.get('content-type') || ''), `${asset} did not return JavaScript`);
  }

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
      console.log(`Production smoke passed on attempt ${attempt}; commit=${commit || 'unknown'}`);
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
