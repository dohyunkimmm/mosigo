'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collectMetadata, PREFIXES, auditTarget, scopedList } = require('../scripts/audit-blob-inventory.js');

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


test('audit rejects wrong store, missing OIDC, CI and ambient read-write credentials', () => {
  const storeId = 'store_eZ1r1Ofm1v8N0Ahj';
  const env = {
    MOSIGO_AUDIT_BLOB_METADATA_ONLY: 'yes',
    MOSIGO_BLOB_STORE_ID: storeId,
    MOSIGO_AUDIT_EXPECTED_STORE_ID: storeId,
    VERCEL_OIDC_TOKEN: 'short-lived-fake-oidc'
  };
  assert.deepEqual(auditTarget(env), {
    storeId, oidcToken: 'short-lived-fake-oidc'
  });
  for (const updates of [
    { MOSIGO_AUDIT_EXPECTED_STORE_ID: 'store_another' },
    { MOSIGO_AUDIT_EXPECTED_STORE_ID: '' },
    { MOSIGO_BLOB_STORE_ID: 'store_another' },
    { VERCEL_OIDC_TOKEN: '' },
    { MOSIGO_AUDIT_BLOB_METADATA_ONLY: 'no' },
    { BLOB_READ_WRITE_TOKEN: 'must-not-be-used' },
    { CI: 'true' },
    { VERCEL: '1' },
    { GITHUB_ACTIONS: 'true' }
  ]) {
    assert.throws(() => auditTarget({ ...env, ...updates }));
  }
});

test('OIDC store scope applies on every paginated list request and never returns token in report', async () => {
  const storeId = 'store_eZ1r1Ofm1v8N0Ahj', oidcToken = 'do-not-print-this';
  const calls = [];
  const list = scopedList(async options => {
    calls.push(options);
    return { blobs: [], hasMore: false };
  }, { storeId, oidcToken });
  const report = await collectMetadata({ list });
  assert.equal(calls.length, PREFIXES.length);
  assert.ok(calls.every(x => x.storeId === storeId && x.oidcToken === oidcToken));
  assert.ok(calls.every(x => x.prefix?.startsWith('mosigo/') && x.mode === 'expanded'));
  assert.doesNotMatch(JSON.stringify(report), /do-not-print-this|store_eZ1r1Ofm1v8N0Ahj/);
  assert.throws(() => scopedList(() => [], {}));
});
