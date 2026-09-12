const Booking = require('../booking-state.js');

class BookingServiceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'BookingServiceError';
    this.code = code;
    this.status = status;
  }
}

function createPilotBookingId(now = Date.now()) {
  const stamp = Math.max(0, Number(now) || 0)
    .toString(36)
    .toUpperCase()
    .slice(-8)
    .padStart(8, '0');
  return `M6${stamp}`;
}

function validBookingId(value) {
  return /^M[46][A-Z0-9]{8}$/.test(String(value || '').trim());
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

function createBookingRequest(input = {}, { now = Date.now(), bookingId } = {}) {
  const normalized = validateBookingRequest(input);
  const state = Booking.createBookingState();
  const requestedId = validBookingId(bookingId)
    ? bookingId
    : validBookingId(normalized.bookingId)
      ? normalized.bookingId
      : createPilotBookingId(now);
  return Booking.transitionBookingState(
    state,
    Booking.PHASES.REQUESTING,
    {
      ...normalized,
      bookingId: requestedId
    },
    now
  );
}

const ACTION_TO_PHASE = Object.freeze({
  confirm: Booking.PHASES.CONFIRMED,
  start: Booking.PHASES.IN_PROGRESS,
  complete: Booking.PHASES.COMPLETED,
  cancel: Booking.PHASES.CANCELLED
});

function applyBookingAction(input = {}, action, { now = Date.now() } = {}) {
  const booking = Booking.createBookingState(input);
  if (!validBookingId(booking.bookingId)) {
    throw new BookingServiceError('booking_id_required', 'A valid booking ID is required.', 422);
  }
  const nextPhase = ACTION_TO_PHASE[action];
  if (!nextPhase) {
    throw new BookingServiceError('unknown_action', `Unknown booking action: ${action || ''}`, 400);
  }
  try {
    return Booking.transitionBookingState(booking, nextPhase, {}, now);
  } catch (error) {
    throw new BookingServiceError('invalid_transition', error.message, 409);
  }
}

function capability() {
  return {
    schemaVersion: 'v6',
    resource: 'booking-command',
    authoritativeTransitions: true,
    persistence: 'client-session',
    actions: Object.keys(ACTION_TO_PHASE)
  };
}

module.exports = {
  ACTION_TO_PHASE,
  BookingServiceError,
  applyBookingAction,
  capability,
  createBookingRequest,
  createPilotBookingId,
  validBookingId,
  validateBookingRequest
};
