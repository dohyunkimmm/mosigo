const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

const assets = ['game2.mp4', 'game3.mp4', 'game4.mp4', '0810(4).mp4'];

test('live game MP4 assets stay within a 5 MB combined budget', () => {
  let total = 0;
  for (const asset of assets) {
    const path = join(__dirname, '../src', asset);
    const stat = statSync(path);
    assert.ok(stat.size > 0, `${asset} must not be empty`);
    const header = readFileSync(path).subarray(4, 8).toString('ascii');
    assert.equal(header, 'ftyp', `${asset} must remain a valid MP4 container`);
    total += stat.size;
  }
  assert.ok(total <= 5_000_000, `MP4 total ${total} bytes exceeds 5 MB budget`);
});
