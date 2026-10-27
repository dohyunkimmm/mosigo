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


test('share holders cannot issue, rotate, or revoke share grants without owner credentials', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const store = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi });
  const bookings = createBookingsHandler({ store, shareStore });
  const shares = createSharesHandler({ store, shareStore });

  const created = await invoke(bookings, { method: 'POST', body: { booking: sample } });
  assert.equal(created.statusCode, 201);
  const bookingId = created.body.booking.bookingId;
  const ownerKey = created.body.recoveryKey;
  const issued = await invoke(shares, {
    method: 'POST',
    headers: { 'x-mosigo-recovery-key': ownerKey },
    body: { bookingId, ttlMinutes: 60 }
  });
  const token = issued.body.shareToken;
  assert.ok(token);

  for (const method of ['POST', 'DELETE']) {
    const denied = await invoke(shares, {
      method,
      headers: { 'x-mosigo-share-token': token },
      body: { bookingId, ttlMinutes: 60 }
    });
    assert.equal(denied.statusCode, 401, method);
    assert.equal(denied.body.error, 'booking_recovery_key_invalid', method);
  }

  const ownerState = await invoke(shares, {
    query: { bookingId },
    headers: { 'x-mosigo-recovery-key': ownerKey }
  });
  assert.equal(ownerState.statusCode, 200);
  assert.equal(ownerState.body.share.active, true);
  assert.equal(ownerState.body.share.generation, 1);
});


test('expired or revoked share tokens cannot PATCH a booking and do not alter its revision', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  let now = Date.parse('2026-10-27T00:00:00Z');
  const store = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi, now: () => now });
  const bookings = createBookingsHandler({ store, shareStore });
  const shares = createSharesHandler({ store, shareStore });

  const created = await invoke(bookings, { method: 'POST', body: { booking: sample } });
  assert.equal(created.statusCode, 201);
  const { bookingId } = created.body.booking;
  const ownerHeaders = { 'x-mosigo-recovery-key': created.body.recoveryKey };
  const firstShare = await invoke(shares, {
    method: 'POST', headers: ownerHeaders, body: { bookingId, ttlMinutes: 5 }
  });
  assert.equal(firstShare.statusCode, 201);
  const expiredToken = firstShare.body.shareToken;
  now += 5 * 60 * 1000 + 1;
  const expiredPatch = await invoke(bookings, {
    method: 'PATCH', headers: { 'x-mosigo-share-token': expiredToken },
    body: { bookingId, action: 'confirm', expectedRevision: 1 }
  });
  assert.equal(expiredPatch.statusCode, 401);
  assert.equal(expiredPatch.body.error, 'booking_share_expired');

  const secondShare = await invoke(shares, {
    method: 'POST', headers: ownerHeaders, body: { bookingId, ttlMinutes: 60 }
  });
  assert.equal(secondShare.statusCode, 201);
  const revoke = await invoke(shares, {
    method: 'DELETE', headers: ownerHeaders, body: { bookingId }
  });
  assert.equal(revoke.statusCode, 200);
  const revokedPatch = await invoke(bookings, {
    method: 'PATCH', headers: { 'x-mosigo-share-token': secondShare.body.shareToken },
    body: { bookingId, action: 'confirm', expectedRevision: 1 }
  });
  assert.equal(revokedPatch.statusCode, 401);
  assert.equal(revokedPatch.body.error, 'booking_share_revoked');
  const canonical = await invoke(bookings, { query: { bookingId }, headers: ownerHeaders });
  assert.equal(canonical.statusCode, 200);
  assert.equal(canonical.body.booking.revision, 1);
  assert.equal(canonical.body.booking.phase, 'requesting');
});


test('opt-in read-only sharing allows viewing but denies share-token PATCH without changing a booking', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const store = createBookingStore({ env, blobApi });
  const shareStore = createBookingShareStore({ env, blobApi });
  const bookings = createBookingsHandler({ store, shareStore, shareWritePolicy: 'read-only' });
  const shares = createSharesHandler({ store, shareStore });
  const capability = await invoke(bookings);
  assert.equal(capability.body.shareParticipantWriteAccess, 'read-only');

  const created = await invoke(bookings, { method: 'POST', body: { booking: sample } });
  assert.equal(created.statusCode, 201);
  const { bookingId } = created.body.booking;
  const ownerHeaders = { 'x-mosigo-recovery-key': created.body.recoveryKey };
  const issued = await invoke(shares, {
    method: 'POST', headers: ownerHeaders, body: { bookingId, ttlMinutes: 60 }
  });
  assert.equal(issued.statusCode, 201);
  const sharedHeaders = { 'x-mosigo-share-token': issued.body.shareToken };

  const sharedRead = await invoke(bookings, { query: { bookingId }, headers: sharedHeaders });
  assert.equal(sharedRead.statusCode, 200);
  assert.equal(sharedRead.body.accessType, 'share-token');

  const denied = await invoke(bookings, {
    method: 'PATCH', headers: sharedHeaders,
    body: { bookingId, action: 'confirm', expectedRevision: 1 }
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.error, 'booking_share_read_only');
  const ownerRead = await invoke(bookings, { query: { bookingId }, headers: ownerHeaders });
  assert.equal(ownerRead.statusCode, 200);
  assert.equal(ownerRead.body.booking.revision, 1);
  assert.equal(ownerRead.body.booking.phase, 'requesting');

  const ownerPatch = await invoke(bookings, {
    method: 'PATCH', headers: ownerHeaders,
    body: { bookingId, action: 'confirm', expectedRevision: 1 }
  });
  assert.equal(ownerPatch.statusCode, 200);
  assert.equal(ownerPatch.body.booking.revision, 2);
  const sharedReadAfter = await invoke(bookings, { query: { bookingId }, headers: sharedHeaders });
  assert.equal(sharedReadAfter.statusCode, 200);
  assert.equal(sharedReadAfter.body.booking.phase, 'confirmed');
});
