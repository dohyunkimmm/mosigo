const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BookingStoreError,
  DEFAULT_BLOB_STORE_ID,
  createBookingStore,
  createRecoveryKey,
  recoveryKeyMatches,
  resolveBlobStoreId
} = require('../src/lib/booking-store.js');

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
        error.name = 'BlobPreconditionFailedError';
        error.statusCode = 412;
        throw error;
      }
      const etag = `etag-${++sequence}`;
      objects.set(pathname, { body: String(body), etag });
      return { etag };
    }
  };
}

const booking = {
  bookingId: 'M10ABC12345',
  phase: 'requesting',
  revision: 1,
  history: [{ sequence: 1, type: 'created' }]
};

test('durable booking store is disabled without Blob credentials', () => {
  const store = createBookingStore({ env: {} });
  assert.equal(store.configured, false);
  assert.equal(store.provider, 'vercel-blob-private');
  assert.equal(store.storeId, DEFAULT_BLOB_STORE_ID);
});

test('Vercel OIDC recognizes connected BLOB_STORE_ID with explicit override support', () => {
  const connected = createBookingStore({
    env: { VERCEL_OIDC_TOKEN: 'oidc-token', BLOB_STORE_ID: 'store_connected' }
  });
  assert.equal(connected.configured, true);
  assert.equal(connected.storeId, 'store_connected');

  assert.equal(
    resolveBlobStoreId({ BLOB_STORE_ID: 'store_connected' }),
    'store_connected'
  );
  assert.equal(
    resolveBlobStoreId({ BLOB_STORE_ID: 'store_connected', MOSIGO_BLOB_STORE_ID: 'store_override' }),
    'store_override'
  );

  const fallback = createBookingStore({ env: { VERCEL_OIDC_TOKEN: 'oidc-token' } });
  assert.equal(fallback.configured, true);
  assert.equal(fallback.storeId, DEFAULT_BLOB_STORE_ID);
});

test('durable store creates private canonical records without storing the raw recovery key', async () => {
  const key = createRecoveryKey();
  const store = createBookingStore({
    env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
    blobApi: fakeBlobApi(),
    now: () => Date.parse('2026-09-13T10:00:00.000Z')
  });

  const created = await store.create(booking, key);
  assert.equal(store.configured, true);
  assert.equal(created.record.booking.bookingId, booking.bookingId);
  assert.equal(created.record.recoveryKey, undefined);
  assert.equal(recoveryKeyMatches(created.record, key), true);
  assert.equal(recoveryKeyMatches(created.record, 'wrong-key'), false);

  const read = await store.read(booking.bookingId);
  assert.equal(read.record.booking.revision, 1);
  assert.equal(read.etag, created.etag);
});

test('durable store uses ETag compare-and-swap and rejects stale writers', async () => {
  const blobApi = fakeBlobApi();
  const store = createBookingStore({
    env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
    blobApi
  });
  const key = createRecoveryKey();
  await store.create(booking, key);
  const firstRead = await store.read(booking.bookingId);
  const secondRead = await store.read(booking.bookingId);

  const revision2 = { ...booking, phase: 'confirmed', revision: 2 };
  await store.update(firstRead, revision2);

  await assert.rejects(
    () => store.update(secondRead, { ...revision2, phase: 'cancelled' }),
    (error) => error instanceof BookingStoreError && error.code === 'durable_revision_conflict'
  );
  const canonical = await store.read(booking.bookingId);
  assert.equal(canonical.record.booking.phase, 'confirmed');
  assert.equal(canonical.record.booking.revision, 2);
});
