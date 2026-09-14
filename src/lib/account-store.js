const { createHash, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { isConfigured, resolveBlobStoreId } = require('./booking-store.js');

const ACCOUNT_SCHEMA_VERSION = 1;
const SESSION_SCHEMA_VERSION = 1;
const BOOKING_INDEX_SCHEMA_VERSION = 1;
const SESSION_COOKIE_NAME = 'mosigo_v13_session';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

class AccountStoreError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'AccountStoreError';
    this.code = code;
    this.status = status;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function emailKey(value) {
  return createHash('sha256').update(normalizeEmail(value)).digest('hex');
}

function createAccountId() {
  return `A13${randomBytes(10).toString('hex').slice(0, 16).toUpperCase()}`;
}

function accountPathForKey(key) {
  return `mosigo/accounts/by-email/${String(key || '').trim()}.json`;
}

function accountPathForEmail(email) {
  return accountPathForKey(emailKey(email));
}

function sessionPath(sessionToken) {
  const digest = createHash('sha256').update(String(sessionToken || '')).digest('hex');
  return `mosigo/account-sessions/${digest}.json`;
}

function bookingIndexPath(accountId) {
  return `mosigo/account-bookings/${String(accountId || '').trim()}.json`;
}

function hashPassword(password, salt) {
  return scryptSync(String(password || ''), String(salt || ''), 64).toString('hex');
}

function passwordMatches(record, password) {
  const expected = Buffer.from(String(record?.passwordHash || ''), 'hex');
  const actual = Buffer.from(hashPassword(password, record?.passwordSalt || ''), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

function publicAccount(record) {
  if (!record) return null;
  return {
    accountId: String(record.accountId || ''),
    email: String(record.email || ''),
    createdAt: record.createdAt || null
  };
}

function parseCookies(req) {
  const header = req?.headers?.cookie || req?.headers?.Cookie || '';
  const result = {};
  String(header || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    try { result[key] = decodeURIComponent(value); } catch (error) { result[key] = value; }
  });
  return result;
}

function readSessionToken(req) {
  return String(parseCookies(req)[SESSION_COOKIE_NAME] || '').trim();
}

function serializeSessionCookie(sessionToken, maxAgeSeconds = Math.floor(DEFAULT_SESSION_TTL_MS / 1000)) {
  const token = encodeURIComponent(String(sessionToken || ''));
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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

function createAccountStore({
  env = process.env,
  blobApi = null,
  now = () => Date.now(),
  sessionTtlMs = DEFAULT_SESSION_TTL_MS
} = {}) {
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
      throw new AccountStoreError('account_storage_unavailable', 'Account storage is not configured for this deployment.', 503);
    }
  }

  async function readJson(pathname, invalidCode, invalidMessage) {
    assertConfigured();
    const blob = await getBlobApi();
    const result = await blob.get(pathname, {
      access: 'private',
      useCache: false,
      ...authOptions()
    });
    if (!result || result.statusCode === 404) return null;
    if (result.statusCode && result.statusCode !== 200) {
      throw new AccountStoreError('account_storage_read_failed', 'Could not read account storage.', 502);
    }
    const text = await new Response(result.stream).text();
    let record;
    try { record = JSON.parse(text); }
    catch (error) { throw new AccountStoreError(invalidCode, invalidMessage, 500); }
    return { record, etag: result.blob?.etag || result.etag || '' };
  }

  async function putJson(pathname, record, { current = null, createOnly = false } = {}) {
    assertConfigured();
    const blob = await getBlobApi();
    const options = {
      access: 'private',
      contentType: 'application/json',
      ...authOptions()
    };
    if (current) {
      if (!current.etag) throw new AccountStoreError('account_storage_etag_missing', 'Stored account revision token is missing.', 409);
      options.allowOverwrite = true;
      options.ifMatch = current.etag;
    } else if (createOnly) {
      options.allowOverwrite = false;
    } else {
      options.allowOverwrite = true;
    }
    try {
      const result = await blob.put(pathname, JSON.stringify(record), options);
      return { record, etag: result?.etag || '' };
    } catch (error) {
      if (isConflictError(error)) {
        throw new AccountStoreError('account_storage_conflict', 'Account data changed before this update was saved.', 409);
      }
      throw new AccountStoreError('account_storage_write_failed', 'Could not persist account data.', 502);
    }
  }

  function assertAccountRecord(record, expectedKey = '') {
    const expected = String(expectedKey || '').trim();
    const recordKey = emailKey(record?.email || '');
    const valid = Boolean(
      record &&
      record.version === ACCOUNT_SCHEMA_VERSION &&
      /^A13[A-F0-9]{16}$/.test(String(record.accountId || '')) &&
      validEmail(record.email) &&
      (!expected || recordKey === expected) &&
      /^[A-Za-z0-9_-]{16,}$/.test(String(record.passwordSalt || '')) &&
      /^[a-f0-9]{128}$/i.test(String(record.passwordHash || '')) &&
      Number.isFinite(Date.parse(String(record.createdAt || '')))
    );
    if (!valid) throw new AccountStoreError('account_record_invalid', 'Stored account record failed integrity validation.', 500);
    return record;
  }

  async function readAccountByKey(key) {
    const normalizedKey = String(key || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(normalizedKey)) return null;
    const current = await readJson(accountPathForKey(normalizedKey), 'account_record_invalid', 'Stored account record is not valid JSON.');
    if (!current) return null;
    assertAccountRecord(current.record, normalizedKey);
    return current;
  }

  async function readAccountByEmail(email) {
    if (!validEmail(email)) return null;
    return readAccountByKey(emailKey(email));
  }

  async function register(emailValue, passwordValue) {
    assertConfigured();
    const email = normalizeEmail(emailValue);
    const password = String(passwordValue || '');
    if (!validEmail(email)) throw new AccountStoreError('account_email_invalid', 'A valid email address is required.', 422);
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AccountStoreError('account_password_weak', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 422);
    }
    const salt = randomBytes(16).toString('base64url');
    const createdAt = new Date(Number(now())).toISOString();
    const record = {
      version: ACCOUNT_SCHEMA_VERSION,
      accountId: createAccountId(),
      email,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt,
      updatedAt: createdAt
    };
    try {
      const saved = await putJson(accountPathForEmail(email), record, { createOnly: true });
      return { ...saved, account: publicAccount(record) };
    } catch (error) {
      if (error instanceof AccountStoreError && error.code === 'account_storage_conflict') {
        throw new AccountStoreError('account_already_exists', 'An account already exists for this email.', 409);
      }
      throw error;
    }
  }

  async function authenticate(emailValue, passwordValue) {
    assertConfigured();
    const email = normalizeEmail(emailValue);
    const password = String(passwordValue || '');
    if (!validEmail(email) || !password) {
      throw new AccountStoreError('account_credentials_invalid', 'Email or password is incorrect.', 401);
    }
    const current = await readAccountByEmail(email);
    if (!current || current.record.email !== email || !passwordMatches(current.record, password)) {
      throw new AccountStoreError('account_credentials_invalid', 'Email or password is incorrect.', 401);
    }
    return { ...current, account: publicAccount(current.record) };
  }

  async function createSession(accountRecord) {
    assertConfigured();
    const record = assertAccountRecord(accountRecord);
    const sessionToken = randomBytes(32).toString('base64url');
    const issuedAtMs = Number(now());
    const sessionRecord = {
      version: SESSION_SCHEMA_VERSION,
      accountId: record.accountId,
      accountKey: emailKey(record.email),
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + Number(sessionTtlMs)).toISOString(),
      revokedAt: null
    };
    await putJson(sessionPath(sessionToken), sessionRecord, { createOnly: true });
    return { sessionToken, expiresAt: sessionRecord.expiresAt, account: publicAccount(record) };
  }

  function assertSessionRecord(record) {
    const valid = Boolean(
      record &&
      record.version === SESSION_SCHEMA_VERSION &&
      /^A13[A-F0-9]{16}$/.test(String(record.accountId || '')) &&
      /^[a-f0-9]{64}$/i.test(String(record.accountKey || '')) &&
      Number.isFinite(Date.parse(String(record.issuedAt || ''))) &&
      Number.isFinite(Date.parse(String(record.expiresAt || ''))) &&
      Date.parse(record.expiresAt) > Date.parse(record.issuedAt) &&
      (record.revokedAt == null || Number.isFinite(Date.parse(String(record.revokedAt))))
    );
    if (!valid) throw new AccountStoreError('account_session_invalid', 'Stored account session failed integrity validation.', 500);
    return record;
  }

  async function readSession(sessionToken) {
    assertConfigured();
    const token = String(sessionToken || '').trim();
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
    const current = await readJson(sessionPath(token), 'account_session_invalid', 'Stored account session is not valid JSON.');
    if (!current) return null;
    assertSessionRecord(current.record);
    if (current.record.revokedAt || Date.parse(current.record.expiresAt) <= Number(now())) return null;
    const account = await readAccountByKey(current.record.accountKey);
    if (!account || account.record.accountId !== current.record.accountId) return null;
    return {
      ...current,
      sessionToken: token,
      account: publicAccount(account.record)
    };
  }

  async function sessionFromRequest(req) {
    const token = readSessionToken(req);
    if (!token) return null;
    return readSession(token);
  }

  async function revokeSession(sessionToken) {
    assertConfigured();
    const token = String(sessionToken || '').trim();
    if (!token) return false;
    const current = await readJson(sessionPath(token), 'account_session_invalid', 'Stored account session is not valid JSON.');
    if (!current) return false;
    assertSessionRecord(current.record);
    if (current.record.revokedAt) return true;
    const record = { ...current.record, revokedAt: new Date(Number(now())).toISOString() };
    await putJson(sessionPath(token), record, { current });
    return true;
  }

  function assertBookingIndex(record, accountId) {
    const ids = record?.bookingIds;
    const valid = Boolean(
      record &&
      record.version === BOOKING_INDEX_SCHEMA_VERSION &&
      record.accountId === accountId &&
      Array.isArray(ids) &&
      ids.every((id) => /^M(?:[46789]|1[01])[A-Z0-9]{8}$/.test(String(id || '')))
    );
    if (!valid) throw new AccountStoreError('account_booking_index_invalid', 'Stored account booking index failed integrity validation.', 500);
    return record;
  }

  async function readBookingIndex(accountId) {
    const id = String(accountId || '').trim();
    const current = await readJson(bookingIndexPath(id), 'account_booking_index_invalid', 'Stored account booking index is not valid JSON.');
    if (!current) return null;
    assertBookingIndex(current.record, id);
    return current;
  }

  async function addBooking(accountId, bookingId) {
    assertConfigured();
    const id = String(accountId || '').trim();
    const booking = String(bookingId || '').trim();
    if (!/^A13[A-F0-9]{16}$/.test(id)) throw new AccountStoreError('account_id_invalid', 'A valid account ID is required.', 422);
    if (!/^M(?:[46789]|1[01])[A-Z0-9]{8}$/.test(booking)) throw new AccountStoreError('account_booking_id_invalid', 'A valid booking ID is required.', 422);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await readBookingIndex(id);
      if (current?.record?.bookingIds?.includes(booking)) return current.record;
      const bookingIds = current ? [...current.record.bookingIds, booking] : [booking];
      const record = {
        version: BOOKING_INDEX_SCHEMA_VERSION,
        accountId: id,
        bookingIds,
        updatedAt: new Date(Number(now())).toISOString()
      };
      try {
        const saved = await putJson(bookingIndexPath(id), record, current ? { current } : { createOnly: true });
        return saved.record;
      } catch (error) {
        if (!(error instanceof AccountStoreError) || error.code !== 'account_storage_conflict' || attempt === 3) throw error;
      }
    }
    throw new AccountStoreError('account_booking_index_conflict', 'Could not update account booking index.', 409);
  }

  async function listBookingIds(accountId) {
    const current = await readBookingIndex(accountId);
    return current ? [...current.record.bookingIds] : [];
  }

  async function listOwnedBookings(accountId, bookingStore) {
    const ids = await listBookingIds(accountId);
    const bookings = [];
    for (const bookingId of ids.slice().reverse()) {
      const current = await bookingStore.read(bookingId);
      if (!current || String(current.record?.ownerAccountId || '') !== String(accountId || '')) continue;
      bookings.push(current.record.booking);
    }
    return bookings;
  }

  return {
    configured,
    provider: 'vercel-blob-private',
    storeId,
    register,
    authenticate,
    createSession,
    readSession,
    sessionFromRequest,
    revokeSession,
    readAccountByEmail,
    addBooking,
    listBookingIds,
    listOwnedBookings
  };
}

module.exports = {
  ACCOUNT_SCHEMA_VERSION,
  AccountStoreError,
  DEFAULT_SESSION_TTL_MS,
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE_NAME,
  accountPathForEmail,
  accountPathForKey,
  bookingIndexPath,
  clearSessionCookie,
  createAccountId,
  createAccountStore,
  emailKey,
  hashPassword,
  normalizeEmail,
  parseCookies,
  passwordMatches,
  publicAccount,
  readSessionToken,
  serializeSessionCookie,
  sessionPath,
  validEmail
};
