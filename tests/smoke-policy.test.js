'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { requiresDurableStorage } = require('../scripts/smoke-policy.js');

test('every v10 and later release requires private Blob durability', () => {
  for (const version of ['10.0.0', '11.9.0', '13.0.0', '14.0.0', '14.99.1', '15.0.0', '20.1.2']) {
    assert.equal(requiresDurableStorage(version), true, version);
  }
  for (const version of ['0.1.0', '4.8.0', '9.9.9']) {
    assert.equal(requiresDurableStorage(version), false, version);
  }
  for (const version of ['', 'v14.0.0', '14', 'invalid', '14.0.0-pre']) {
    assert.throws(() => requiresDurableStorage(version), /Invalid release version/, version);
  }
});

test('Production Smoke applies the durable requirement to checks and output', () => {
  const script = fs.readFileSync(path.join(__dirname, '../scripts/production-smoke.js'), 'utf8');
  assert.match(script, /if \(requiresDurableStorage\(RELEASE_VERSION\)\)/);
  assert.match(script, /const durableRequired = requiresDurableStorage\(RELEASE_VERSION\)/);
  assert.doesNotMatch(script, /\['10\.',\s*'11\.',\s*'12\.',\s*'13\.'\]/);
});

test('release cannot publish before matching main SHA browser QA succeeds', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /Require successful main-branch browser QA for release commit/);
  assert.match(workflow, /head_sha=\$TARGET_SHA/);
  assert.match(workflow, /\.head_branch == "main" and \.head_sha == \$sha/);
  assert.match(workflow, /success\) echo "Browser QA passed/);
  assert.match(workflow, /Browser QA not successful within 15 minutes/);
});
