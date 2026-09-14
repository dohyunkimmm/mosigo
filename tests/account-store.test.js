const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAccountStore,
  readSessionToken,
  serializeSessionCookie
} = require('../src/lib/account-store.js');
const { createBookingStore, createRecoveryKey } = require('../src/lib/booking-store.js');

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

test('account store hashes passwords, authenticates sessions, and never exposes password material', async () => {
  let now = Date.parse('2026-09-15T00:00:00.000Z');
  const blobApi = fakeBlobApi();
  const store = createAccountStore({ env: { BLOB_READ_WRITE_TOKEN: 'test-token' }, blobApi, now: () => now });

  const registered = await store.register('Owner@Example.com', 'correct-horse');
  assert.match(registered.account.accountId, /^A13[A-F0-9]{16}$/);
  assert.equal(registered.account.email, 'owner@example.com');
  assert.equal('passwordHash' in registered.account, false);
  assert.equal('passwordSalt' in registered.account, false);

  await assert.rejects(
    () => store.authenticate('owner@example.com', 'wrong-pass'),
    (error) => error.code === 'account_credentials_invalid'
  );
  const authenticated = await store.authenticate('owner@example.com', 'correct-horse');
  assert.equal(authenticated.account.accountId, registered.account.accountId);

  const authenticatedRecord = await store.authenticate('owner@example.com', 'correct-horse');
  const session = await store.createSession(authenticatedRecord.record);
  assert.match(session.sessionToken, /^[A-Za-z0-9_-]{32,}$/);
  const cookie = serializeSessionCookie(session.sessionToken);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(readSessionToken({ headers: { cookie } }), session.sessionToken);

  const loaded = await store.readSession(session.sessionToken);
  assert.equal(loaded.account.email, 'owner@example.com');
  await store.revokeSession(session.sessionToken);
  assert.equal(await store.readSession(session.sessionToken), null);

  now += 8 * 24 * 60 * 60 * 1000;
  const second = await store.createSession(authenticatedRecord.record);
  now += 8 * 24 * 60 * 60 * 1000;
  assert.equal(await store.readSession(second.sessionToken), null);
});

test('booking ownership index only lists durable bookings owned by the account', async () => {
  const blobApi = fakeBlobApi();
  const env = { BLOB_READ_WRITE_TOKEN: 'test-token' };
  const accounts = createAccountStore({ env, blobApi, now: () => Date.parse('2026-09-15T00:00:00.000Z') });
  const bookings = createBookingStore({ env, blobApi, now: () => Date.parse('2026-09-15T00:00:00.000Z') });
  const owner = (await accounts.register('owner@example.com', 'password-123')).account;
  const booking = { bookingId:'M10ABC12345', phase:'requesting', revision:1 };
  await bookings.create(booking, createRecoveryKey(), { ownerAccountId: owner.accountId });
  await accounts.addBooking(owner.accountId, booking.bookingId);
  await accounts.addBooking(owner.accountId, booking.bookingId);

  const ids = await accounts.listBookingIds(owner.accountId);
  assert.deepEqual(ids, [booking.bookingId]);
  const owned = await accounts.listOwnedBookings(owner.accountId, bookings);
  assert.deepEqual(owned, [booking]);
});
