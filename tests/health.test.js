const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../src/api/health.js');

function invoke({ method = 'GET' } = {}) {
  const headers = {};
  const result = { statusCode: 200, headers, body: undefined, ended: false };
  const req = { method };
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
    },
    end() {
      result.ended = true;
      return this;
    }
  };

  handler(req, res);
  return result;
}

test('GET exposes a minimal readiness payload without caching', () => {
  const res = invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, 'mosigo');
  assert.equal(res.body.status, 'ready');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['content-type'], /^application\/json/);
});

test('HEAD confirms readiness without a response body', () => {
  const res = invoke({ method: 'HEAD' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.ended, true);
  assert.equal(res.body, undefined);
});

test('unsupported methods are rejected explicitly', () => {
  const res = invoke({ method: 'POST' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, 'method_not_allowed');
  assert.equal(res.headers.allow, 'GET, HEAD');
});
