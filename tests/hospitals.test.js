const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../src/api/hospitals.js');

function invoke({ method = 'GET', query = {} } = {}) {
  const headers = {};
  const result = { statusCode: 200, headers, body: undefined };

  const req = { method, query };
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    }
  };

  handler(req, res);
  return result;
}

test('GET returns v4 prototype hospital data and query metadata', () => {
  const res = invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.source, 'prototype');
  assert.equal(res.body.schemaVersion, 'v4');
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  assert.equal(res.body.meta.returned, res.body.items.length);
  assert.equal(res.headers['x-mosigo-data'], 'prototype');
  assert.equal(res.headers['x-mosigo-schema'], 'v4');
  assert.equal(res.headers['cache-control'], 'public, s-maxage=300, stale-while-revalidate=600');
});

test('department code filters hospitals', () => {
  const res = invoke({ query: { qd: 'D006' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((item) => item.dept.includes('정형외과')));
  assert.equal(res.body.meta.filters.department, '정형외과');
});

test('name query filters by hospital name, department, or specialty', () => {
  const res = invoke({ query: { qn: '이명' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.some((item) => item.specialties.includes('이명')));
});

test('manager and same-day filters can be combined', () => {
  const res = invoke({ query: { managerAvailable: '1', sameDay: '1' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((item) => item.mgrIds.length > 0));
  assert.ok(res.body.items.every((item) => item.availability.sameDay === true));
  assert.equal(res.body.meta.filters.managerAvailable, true);
  assert.equal(res.body.meta.filters.sameDay, true);
});

test('wait sort returns shortest prototype waits first', () => {
  const res = invoke({ query: { sort: 'wait' } });
  const waits = res.body.items.map((item) => item.availability.waitMin == null ? Infinity : item.availability.waitMin);
  for (let i = 1; i < waits.length; i += 1) {
    assert.ok(waits[i - 1] <= waits[i]);
  }
});

test('numOfRows is bounded to a safe range', () => {
  const one = invoke({ query: { numOfRows: '1' } });
  assert.equal(one.body.items.length, 1);

  const oversized = invoke({ query: { numOfRows: '999' } });
  assert.ok(oversized.body.items.length <= 30);
});

test('non-GET methods are rejected', () => {
  const res = invoke({ method: 'POST' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.success, false);
  assert.equal(res.headers.allow, 'GET');
});
