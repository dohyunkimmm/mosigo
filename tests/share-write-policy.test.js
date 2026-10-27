'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveShareWritePolicy } = require('../src/lib/share-write-policy.js');

test('existing share link write contract remains default in production', () => {
  assert.equal(resolveShareWritePolicy({}), 'edit');
  assert.equal(resolveShareWritePolicy(), process.env.MOSIGO_SHARE_WRITE_POLICY || 'edit');
  assert.equal(resolveShareWritePolicy({ MOSIGO_SHARE_WRITE_POLICY: 'edit' }), 'edit');
});

test('read-only policy is explicit and invalid values cannot silently enable a new behavior', () => {
  assert.equal(resolveShareWritePolicy({ MOSIGO_SHARE_WRITE_POLICY: 'read-only' }), 'read-only');
  for (const invalid of ['false', 'readonly', 'owner-only', 'off', 'READ-ONLY']) {
    assert.throws(
      () => resolveShareWritePolicy({ MOSIGO_SHARE_WRITE_POLICY: invalid }),
      /must be edit or read-only/
    );
  }
});
