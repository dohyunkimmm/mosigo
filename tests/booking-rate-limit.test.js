const test = require('node:test');
const assert = require('node:assert/strict');
const { createIpBurstLimiter } = require('../src/lib/ip-burst-limiter.js');
const { createHandler } = require('../src/api/bookings.js');
const { createBookingRequest } = require('../src/lib/booking-service.js');
const { hashRecoveryKey } = require('../src/lib/booking-store.js');

const sample = {
  hospitalId: 'hospital-1', hospitalName: 'Demo hospital',
  managerIndex: 0, managerName: 'Demo manager',
  targetName: 'Demo patient', date: '2026-11-01',
  time: '10:00', durationHours: 2, mode: 'car'
};

async function invoke(handler, method, body, headers = {}) {
  const result = { statusCode: 200, body: null, headers: {} };
  const res = {
    setHeader(name, value) { result.headers[String(name).toLowerCase()] = value; },
    status(statusCode) { result.statusCode = statusCode; return this; },
    json(value) { result.body = value; return this; }
  };
  await handler({ method, body, headers }, res);
  return result;
}

test('IP burst limiter bounds repeated calls and resets after the time window', () => {
  let now = 1000;
  const limiter = createIpBurstLimiter({ maxAttempts: 2, windowMs: 1000, clock: () => now });
  const req = { headers: { 'x-forwarded-for': '192.0.2.10' } };
  assert.equal(limiter(req).allowed, true);
  assert.equal(limiter(req).allowed, true);
  const denied = limiter(req);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfter, 1);
  assert.equal(limiter({ headers: { 'x-forwarded-for': '192.0.2.20' } }).allowed, true);
  now += 1000;
  assert.equal(limiter(req).allowed, true);
});

test('durable POST and first-time PUT refuse excess creations without persisting data', async () => {
  let writes = 0;
  const store = {
    configured: true,
    async create() { writes += 1; },
    async read() { return null; }
  };
  const handler = createHandler({
    store, accountStore: { configured: false }, shareStore: { configured: false },
    creationLimiter: () => ({ allowed: false, retryAfter: 37 })
  });
  const post = await invoke(handler, 'POST', sample);
  assert.equal(post.statusCode, 429);
  assert.equal(post.body.error, 'booking_rate_limited');
  assert.equal(post.headers['retry-after'], '37');

  const snapshot = createBookingRequest(sample);
  const put = await invoke(handler, 'PUT', { booking: snapshot });
  assert.equal(put.statusCode, 429);
  assert.equal(put.body.error, 'booking_rate_limited');
  assert.equal(writes, 0);
});

test('existing booking recovery remains available even when creation is throttled', async () => {
  const booking = createBookingRequest(sample);
  const handler = createHandler({
    store: {
      configured: true,
      async read() { return { record: { booking, recoveryKeyHash: hashRecoveryKey('test-key') }, etag: 'v1' }; }
    },
    accountStore: { configured: false }, shareStore: { configured: false },
    creationLimiter: () => ({ allowed: false, retryAfter: 37 })
  });
  const response = await invoke(handler, 'PUT', { booking, recoveryKey: 'test-key' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.recovered, true);
});
