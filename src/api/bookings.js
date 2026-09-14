const {
  BookingServiceError,
  applyBookingAction,
  capability,
  createBookingRequest,
  recoverBookingSnapshot,
  validBookingId
} = require('../lib/booking-service.js');
const {
  BookingStoreError,
  createBookingStore,
  createRecoveryKey,
  isOwnedByAccount,
  recoveryKeyMatches
} = require('../lib/booking-store.js');
const {
  BookingShareStoreError,
  createBookingShareStore
} = require('../lib/booking-share-store.js');
const {
  AccountStoreError,
  createAccountStore
} = require('../lib/account-store.js');

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

function readShareToken(req) {
  const header = req?.headers?.['x-mosigo-share-token'] || req?.headers?.['X-Mosigo-Share-Token'];
  return String(header || '').trim();
}

function writeCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Mosigo-Schema', 'v10');
  res.setHeader('X-Mosigo-Data', 'prototype');
}

function writeError(res, error) {
  const known =
    error instanceof BookingServiceError ||
    error instanceof BookingStoreError ||
    error instanceof BookingShareStoreError ||
    error instanceof AccountStoreError;
  const status = known ? error.status : 500;
  return res.status(status).json({
    success: false,
    schemaVersion: 'v10',
    error: known ? error.code : 'internal_error',
    message: known ? error.message : 'Unexpected booking service error.'
  });
}

async function optionalAccountSession(accountStore, req) {
  if (!accountStore?.configured || typeof accountStore.sessionFromRequest !== 'function') return null;
  return accountStore.sessionFromRequest(req);
}

async function assertBookingAccess(current, req, body, bookingId, shareStore, accountStore) {
  const recoveryKey = readRecoveryKey(req, body);
  if (recoveryKey && recoveryKeyMatches(current?.record, recoveryKey)) {
    return { type: 'recovery-key', account: null };
  }

  const session = await optionalAccountSession(accountStore, req);
  if (session?.account?.accountId && isOwnedByAccount(current?.record, session.account.accountId)) {
    return { type: 'account-session', account: session.account };
  }

  const shareToken = readShareToken(req);
  if (shareToken) {
    if (!shareStore?.configured) {
      throw new BookingShareStoreError('booking_share_storage_unavailable', 'Secure booking-share storage is not configured for this deployment.', 503);
    }
    await shareStore.validate(bookingId, shareToken);
    return { type: 'share-token', account: null };
  }
  throw new BookingServiceError('booking_recovery_key_invalid', 'A valid recovery key, owner account session, or active share token is required for this durable booking.', 401);
}

function createHandler({
  store = createBookingStore(),
  shareStore = createBookingShareStore(),
  accountStore = createAccountStore()
} = {}) {
  return async function handler(req, res) {
    writeCommonHeaders(res);

    try {
      if (req.method === 'GET') {
        const bookingId = readQuery(req, 'bookingId');
        if (!bookingId) {
          const secureSharing = Boolean(store.configured && shareStore.configured);
          const accountOwnership = Boolean(store.configured && accountStore.configured);
          return res.status(200).json({
            success: true,
            source: 'prototype',
            ...capability({ durableServerPersistence: store.configured }),
            secureSharing,
            shareCredential: secureSharing ? 'opaque-expiring-share-token' : 'unavailable',
            shareTransport: secureSharing ? 'url-fragment' : 'unavailable',
            shareEndpoint: secureSharing ? '/api/booking-shares' : null,
            shareRevocable: secureSharing,
            shareRotatable: secureSharing,
            shareServerValidation: secureSharing,
            accountOwnership,
            accountEndpoint: accountOwnership ? '/api/account' : null,
            accountSessionCredential: accountOwnership ? 'http-only-secure-cookie' : 'unavailable',
            accountBookingScope: accountOwnership ? 'owner-account' : 'unavailable'
          });
        }
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
        const access = await assertBookingAccess(current, req, {}, bookingId, shareStore, accountStore);
        return res.status(200).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v10',
          durablePersisted: true,
          accessType: access.type,
          accountOwned: Boolean(current.record.ownerAccountId),
          booking: current.record.booking
        });
      }

      if (req.method === 'POST') {
        const body = readBody(req);
        const booking = createBookingRequest(body.booking || body);
        if (!store.configured) {
          return res.status(201).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v10',
            durablePersisted: false,
            booking
          });
        }
        const session = await optionalAccountSession(accountStore, req);
        const ownerAccountId = session?.account?.accountId || '';
        const recoveryKey = createRecoveryKey();
        if (ownerAccountId) await accountStore.addBooking(ownerAccountId, booking.bookingId);
        await store.create(booking, recoveryKey, { ownerAccountId: ownerAccountId || null });
        return res.status(201).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v10',
          durablePersisted: true,
          recoveryKey,
          accountOwned: Boolean(ownerAccountId),
          booking
        });
      }

      if (req.method === 'PUT') {
        const body = readBody(req);
        const submitted = recoverBookingSnapshot(body.booking || body);
        if (!store.configured) {
          return res.status(200).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v10',
            recovered: true,
            recoveryScope: 'same-device',
            durablePersisted: false,
            booking: submitted
          });
        }

        const current = await store.read(submitted.bookingId);
        if (!current) {
          const session = await optionalAccountSession(accountStore, req);
          const ownerAccountId = session?.account?.accountId || '';
          const recoveryKey = createRecoveryKey();
          if (ownerAccountId) await accountStore.addBooking(ownerAccountId, submitted.bookingId);
          await store.create(submitted, recoveryKey, { ownerAccountId: ownerAccountId || null });
          return res.status(200).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v10',
            recovered: true,
            migratedToDurable: true,
            recoveryScope: ownerAccountId ? 'owner-account' : 'booking-key',
            durablePersisted: true,
            recoveryKey,
            accountOwned: Boolean(ownerAccountId),
            booking: submitted
          });
        }

        const access = await assertBookingAccess(current, req, body, submitted.bookingId, shareStore, accountStore);
        const canonical = current.record.booking;
        if (Number(submitted.revision) > Number(canonical.revision)) {
          throw new BookingServiceError('booking_revision_conflict', 'Client snapshot is ahead of the durable canonical revision.', 409);
        }
        return res.status(200).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v10',
          recovered: true,
          recoveryScope: access.type === 'account-session' ? 'owner-account' : (access.type === 'share-token' ? 'temporary-share' : 'booking-key'),
          durablePersisted: true,
          accessType: access.type,
          accountOwned: Boolean(current.record.ownerAccountId),
          booking: canonical
        });
      }

      if (req.method === 'PATCH') {
        const body = readBody(req);
        if (!store.configured) {
          const booking = applyBookingAction(body.booking, body.action);
          return res.status(200).json({
            success: true,
            source: 'prototype',
            schemaVersion: 'v10',
            durablePersisted: false,
            booking
          });
        }

        const bookingId = String(body.bookingId || body.booking?.bookingId || '').trim();
        if (!validBookingId(bookingId)) {
          throw new BookingServiceError('booking_id_required', 'A valid booking ID is required.', 422);
        }
        const current = await store.read(bookingId);
        if (!current) {
          throw new BookingServiceError('booking_not_found', 'No durable booking was found for this ID.', 404);
        }
        const access = await assertBookingAccess(current, req, body, bookingId, shareStore, accountStore);

        const expectedRevision = Number(body.expectedRevision ?? body.booking?.revision);
        const canonicalRevision = Number(current.record.booking?.revision);
        if (!Number.isInteger(expectedRevision) || expectedRevision !== canonicalRevision) {
          throw new BookingServiceError('booking_revision_conflict', 'Expected revision does not match the durable canonical booking.', 409);
        }

        const booking = applyBookingAction(current.record.booking, body.action);
        await store.update(current, booking);
        return res.status(200).json({
          success: true,
          source: 'prototype',
          schemaVersion: 'v10',
          durablePersisted: true,
          accessType: access.type,
          accountOwned: Boolean(current.record.ownerAccountId),
          booking
        });
      }

      res.setHeader('Allow', 'GET, POST, PUT, PATCH');
      return res.status(405).json({
        success: false,
        schemaVersion: 'v10',
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
module.exports.assertBookingAccess = assertBookingAccess;
