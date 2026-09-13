const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const DEFAULT_BLOB_STORE_ID = 'store_eZ1r1Ofm1v8N0Ahj';

class BookingStoreError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'BookingStoreError';
    this.code = code;
    this.status = status;
  }
}

function resolveBlobStoreId(env = process.env) {
  return String(
    env.MOSIGO_BLOB_STORE_ID ||
    env.BLOB_STORE_ID ||
    DEFAULT_BLOB_STORE_ID
  ).trim();
}

function isConfigured(env = process.env) {
  if (String(env.MOSIGO_DISABLE_DURABLE_STORE || '') === '1') return false;
  if (env.BLOB_READ_WRITE_TOKEN) return true;
  return Boolean(env.MOSIGO_BLOB_STORE_ID || env.BLOB_STORE_ID);
}

function bookingPath(bookingId) {
  return `mosigo/bookings/${String(bookingId || '').trim()}.json`;
}

function createRecoveryKey() {
  return randomBytes(24).toString('base64url');
}

function hashRecoveryKey(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function recoveryKeyMatches(record, recoveryKey) {
  const expected = Buffer.from(String(record?.recoveryKeyHash || ''), 'hex');
  const actual = Buffer.from(hashRecoveryKey(recoveryKey), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
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

function createBookingStore({ env = process.env, blobApi = null, now = () => Date.now() } = {}) {
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
      throw new BookingStoreError(
        'durable_storage_unavailable',
        'Durable booking storage is not configured for this deployment.',
        503
      );
    }
  }

  async function read(bookingId) {
    assertConfigured();
    const blob = await getBlobApi();
    const result = await blob.get(bookingPath(bookingId), {
      access: 'private',
      useCache: false,
      ...authOptions()
    });
    if (!result || result.statusCode === 404) return null;
    if (result.statusCode && result.statusCode !== 200) {
      throw new BookingStoreError('durable_storage_read_failed', 'Could not read the durable booking record.', 502);
    }

    const text = await new Response(result.stream).text();
    let record;
    try {
      record = JSON.parse(text);
    } catch (error) {
      throw new BookingStoreError('durable_record_invalid', 'Stored booking record is not valid JSON.', 500);
    }
    return {
      record,
      etag: result.blob?.etag || result.etag || ''
    };
  }

  async function create(booking, recoveryKey) {
    assertConfigured();
    const blob = await getBlobApi();
    const record = {
      version: 1,
      booking,
      recoveryKeyHash: hashRecoveryKey(recoveryKey),
      storedAt: new Date(now()).toISOString()
    };
    try {
      const result = await blob.put(bookingPath(booking.bookingId), JSON.stringify(record), {
        access: 'private',
        contentType: 'application/json',
        allowOverwrite: false,
        ...authOptions()
      });
      return { record, etag: result?.etag || '' };
    } catch (error) {
      if (isConflictError(error)) {
        throw new BookingStoreError('booking_already_persisted', 'A durable booking with this ID already exists.', 409);
      }
      throw new BookingStoreError('durable_storage_write_failed', 'Could not persist the booking.', 502);
    }
  }

  async function update(current, booking) {
    assertConfigured();
    if (!current?.etag) {
      throw new BookingStoreError('durable_record_etag_missing', 'Stored booking revision token is missing.', 409);
    }
    const blob = await getBlobApi();
    const record = {
      ...current.record,
      booking,
      storedAt: new Date(now()).toISOString()
    };
    try {
      const result = await blob.put(bookingPath(booking.bookingId), JSON.stringify(record), {
        access: 'private',
        contentType: 'application/json',
        allowOverwrite: true,
        ifMatch: current.etag,
        ...authOptions()
      });
      return { record, etag: result?.etag || '' };
    } catch (error) {
      if (isConflictError(error)) {
        throw new BookingStoreError('durable_revision_conflict', 'The durable booking changed before this update was saved.', 409);
      }
      throw new BookingStoreError('durable_storage_write_failed', 'Could not update the durable booking.', 502);
    }
  }

  return {
    configured,
    provider: 'vercel-blob-private',
    storeId,
    create,
    read,
    update
  };
}

module.exports = {
  BookingStoreError,
  DEFAULT_BLOB_STORE_ID,
  bookingPath,
  createBookingStore,
  createRecoveryKey,
  hashRecoveryKey,
  isConfigured,
  recoveryKeyMatches,
  resolveBlobStoreId
};
