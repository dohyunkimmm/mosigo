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

test('GET exposes the v7 recoverable booking resource capability', () => {
  const res = invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.schemaVersion, 'v7');
  assert.equal(res.body.resource, 'booking-resource');
  assert.equal(res.body.authoritativeTransitions, true);
  assert.equal(res.body.persistence, 'client-local');
  assert.equal(res.body.recoverable, true);
  assert.equal(res.body.recoveryScope, 'same-device');
  assert.equal(res.body.durableServerPersistence, false);
  assert.equal(res.body.recoveryMethod, 'PUT');
  assert.deepEqual(res.body.actions, ['confirm', 'start', 'complete', 'cancel']);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-mosigo-schema'], 'v7');
});

test('POST creates a canonical requesting booking with a v7 ID', () => {
  const res = invoke({ method: 'POST', body: sample });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.schemaVersion, 'v7');
  assert.equal(res.body.booking.phase, 'requesting');
  assert.match(res.body.booking.bookingId, /^M7[A-Z0-9]{8}$/);
  assert.equal(res.body.booking.hospitalId, sample.hospitalId);
  assert.equal(res.body.booking.managerName, sample.managerName);
  assert.ok(res.body.booking.createdAt);
});

test('POST preserves valid v4/v6/v7 browser booking IDs', () => {
  for (const bookingId of ['M4ABC12345', 'M6ABC12345', 'M7ABC12345']) {
    const res = invoke({ method: 'POST', body: { ...sample, bookingId } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.booking.bookingId, bookingId);
    assert.equal(res.body.booking.phase, 'requesting');
  }
});

test('POST replaces malformed client booking IDs with a v7 ID', () => {
  const res = invoke({ method: 'POST', body: { ...sample, bookingId: 'bad-id' } });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.booking.bookingId, /^M7[A-Z0-9]{8}$/);
});

test('POST rejects incomplete booking input', () => {
  const res = invoke({ method: 'POST', body: { hospitalName: '똑똑연세내과의원' } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'manager_required');
});

test('PUT revalidates a same-device booking snapshot without resetting phase', () => {
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
});

test('PUT rejects idle or malformed recovery snapshots', () => {
  const idle = invoke({ method: 'PUT', body: { booking: { ...sample, bookingId: 'M7ABC12345', phase: 'idle' } } });
  assert.equal(idle.statusCode, 422);
  assert.equal(idle.body.error, 'booking_phase_required');

  const malformed = invoke({ method: 'PUT', body: { booking: { ...sample, bookingId: 'broken', phase: 'confirmed' } } });
  assert.equal(malformed.statusCode, 422);
  assert.equal(malformed.body.error, 'booking_id_required');
});

test('PATCH applies legal booking lifecycle transitions', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const confirmed = invoke({ method: 'PATCH', body: { action: 'confirm', booking: created } });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.body.booking.phase, 'confirmed');

  const started = invoke({ method: 'PATCH', body: { action: 'start', booking: confirmed.body.booking } });
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.booking.phase, 'in_progress');

  const completed = invoke({ method: 'PATCH', body: { action: 'complete', booking: started.body.booking } });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.body.booking.phase, 'completed');
});

test('PATCH rejects invalid transitions and unknown actions', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;

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

test('scheduled booking can be cancelled through the API', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const cancelled = invoke({ method: 'PATCH', body: { action: 'cancel', booking: created } });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.body.booking.phase, 'cancelled');
});

test('unsupported methods are rejected', () => {
  const res = invoke({ method: 'DELETE' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST, PUT, PATCH');
});
