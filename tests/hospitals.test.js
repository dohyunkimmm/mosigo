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

test('GET returns prototype hospital data', () => {
  const res = invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.source, 'prototype');
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  assert.equal(res.headers['x-mosigo-data'], 'prototype');
  assert.equal(res.headers['cache-control'], 'public, s-maxage=300, stale-while-revalidate=600');
});

test('department code filters hospitals', () => {
  const res = invoke({ query: { qd: 'D006' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((item) => item.dept.includes('정형외과')));
});

test('name query filters by hospital name or department', () => {
  const res = invoke({ query: { qn: '안과' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((item) => item.name.includes('안과') || item.dept.includes('안과')));
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
