const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../src/api/bookings.js');

function invoke({ method = 'GET', body } = {}) {
  const headers = {};
  const result = { statusCode: 200, headers, body: undefined };
  const req = { method, body };
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    }
  };
  handler(req, res);
  return result;
}

const sample = {
  hospitalId: 'hospital-1',
  hospitalName: '똑똑연세내과의원',
  managerIndex: 0,
  managerName: '김민준',
  targetName: '아버지',
  date: '2026-09-20',
  time: '10:00',
  durationHours: 2,
  mode: '차량 동행',
  amount: 45000
};

test('GET exposes the v9 coordinated booking resource capability', () => {
  const res = invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.schemaVersion, 'v9');
  assert.equal(res.body.resource, 'coordinated-booking-resource');
  assert.equal(res.body.authoritativeTransitions, true);
  assert.equal(res.body.persistence, 'client-local');
  assert.equal(res.body.recoverable, true);
  assert.equal(res.body.recoveryScope, 'same-device');
  assert.equal(res.body.durableServerPersistence, false);
  assert.equal(res.body.recoveryMethod, 'PUT');
  assert.equal(res.body.traceable, true);
  assert.equal(res.body.historyField, 'history');
  assert.equal(res.body.revisionField, 'revision');
  assert.equal(res.body.historyValidation, 'server');
  assert.equal(res.body.legacyRecoveryMigration, true);
  assert.equal(res.body.coordinated, true);
  assert.equal(res.body.coordinationScope, 'same-device');
  assert.equal(res.body.coordinationTransport, 'storage-event');
  assert.equal(res.body.snapshotConflictPolicy, 'higher-revision-wins');
  assert.equal(res.body.equalRevisionConflictPolicy, 'stored-snapshot-wins');
  assert.deepEqual(res.body.actions, ['confirm', 'start', 'complete', 'cancel']);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-mosigo-schema'], 'v9');
});

test('POST creates a traceable requesting booking with a v9 ID', () => {
  const res = invoke({ method: 'POST', body: sample });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.schemaVersion, 'v9');
  assert.equal(res.body.booking.phase, 'requesting');
  assert.match(res.body.booking.bookingId, /^M9[A-Z0-9]{8}$/);
  assert.equal(res.body.booking.hospitalId, sample.hospitalId);
  assert.equal(res.body.booking.managerName, sample.managerName);
  assert.ok(res.body.booking.createdAt);
  assert.equal(res.body.booking.revision, 1);
  assert.equal(res.body.booking.historyComplete, true);
  assert.deepEqual(
    res.body.booking.history.map(({ sequence, bookingId, type, from, to }) => ({ sequence, bookingId, type, from, to })),
    [{
      sequence: 1,
      bookingId: res.body.booking.bookingId,
      type: 'created',
      from: 'idle',
      to: 'requesting'
    }]
  );
});

test('POST preserves valid v4/v6/v7/v8/v9 browser booking IDs', () => {
  for (const bookingId of ['M4ABC12345', 'M6ABC12345', 'M7ABC12345', 'M8ABC12345', 'M9ABC12345']) {
    const res = invoke({ method: 'POST', body: { ...sample, bookingId } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.booking.bookingId, bookingId);
    assert.equal(res.body.booking.phase, 'requesting');
    assert.equal(res.body.booking.history[0].bookingId, bookingId);
  }
});

test('POST replaces malformed client booking IDs with a v9 ID', () => {
  const res = invoke({ method: 'POST', body: { ...sample, bookingId: 'bad-id' } });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.booking.bookingId, /^M9[A-Z0-9]{8}$/);
});

test('POST rejects incomplete booking input', () => {
  const res = invoke({ method: 'POST', body: { hospitalName: '똑똑연세내과의원' } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'manager_required');
});

test('PUT revalidates a traced booking snapshot without resetting phase or history', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const confirmed = invoke({ method: 'PATCH', body: { action: 'confirm', booking: created } }).body.booking;
  const recovered = invoke({ method: 'PUT', body: { booking: confirmed } });

  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.body.success, true);
  assert.equal(recovered.body.recovered, true);
  assert.equal(recovered.body.recoveryScope, 'same-device');
  assert.equal(recovered.body.booking.bookingId, confirmed.bookingId);
  assert.equal(recovered.body.booking.phase, 'confirmed');
  assert.equal(recovered.body.booking.updatedAt, confirmed.updatedAt);
  assert.equal(recovered.body.booking.revision, 2);
  assert.equal(recovered.body.booking.historyComplete, true);
  assert.deepEqual(recovered.body.booking.history, confirmed.history);
});

test('PUT migrates a legacy v7 same-device snapshot into an explicitly incomplete history', () => {
  const legacy = {
    ...sample,
    bookingId: 'M7ABC12345',
    phase: 'confirmed',
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T01:00:00.000Z'
  };
  const recovered = invoke({ method: 'PUT', body: { booking: legacy } });

  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.body.booking.revision, 1);
  assert.equal(recovered.body.booking.historyComplete, false);
  assert.equal(recovered.body.booking.history[0].type, 'legacy_import');
  assert.equal(recovered.body.booking.history[0].from, null);
  assert.equal(recovered.body.booking.history[0].to, 'confirmed');
});

test('PUT rejects idle, malformed, or tampered recovery snapshots', () => {
  const idle = invoke({ method: 'PUT', body: { booking: { ...sample, bookingId: 'M9ABC12345', phase: 'idle' } } });
  assert.equal(idle.statusCode, 422);
  assert.equal(idle.body.error, 'booking_phase_required');

  const malformed = invoke({ method: 'PUT', body: { booking: { ...sample, bookingId: 'broken', phase: 'confirmed' } } });
  assert.equal(malformed.statusCode, 422);
  assert.equal(malformed.body.error, 'booking_id_required');

  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const tampered = {
    ...created,
    phase: 'confirmed'
  };
  const conflict = invoke({ method: 'PUT', body: { booking: tampered } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.error, 'booking_history_conflict');
});

test('PATCH appends ordered history for legal booking lifecycle transitions', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const confirmed = invoke({ method: 'PATCH', body: { action: 'confirm', booking: created } });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.body.booking.phase, 'confirmed');
  assert.equal(confirmed.body.booking.revision, 2);
  assert.equal(confirmed.body.booking.history[1].type, 'confirm');
  assert.equal(confirmed.body.booking.history[1].from, 'requesting');
  assert.equal(confirmed.body.booking.history[1].to, 'confirmed');

  const started = invoke({ method: 'PATCH', body: { action: 'start', booking: confirmed.body.booking } });
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.booking.phase, 'in_progress');
  assert.equal(started.body.booking.revision, 3);

  const completed = invoke({ method: 'PATCH', body: { action: 'complete', booking: started.body.booking } });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.body.booking.phase, 'completed');
  assert.equal(completed.body.booking.revision, 4);
  assert.deepEqual(completed.body.booking.history.map((event) => event.type), ['created', 'confirm', 'start', 'complete']);
  assert.equal(completed.body.booking.history.at(-1).to, 'completed');
});

test('PATCH rejects stale revision metadata and invalid transitions', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const stale = { ...created, revision: 2 };
  const revisionConflict = invoke({ method: 'PATCH', body: { action: 'confirm', booking: stale } });
  assert.equal(revisionConflict.statusCode, 409);
  assert.equal(revisionConflict.body.error, 'booking_revision_conflict');

  const completeTooEarly = invoke({ method: 'PATCH', body: { action: 'complete', booking: created } });
  assert.equal(completeTooEarly.statusCode, 409);
  assert.equal(completeTooEarly.body.error, 'invalid_transition');

  const unknown = invoke({ method: 'PATCH', body: { action: 'teleport', booking: created } });
  assert.equal(unknown.statusCode, 400);
  assert.equal(unknown.body.error, 'unknown_action');
});

test('PATCH rejects malformed booking IDs', () => {
  const invalid = { ...sample, phase: 'requesting', bookingId: 'broken' };
  const res = invoke({ method: 'PATCH', body: { action: 'confirm', booking: invalid } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, 'booking_id_required');
});

test('scheduled booking can be cancelled with a trace event', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const cancelled = invoke({ method: 'PATCH', body: { action: 'cancel', booking: created } });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.body.booking.phase, 'cancelled');
  assert.equal(cancelled.body.booking.revision, 2);
  assert.equal(cancelled.body.booking.history[1].type, 'cancel');
  assert.equal(cancelled.body.booking.history[1].to, 'cancelled');
});

test('unsupported methods are rejected', () => {
  const res = invoke({ method: 'DELETE' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST, PUT, PATCH');
  assert.equal(res.body.schemaVersion, 'v9');
});
