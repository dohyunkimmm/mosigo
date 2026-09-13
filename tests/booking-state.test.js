const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PHASES,
  canTransition,
  createBookingId,
  createBookingState,
  isActiveBooking,
  restoreBookingState,
  serializeBookingState,
  transitionBookingState
} = require('../src/booking-state.js');

test('booking IDs use the v9 timestamp-plus-entropy format', () => {
  const id=createBookingId(1789176000000,'ABCD');
  assert.match(id,/^M9[A-Z0-9]{8}$/);
  assert.equal(id,createBookingId(1789176000000,'ABCD'));
  assert.notEqual(id,createBookingId(1789176000000,'WXYZ'));
});

test('booking state starts idle with normalized defaults', () => {
  const state=createBookingState({ hospitalName:'  똑똑연세내과의원  ', durationHours:'3' });
  assert.equal(state.phase,PHASES.IDLE);
  assert.equal(state.hospitalName,'똑똑연세내과의원');
  assert.equal(state.durationHours,3);
  assert.equal(isActiveBooking(state),false);
});

test('booking follows request-confirm-progress-complete lifecycle', () => {
  let state=createBookingState();
  state=transitionBookingState(state,PHASES.REQUESTING,{ bookingId:'M9ABC12345', hospitalName:'똑똑연세내과의원' },0);
  assert.equal(isActiveBooking(state),true);
  state=transitionBookingState(state,PHASES.CONFIRMED,{},1000);
  state=transitionBookingState(state,PHASES.IN_PROGRESS,{},2000);
  state=transitionBookingState(state,PHASES.COMPLETED,{},3000);
  assert.equal(state.phase,PHASES.COMPLETED);
  assert.equal(isActiveBooking(state),false);
});

test('scheduled booking can be cancelled but completed booking cannot jump backwards', () => {
  let state=createBookingState();
  state=transitionBookingState(state,PHASES.REQUESTING,{},0);
  state=transitionBookingState(state,PHASES.CONFIRMED,{},1000);
  assert.equal(canTransition(state.phase,PHASES.CANCELLED),true);
  state=transitionBookingState(state,PHASES.CANCELLED,{},2000);
  assert.throws(()=>transitionBookingState(state,PHASES.CONFIRMED),/Invalid booking transition/);
});

test('invalid direct phase jumps are rejected', () => {
  const state=createBookingState();
  assert.equal(canTransition(PHASES.IDLE,PHASES.IN_PROGRESS),false);
  assert.throws(()=>transitionBookingState(state,PHASES.IN_PROGRESS),/Invalid booking transition/);
});

test('booking state survives safe serialize and restore', () => {
  let state=createBookingState({ managerIndex:2, managerName:'박성호', amount:45000 });
  state=transitionBookingState(state,PHASES.REQUESTING,{ bookingId:'M9ABC12345' },0);
  const restored=restoreBookingState(serializeBookingState(state));
  assert.equal(restored.phase,PHASES.REQUESTING);
  assert.equal(restored.managerIndex,2);
  assert.equal(restored.amount,45000);
});

test('corrupt persisted booking state safely resets to idle', () => {
  const restored=restoreBookingState('{broken');
  assert.equal(restored.phase,PHASES.IDLE);
  assert.equal(restored.bookingId,'');
});
