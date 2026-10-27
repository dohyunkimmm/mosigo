'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collectMetadata, PREFIXES } = require('../scripts/audit-blob-inventory.js');

const entry = (pathname, uploadedAt = '2026-10-21T00:00:00.000Z') =>
  ({ pathname, uploadedAt, size: 128, url: 'https://private.example.test/never-log-this' });

test('inventory enumerates only approved prefixes and returns aggregates, never paths or private URLs', async () => {
  const calls = [];
  const list = async (options) => {
    calls.push(options);
    if (options.prefix === 'mosigo/bookings/' && !options.cursor) {
      return { blobs: [entry('mosigo/bookings/M10EXAMPLE1.json')], hasMore: true, cursor: 'page-2' };
    }
    if (options.prefix === 'mosigo/bookings/' && options.cursor === 'page-2') {
      return { blobs: [entry('mosigo/bookings/M10EXAMPLE2.json')], hasMore: false };
    }
    return { blobs: [], hasMore: false };
  };
  const report = await collectMetadata({ list, pageSize: 10, maxPages: 3 });
  assert.equal(report.readOnly, true);
  assert.equal(report.complete, true);
  assert.equal(report.candidateDeletions, 0);
  assert.equal(report.scanned.length, PREFIXES.length);
  assert.deepEqual(report.scanned[0], {
    kind: 'bookings', count: 2, bytes: 256,
    oldest: '2026-10-21T00:00:00.000Z', newest: '2026-10-21T00:00:00.000Z',
    pages: 2, complete: true, classification: 'unattributed'
  });
  assert.equal(calls.length, PREFIXES.length + 1);
  assert.ok(calls.every(c => c.mode === 'expanded' && c.limit === 10 && PREFIXES.some(([,p]) => p === c.prefix)));
  assert.doesNotMatch(JSON.stringify(report), /M10EXAMPLE|private\.example|mosigo\/bookings\//);
});

test('bounded pagination reports incomplete results without pretending scan is exhaustive', async () => {
  const report = await collectMetadata({
    list: async o => ({ blobs: [entry(o.prefix + 'a.json')], cursor: 'next', hasMore: true }),
    maxPages: 1
  });
  assert.equal(report.complete, false);
  assert.ok(report.scanned.every(p => p.complete === false && p.count === 1));
});

test('unexpected prefix and ambiguous pagination fail closed', async () => {
  await assert.rejects(
    () => collectMetadata({ list: async () => ({ blobs: [entry('unrelated/file.json')], hasMore: false }) }),
    /escaped/
  );
  await assert.rejects(
    () => collectMetadata({ list: async () => ({ blobs: [], hasMore: true }) }),
    /cursor/
  );
  await assert.rejects(
    () => collectMetadata({ list: async () => ({ blobs: [], hasMore: false }), pageSize: 1001 }),
    /pageSize/
  );
});

test('audit implementation never calls get, put, del, copy, or exports private identifiers', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/audit-blob-inventory.js'), 'utf8');
  assert.doesNotMatch(source, /\bblob\.(?:get|put|del|copy)\s*\(/);
  assert.match(source, /MOSIGO_AUDIT_BLOB_METADATA_ONLY/);
  assert.match(source, /classification: 'unattributed'/);
});
