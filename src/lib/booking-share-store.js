const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { isConfigured, resolveBlobStoreId } = require('./booking-store.js');

const DEFAULT_SHARE_TTL_MINUTES = 60;
const MIN_SHARE_TTL_MINUTES = 5;
const MAX_SHARE_TTL_MINUTES = 24 * 60;

class BookingShareStoreError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'BookingShareStoreError';
    this.code = code;
    this.status = status;
  }
}

function sharePath(bookingId) {
  return `mosigo/booking-shares/${String(bookingId || '').trim()}.json`;
}

function createShareToken() {
  return randomBytes(24).toString('base64url');
}

function hashShareToken(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function shareTokenMatches(record, shareToken) {
  const expected = Buffer.from(String(record?.shareTokenHash || ''), 'hex');
  const actual = Buffer.from(hashShareToken(shareToken), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

function clampTtlMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SHARE_TTL_MINUTES;
  return Math.min(MAX_SHARE_TTL_MINUTES, Math.max(MIN_SHARE_TTL_MINUTES, Math.round(parsed)));
}

function assertValidShareRecord(record, expectedBookingId = '') {
  const issuedAtMs = Date.parse(String(record?.issuedAt || ''));
  const expiresAtMs = Date.parse(String(record?.expiresAt || ''));
  const revokedAtMs = record?.revokedAt == null ? null : Date.parse(String(record.revokedAt));
  const generation = Number(record?.generation);
  const bookingId = String(record?.bookingId || '').trim();
  const expected = String(expectedBookingId || '').trim();
  const valid = Boolean(
    record &&
    typeof record === 'object' &&
    record.version === 1 &&
    bookingId &&
    (!expected || bookingId === expected) &&
    /^[a-f0-9]{64}$/i.test(String(record.shareTokenHash || '')) &&
    Number.isFinite(issuedAtMs) &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > issuedAtMs &&
    (revokedAtMs == null || (Number.isFinite(revokedAtMs) && revokedAtMs >= issuedAtMs)) &&
    Number.isInteger(generation) &&
    generation >= 1
  );
  if (!valid) {
    throw new BookingShareStoreError(
      'booking_share_record_invalid',
      'Stored booking-share record failed integrity validation.',
      500
    );
  }
  return record;
}

function isConflictError(error) {
  return (
    error?.name === 'BlobPreconditionFailedError' ||
    error?.status === 409 ||
    error?.status === 412 ||
    error?.statusCode === 409 ||
    error?.statusCode === 412 ||
    /precondition|already exists|conflict/i.test(String(error?.message || ''))
  );
}

function publicShareState(record, now = Date.now()) {
  if (!record) {
    return {
      exists: false,
      active: false,
      issuedAt: null,
      expiresAt: null,
      revokedAt: null,
      generation: 0
    };
  }
  const expiresAtMs = Date.parse(record.expiresAt || '');
  const expired = !Number.isFinite(expiresAtMs) || expiresAtMs <= Number(now);
  const revoked = Boolean(record.revokedAt);
  return {
    exists: true,
    active: !expired && !revoked,
    issuedAt: record.issuedAt || null,
    expiresAt: record.expiresAt || null,
    revokedAt: record.revokedAt || null,
    generation: Number(record.generation || 0),
    expired,
    revoked
  };
}

function createBookingShareStore({ env = process.env, blobApi = null, now = () => Date.now() } = {}) {
  const configured = isConfigured(env);
  const storeId = resolveBlobStoreId(env);
  let loadedBlobApi = blobApi;

  async function getBlobApi() {
    if (loadedBlobApi) return loadedBlobApi;
    loadedBlobApi = await import('@vercel/blob');
    return loadedBlobApi;
  }

  function authOptions() {
    if (env.BLOB_READ_WRITE_TOKEN) return { token: env.BLOB_READ_WRITE_TOKEN };
    const options = storeId ? { storeId } : {};
    if (env.VERCEL_OIDC_TOKEN) options.oidcToken = env.VERCEL_OIDC_TOKEN;
    return options;
  }

  function assertConfigured() {
    if (!configured) {
      throw new BookingShareStoreError(
        'booking_share_storage_unavailable',
        'Secure booking-share storage is not configured for this deployment.',
        503
      );
    }
  }

  async function read(bookingId) {
    assertConfigured();
    const blob = await getBlobApi();
    const result = await blob.get(sharePath(bookingId), {
      access: 'private',
      useCache: false,
      ...authOptions()
    });
    if (!result || result.statusCode === 404) return null;
    if (result.statusCode && result.statusCode !== 200) {
      throw new BookingShareStoreError('booking_share_read_failed', 'Could not read the booking-share record.', 502);
    }

    const text = await new Response(result.stream).text();
    let record;
    try {
      record = JSON.parse(text);
    } catch (error) {
      throw new BookingShareStoreError('booking_share_record_invalid', 'Stored booking-share record is not valid JSON.', 500);
    }
    assertValidShareRecord(record, bookingId);
    return {
      record,
      etag: result.blob?.etag || result.etag || ''
    };
  }

  async function write(current, record) {
    assertConfigured();
    assertValidShareRecord(record, record?.bookingId);
    const blob = await getBlobApi();
    const options = {
      access: 'private',
      contentType: 'application/json',
      ...authOptions()
    };
    if (current) {
      if (!current.etag) {
        throw new BookingShareStoreError('booking_share_etag_missing', 'Stored booking-share revision token is missing.', 409);
      }
      options.allowOverwrite = true;
      options.ifMatch = current.etag;
    } else {
      options.allowOverwrite = false;
    }

    try {
      const result = await blob.put(sharePath(record.bookingId), JSON.stringify(record), options);
      return { record, etag: result?.etag || '' };
    } catch (error) {
      if (isConflictError(error)) {
        throw new BookingShareStoreError('booking_share_conflict', 'The booking-share capability changed before this update was saved.', 409);
      }
      throw new BookingShareStoreError('booking_share_write_failed', 'Could not persist the booking-share capability.', 502);
    }
  }

  async function issue(bookingId, ttlMinutes = DEFAULT_SHARE_TTL_MINUTES) {
    assertConfigured();
    const current = await read(bookingId);
    const shareToken = createShareToken();
    const issuedAtMs = Number(now());
    const ttl = clampTtlMinutes(ttlMinutes);
    const record = {
      version: 1,
      bookingId: String(bookingId || '').trim(),
      shareTokenHash: hashShareToken(shareToken),
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + ttl * 60 * 1000).toISOString(),
      revokedAt: null,
      generation: Number(current?.record?.generation || 0) + 1
    };
    const saved = await write(current, record);
    return { ...saved, shareToken };
  }

  async function revoke(bookingId) {
    assertConfigured();
    const current = await read(bookingId);
    if (!current) return { record: null, etag: '', revoked: false };
    if (current.record.revokedAt) return { ...current, revoked: true };
    const record = {
      ...current.record,
      revokedAt: new Date(Number(now())).toISOString()
    };
    const saved = await write(current, record);
    return { ...saved, revoked: true };
  }

  async function validate(bookingId, shareToken) {
    assertConfigured();
    const current = await read(bookingId);
    if (!current || !shareToken || !shareTokenMatches(current.record, shareToken)) {
      throw new BookingShareStoreError('booking_share_token_invalid', 'A valid booking share token is required.', 401);
    }
    const state = publicShareState(current.record, now());
    if (state.revoked) {
      throw new BookingShareStoreError('booking_share_revoked', 'This booking share link has been revoked.', 401);
    }
    if (state.expired) {
      throw new BookingShareStoreError('booking_share_expired', 'This booking share link has expired.', 401);
    }
    return { ...current, state };
  }

  return {
    configured,
    provider: 'vercel-blob-private',
    storeId,
    issue,
    read,
    revoke,
    validate,
    status: async (bookingId) => {
      const current = await read(bookingId);
      return publicShareState(current?.record || null, now());
    }
  };
}

module.exports = {
  BookingShareStoreError,
  DEFAULT_SHARE_TTL_MINUTES,
  MIN_SHARE_TTL_MINUTES,
  MAX_SHARE_TTL_MINUTES,
  assertValidShareRecord,
  clampTtlMinutes,
  createBookingShareStore,
  createShareToken,
  hashShareToken,
  publicShareState,
  sharePath,
  shareTokenMatches
};
