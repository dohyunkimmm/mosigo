const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function read(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

test('v10 durable booking runtime and store files exist', () => {
  for (const file of [
    'v10-booking.js',
    'lib/booking-store.js',
    'package.json'
  ]) {
    assert.ok(fs.existsSync(path.join(SRC, file)), `Missing v10 runtime file: src/${file}`);
  }
});

test('v9 loads v10 durability through the stable extension chain', () => {
  const v9 = read('v9-booking.js');
  const v10 = read('v10-booking.js');
  assert.match(v9, /v10\.src=['"]v10-booking\.js['"]/, 'v9 should load the v10 durability layer');
  assert.match(v10, /MosigoV10BookingDurability/, 'v10 should expose its durability facade');
  assert.match(v10, /X-Mosigo-Recovery-Key/, 'v10 durable reads should use the recovery key header');
  assert.match(v10, /durableServerPersistence/, 'v10 should inspect server durable capability');
  assert.doesNotThrow(() => new Function(v10), 'v10 browser runtime should be syntax-valid');
});

test('v10 runtime dependency is isolated inside the Vercel src root', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies?.['@vercel/blob'], '2.8.0');
});

test('v10 durable server layer uses private Blob storage and conditional writes', () => {
  const store = read('lib/booking-store.js');
  assert.match(store, /access:\s*['"]private['"]/, 'durable records should use private Blob access');
  assert.match(store, /ifMatch:/, 'durable updates should use ETag conditional writes');
  assert.match(store, /allowOverwrite:\s*false/, 'durable creation should refuse overwriting existing booking IDs');
  assert.match(store, /recoveryKeyHash/, 'durable records should store a recovery-key hash');
  assert.doesNotMatch(store, /recoveryKey:\s*recoveryKey/, 'raw recovery keys should not be stored in durable records');
});
