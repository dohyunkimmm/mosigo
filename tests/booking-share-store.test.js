const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createBookingShareStore,
  hashShareToken,
  sharePath
} = require('../src/lib/booking-share-store.js');

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

test('secure share store hashes tokens and enforces expiry, rotation, and revocation', async () => {
  let now = Date.parse('2026-09-14T00:00:00.000Z');
  const blobApi = fakeBlobApi();
  const store = createBookingShareStore({
    env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
    blobApi,
    now: () => now
  });
  const bookingId = 'M10ABC12345';

  const first = await store.issue(bookingId, 60);
  assert.match(first.shareToken, /^[A-Za-z0-9_-]{24,}$/);
  assert.equal(first.record.shareTokenHash, hashShareToken(first.shareToken));
  assert.equal(first.record.generation, 1);
  assert.equal(first.record.revokedAt, null);
  assert.equal(await store.validate(bookingId, first.shareToken).then(() => true), true);

  const persisted = JSON.parse(blobApi.objects.get(sharePath(bookingId)).body);
  assert.equal('shareToken' in persisted, false);
  assert.notEqual(persisted.shareTokenHash, first.shareToken);

  const second = await store.issue(bookingId, 30);
  assert.equal(second.record.generation, 2);
  await assert.rejects(() => store.validate(bookingId, first.shareToken), /valid booking share token/i);
  assert.equal(await store.validate(bookingId, second.shareToken).then(() => true), true);

  now += 31 * 60 * 1000;
  await assert.rejects(
    () => store.validate(bookingId, second.shareToken),
    (error) => error.code === 'booking_share_expired'
  );

  const third = await store.issue(bookingId, 60);
  const revoked = await store.revoke(bookingId);
  assert.ok(revoked.record.revokedAt);
  await assert.rejects(
    () => store.validate(bookingId, third.shareToken),
    (error) => error.code === 'booking_share_revoked'
  );
});

test('share TTL is clamped to the supported server window', async () => {
  const store = createBookingShareStore({
    env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
    blobApi: fakeBlobApi(),
    now: () => Date.parse('2026-09-14T00:00:00.000Z')
  });
  const short = await store.issue('M10AAA12345', 1);
  assert.equal(Date.parse(short.record.expiresAt) - Date.parse(short.record.issuedAt), 5 * 60 * 1000);
  const long = await store.issue('M10BBB12345', 99999);
  assert.equal(Date.parse(long.record.expiresAt) - Date.parse(long.record.issuedAt), 24 * 60 * 60 * 1000);
});
