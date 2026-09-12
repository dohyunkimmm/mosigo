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

test('GET exposes the v6 booking command capability', () => {
  const res = invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.schemaVersion, 'v6');
  assert.equal(res.body.authoritativeTransitions, true);
  assert.equal(res.body.persistence, 'client-session');
  assert.deepEqual(res.body.actions, ['confirm', 'start', 'complete', 'cancel']);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-mosigo-schema'], 'v6');
});

test('POST creates a canonical requesting booking', () => {
  const res = invoke({ method: 'POST', body: sample });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.booking.phase, 'requesting');
  assert.match(res.body.booking.bookingId, /^M6[A-Z0-9]{8}$/);
  assert.equal(res.body.booking.hospitalId, sample.hospitalId);
  assert.equal(res.body.booking.managerName, sample.managerName);
  assert.ok(res.body.booking.createdAt);
});

test('POST rejects incomplete booking input', () => {
  const res = invoke({ method: 'POST', body: { hospitalName: '똑똑연세내과의원' } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'manager_required');
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

test('scheduled booking can be cancelled through the API', () => {
  const created = invoke({ method: 'POST', body: sample }).body.booking;
  const cancelled = invoke({ method: 'PATCH', body: { action: 'cancel', booking: created } });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.body.booking.phase, 'cancelled');
});

test('unsupported methods are rejected', () => {
  const res = invoke({ method: 'DELETE' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST, PATCH');
});
