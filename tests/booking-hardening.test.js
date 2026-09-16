const test = require('node:test');
const assert = require('node:assert/strict');

const {
  capability,
  createPilotBookingId,
  validBookingId
} = require('../src/lib/booking-service.js');

test('server-generated v10 IDs combine timestamp material with entropy while preserving legacy IDs', () => {
  const first = createPilotBookingId(1789176000000, 'ABCD');
  const second = createPilotBookingId(1789176000000, 'WXYZ');
  assert.match(first, /^M10[A-Z0-9]{8}$/);
  assert.match(second, /^M10[A-Z0-9]{8}$/);
  assert.notEqual(first, second);
  assert.equal(validBookingId(first), true);
  assert.equal(validBookingId(second), true);
  for (const legacy of ['M4ABC12345', 'M6ABC12345', 'M7ABC12345', 'M8ABC12345', 'M9ABC12345']) {
    assert.equal(validBookingId(legacy), true);
  }
});

test('v10 capability preserves v9 coordination policies and truthfully reports storage configuration', () => {
  const fallback = capability();
  assert.equal(fallback.schemaVersion, 'v10');
  assert.equal(fallback.resource, 'durable-booking-resource');
  assert.equal(fallback.snapshotConflictPolicy, 'higher-revision-wins');
  assert.equal(fallback.equalRevisionConflictPolicy, 'stored-snapshot-wins');
  assert.equal(fallback.crossBookingTieBreakPolicy, 'updated-at-then-booking-id');
  assert.equal(fallback.clearPropagation, true);
  assert.equal(fallback.canonicalReadMethod, 'PUT');
  assert.equal(fallback.bookingIdVersion, 'M10');
  assert.equal(fallback.durableServerPersistence, false);
  assert.equal(fallback.persistence, 'client-local-fallback');

  const durable = capability({ durableServerPersistence: true });
  assert.equal(durable.durableServerPersistence, true);
  assert.equal(durable.persistence, 'server-durable');
  assert.equal(durable.recoveryScope, 'booking-key');
  assert.equal(durable.canonicalReadMethod, 'GET');
  assert.equal(durable.serverConflictPolicy, 'revision-plus-etag-cas');
});
