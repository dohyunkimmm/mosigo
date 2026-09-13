const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../src/api/bookings.js');
const { createBookingStore } = require('../src/lib/booking-store.js');

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

const fallbackHandler = createHandler({ store: { configured: false } });

async function invoke({ handler = fallbackHandler, method = 'GET', body, query = {}, headers = {} } = {}) {
  const responseHeaders = {};
  const result = { statusCode: 200, headers: responseHeaders, body: undefined };
  const req = { method, body, query, headers };
  const res = {
    setHeader(name, value) {
      responseHeaders[String(name).toLowerCase()] = value;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    }
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

test('GET exposes v10 capability without falsely claiming durable storage when unconfigured', async () => {
  const res = await invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schemaVersion, 'v10');
  assert.equal(res.body.resource, 'durable-booking-resource');
  assert.equal(res.body.persistence, 'client-local-fallback');
  assert.equal(res.body.durableServerPersistence, false);
  assert.equal(res.body.durableStorageProvider, 'vercel-blob-private');
  assert.equal(res.body.bookingIdVersion, 'M10');
  assert.equal(res.headers['x-mosigo-schema'], 'v10');
});

test('fallback POST creates an M10 traced booking and preserves legacy IDs', async () => {
  const created = await invoke({ method: 'POST', body: sample });
  assert.equal(created.statusCode, 201);
  assert.match(created.body.booking.bookingId, /^M10[A-Z0-9]{8}$/);
  assert.equal(created.body.booking.revision, 1);
  assert.equal(created.body.booking.history[0].type, 'created');
  assert.equal(created.body.durablePersisted, false);

  for (const bookingId of ['M4ABC12345', 'M6ABC12345', 'M7ABC12345', 'M8ABC12345', 'M9ABC12345', 'M10ABC12345']) {
    const res = await invoke({ method: 'POST', body: { ...sample, bookingId } });
    assert.equal(res.body.booking.bookingId, bookingId);
  }
});

test('fallback PUT and PATCH retain v9-compatible recovery and lifecycle behavior', async () => {
  const created = (await invoke({ method: 'POST', body: sample })).body.booking;
  const confirmed = await invoke({ method: 'PATCH', body: { action: 'confirm', booking: created } });
  assert.equal(confirmed.body.booking.phase, 'confirmed');
  assert.equal(confirmed.body.booking.revision, 2);

  const recovered = await invoke({ method: 'PUT', body: { booking: confirmed.body.booking } });
  assert.equal(recovered.body.recovered, true);
  assert.equal(recovered.body.recoveryScope, 'same-device');
  assert.equal(recovered.body.booking.revision, 2);
  assert.deepEqual(recovered.body.booking.history, confirmed.body.booking.history);
});

test('history tampering and invalid lifecycle transitions are rejected', async () => {
  const created = (await invoke({ method: 'POST', body: sample })).body.booking;
  const tampered = await invoke({ method: 'PUT', body: { booking: { ...created, phase: 'confirmed' } } });
  assert.equal(tampered.statusCode, 409);
  assert.equal(tampered.body.error, 'booking_history_conflict');

  const invalid = await invoke({ method: 'PATCH', body: { action: 'complete', booking: created } });
  assert.equal(invalid.statusCode, 409);
  assert.equal(invalid.body.error, 'invalid_transition');
});

test('durable handler persists canonical bookings behind a recovery key', async () => {
  const store = createBookingStore({
    env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
    blobApi: fakeBlobApi()
  });
  const handler = createHandler({ store });

  const capability = await invoke({ handler });
  assert.equal(capability.body.durableServerPersistence, true);
  assert.equal(capability.body.persistence, 'server-durable');
  assert.equal(capability.body.recoveryScope, 'booking-key');
  assert.equal(capability.body.serverConflictPolicy, 'revision-plus-etag-cas');

  const created = await invoke({ handler, method: 'POST', body: sample });
  assert.equal(created.body.durablePersisted, true);
  assert.match(created.body.recoveryKey, /^[A-Za-z0-9_-]+$/);
  const bookingId = created.body.booking.bookingId;
  const recoveryKey = created.body.recoveryKey;

  const denied = await invoke({ handler, query: { bookingId } });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.body.error, 'booking_recovery_key_invalid');

  const read = await invoke({
    handler,
    query: { bookingId },
    headers: { 'x-mosigo-recovery-key': recoveryKey }
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.booking.revision, 1);

  const confirmed = await invoke({
    handler,
    method: 'PATCH',
    body: {
      bookingId,
      action: 'confirm',
      expectedRevision: 1,
      recoveryKey
    }
  });
  assert.equal(confirmed.body.booking.phase, 'confirmed');
  assert.equal(confirmed.body.booking.revision, 2);

  const stale = await invoke({
    handler,
    method: 'PATCH',
    body: {
      bookingId,
      action: 'start',
      expectedRevision: 1,
      recoveryKey
    }
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.error, 'booking_revision_conflict');

  const recovered = await invoke({
    handler,
    method: 'PUT',
    body: { booking: created.body.booking, recoveryKey }
  });
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.body.booking.phase, 'confirmed');
  assert.equal(recovered.body.booking.revision, 2);
});

test('durable PUT migrates a legacy local snapshot once and issues a recovery key', async () => {
  const store = createBookingStore({
    env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
    blobApi: fakeBlobApi()
  });
  const handler = createHandler({ store });
  const legacy = {
    ...sample,
    bookingId: 'M9ABC12345',
    phase: 'confirmed',
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T01:00:00.000Z'
  };
  const migrated = await invoke({ handler, method: 'PUT', body: { booking: legacy } });
  assert.equal(migrated.statusCode, 200);
  assert.equal(migrated.body.migratedToDurable, true);
  assert.equal(migrated.body.durablePersisted, true);
  assert.ok(migrated.body.recoveryKey);
  assert.equal(migrated.body.booking.history[0].type, 'legacy_import');
});

test('unsupported methods are rejected with v10 schema', async () => {
  const res = await invoke({ method: 'DELETE' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST, PUT, PATCH');
  assert.equal(res.body.schemaVersion, 'v10');
});
