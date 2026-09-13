const { BookingServiceError, validBookingId } = require('../lib/booking-service.js');
const {
  BookingStoreError,
  createBookingStore,
  recoveryKeyMatches
} = require('../lib/booking-store.js');
const {
  BookingShareStoreError,
  DEFAULT_SHARE_TTL_MINUTES,
  MIN_SHARE_TTL_MINUTES,
  MAX_SHARE_TTL_MINUTES,
  clampTtlMinutes,
  createBookingShareStore
} = require('../lib/booking-share-store.js');

function readBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string' || !req.body.trim()) return {};
  try {
    return JSON.parse(req.body);
  } catch (error) {
    throw new BookingServiceError('invalid_json', 'Request body must be valid JSON.', 400);
  }
}

function readQuery(req, name) {
  const value = req?.query?.[name];
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function readRecoveryKey(req, body = {}) {
  const header = req?.headers?.['x-mosigo-recovery-key'] || req?.headers?.['X-Mosigo-Recovery-Key'];
  return String(body.recoveryKey || header || '').trim();
}

function writeCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Mosigo-Schema', 'v12');
  res.setHeader('X-Mosigo-Data', 'prototype');
}

function writeError(res, error) {
  const known =
    error instanceof BookingServiceError ||
    error instanceof BookingStoreError ||
    error instanceof BookingShareStoreError;
  const status = known ? error.status : 500;
  return res.status(status).json({
    success: false,
    schemaVersion: 'v12',
    error: known ? error.code : 'internal_error',
    message: known ? error.message : 'Unexpected booking-share service error.'
  });
}

function capability({ enabled = false } = {}) {
  return {
    schemaVersion: 'v12',
    resource: 'secure-booking-share-resource',
    enabled,
    shareScope: 'single-booking',
    credential: enabled ? 'opaque-expiring-share-token' : 'unavailable',
    transport: enabled ? 'url-fragment' : 'unavailable',
    serverValidation: enabled,
    rawTokenStoredServerSide: false,
    revocable: enabled,
    rotatable: enabled,
    singleActiveGrantPerBooking: enabled,
    defaultTtlMinutes: DEFAULT_SHARE_TTL_MINUTES,
    minTtlMinutes: MIN_SHARE_TTL_MINUTES,
    maxTtlMinutes: MAX_SHARE_TTL_MINUTES
  };
}

async function assertOwner(store, bookingId, recoveryKey) {
  if (!store.configured) {
    throw new BookingStoreError('durable_storage_unavailable', 'Durable booking storage is not configured for this deployment.', 503);
  }
  if (!validBookingId(bookingId)) {
    throw new BookingServiceError('booking_id_required', 'A valid booking ID is required.', 422);
  }
  const current = await store.read(bookingId);
  if (!current) {
    throw new BookingServiceError('booking_not_found', 'No durable booking was found for this ID.', 404);
  }
  if (!recoveryKey || !recoveryKeyMatches(current.record, recoveryKey)) {
    throw new BookingServiceError('booking_recovery_key_invalid', 'A valid recovery key is required to manage booking sharing.', 401);
  }
  return current;
}

function createHandler({
  store = createBookingStore(),
  shareStore = createBookingShareStore()
} = {}) {
  return async function handler(req, res) {
    writeCommonHeaders(res);

    try {
      const enabled = Boolean(store.configured && shareStore.configured);
      if (req.method === 'GET') {
        const bookingId = readQuery(req, 'bookingId');
        if (!bookingId) {
          return res.status(200).json({
            success: true,
            source: 'prototype',
            ...capability({ enabled })
          });
        }
        const body = readBody(req);
        await assertOwner(store, bookingId, readRecoveryKey(req, body));
        const share = await shareStore.status(bookingId);
        return res.status(200).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v12',
          bookingId,
          share
        });
      }

      if (req.method === 'POST') {
        const body = readBody(req);
        const bookingId = String(body.bookingId || '').trim();
        await assertOwner(store, bookingId, readRecoveryKey(req, body));
        if (!shareStore.configured) {
          throw new BookingShareStoreError('booking_share_storage_unavailable', 'Secure booking-share storage is not configured for this deployment.', 503);
        }
        const ttlMinutes = clampTtlMinutes(body.ttlMinutes);
        const issued = await shareStore.issue(bookingId, ttlMinutes);
        return res.status(201).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v12',
          bookingId,
          shareToken: issued.shareToken,
          share: {
            active: true,
            issuedAt: issued.record.issuedAt,
            expiresAt: issued.record.expiresAt,
            revokedAt: null,
            generation: issued.record.generation,
            ttlMinutes
          }
        });
      }

      if (req.method === 'DELETE') {
        const body = readBody(req);
        const bookingId = String(body.bookingId || readQuery(req, 'bookingId') || '').trim();
        await assertOwner(store, bookingId, readRecoveryKey(req, body));
        if (!shareStore.configured) {
          throw new BookingShareStoreError('booking_share_storage_unavailable', 'Secure booking-share storage is not configured for this deployment.', 503);
        }
        const revoked = await shareStore.revoke(bookingId);
        const share = revoked.record
          ? {
              exists: true,
              active: false,
              issuedAt: revoked.record.issuedAt || null,
              expiresAt: revoked.record.expiresAt || null,
              revokedAt: revoked.record.revokedAt || null,
              generation: Number(revoked.record.generation || 0),
              revoked: Boolean(revoked.record.revokedAt)
            }
          : {
              exists: false,
              active: false,
              issuedAt: null,
              expiresAt: null,
              revokedAt: null,
              generation: 0,
              revoked: false
            };
        return res.status(200).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v12',
          bookingId,
          share
        });
      }

      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({
        success: false,
        schemaVersion: 'v12',
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
module.exports.createHandler = createHandler;
module.exports.capability = capability;
