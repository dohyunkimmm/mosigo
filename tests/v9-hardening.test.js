const test = require('node:test');
const assert = require('node:assert/strict');

const {
  capability,
  createPilotBookingId,
  validBookingId
} = require('../src/lib/booking-service.js');

test('server-generated v9 IDs combine timestamp material with entropy', () => {
  const first = createPilotBookingId(1789176000000, 'ABCD');
  const second = createPilotBookingId(1789176000000, 'WXYZ');
  assert.match(first, /^M9[A-Z0-9]{8}$/);
  assert.match(second, /^M9[A-Z0-9]{8}$/);
  assert.notEqual(first, second);
  assert.equal(validBookingId(first), true);
  assert.equal(validBookingId(second), true);
});

test('v9 capability describes deterministic same-device coordination policies', () => {
  const value = capability();
  assert.equal(value.schemaVersion, 'v9');
  assert.equal(value.snapshotConflictPolicy, 'higher-revision-wins');
  assert.equal(value.equalRevisionConflictPolicy, 'stored-snapshot-wins');
  assert.equal(value.crossBookingTieBreakPolicy, 'updated-at-then-booking-id');
  assert.equal(value.clearPropagation, true);
  assert.equal(value.canonicalReadMethod, 'PUT');
  assert.equal(value.bookingIdVersion, 'M9');
  assert.equal(value.bookingIdGeneration, 'timestamp-plus-entropy');
  assert.equal(value.durableServerPersistence, false);
});
