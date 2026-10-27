'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseRequestQuery, readRequestQuery } = require('../src/lib/request-query.js');
const hospitalHandler = require('../src/api/hospitals.js');

function request(url) {
  const req = { method: 'GET', url };
  Object.defineProperty(req, 'query', {
    get() { throw new Error('Vercel req.query getter must not be used'); }
  });
  return req;
}

test('WHATWG query parser preserves single, duplicate, Unicode, and encoded values', () => {
  const req = request('/api/hospitals?qn=%EC%9D%B4%EB%AA%85&qd=D006&qn=%ED%97%88%EB%A6%AC&blank=&plus=a+b');
  const query = parseRequestQuery(req);
  assert.deepEqual(query.qn, ['이명', '허리']);
  assert.equal(query.qd, 'D006');
  assert.equal(query.blank, '');
  assert.equal(query.plus, 'a b');
  assert.equal(readRequestQuery(req, 'qn'), '이명');
  assert.equal(readRequestQuery(req, 'absent'), '');
});

test('query keys are own properties, including prototype-sensitive names', () => {
  const query = parseRequestQuery(request('/api/hospitals?__proto__=ok&constructor=literal'));
  assert.equal(query.__proto__, 'ok');
  assert.equal(query.constructor, 'literal');
  assert.equal(Object.getPrototypeOf(query), null);
  assert.equal({}.polluted, undefined);
});

test('query parsing never reads Vercel req.query when URL is present', () => {
  assert.deepEqual(Object.keys(parseRequestQuery(request('/api/hospitals'))), []);
  assert.equal(readRequestQuery(request('/api/bookings?bookingId=M10ABC12345'), 'bookingId'), 'M10ABC12345');
});

test('legacy test doubles without req.url retain their explicit query fixture', () => {
  assert.equal(readRequestQuery({query: { resource: ['bookings', 'ignored'] }}, 'resource'), 'bookings');
});

test('hospital endpoint filters using req.url without invoking deprecated getter', () => {
  const state = { statusCode: 200, body: null };
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(s) { state.statusCode = s; return this; },
    json(body) { state.body = body; return this; }
  };
  hospitalHandler(request('/api/hospitals?qd=D006&numOfRows=1'), res);
  assert.equal(state.statusCode, 200);
  assert.equal(state.body.meta.limit, 1);
  assert.equal(state.body.meta.filters.department, '정형외과');
  assert.ok(state.body.items.every(x => x.dept.includes('정형외과')));
});

test('no API endpoint directly references the Vercel req.query getter', () => {
  for (const file of ['hospitals.js', 'account.js', 'bookings.js', 'booking-shares.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src/api', file), 'utf8');
    assert.doesNotMatch(source, /req\s*\??\.\s*query\b/);
  }
});
