'use strict';

// #88: metadata-only, bounded read for historical production Blob audit.
// This module intentionally has no get/put/copy/delete functionality.
const { createRequire } = require('node:module');
const path = require('node:path');

const PREFIXES = Object.freeze([
  ['bookings', 'mosigo/bookings/'],
  ['accounts', 'mosigo/accounts/by-email/'],
  ['sessions', 'mosigo/account-sessions/'],
  ['accountIndexes', 'mosigo/account-bookings/'],
  ['shares', 'mosigo/booking-shares/']
]);

async function collectMetadata({ list, pageSize = 100, maxPages = 3 } = {}) {
  if (typeof list !== 'function') throw new TypeError('A metadata list function is required');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError('Invalid pageSize');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new RangeError('Invalid maxPages');

  const report = { readOnly: true, complete: true, candidateDeletions: 0, scanned: [] };
  for (const [kind, prefix] of PREFIXES) {
    let cursor, pages = 0, count = 0, bytes = 0, oldest = null, newest = null, complete = false;
    const visited = new Set();
    while (pages < maxPages) {
      const result = await list({ prefix, limit: pageSize, mode: 'expanded', ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(result?.blobs) || typeof result.hasMore !== 'boolean') {
        throw new Error('Unexpected Blob list response');
      }
      for (const blob of result.blobs) {
        if (typeof blob.pathname !== 'string' || !blob.pathname.startsWith(prefix)) {
          throw new Error('Blob listing escaped the audited prefix');
        }
        if (!Number.isSafeInteger(blob.size) || blob.size < 0) throw new Error('Invalid Blob metadata size');
        count += 1;
        bytes += blob.size;
        const when = new Date(blob.uploadedAt).toISOString();
        if (!oldest || when < oldest) oldest = when;
        if (!newest || when > newest) newest = when;
      }
      pages += 1;
      if (!result.hasMore) { complete = true; break; }
      if (!result.cursor || visited.has(result.cursor)) throw new Error('Missing or repeated Blob cursor');
      visited.add(result.cursor);
      cursor = result.cursor;
    }
    report.scanned.push({ kind, count, bytes, oldest, newest, pages, complete, classification: 'unattributed' });
    if (!complete) report.complete = false;
  }
  return report;
}

async function main() {
  if (process.env.MOSIGO_AUDIT_BLOB_METADATA_ONLY !== 'yes') {
    throw new Error('Set MOSIGO_AUDIT_BLOB_METADATA_ONLY=yes to permit a read-only inventory');
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('An explicit Blob token is required for local audit');
  // Resolve the existing src dependency only when explicitly running this CLI.
  const runtimeRequire = createRequire(path.resolve(__dirname, '../src/package.json'));
  const { list } = runtimeRequire('@vercel/blob');
  const report = await collectMetadata({ list });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    // Never print SDK error details; they could include private Blob URLs.
    process.stderr.write('Metadata audit failed; verify local setup and permitted scope.\n');
    process.exitCode = 1;
  });
}

module.exports = { PREFIXES, collectMetadata };
