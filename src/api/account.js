const { BookingServiceError, validBookingId } = require('../lib/booking-service.js');
const { BookingStoreError, createBookingStore, recoveryKeyMatches } = require('../lib/booking-store.js');
const {
  AccountStoreError,
  DEFAULT_SESSION_TTL_MS,
  clearSessionCookie,
  createAccountStore,
  readSessionToken,
  serializeSessionCookie
} = require('../lib/account-store.js');

function readBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string' || !req.body.trim()) return {};
  try { return JSON.parse(req.body); }
  catch (error) { throw new AccountStoreError('invalid_json', 'Request body must be valid JSON.', 400); }
}

function readQuery(req, name) {
  const value = req?.query?.[name];
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function writeCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Mosigo-Schema', 'v13');
  res.setHeader('X-Mosigo-Data', 'prototype');
}

function writeError(res, error) {
  const known =
    error instanceof AccountStoreError ||
    error instanceof BookingStoreError ||
    error instanceof BookingServiceError;
  const status = known ? error.status : 500;
  return res.status(status).json({
    success: false,
    schemaVersion: 'v13',
    error: known ? error.code : 'internal_error',
    message: known ? error.message : 'Unexpected account service error.'
  });
}

function capability(enabled) {
  return {
    schemaVersion: 'v13',
    resource: 'account-ownership-resource',
    enabled: Boolean(enabled),
    authentication: enabled ? 'email-password' : 'unavailable',
    passwordStorage: enabled ? 'scrypt-hash' : 'unavailable',
    sessionCredential: enabled ? 'http-only-secure-cookie' : 'unavailable',
    sessionTtlHours: Math.round(DEFAULT_SESSION_TTL_MS / 3600000),
    bookingOwnership: Boolean(enabled),
    bookingListing: Boolean(enabled),
    recoveryKeyClaim: Boolean(enabled),
    crossDeviceSession: Boolean(enabled)
  };
}

async function requireSession(accountStore, req) {
  const session = await accountStore.sessionFromRequest(req);
  if (!session?.account?.accountId) {
    throw new AccountStoreError('account_session_required', 'Sign in to continue.', 401);
  }
  return session;
}

function createHandler({
  accountStore = createAccountStore(),
  bookingStore = createBookingStore()
} = {}) {
  return async function handler(req, res) {
    writeCommonHeaders(res);
    try {
      const enabled = Boolean(accountStore.configured && bookingStore.configured);

      if (req.method === 'GET') {
        const resource = readQuery(req, 'resource');
        if (resource === 'bookings') {
          const session = await requireSession(accountStore, req);
          const bookings = await accountStore.listOwnedBookings(session.account.accountId, bookingStore);
          return res.status(200).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v13',
            account: session.account,
            bookings
          });
        }

        const session = enabled ? await accountStore.sessionFromRequest(req) : null;
        return res.status(200).json({
          success: true,
          source: 'prototype',
          ...capability(enabled),
          authenticated: Boolean(session?.account),
          account: session?.account || null,
          sessionExpiresAt: session?.record?.expiresAt || null
        });
      }

      if (req.method === 'POST') {
        if (!enabled) {
          throw new AccountStoreError('account_storage_unavailable', 'Account ownership is not configured for this deployment.', 503);
        }
        const body = readBody(req);
        const action = String(body.action || '').trim();

        if (action === 'register' || action === 'login') {
          const result = action === 'register'
            ? await accountStore.register(body.email, body.password)
            : await accountStore.authenticate(body.email, body.password);
          const session = await accountStore.createSession(result.record);
          res.setHeader('Set-Cookie', serializeSessionCookie(session.sessionToken));
          return res.status(action === 'register' ? 201 : 200).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v13',
            authenticated: true,
            account: session.account,
            sessionExpiresAt: session.expiresAt
          });
        }

        if (action === 'claim-booking') {
          const session = await requireSession(accountStore, req);
          const bookingId = String(body.bookingId || '').trim();
          const recoveryKey = String(body.recoveryKey || '').trim();
          if (!validBookingId(bookingId)) {
            throw new BookingServiceError('booking_id_required', 'A valid booking ID is required.', 422);
          }
          const current = await bookingStore.read(bookingId);
          if (!current) {
            throw new BookingServiceError('booking_not_found', 'No durable booking was found for this ID.', 404);
          }
          if (!recoveryKey || !recoveryKeyMatches(current.record, recoveryKey)) {
            throw new BookingServiceError('booking_recovery_key_invalid', 'A valid recovery key is required to claim this booking.', 401);
          }
          const claimed = await bookingStore.claimOwner(current, session.account.accountId);
          await accountStore.addBooking(session.account.accountId, bookingId);
          return res.status(200).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v13',
            claimed: true,
            account: session.account,
            booking: claimed.record.booking
          });
        }

        throw new AccountStoreError('account_action_invalid', 'Unsupported account action.', 422);
      }

      if (req.method === 'DELETE') {
        const token = readSessionToken(req);
        if (enabled && token) await accountStore.revokeSession(token);
        res.setHeader('Set-Cookie', clearSessionCookie());
        return res.status(200).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v13',
          authenticated: false
        });
      }

      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({
        success: false,
        schemaVersion: 'v13',
        error: 'method_not_allowed',
        message: 'Method Not Allowed'
      });
    } catch (error) {
      return writeError(res, error);
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.capability = capability;
module.exports.createHandler = createHandler;
