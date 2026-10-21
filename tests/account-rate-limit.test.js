const test = require('node:test');
const assert = require('node:assert/strict');
const { AccountStoreError } = require('../src/lib/account-store.js');
const { createHandler, createAuthBurstLimiter } = require('../src/api/account.js');

function request(ip) {
  return {
    method: 'POST',
    headers: { 'x-real-ip': ip },
    body: { action: 'login', email: 'example@example.com', password: 'wrong' }
  };
}

async function invoke(handler, req) {
  const response = { statusCode: 200, headers: {}, body: null };
  const res = {
    setHeader(name, value) { response.headers[String(name).toLowerCase()] = value; },
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; }
  };
  await handler(req, res);
  return response;
}

test('login throttle returns 429 after repeated attempts and does not call authentication again', async () => {
  let now = 0;
  let calls = 0;
  const authLimiter = createAuthBurstLimiter({ maxAttempts: 2, windowMs: 60_000, clock: () => now });
  const accountStore = {
    configured: true,
    async authenticate() {
      calls += 1;
      throw new AccountStoreError('account_credentials_invalid', 'Invalid credentials', 401);
    }
  };
  const handler = createHandler({ accountStore, bookingStore: { configured: true }, authLimiter });

  assert.equal((await invoke(handler, request('198.51.100.1'))).statusCode, 401);
  assert.equal((await invoke(handler, request('198.51.100.1'))).statusCode, 401);
  const rejected = await invoke(handler, request('198.51.100.1'));
  assert.equal(rejected.statusCode, 429);
  assert.equal(rejected.body.error, 'account_rate_limited');
  assert.equal(rejected.headers['retry-after'], '60');
  assert.equal(calls, 2);

  assert.equal((await invoke(handler, request('198.51.100.2'))).statusCode, 401);
  now = 60_000;
  assert.equal((await invoke(handler, request('198.51.100.1'))).statusCode, 401);
  assert.equal(calls, 4);
});
