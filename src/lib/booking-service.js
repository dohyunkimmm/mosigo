const { randomInt } = require('node:crypto');
const Booking = require('../booking-state.js');

class BookingServiceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'BookingServiceError';
    this.code = code;
    this.status = status;
  }
}

function entropyToken(value) {
  if (value != null) {
    const token = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (token) return token.slice(-4).padStart(4, '0');
  }
  return randomInt(0, 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
}

function createPilotBookingId(now = Date.now(), entropy) {
  const stamp = Math.max(0, Number(now) || 0)
    .toString(36)
    .toUpperCase()
    .slice(-4)
    .padStart(4, '0');
  return `M9${stamp}${entropyToken(entropy)}`;
}

function validBookingId(value) {
  return /^M[46789][A-Z0-9]{8}$/.test(String(value || '').trim());
}

function validTimestamp(value) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value));
}

function createHistoryEvent({ sequence, bookingId, type, from = null, to, at }) {
  return {
    sequence,
    bookingId,
    type,
    from,
    to,
    at
  };
}

function validateBookingRequest(input = {}) {
  const booking = Booking.createBookingState(input);
  if (!booking.hospitalId && !booking.hospitalName) {
    throw new BookingServiceError('hospital_required', 'Hospital selection is required.', 422);
  }
  if (booking.managerIndex < 0 || !booking.managerName) {
    throw new BookingServiceError('manager_required', 'Manager selection is required.', 422);
  }
  if (!booking.targetName) {
    throw new BookingServiceError('target_required', 'Booking target is required.', 422);
  }
  if (!booking.date || !booking.time) {
    throw new BookingServiceError('schedule_required', 'Booking date and time are required.', 422);
  }
  if (!booking.mode) {
    throw new BookingServiceError('mode_required', 'Transport mode is required.', 422);
  }
  return booking;
}

const ACTION_TO_PHASE = Object.freeze({
  confirm: Booking.PHASES.CONFIRMED,
  start: Booking.PHASES.IN_PROGRESS,
  complete: Booking.PHASES.COMPLETED,
  cancel: Booking.PHASES.CANCELLED
});

function validateBookingHistory(input = {}, booking = Booking.createBookingState(input)) {
  const history = input.history;
  if (!Array.isArray(history) || history.length === 0) {
    throw new BookingServiceError('booking_history_required', 'Booking history is required.', 409);
  }

  const revision = Number(input.revision);
  if (!Number.isInteger(revision) || revision !== history.length) {
    throw new BookingServiceError('booking_revision_conflict', 'Booking revision must match the history length.', 409);
  }

  let previousTo = null;
  let previousAt = 0;
  let historyComplete = true;

  for (let index = 0; index < history.length; index += 1) {
    const event = history[index] || {};
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new BookingServiceError('booking_history_conflict', 'Booking history sequence is not contiguous.', 409);
    }
    if (event.bookingId !== booking.bookingId) {
      throw new BookingServiceError('booking_history_conflict', 'Booking history belongs to a different booking.', 409);
    }
    if (!validTimestamp(event.at)) {
      throw new BookingServiceError('booking_history_conflict', 'Booking history contains an invalid timestamp.', 409);
    }

    const at = Date.parse(event.at);
    if (at < previousAt) {
      throw new BookingServiceError('booking_history_conflict', 'Booking history timestamps are out of order.', 409);
    }
    previousAt = at;

    if (index === 0 && event.type === 'legacy_import') {
      if (event.from !== null || !Object.values(Booking.PHASES).includes(event.to) || event.to === Booking.PHASES.IDLE) {
        throw new BookingServiceError('booking_history_conflict', 'Legacy booking history import is invalid.', 409);
      }
      historyComplete = false;
    } else if (index === 0) {
      if (event.type !== 'created' || event.from !== Booking.PHASES.IDLE || event.to !== Booking.PHASES.REQUESTING) {
        throw new BookingServiceError('booking_history_conflict', 'Booking history must begin with booking creation.', 409);
      }
    } else {
      if (event.from !== previousTo || !Booking.canTransition(event.from, event.to)) {
        throw new BookingServiceError('booking_history_conflict', 'Booking history contains an invalid transition.', 409);
      }
      const expectedPhase = ACTION_TO_PHASE[event.type];
      if (!expectedPhase || expectedPhase !== event.to) {
        throw new BookingServiceError('booking_history_conflict', 'Booking history action does not match its transition.', 409);
      }
    }

    previousTo = event.to;
  }

  if (previousTo !== booking.phase) {
    throw new BookingServiceError('booking_history_conflict', 'Booking history does not match the current phase.', 409);
  }

  return {
    revision,
    history: history.map((event) => ({ ...event })),
    historyComplete
  };
}

function traceBooking(input = {}, booking = Booking.createBookingState(input), { now = Date.now() } = {}) {
  if (Array.isArray(input.history) && input.history.length > 0) {
    return validateBookingHistory(input, booking);
  }

  const timestamp = validTimestamp(booking.updatedAt)
    ? new Date(booking.updatedAt).toISOString()
    : validTimestamp(booking.createdAt)
      ? new Date(booking.createdAt).toISOString()
      : new Date(now).toISOString();

  return {
    revision: 1,
    historyComplete: false,
    history: [createHistoryEvent({
      sequence: 1,
      bookingId: booking.bookingId,
      type: 'legacy_import',
      from: null,
      to: booking.phase,
      at: timestamp
    })]
  };
}

function createBookingRequest(input = {}, { now = Date.now(), bookingId, entropy } = {}) {
  const normalized = validateBookingRequest(input);
  const state = Booking.createBookingState();
  const requestedId = validBookingId(bookingId)
    ? bookingId
    : validBookingId(normalized.bookingId)
      ? normalized.bookingId
      : createPilotBookingId(now, entropy);
  const booking = Booking.transitionBookingState(
    state,
    Booking.PHASES.REQUESTING,
    {
      ...normalized,
      bookingId: requestedId
    },
    now
  );

  return {
    ...booking,
    revision: 1,
    historyComplete: true,
    history: [createHistoryEvent({
      sequence: 1,
      bookingId: requestedId,
      type: 'created',
      from: Booking.PHASES.IDLE,
      to: Booking.PHASES.REQUESTING,
      at: booking.updatedAt
    })]
  };
}

function recoverBookingSnapshot(input = {}, { now = Date.now() } = {}) {
  const booking = validateBookingRequest(input);
  if (!validBookingId(booking.bookingId)) {
    throw new BookingServiceError('booking_id_required', 'A valid booking ID is required.', 422);
  }
  if (booking.phase === Booking.PHASES.IDLE) {
    throw new BookingServiceError('booking_phase_required', 'A recoverable booking phase is required.', 422);
  }
  const trace = traceBooking(input, booking, { now });
  return {
    ...booking,
    ...trace
  };
}

function applyBookingAction(input = {}, action, { now = Date.now() } = {}) {
  const booking = Booking.createBookingState(input);
  if (!validBookingId(booking.bookingId)) {
    throw new BookingServiceError('booking_id_required', 'A valid booking ID is required.', 422);
  }
  const nextPhase = ACTION_TO_PHASE[action];
  if (!nextPhase) {
    throw new BookingServiceError('unknown_action', `Unknown booking action: ${action || ''}`, 400);
  }

  const trace = traceBooking(input, booking, { now });
  let nextBooking;
  try {
    nextBooking = Booking.transitionBookingState(booking, nextPhase, {}, now);
  } catch (error) {
    throw new BookingServiceError('invalid_transition', error.message, 409);
  }

  const nextRevision = trace.revision + 1;
  const nextEvent = createHistoryEvent({
    sequence: nextRevision,
    bookingId: booking.bookingId,
    type: action,
    from: booking.phase,
    to: nextPhase,
    at: nextBooking.updatedAt
  });

  return {
    ...nextBooking,
    revision: nextRevision,
    historyComplete: trace.historyComplete,
    history: [...trace.history, nextEvent]
  };
}

function capability() {
  return {
    schemaVersion: 'v9',
    resource: 'coordinated-booking-resource',
    authoritativeTransitions: true,
    persistence: 'client-local',
    recoverable: true,
    recoveryScope: 'same-device',
    durableServerPersistence: false,
    recoveryMethod: 'PUT',
    traceable: true,
    historyField: 'history',
    revisionField: 'revision',
    historyValidation: 'server',
    legacyRecoveryMigration: true,
    coordinated: true,
    coordinationScope: 'same-device',
    coordinationTransport: 'storage-event',
    snapshotConflictPolicy: 'higher-revision-wins',
    equalRevisionConflictPolicy: 'stored-snapshot-wins',
    crossBookingTieBreakPolicy: 'updated-at-then-booking-id',
    clearPropagation: true,
    canonicalReadMethod: 'PUT',
    bookingIdVersion: 'M9',
    bookingIdGeneration: 'timestamp-plus-entropy',
    actions: Object.keys(ACTION_TO_PHASE)
  };
}

module.exports = {
  ACTION_TO_PHASE,
  BookingServiceError,
  applyBookingAction,
  capability,
  createBookingRequest,
  createHistoryEvent,
  createPilotBookingId,
  recoverBookingSnapshot,
  traceBooking,
  validBookingId,
  validateBookingHistory,
  validateBookingRequest
};
