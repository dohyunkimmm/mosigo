const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler: createAccountHandler } = require('../src/api/account.js');
const { createHandler: createBookingsHandler } = require('../src/api/bookings.js');
const { createHandler: createSharesHandler } = require('../src/api/booking-shares.js');
const { createAccountStore } = require('../src/lib/account-store.js');
const { createBookingStore } = require('../src/lib/booking-store.js');
const { createBookingShareStore } = require('../src/lib/booking-share-store.js');

function fakeBlobApi() {
  const objects = new Map();
  let sequence = 0;
  return {
    objects,
    async get(pathname) {
      const value = objects.get(pathname);
      if (!value) return null;
      return {
        statusCode: 200,
        stream: new Blob([value.body]).stream(),
        blob: { etag: value.etag }
      };
    },
    async put(pathname, body, options = {}) {
      const current = objects.get(pathname);
      if (current && options.allowOverwrite === false) {
        const error = new Error('already exists');
        error.statusCode = 409;
        throw error;
      }
      if (options.ifMatch && (!current || current.etag !== options.ifMatch)) {
        const error = new Error('precondition failed');
        error.statusCode = 412;
        throw error;
      }
      const etag = `etag-${++sequence}`;
      objects.set(pathname, { body: String(body), etag });
      return { etag };
    }
  };
}

async function invoke(handler, { method = 'GET', body, query = {}, headers = {} } = {}) {
  const responseHeaders = {};
  const result = { statusCode: 200, headers: responseHeaders, body: undefined };
  const req = { method, body, query, headers };
  const res = {
    setHeader(name, value) { responseHeaders[String(name).toLowerCase()] = value; },
    status(code) { result.statusCode = code; return this; },
    json(payload) { result.body = payload; return this; }
  };
  await handler(req, res);
  return result;
}

function cookieHeader(setCookie) {
  return String(setCookie || '').split(';')[0];
}

const sample = {
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

test('v13 account session owns new bookings, lists them cross-device, and manages v12 sharing', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const accountStore = createAccountStore({ env, blobApi });
  const bookingStore = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi });
  const account = createAccountHandler({ accountStore, bookingStore });
  const bookings = createBookingsHandler({ store: bookingStore, shareStore, accountStore });
  const shares = createSharesHandler({ store: bookingStore, shareStore, accountStore });

  const capability = await invoke(account);
  assert.equal(capability.statusCode, 200);
  assert.equal(capability.body.schemaVersion, 'v13');
  assert.equal(capability.body.resource, 'account-ownership-resource');
  assert.equal(capability.body.sessionCredential, 'http-only-secure-cookie');

  const registered = await invoke(account, {
    method: 'POST',
    body: { action: 'register', email: 'owner@example.com', password: 'password-123' }
  });
  assert.equal(registered.statusCode, 201);
  assert.equal(registered.body.authenticated, true);
  assert.match(registered.headers['set-cookie'], /HttpOnly/);
  assert.match(registered.headers['set-cookie'], /Secure/);
  const cookie = cookieHeader(registered.headers['set-cookie']);

  const bookingCapability = await invoke(bookings);
  assert.equal(bookingCapability.body.accountOwnership, true);
  assert.equal(bookingCapability.body.accountEndpoint, '/api/account');

  const created = await invoke(bookings, {
    method: 'POST',
    headers: { cookie },
    body: { booking: sample }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.accountOwned, true);
  const bookingId = created.body.booking.bookingId;

  const listed = await invoke(account, { query: { resource: 'bookings' }, headers: { cookie } });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.bookings.length, 1);
  assert.equal(listed.body.bookings[0].bookingId, bookingId);

  const canonical = await invoke(bookings, { query: { bookingId }, headers: { cookie } });
  assert.equal(canonical.statusCode, 200);
  assert.equal(canonical.body.accessType, 'account-session');

  const issued = await invoke(shares, {
    method: 'POST',
    headers: { cookie },
    body: { bookingId, ttlMinutes: 60 }
  });
  assert.equal(issued.statusCode, 201);
  assert.equal(issued.body.ownerAccessType, 'account-session');
  assert.match(issued.body.shareToken, /^[A-Za-z0-9_-]{24,}$/);

  const logout = await invoke(account, { method: 'DELETE', headers: { cookie } });
  assert.equal(logout.statusCode, 200);
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);

  const denied = await invoke(bookings, { query: { bookingId }, headers: { cookie } });
  assert.equal(denied.statusCode, 401);
});

test('existing durable booking can be claimed once with recovery key and cannot be claimed by another account', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const accountStore = createAccountStore({ env, blobApi });
  const bookingStore = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi });
  const account = createAccountHandler({ accountStore, bookingStore });
  const bookings = createBookingsHandler({ store: bookingStore, shareStore, accountStore });

  const unowned = await invoke(bookings, { method: 'POST', body: { booking: sample } });
  const bookingId = unowned.body.booking.bookingId;
  const recoveryKey = unowned.body.recoveryKey;

  const first = await invoke(account, {
    method: 'POST',
    body: { action: 'register', email: 'first@example.com', password: 'password-123' }
  });
  const firstCookie = cookieHeader(first.headers['set-cookie']);
  const claimed = await invoke(account, {
    method: 'POST',
    headers: { cookie: firstCookie },
    body: { action: 'claim-booking', bookingId, recoveryKey }
  });
  assert.equal(claimed.statusCode, 200);
  assert.equal(claimed.body.claimed, true);

  const second = await invoke(account, {
    method: 'POST',
    body: { action: 'register', email: 'second@example.com', password: 'password-123' }
  });
  const secondCookie = cookieHeader(second.headers['set-cookie']);
  const conflict = await invoke(account, {
    method: 'POST',
    headers: { cookie: secondCookie },
    body: { action: 'claim-booking', bookingId, recoveryKey }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.error, 'booking_already_owned');

  const secondDenied = await invoke(bookings, { query: { bookingId }, headers: { cookie: secondCookie } });
  assert.equal(secondDenied.statusCode, 401);
  const firstAllowed = await invoke(bookings, { query: { bookingId }, headers: { cookie: firstCookie } });
  assert.equal(firstAllowed.statusCode, 200);
  assert.equal(firstAllowed.body.accessType, 'account-session');
});
