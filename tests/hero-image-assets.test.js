const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../src');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const TARGETS = {
  gyeote_report_hero: 1_670_060,
  day: 783_416
};

test('large report/benefit imagery has one valid referenced asset per image', () => {
  for (const [stem, originalBytes] of Object.entries(TARGETS)) {
    const png = path.join(ROOT, stem + '.png');
    const webp = path.join(ROOT, stem + '.webp');
    const originalExists = fs.existsSync(png);
    const optimizedExists = fs.existsSync(webp);
    assert.notEqual(originalExists, optimizedExists,
      stem + ': keep either the original PNG or optimized WebP, never both or neither');

    const ext = optimizedExists ? 'webp' : 'png';
    assert.equal(html.split('src="' + stem + '.' + ext + '"').length - 1, 1,
      stem + ': document must reference current asset exactly once');
    assert.equal(html.includes('src="' + stem + '.' + (optimizedExists ? 'png' : 'webp') + '"'), false,
      stem + ': no stale image references');

    const bytes = fs.readFileSync(optimizedExists ? webp : png);
    if (optimizedExists) {
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
      assert.ok(bytes.length <= originalBytes * 0.85,
        stem + ': optimized image must save at least 15%');
    } else {
      assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    }
  }
});
