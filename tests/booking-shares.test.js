const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler: createBookingsHandler } = require('../src/api/bookings.js');
const { createHandler: createSharesHandler } = require('../src/api/booking-shares.js');
const { createBookingStore } = require('../src/lib/booking-store.js');
const { createBookingShareStore } = require('../src/lib/booking-share-store.js');

function fakeBlobApi() {
  const objects = new Map();
  let sequence = 0;
  return {
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

test('v12 secure share capability issues, rotates, authorizes, and revokes temporary booking access', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const store = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi });
  const bookings = createBookingsHandler({ store, shareStore });
  const shares = createSharesHandler({ store, shareStore });

  const bookingCapability = await invoke(bookings);
  assert.equal(bookingCapability.body.schemaVersion, 'v10');
  assert.equal(bookingCapability.body.secureSharing, true);
  assert.equal(bookingCapability.body.shareEndpoint, '/api/booking-shares');

  const shareCapability = await invoke(shares);
  assert.equal(shareCapability.body.schemaVersion, 'v12');
  assert.equal(shareCapability.body.resource, 'secure-booking-share-resource');
  assert.equal(shareCapability.body.revocable, true);
  assert.equal(shareCapability.body.rotatable, true);
  assert.equal(shareCapability.body.rawTokenStoredServerSide, false);

  const created = await invoke(bookings, { method: 'POST', body: { booking: sample } });
  assert.equal(created.statusCode, 201);
  const bookingId = created.body.booking.bookingId;
  const recoveryKey = created.body.recoveryKey;

  const issued = await invoke(shares, {
    method: 'POST',
    headers: { 'x-mosigo-recovery-key': recoveryKey },
    body: { bookingId, ttlMinutes: 60 }
  });
  assert.equal(issued.statusCode, 201);
  assert.match(issued.body.shareToken, /^[A-Za-z0-9_-]{24,}$/);
  assert.equal(issued.body.share.active, true);
  const firstToken = issued.body.shareToken;

  const sharedRead = await invoke(bookings, {
    query: { bookingId },
    headers: { 'x-mosigo-share-token': firstToken }
  });
  assert.equal(sharedRead.statusCode, 200);
  assert.equal(sharedRead.body.booking.bookingId, bookingId);

  const sharedPatch = await invoke(bookings, {
    method: 'PATCH',
    headers: { 'x-mosigo-share-token': firstToken },
    body: { bookingId, action: 'confirm', expectedRevision: 1 }
  });
  assert.equal(sharedPatch.statusCode, 200);
  assert.equal(sharedPatch.body.booking.phase, 'confirmed');
  assert.equal(sharedPatch.body.booking.revision, 2);

  const rotated = await invoke(shares, {
    method: 'POST',
    headers: { 'x-mosigo-recovery-key': recoveryKey },
    body: { bookingId, ttlMinutes: 30 }
  });
  const secondToken = rotated.body.shareToken;
  assert.notEqual(secondToken, firstToken);
  assert.equal(rotated.body.share.generation, 2);

  const oldDenied = await invoke(bookings, {
    query: { bookingId },
    headers: { 'x-mosigo-share-token': firstToken }
  });
  assert.equal(oldDenied.statusCode, 401);
  assert.equal(oldDenied.body.error, 'booking_share_token_invalid');

  const newAllowed = await invoke(bookings, {
    query: { bookingId },
    headers: { 'x-mosigo-share-token': secondToken }
  });
  assert.equal(newAllowed.statusCode, 200);
  assert.equal(newAllowed.body.booking.revision, 2);

  const revoked = await invoke(shares, {
    method: 'DELETE',
    headers: { 'x-mosigo-recovery-key': recoveryKey },
    body: { bookingId }
  });
  assert.equal(revoked.statusCode, 200);
  assert.equal(revoked.body.share.active, false);
  assert.equal(revoked.body.share.revoked, true);

  const revokedDenied = await invoke(bookings, {
    query: { bookingId },
    headers: { 'x-mosigo-share-token': secondToken }
  });
  assert.equal(revokedDenied.statusCode, 401);
  assert.equal(revokedDenied.body.error, 'booking_share_revoked');
});

test('booking-share management requires the durable owner recovery key', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const store = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi });
  const bookings = createBookingsHandler({ store, shareStore });
  const shares = createSharesHandler({ store, shareStore });
  const created = await invoke(bookings, { method: 'POST', body: { booking: sample } });
  const bookingId = created.body.booking.bookingId;

  const denied = await invoke(shares, {
    method: 'POST',
    body: { bookingId, ttlMinutes: 60 }
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.body.error, 'booking_recovery_key_invalid');
});
